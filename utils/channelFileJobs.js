const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = require('crypto');

const JOBS_DIR = process.env.CHANNEL_FILE_JOBS_DIR || path.join(__dirname, '../data/channelFileJobs');
const SCHEMA_VERSION = 1;

const PHASES = {
    freezing: 'freezing',
    filing: 'filing',
    verifying: 'verifying',
    review: 'review',
    proceeding: 'proceeding',
    aborting: 'aborting',
    done: 'done',
    aborted: 'aborted',
    unrecoverable: 'unrecoverable',
};

const FINAL_PHASES = [PHASES.done, PHASES.aborted];
const RUNNING_PHASES = [PHASES.freezing, PHASES.filing, PHASES.verifying, PHASES.proceeding, PHASES.aborting];

const jobs = new Map();
const locks = new Map();
let loaded = false;

function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(key, next.catch(() => {}));
    return next;
}

// ─── Atomic, verified file I/O ──────────────────────────────────────────────
function ensureDir() {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
}

const jobFile = id => path.join(JOBS_DIR, `${id}.json`);
const snapshotFile = id => path.join(JOBS_DIR, `${id}.snapshot.json`);
const manifestFile = id => path.join(JOBS_DIR, `${id}.manifest.json`);
const backupOf = file => `${file}.bak`;

function checksum(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function readVerified(file) {
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (envelope?.v !== SCHEMA_VERSION) throw new Error(`Unsupported schema version ${envelope?.v}`);
    if (envelope.checksum !== checksum(envelope.data)) throw new Error('Checksum mismatch');
    return envelope.data;
}

function isValid(file) {
    try { readVerified(file); return true; } catch { return false; }
}

function writeAtomic(file, data) {
    ensureDir();
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const body = JSON.stringify({ v: SCHEMA_VERSION, checksum: checksum(data), data });

    try {
        const fd = fs.openSync(tmp, 'w');
        try {
            fs.writeSync(fd, body);
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }

        if (fs.existsSync(file) && isValid(file)) fs.copyFileSync(file, backupOf(file));
        fs.renameSync(tmp, file);

        try {
            const dirFd = fs.openSync(path.dirname(file), 'r');
            try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
        } catch { /* directory fsync is not supported everywhere */ }
    } catch (err) {
        console.error(`[channelFileJobs] Failed to write ${file}:`, err.message);
        try { fs.unlinkSync(tmp); } catch { /* best effort cleanup */ }
        throw err;
    }
}

function readWithFallback(file) {
    for (const candidate of [file, backupOf(file)]) {
        if (!fs.existsSync(candidate)) continue;
        try {
            return { data: readVerified(candidate), fromBackup: candidate !== file };
        } catch (err) {
            console.error(`[channelFileJobs] ${candidate} is unreadable:`, err.message);
        }
    }
    return null;
}

// ─── Loading ────────────────────────────────────────────────────────────────
function loadAll() {
    ensureDir();
    jobs.clear();

    const ids = new Set(
        fs.readdirSync(JOBS_DIR)
            .filter(name => /^[0-9a-f-]{36}\.(json|json\.bak|snapshot\.json)$/.test(name))
            .map(name => name.slice(0, 36)),
    );

    for (const id of ids) {
        const result = readWithFallback(jobFile(id));
        if (result) {
            if (result.fromBackup) console.warn(`[channelFileJobs] Job ${id} was restored from its backup file.`);
            jobs.set(id, result.data);
            continue;
        }

        const snap = readWithFallback(snapshotFile(id));
        console.error(`[channelFileJobs] Job ${id} is unrecoverable.`);
        jobs.set(id, {
            id,
            phase: PHASES.unrecoverable,
            targetId: snap?.data.channelId ?? null,
            guildId: snap?.data.guildId ?? null,
            hasSnapshot: Boolean(snap),
        });
    }

    loaded = true;
    return listJobs();
}

function ensureLoaded() {
    if (!loaded) loadAll();
}

// ─── Public API ─────────────────────────────────────────────────────────────
function listJobs() {
    ensureLoaded();
    return [...jobs.values()];
}

function getJob(id) {
    ensureLoaded();
    return jobs.get(id) ?? null;
}

function isActive(job) {
    return !FINAL_PHASES.includes(job.phase);
}

function getActiveJobForTarget(targetId) {
    return listJobs().find(job => job.targetId === targetId && isActive(job)) ?? null;
}

function getRunningJob() {
    return listJobs().find(job => RUNNING_PHASES.includes(job.phase)) ?? null;
}

function createJob(fields) {
    ensureLoaded();
    const id = randomUUID();
    const job = {
        snags: [],
        verified: false,
        ...fields,
        id,
        phase: fields.phase ?? PHASES.freezing,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    return withLock(id, () => {
        writeAtomic(jobFile(id), job);
        jobs.set(id, job);
        return job;
    });
}

function updateJob(id, patch) {
    ensureLoaded();
    return withLock(id, () => {
        const current = jobs.get(id);
        if (!current) return null;
        if (current.phase === PHASES.unrecoverable) throw new Error(`Job ${id} is unrecoverable and cannot be updated.`);
        const next = { ...current, ...patch, id, updatedAt: Date.now() };
        writeAtomic(jobFile(id), next);
        jobs.set(id, next);
        return next;
    });
}

function transitionJob(id, allowedPhases, patch) {
    ensureLoaded();
    return withLock(id, () => {
        const current = jobs.get(id);
        if (!current) return { ok: false, reason: 'missing' };
        if (!allowedPhases.includes(current.phase)) return { ok: false, reason: 'phase', job: current };
        const next = { ...current, ...patch, id, updatedAt: Date.now() };
        writeAtomic(jobFile(id), next);
        jobs.set(id, next);
        return { ok: true, job: next };
    });
}

function removeJob(id) {
    ensureLoaded();
    return withLock(id, () => {
        const existed = jobs.delete(id);
        for (const file of [jobFile(id), snapshotFile(id), manifestFile(id)]) {
            for (const target of [file, backupOf(file)]) {
                try { fs.unlinkSync(target); } catch { /* already gone */ }
            }
        }
        return existed;
    });
}

// ─── Permission snapshot (its own file, written before anything is frozen) ──
function saveSnapshot(id, snapshot) {
    return withLock(id, () => writeAtomic(snapshotFile(id), snapshot));
}

function loadSnapshot(id) {
    return readWithFallback(snapshotFile(id))?.data ?? null;
}

// ─── Manifest (message inventory + posted copy; written once per filing) ────
function saveManifest(id, manifest) {
    return withLock(id, () => writeAtomic(manifestFile(id), manifest));
}

function loadManifest(id) {
    return readWithFallback(manifestFile(id))?.data ?? null;
}

// ─── Delete gate ────────────────────────────────────────────────────────────
function assertDeletable(id) {
    try {
        ensureLoaded();
        const job = jobs.get(id);
        if (!job) return { ok: false, reason: 'The job record is missing.' };

        let onDisk;
        try {
            onDisk = readVerified(jobFile(id));
        } catch (err) {
            return { ok: false, reason: `The job file failed its integrity check (${err.message}).` };
        }

        if (onDisk.phase !== PHASES.proceeding || job.phase !== PHASES.proceeding) {
            return { ok: false, reason: `The job is in "${job.phase}", not in the proceed step.` };
        }
        if (onDisk.verified !== true || job.verified !== true) {
            return { ok: false, reason: 'The checks have not completed for this job.' };
        }
        if (!onDisk.proceededBy) {
            return { ok: false, reason: 'No admin has approved this job.' };
        }
        if (!loadSnapshot(id)) {
            return { ok: false, reason: 'The permission snapshot is missing, so a revert would not be possible.' };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, reason: `Unexpected error: ${err.message}` };
    }
}

module.exports = {
    PHASES,
    FINAL_PHASES,
    RUNNING_PHASES,
    JOBS_DIR,
    loadAll,
    listJobs,
    getJob,
    getActiveJobForTarget,
    getRunningJob,
    createJob,
    updateJob,
    transitionJob,
    removeJob,
    saveSnapshot,
    loadSnapshot,
    saveManifest,
    loadManifest,
    assertDeletable,
};
