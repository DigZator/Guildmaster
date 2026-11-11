// Child process: builds the registry from the real manifests and prints a plain-JSON summary.
// Loading the manifests loads every handler module, and some of those start background work (for example the
// game cache refresh talks to Notion), so this runs with the network blocked, Notion stubbed and every
// filesystem write turned into a no-op, then exits explicitly instead of waiting for timers.
require('./env');
const fs = require('fs');
const Module = require('module');

const offline = () => { throw new Error('offline (test)'); };
globalThis.fetch = () => Promise.reject(new Error('offline (test)'));
for (const name of ['http', 'https']) { const m = require(name); m.request = offline; m.get = offline; }
for (const fn of ['writeFileSync', 'appendFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'mkdirSync', 'copyFileSync', 'truncateSync']) fs[fn] = () => undefined;
for (const fn of ['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'rmdir', 'mkdir', 'copyFile', 'truncate']) {
    fs[fn] = (...args) => { const cb = args[args.length - 1]; if (typeof cb === 'function') cb(null); };
    fs.promises[fn] = async () => undefined;
}
fs.createWriteStream = offline;
const notionStub = new Proxy(function () {}, {
    get: (_t, k) => (k === 'then' ? undefined : notionStub),
    apply: () => Promise.reject(new Error('offline (test)')),
});
const originalLoad = Module._load;
Module._load = function (request) {
    if (request === '@notionhq/client') {
        return { Client: function Client() { return notionStub; }, APIErrorCode: {}, LogLevel: {}, isNotionClientError: () => false };
    }
    return originalLoad.apply(this, arguments);
};
console.log = () => {}; console.warn = () => {};   // keep stdout clean for the JSON below

const { inspect } = require('../../core/registry');
const { problems, registry } = inspect(require('../../manifests'));

const plain = (spec) => ({ id: spec.id, owner: spec.owner, policy: spec.policy, gate: spec.gate, denied: spec.denied, falseMeansUnhandled: spec.falseMeansUnhandled, hasHandler: typeof spec.handler === 'function' });
const out = { problems, registry: null };
if (registry) {
    out.registry = {
        commands: [...registry.commands.entries()].map(([name, cmd]) => ({
            name, owner: cmd.owner, policy: cmd.policy, gate: cmd.gate, denied: cmd.denied, hasHandler: typeof cmd.handler === 'function',
            handlerSource: typeof cmd.handler === 'function' ? Function.prototype.toString.call(cmd.handler) : null,
            autocomplete: (cmd.autocomplete || []).map(a => ({ name: a.name, policy: a.policy, gate: a.gate, hasHandle: typeof a.handle === 'function' })),
            subcommands: Object.fromEntries(Object.entries(cmd.subcommands || {}).map(([k, s]) => [k, { policy: s.policy, gate: s.gate, denied: s.denied }])),
        })),
        tables: Object.fromEntries(Object.entries(registry.tables).map(([kind, t]) => [kind, {
            exact: [...t.exact.entries()].map(([id, spec]) => plain({ ...spec, id })),
            prefix: t.prefix.map(plain),
        }])),
    };
}
process.stdout.write(`MANIFESTS_JSON_START${JSON.stringify(out)}MANIFESTS_JSON_END\n`, () => process.exit(0));
