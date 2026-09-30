const held = new Map();

function tryAcquire(key) {
    if (held.has(key)) return false;
    held.set(key, null);
    return true;
}

function release(key, { holdMs = 0 } = {}) {
    const existing = held.get(key);
    if (existing) clearTimeout(existing);

    if (holdMs > 0) {
        const timer = setTimeout(() => held.delete(key), holdMs);
        if (timer.unref) timer.unref();
        held.set(key, timer);
        return;
    }
    held.delete(key);
}

function isHeld(key) {
    return held.has(key);
}

module.exports = { tryAcquire, release, isHeld };
