// Static scanners. Each returns plain data so it can be snapshotted and diffed.
const { read, sourceFiles } = require('./repo');

function balanced(src, openIndex) {
    let depth = 0, quote = null;
    for (let i = openIndex; i < src.length; i++) {
        const c = src[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '\'' || c === '"' || c === '`') quote = c;
        else if (c === '(') depth++;
        else if (c === ')' && --depth === 0) return src.slice(openIndex + 1, i);
    }
    return src.slice(openIndex + 1);
}

function scanCommandRoutes() {
    const src = read('interactions/commandHandler.js');
    const split = src.indexOf('isChatInputCommand()');
    const autocomplete = src.slice(0, split);
    const chat = src.slice(split);
    const handlers = [...chat.matchAll(/if \(command === '([^']+)'\)\s*await (\w+)\(/g)]
        .map(m => ({ command: m[1], handler: m[2] }));
    const autocompleteTokens = [...autocomplete.matchAll(/(commandName|sub|group|focused\.name)\s*===\s*'([^']+)'/g)]
        .map(m => `${m[1]}=${m[2]}`);
    const sets = {};
    for (const m of autocomplete.matchAll(/const (\w+) = new Set\(\[([^\]]*)\]\)/g)) {
        sets[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
    }
    return { handlers, autocompleteTokens, sets };
}

function scanChain(rel) {
    const src = read(rel);
    const out = [];
    const re = /customId\s*(?:===\s*'([^']+)'|\.startsWith\('([^']+)'\))/g;
    let m;
    while ((m = re.exec(src))) {
        const req = src.slice(m.index, m.index + 400).match(/require\('([^']+)'\)(?:\.(\w+))?/);
        out.push({
            match: m[1] !== undefined ? 'exact' : 'prefix',
            value: m[1] !== undefined ? m[1] : m[2],
            target: req ? req[1] + (req[2] ? '.' + req[2] : '') : null,
        });
    }
    return out;
}

function shadowedInChain(chain) {
    const out = [];
    chain.forEach((a, i) => {
        if (a.match !== 'prefix') return;
        chain.slice(i + 1).forEach(b => {
            if (b.value !== a.value && b.value.startsWith(a.value)) out.push({ earlierPrefix: a.value, shadows: b.value });
        });
    });
    return out;
}

function classifyCustomId(arg) {
    const a = arg.trim();
    const enc = a.match(/^(?:\w+\.)?encodeId\(\s*[^,]+,\s*(['"`])([^'"`]+)\1/);
    if (enc) return `encodeId(*, '${enc[2]}')`;
    if (/^(['"`])/.test(a)) {
        const q = a[0];
        let lit = '';
        for (let i = 1; i < a.length; i++) {
            if (a[i] === '\\') { lit += a[i + 1] || ''; i++; continue; }
            if (q === '`' && a[i] === '$' && a[i + 1] === '{') { lit += '${…}'; break; }
            if (a[i] === q) break;
            lit += a[i];
        }
        return lit.length < a.length - 2 && a.slice(lit.length + 2).trim().startsWith('+') ? lit + '…' : lit;
    }
    return 'dynamic: ' + a.replace(/\s+/g, ' ').slice(0, 50);
}

function scanCustomIdProducers() {
    const out = {};
    for (const file of sourceFiles()) {
        const src = read(file);
        const heads = new Set();
        let idx = -1;
        while ((idx = src.indexOf('.setCustomId(', idx + 1)) !== -1) {
            heads.add(classifyCustomId(balanced(src, idx + '.setCustomId'.length)));
        }
        for (const m of src.matchAll(/customId\s*:\s*(['"`])([^'"`$]*)/g)) heads.add(m[2]);
        if (heads.size) out[file] = [...heads].sort();
    }
    return out;
}

function scanPermissionChecks() {
    const out = {};
    for (const file of sourceFiles()) {
        if (file === 'utils/isAdminChannel.js') continue;
        const src = read(file);
        const rec = {};
        const admin = {};
        for (const m of src.matchAll(/\b(isAdminChannel|isAdmin)\(\s*[^,()]+(?:,\s*'([^']+)')?\s*\)/g)) {
            const key = (m[2] || 'bot (default)') + (m[1] === 'isAdmin' ? ' [alias]' : '');
            admin[key] = (admin[key] || 0) + 1;
        }
        if (Object.keys(admin).length) rec.isAdminChannel = Object.fromEntries(Object.entries(admin).sort());
        const roles = (src.match(/\.roles\.cache\.(?:has|some)\(/g) || []).length;
        if (roles) rec['roles.cache'] = roles;
        const perms = (src.match(/\.(?:memberPermissions|permissions)\??\.has\(/g) || []).length;
        if (perms) rec['permissions.has'] = perms;
        if (Object.keys(rec).length) out[file] = rec;
    }
    return out;
}

function scanStartupWiring() {
    const src = read('index.js');
    return [...src.matchAll(/require\('([^']+)'\)(?:\.(\w+))?\(client\)/g)]
        .map(m => m[1] + (m[2] ? '.' + m[2] : ''));
}

function stripComments(src) {
    let out = '', i = 0, quote = null;
    while (i < src.length) {
        const c = src[i], n = src[i + 1];
        if (quote) {
            out += c;
            if (c === '\\') { out += n || ''; i += 2; continue; }
            if (c === quote) quote = null;
            i++; continue;
        }
        if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (c === '/' && n === '*') { const j = src.indexOf('*/', i + 2); i = j === -1 ? src.length : j + 2; continue; }
        if (c === '\'' || c === '"' || c === '`') quote = c;
        out += c; i++;
    }
    return out;
}

function scanRelativeRequires(file) {
    const src = stripComments(read(file));
    const sites = [];
    for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*require\(\s*'(\.[^']*)'\s*\)(?!\s*[.(\[])/g)) {
        const names = m[1].split(',').map(s => s.trim().split(/[:=]/)[0].trim()).filter(Boolean);
        sites.push({ spec: m[2], names });
    }
    for (const m of src.matchAll(/require\(\s*'(\.[^']*)'\s*\)\.(\w+)/g)) sites.push({ spec: m[1], names: [m[2]] });
    for (const m of src.matchAll(/require\(\s*'(\.[^']*)'\s*\)/g)) sites.push({ spec: m[1], names: [] });
    return sites;
}

module.exports = {
    scanCommandRoutes, scanChain, shadowedInChain, scanCustomIdProducers,
    scanPermissionChecks, scanStartupWiring, scanRelativeRequires, stripComments,
};
