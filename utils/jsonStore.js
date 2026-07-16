/**
 * Usage:
 *   const { createJsonStore } = require('./jsonStore');
 *   const store = createJsonStore(path.join(__dirname, '../data/foo.json'), []);
 *   const items = store.load();
 *   store.save(items);
 */

const fs = require('fs');
const path = require('path');

function createJsonStore(filePath, defaultValue = []) {
    function cloneDefault() {
        return JSON.parse(JSON.stringify(defaultValue));
    }

    function ensureDir() {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    function load() {
        ensureDir();

        if (!fs.existsSync(filePath)) {
            const initial = cloneDefault();
            save(initial);
            return initial;
        }

        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        } catch (err) {
            console.error(`[jsonStore] ${filePath} is missing or malformed, using default value:`, err.message);
            return cloneDefault();
        }
    }

    function save(data) {
        ensureDir();
        const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        try {
            fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
            fs.renameSync(tmpPath, filePath);
        } catch (err) {
            console.error(`[jsonStore] Failed to write ${filePath}:`, err.message);
            try { fs.unlinkSync(tmpPath); } catch { /* best effort cleanup */ }
            throw err;
        }
    }

    return { load, save };
}

module.exports = { createJsonStore };
