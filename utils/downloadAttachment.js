const fs   = require('fs');
const https = require('https');

async function downloadAttachment(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, res => {
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', err => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

module.exports = { downloadAttachment };