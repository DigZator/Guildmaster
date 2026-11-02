const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'tests', 'scripts', 'temp']);
const NOT_LOADABLE = new Set(['index.js', 'deploy-commands.js', 'art-thread.js']);
const TOOLING_FILES = new Set(['eslint.config.js']);

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function sourceFiles() {
    const out = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
            } else if (entry.name.endsWith('.js') && !(dir === root && TOOLING_FILES.has(entry.name))) {
                out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/'));
            }
        }
    })(root);
    return out.sort();
}

const loadableFiles = () => sourceFiles().filter(f => !NOT_LOADABLE.has(f));

module.exports = { root, read, sourceFiles, loadableFiles };
