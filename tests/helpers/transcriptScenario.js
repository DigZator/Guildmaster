// A small fake channel for tests/transcript.test.js: two authors, an attachment that fits and one that does not,
// an embed, a sticker and a message without text. Timestamps are fixed so the IST output is the same every day.
module.exports = function scenario() {
    const base = Date.UTC(2026, 0, 10, 12, 0, 0);
    const att = (id, name, size) => ({ id, name, url: `https://cdn.invalid/${name}`, size });
    const mk = (id, ts, authorId, username, extra = {}) => ({ id, channelId: 'chan', createdTimestamp: ts, author: { id: authorId, username }, content: '', embeds: [], ...extra });
    const messages = [
        mk('1', base, 'u1', 'Alice', { content: 'Hello there\nsecond line' }),
        mk('2', base + 60 * 1000, 'u1', 'Alice', { content: 'same group' }),
        mk('3', base + 20 * 60 * 1000, 'u2', 'Bob', { content: 'later reply', attachments: new Map([['a', att('a', 'notes.txt', 1234)], ['b', att('b', 'huge.bin', 60 * 1024 * 1024)]]) }),
        mk('4', base + 21 * 60 * 1000, 'u2', 'Bob', { embeds: [{ title: 'T', description: 'd1\nd2', fields: [{ name: 'f', value: 'v' }], footer: { text: 'foot' } }] }),
        mk('5', base + 26 * 60 * 60 * 1000, 'u1', 'Alice', { stickers: new Map([['s', { name: 'wave' }]]) }),
        mk('6', base + 26 * 60 * 60 * 1000 + 1000, 'u1', 'Alice', {}),
    ];
    const channel = {
        guild: { premiumTier: 0 },
        messages: { fetch: async () => { const arr = [...messages].reverse(); return { size: arr.length, values: () => arr, last: () => arr[arr.length - 1] }; } },
    };
    return { channel, messages };
};
