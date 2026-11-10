const fs = require('fs');
const path = require('path');
const { downloadAttachment: downloadToFile } = require('../../utils/downloadAttachment');
const { UNKNOWN_SIZE_ESTIMATE } = require('./limits');

// Fetching attachments into memory or onto disk, and packing them into upload batches.

const FILES_PER_MESSAGE = 10;

const DOWNLOAD_TIMEOUT_MS = 20 * 1000;

const DOWNLOAD_ATTEMPTS = 3;

const DOWNLOAD_RETRY_BASE_MS = 1000;

// ─── Attachment staging ─────────────────────────────────────────────────────
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function safeFileName(name) {
    return String(name ?? 'file').replace(/[^\w.\-]+/g, '_').slice(-100) || 'file';
}

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}

async function fetchBuffer(url, { maxBytes, timeoutMs = DOWNLOAD_TIMEOUT_MS } = {}) {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers?.get?.('content-length'));
    if (maxBytes && declared && declared > maxBytes) throw new Error('File is too large');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (maxBytes && buffer.length > maxBytes) throw new Error('File is too large');
    return buffer;
}

function sizeMismatch(file, actual) {
    return !file.sizeUnknown && Number.isFinite(file.size) && file.size > 0 && actual !== file.size
        ? new Error(`Size mismatch (${actual} of ${file.size} bytes)`)
        : null;
}

async function withStaging(file, { refreshUrl, attempts = DOWNLOAD_ATTEMPTS, retryBaseMs = DOWNLOAD_RETRY_BASE_MS }, attempt, cleanup = () => {}) {
    let lastError;
    for (let n = 1; n <= attempts; n++) {
        try {
            let url = file.url;
            if (refreshUrl) {
                try { url = (await refreshUrl(file, n)) || file.url; } catch { url = file.url; }
            }
            return await attempt(url);
        } catch (err) {
            lastError = err;
            cleanup();
            if (n < attempts) await sleep(retryBaseMs * 3 ** (n - 1));
        }
    }
    throw lastError;
}

function stageBuffer(file, { fetchBuffer: fetcher = fetchBuffer, maxBytes, timeoutMs, ...retry } = {}) {
    return withStaging(file, retry, async url => {
        const buffer = await fetcher(url, { maxBytes: maxBytes ?? Math.max(file.size, 1), timeoutMs });
        const mismatch = sizeMismatch(file, buffer.length);
        if (mismatch) throw mismatch;
        return buffer;
    });
}

function stageFile(file, dir, index, { download = downloadToFile, maxBytes, timeoutMs = DOWNLOAD_TIMEOUT_MS, ...retry } = {}) {
    const dest = path.join(dir, `${index}-${safeFileName(file.name)}`);
    return withStaging(file, retry, async url => {
        await download(url, dest, { maxBytes: maxBytes ?? Math.max(file.size, 1), timeoutMs });
        const mismatch = sizeMismatch(file, fs.statSync(dest).size);
        if (mismatch) throw mismatch;
        return dest;
    }, () => fs.rmSync(dest, { force: true })).then(() => dest);
}

function estimatedSize(file) {
    return file.sizeUnknown ? UNKNOWN_SIZE_ESTIMATE : file.size;
}

function packBatches(files, limit) {
    const batches = [];
    let current = [];
    let bytes = 0;
    for (const file of files) {
        const size = estimatedSize(file);
        if (current.length && (current.length >= FILES_PER_MESSAGE || bytes + size > limit)) {
            batches.push(current);
            current = [];
            bytes = 0;
        }
        current.push(file);
        bytes += size;
    }
    if (current.length) batches.push(current);
    return batches;
}

function freeDiskBytes(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
        const stats = fs.statfsSync(dir);
        return Number(stats.bavail) * Number(stats.bsize);
    } catch {
        return Infinity;
    }
}

module.exports = { DOWNLOAD_RETRY_BASE_MS, safeFileName, mapLimit, fetchBuffer, stageBuffer, stageFile, estimatedSize, packBatches, freeDiskBytes };
