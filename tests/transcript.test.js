// Characterization of the shared transcript engine (shared/transcript/): what it prints, how it cuts messages, what it
// reposts, and its size limits. The expected values were recorded from the engine as it was before it was split into files,
// so a later edit that changes the output shows up here.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const transcript = require('../shared/transcript');
const scenario = require('./helpers/transcriptScenario');

const expected = {
    "full": {
        "chunks": [
            "## Ticket #7\n**Close reason:** done\n**Close feedback:** ok\n-# All times are IST\n\n### 💬 Transcript\n\n**── Sat 10 Jan 2026 ──**\n\n**Alice** · 17:30\nHello there\nsecond line\nsame group\n\n**Bob** · 17:50\nlater reply\n📎 notes.txt (1 KB) — reposted below\n📎 huge.bin (60.0 MB) — not preserved — too large to repost\n> **T**\n> d1\n> d2\n> **f:** v\n> -# foot\n\n**── Sun 11 Jan 2026 ──**\n\n**Alice** · 19:30\n🏷️ Sticker: wave\n*[no text]*"
        ],
        "attachmentGroups": [
            {
                "label": "**Bob** · Sat 10 Jan 2026, 17:50",
                "files": [
                    {
                        "name": "notes.txt",
                        "url": "https://cdn.invalid/notes.txt",
                        "size": 1234,
                        "id": "a",
                        "messageId": "3",
                        "channelId": "chan"
                    }
                ]
            }
        ],
        "notPreserved": [
            "huge.bin (too large to repost)"
        ]
    },
    "noPres": {
        "chunks": [
            "## Plain\n**Opened by:** Alice\n-# All times are IST\n\n### 💬 Transcript\n\n**── Sat 10 Jan 2026 ──**\n\n**Alice** · 17:30\nHello there\nsecond line\nsame group\n\n**Bob** · 17:50\nlater reply\n📎 notes.txt (1 KB) — not preserved\n📎 huge.bin (60.0 MB) — not preserved\n> **T**\n> d1\n> d2\n> **f:** v\n> -# foot\n\n**── Sun 11 Jan 2026 ──**\n\n**Alice** · 19:30\n🏷️ Sticker: wave\n*[no text]*"
        ],
        "attachmentGroups": [],
        "notPreserved": [
            "notes.txt (not preserved)",
            "huge.bin (not preserved)"
        ]
    },
    "sent": [
        {
            "content": "### 📎 Attachments",
            "files": []
        },
        {
            "content": "**Bob** · Sat 10 Jan 2026, 17:50",
            "files": [
                "notes.txt"
            ]
        }
    ],
    "res": {
        "reposted": 1,
        "notPreserved": [],
        "failures": []
    },
    "sent2": [
        "### ⚠️ Not preserved\n• x.bin (download failed)"
    ],
    "res2": {
        "reposted": 0,
        "notPreserved": [
            "x.bin (download failed)"
        ],
        "failures": [
            {
                "file": {
                    "name": "x.bin",
                    "url": "u",
                    "size": 10
                },
                "reason": "download failed"
            }
        ]
    },
    "limits": [
        9961472,
        9961472,
        50331648,
        99614720
    ],
    "none": 9961472,
    "min": 52428800,
    "stamp": "Sat 10 Jan 2026, 17:30",
    "chunks": [
        1990,
        1,
        1990,
        1521,
        1708
    ],
    "fenced": [
        "1210:```js\n..\n```",
        "1208:```\nyy..\n```"
    ]
};

test('the transcript of a small channel is rendered exactly as before (header, day and author groups, embeds, stickers, attachments)', async () => {
    const { channel } = scenario();
    const full = await transcript.buildTranscript(channel, { header: 'Ticket #7', closeReason: 'done', closeFeedback: 'ok', preserveAttachments: true, maxAttachments: 5 });
    assert.deepEqual(full, expected.full);
    const plain = await transcript.buildTranscript(channel, { header: 'Plain', meta: [['Opened by', 'Alice']] });
    assert.deepEqual(plain, expected.noPres);
});

test('attachments that fit are reposted in batches, with the header and the not-preserved list handled as before', async () => {
    const { channel } = scenario();
    const full = await transcript.buildTranscript(channel, { header: 'Ticket #7', preserveAttachments: true, maxAttachments: 5 });
    const sent = [];
    const thread = { guild: { premiumTier: 0 }, send: async (p) => { sent.push({ content: p.content, files: (p.files || []).map(f => f.name) }); return {}; } };
    const res = await transcript.postAttachmentGroups(thread, full.attachmentGroups, { fetchBuffer: async () => Buffer.alloc(1234) });
    assert.deepEqual(res, expected.res);
    assert.deepEqual(sent, expected.sent);

    const sent2 = [];
    const res2 = await transcript.postAttachmentGroups({ guild: { premiumTier: 0 }, send: async (p) => { sent2.push(p.content); return {}; } },
        [{ label: 'g', files: [{ name: 'x.bin', url: 'u', size: 10 }] }],
        { header: false, fetchBuffer: async () => { throw new Error('down'); }, retryBaseMs: 1 });
    assert.deepEqual(res2, expected.res2);
    assert.deepEqual(sent2, expected.sent2);
});

test('files are staged three at a time, packed ten to a message, and each download is tried three times', async () => {
    const files = Array.from({ length: 11 }, (_, i) => ({ name: `f${i}.txt`, url: `u${i}`, size: 5 }));
    let inFlight = 0;
    let maxInFlight = 0;
    const perMessage = [];
    await transcript.postAttachmentGroups({ guild: { premiumTier: 0 }, send: async (p) => { perMessage.push((p.files || []).length); return {}; } }, [{ label: 'g', files }], {
        header: false,
        fetchBuffer: async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise(resolve => setTimeout(resolve, 5));
            inFlight--;
            return Buffer.alloc(5);
        },
    });
    assert.equal(maxInFlight, 3);
    assert.deepEqual(perMessage, [10, 1]);

    let attempts = 0;
    await transcript.postAttachmentGroups({ guild: { premiumTier: 0 }, send: async () => ({}) }, [{ label: 'g', files: [{ name: 'x.bin', url: 'u', size: 5 }] }], {
        header: false,
        retryBaseMs: 1,
        fetchBuffer: async () => { attempts++; throw new Error('down'); },
    });
    assert.equal(attempts, 3);
});

test('upload limits follow the server boost tier, and the free-disk margin is unchanged', () => {
    assert.deepEqual([0, 1, 2, 3].map(n => transcript.uploadLimitBytes({ premiumTier: n })), expected.limits);
    assert.equal(transcript.uploadLimitBytes(undefined), expected.none);
    assert.equal(transcript.MIN_FREE_DISK_BYTES, expected.min);
});

test('lines are cut at Discord\'s limit, long lines are split, code fences stay balanced, and stamps are IST', () => {
    assert.equal(transcript.formatStamp(1768046400000), expected.stamp);
    assert.deepEqual(transcript.chunkLines(['a'.repeat(1990), 'b', 'c'.repeat(3000), '```js', 'x'.repeat(500), 'y'.repeat(1700), '```']).map(c => c.length), expected.chunks);
    assert.deepEqual(transcript.chunkLines(['```js', 'x'.repeat(1200), 'y'.repeat(1200), '```']).map(c => c.length + ':' + c.slice(0, 6) + '..' + c.slice(-4)), expected.fenced);
});

test('the engine exports the same names as before', () => {
    assert.deepEqual(Object.keys(transcript).sort(), ['MIN_FREE_DISK_BYTES', 'buildHeaderLines', 'buildTranscript', 'chunkLines', 'formatStamp', 'freeDiskBytes', 'postAttachmentGroups', 'renderHistory', 'sendTranscript', 'uploadLimitBytes']);
});
