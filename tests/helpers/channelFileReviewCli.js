// Child process: builds the channel-filing review messages for four sample jobs and prints them as JSON.
// Same safety as manifestsCli.js: offline, Notion stubbed, writes no-ops, explicit exit.
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

const review = require('../../features/channelFile/review');
const J = (o) => JSON.parse(JSON.stringify(o));
const base = { id: 'abcdef1234567890', targetName: 'old-channel', guildId: 'g1', mainThreadId: 't1', startedBy: 'u1', counts: { messages: 12, files: 3, publicThreads: 1, privateThreads: 2 }, reviewReadyAt: 1700000000000 };
const jobs = {
    clean2: { ...base, checks: { c1: { ok: true, checked: 12, batches: 2, bad: 0 }, c2: { ok: true, deleted: 0, extraMessages: 0, newThreads: 0 } } },
    clean3: { ...base, checks: { c1: { ok: true, collected: 12, missing: 0 }, c2: { ok: false, checked: 12, bad: 1 }, c3: { ok: true, deleted: 1, extraMessages: 2, newThreads: 0 } } },
    snags: { ...base, snags: [{ kind: 'x', message: 'm1', src: 's', dest: 'd' }], snagOverflow: 4, lost: { count: 2, bytes: 3 * 1024 * 1024 }, freezeIssues: ['a'], checks: {} },
    empty: { id: 'ffff0000aaaa1111', targetName: 'n', guildId: 'g', mainThreadId: 't', reviewReadyAt: 1700000000000 },
};
const out = {};
for (const [name, job] of Object.entries(jobs)) {
    out[name] = { review: J(review.buildReviewMessage(job)), modal: J(review.buildProceedModal(job)), proceedId: review.customId(job.id, 'proceed') };
}
out.exports = Object.keys(review).sort();
process.stdout.write(`REVIEW_JSON_START${JSON.stringify(out)}REVIEW_JSON_END\n`, () => process.exit(0));
