const fs = require('fs');
const https = require('https');

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const REDIRECT_CODES = [301, 302, 303, 307, 308];

function downloadAttachment(url, dest, { maxBytes = DEFAULT_MAX_BYTES, redirects = 3 } = {}) {
    return new Promise((resolve, reject) => {
        const fail = err => {
            fs.unlink(dest, () => {});
            reject(err);
        };

        const req = https.get(url, res => {
            if (REDIRECT_CODES.includes(res.statusCode) && res.headers.location) {
                res.resume();
                if (redirects <= 0) return reject(new Error('Too many redirects'));
                const next = new URL(res.headers.location, url).toString();
                return downloadAttachment(next, dest, { maxBytes, redirects: redirects - 1 }).then(resolve, reject);
            }

            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`Download failed (HTTP ${res.statusCode})`));
            }

            const declared = Number(res.headers['content-length']);
            if (declared && declared > maxBytes) {
                res.resume();
                return reject(new Error('File is too large'));
            }

            const file = fs.createWriteStream(dest);
            let received = 0;

            res.on('data', chunk => {
                received += chunk.length;
                if (received > maxBytes) res.destroy(new Error('File is too large'));
            });
            res.on('error', err => { file.destroy(); fail(err); });
            file.on('error', fail);
            file.on('finish', () => file.close(() => resolve(dest)));
            res.pipe(file);
        });

        req.on('error', fail);
    });
}

module.exports = { downloadAttachment };
