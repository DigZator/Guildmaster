// Readable "what changed" output for snapshot mismatches.
function differences(expected, actual, base = '', out = [], limit = 25) {
    if (out.length >= limit) return out;
    if (JSON.stringify(expected) === JSON.stringify(actual)) return out;
    const isObj = v => v && typeof v === 'object';
    if (!isObj(expected) || !isObj(actual) || Array.isArray(expected) !== Array.isArray(actual)) {
        out.push(`${base || '(root)'}: expected ${short(expected)} but got ${short(actual)}`);
        return out;
    }
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const k of keys) {
        const p = Array.isArray(expected) ? `${base}[${k}]` : `${base}${base ? '.' : ''}${k}`;
        if (!(k in actual)) out.push(`${p}: removed (was ${short(expected[k])})`);
        else if (!(k in expected)) out.push(`${p}: added (${short(actual[k])})`);
        else differences(expected[k], actual[k], p, out, limit);
        if (out.length >= limit) break;
    }
    return out;
}
const short = (v) => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 90 ? s.slice(0, 87) + '...' : s; };
module.exports = { differences };
