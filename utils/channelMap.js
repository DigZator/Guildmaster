// Admin-set channel mappings ("where things go"), stored in data/channelMap.json and applied at startup.
//
//   - index.js calls applyToEnv() right after dotenv, before any module reads process.env. A stored value
//     wins over .env; .env stays the fallback. Nothing else in the bot needs to know this file exists.
//   - Changes made by /config therefore apply after a restart. describe() reports what is running now,
//     what is saved, and what the next start will use.
//   - Permission gates (the control and league-admin channels) and mappings managed by other commands are
//     never read from or written to this file, even if someone edits it by hand.
const path = require('path');
const { MAPPINGS } = require('../config/mappings');
const { createJsonStore } = require('./jsonStore');

const SNOWFLAKE = /^\d{17,20}$/;
const QUIET = /** @type {any} */ ({ log() {}, warn() {} });

let defaultStoreInstance;
function defaultStore() {
    if (!defaultStoreInstance) defaultStoreInstance = createJsonStore(path.join(__dirname, '../data/channelMap.json'), /** @type {any} */ ({ channels: {} }));
    return defaultStoreInstance;
}

// Tests swap in an in-memory store so nothing ever touches data/.
function useStore(store) { defaultStoreInstance = store; }

const byKey = (mappings, key) => mappings.find(m => m.key === key) || null;
const isSettable = (m) => Boolean(m) && !m.gate && !m.managed;
const settableMappings = (mappings = MAPPINGS) => mappings.filter(isSettable);

// Why a key cannot be set by command, or null when it can.
function refusalFor(key, mappings = MAPPINGS) {
    const m = byKey(mappings, key);
    if (!m) return `\`${key}\` is not a known mapping.`;
    if (m.gate) return `\`${key}\` is a permission gate, so it can only be changed in .env.`;
    if (m.managed) return `\`${key}\` is managed by another command. ${m.fix}`;
    return null;
}

function readFile(store) {
    const raw = store.load();
    const channels = raw && typeof raw === 'object' && raw.channels && typeof raw.channels === 'object' ? raw.channels : {};
    return channels;
}

// Valid stored entries only: known, settable keys with a plausible id. Everything else is reported and ignored.
function readEntries({ store = defaultStore(), mappings = MAPPINGS, log = console } = {}) {
    const entries = {};
    for (const [key, entry] of Object.entries(readFile(store))) {
        const id = typeof entry === 'string' ? entry : entry?.id;
        const problem = refusalFor(key, mappings) || (SNOWFLAKE.test(String(id ?? '')) ? null : `\`${key}\` has an invalid channel id in data/channelMap.json.`);
        if (problem) { log.warn(`[channelMap] Ignoring ${key}: ${problem.replace(/`/g, '')}`); continue; }
        entries[key] = { id: String(id), by: entry?.by ?? null, at: entry?.at ?? null };
    }
    return entries;
}

// What this process started with. Filled in by applyToEnv().
let boot = { applied: {}, original: {} };

function applyToEnv({ env = process.env, store = defaultStore(), mappings = MAPPINGS, log = console } = {}) {
    boot = { applied: {}, original: {} };
    let entries;
    try { entries = readEntries({ store, mappings, log }); }
    catch (err) { log.warn(`[channelMap] Could not read data/channelMap.json, using .env only: ${err.message}`); return boot; }
    for (const [key, entry] of Object.entries(entries)) {
        boot.original[key] = env[key];
        boot.applied[key] = entry.id;
        env[key] = entry.id;
    }
    const count = Object.keys(boot.applied).length;
    if (count) log.log(`[channelMap] ${count} mapping(s) set by /config override .env: ${Object.keys(boot.applied).join(', ')}`);
    return boot;
}

function getBootState() { return boot; }

// Running value, saved value, and what the next start will use.
function describe(key, { env = process.env, store = defaultStore(), mappings = MAPPINGS, log = QUIET } = {}) {
    const running = env[key] || null;
    const saved = readEntries({ store, mappings, log })[key] || null;
    const original = key in boot.original ? (boot.original[key] || null) : running;
    const next = saved ? saved.id : original;
    return {
        key,
        running,
        runningSource: boot.applied[key] ? 'config' : (running ? 'env' : 'unset'),
        saved,
        next,
        nextSource: saved ? 'config' : (next ? 'env' : 'unset'),
        pending: (next || null) !== running,
    };
}

function save(store, mutate) {
    const raw = store.load();
    const channels = raw && typeof raw === 'object' && raw.channels && typeof raw.channels === 'object' ? { ...raw.channels } : {};
    mutate(channels);
    store.save({ channels });
}

function setMapping(key, id, by, { store = defaultStore(), mappings = MAPPINGS, now = () => new Date().toISOString() } = {}) {
    const refusal = refusalFor(key, mappings);
    if (refusal) throw new Error(refusal);
    if (!SNOWFLAKE.test(String(id))) throw new Error('That is not a valid channel id.');
    save(store, (channels) => { channels[key] = { id: String(id), by: by ?? null, at: now() }; });
}

function clearMapping(key, { store = defaultStore(), mappings = MAPPINGS } = {}) {
    const refusal = refusalFor(key, mappings);
    if (refusal) throw new Error(refusal);
    let had = false;
    save(store, (channels) => { had = key in channels; delete channels[key]; });
    return had;
}

module.exports = { useStore, applyToEnv, getBootState, describe, readEntries, setMapping, clearMapping, settableMappings, refusalFor, isSettable, SNOWFLAKE };
