// Child process: runs each feature's manifest init() on a recording fake client and prints what each one registered.
// Same safety as manifestsCli.js: network blocked, Notion stubbed, filesystem writes turned into no-ops, explicit exit.
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

const { EventEmitter } = require('events');
const { createRegistry } = require('../../core/registry');
const { inits } = createRegistry(require('../../manifests'));
const out = [];
for (const { owner, init } of inits) {
    const client = new EventEmitter();
    const seen = [];
    for (const kind of ['on', 'once']) {
        const original = client[kind].bind(client);
        client[kind] = (event, fn) => { seen.push(`${kind}:${event}`); return original(event, fn); };
    }
    client.user = { id: '1' };
    init(client);
    out.push({ owner, listeners: seen });
}
process.stdout.write(`STARTUP_JSON_START${JSON.stringify(out)}STARTUP_JSON_END\n`, () => process.exit(0));
