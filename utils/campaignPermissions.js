const { PermissionFlagsBits: P } = require('discord.js');

const ROLE_KEYS = ['everyone', 'admins', 'clankers', 'campaign', 'adventurer'];

const ROLE_LABELS = {
    everyone:   '@everyone',
    admins:     'Admins',
    clankers:   'Clankers',
    campaign:   'Campaign',
    adventurer: 'Adventurer',
};

const TEXT_WRITE = [
    P.SendMessages,
    P.SendMessagesInThreads,
    P.CreatePublicThreads,
    P.CreatePrivateThreads,
];

const TEXT_FULL = [P.ViewChannel, P.ReadMessageHistory, ...TEXT_WRITE];

function voiceFull({ useStage = false, moderateStage = false } = {}) {
    const perms = [P.ViewChannel, P.ReadMessageHistory, P.Connect, P.SendMessages];
    perms.push(useStage ? P.RequestToSpeak : P.Speak);
    if (useStage && moderateStage) perms.push(P.MuteMembers, P.MoveMembers);
    return perms;
}

function requiredBotPermissions({ useStage = false } = {}) {
    return [...new Set([
        P.ManageRoles,
        P.ManageChannels,
        ...TEXT_FULL,
        ...voiceFull({ useStage, moderateStage: false }),
    ])];
}

function entry(id, allow = [], deny = []) {
    const out = { id };
    if (allow.length) out.allow = allow;
    if (deny.length)  out.deny  = deny;
    return out;
}

/**
 * The four spectator answers only ever touch the adventurer role:
 *   readChat       – can see the text channel (if false, it is hidden from them)
 *   sendMessages   – can send in text; only applied when readChat is true
 *   joinVoice      – can Connect to voice/stage
 *   sendVoiceChat  – can send messages in the voice/stage channel's chat
 *
 * The voice/stage channel is visible to adventurers when they can read the text
 * chat OR join voice.
 */
function buildOverwrites({
    ids,                       // { everyone, admins, clankers, campaign, adventurer }
    readChat,
    sendMessages,
    joinVoice,
    sendVoiceChat,
    useStage = false,
    moderateStage = false,
}) {
    const voiceVisible = readChat || joinVoice;
    const staff = [ids.admins, ids.clankers, ids.campaign];

    // ── Category ────────────────────────────────────────────────────────────
    const category = [
        entry(ids.everyone, [], [P.ViewChannel]),
        ...staff.map(id => entry(id, [P.ViewChannel])),
        voiceVisible
            ? entry(ids.adventurer, [P.ViewChannel])
            : entry(ids.adventurer, [], [P.ViewChannel]),
    ];

    // ── Text channel ────────────────────────────────────────────────────────
    let adventurerText;
    if (!readChat) {
        adventurerText = entry(ids.adventurer, [], [P.ViewChannel]);
    } else if (sendMessages) {
        adventurerText = entry(ids.adventurer, [P.ViewChannel]);
    } else {
        adventurerText = entry(ids.adventurer, [P.ViewChannel], TEXT_WRITE);
    }
    const text = [
        entry(ids.everyone, [], [P.ViewChannel]),
        ...staff.map(id => entry(id, TEXT_FULL)),
        adventurerText,
    ];

    // ── Voice / Stage channel ───────────────────────────────────────────────
    let adventurerVoice;
    if (!voiceVisible) {
        adventurerVoice = entry(ids.adventurer, [], [P.ViewChannel]);
    } else {
        const deny = [];
        if (!joinVoice)     deny.push(P.Connect);
        if (!sendVoiceChat) deny.push(P.SendMessages);
        adventurerVoice = entry(ids.adventurer, [P.ViewChannel], deny);
    }
    const voiceAllow = voiceFull({ useStage, moderateStage });
    const voice = [
        entry(ids.everyone, [], [P.ViewChannel]),
        ...staff.map(id => entry(id, voiceAllow)),
        adventurerVoice,
    ];

    return { category, text, voice };
}

// ── Matrix ──────────────────────────────────────────────────────────────────

const ALLOW = '✔';
const DENY  = '✖';
const NONE  = '–';

function columnsFor(kind, { useStage = false, moderateStage = false } = {}) {
    if (kind === 'category') {
        return [['View', P.ViewChannel]];
    }
    if (kind === 'text') {
        return [
            ['View',   P.ViewChannel],
            ['Hist',   P.ReadMessageHistory],
            ['Send',   P.SendMessages],
            ['Thread', P.SendMessagesInThreads],
        ];
    }
    const cols = [
        ['View',   P.ViewChannel],
        ['Join',   P.Connect],
        [useStage ? 'ReqSpk' : 'Speak', useStage ? P.RequestToSpeak : P.Speak],
        ['Chat',   P.SendMessages],
    ];
    if (useStage && moderateStage) cols.push(['Mod', P.MuteMembers]);
    return cols;
}

function toBits(list = []) {
    return list.reduce((acc, flag) => acc | flag, 0n);
}

function overwritesToMap(list, ids) {
    const keyById = {};
    for (const [key, id] of Object.entries(ids)) keyById[id] = key;
    const map = {};
    for (const ow of list) {
        const key = keyById[ow.id];
        if (key) map[key] = { allow: toBits(ow.allow), deny: toBits(ow.deny) };
    }
    return map;
}

function channelToMap(channel, ids) {
    const map = {};
    for (const [key, id] of Object.entries(ids)) {
        const ow = channel?.permissionOverwrites?.cache?.get(id);
        if (ow) map[key] = { allow: ow.allow.bitfield, deny: ow.deny.bitfield };
    }
    return map;
}

function stateOf(entryForRole, flag) {
    if (!entryForRole) return NONE;
    if (entryForRole.allow & flag) return ALLOW;
    if (entryForRole.deny & flag)  return DENY;
    return NONE;
}

function renderMatrix(columns, map) {
    const roleWidth = Math.max(...ROLE_KEYS.map(k => ROLE_LABELS[k].length), 4);
    const widths = columns.map(([name]) => name.length);

    const header = 'Role'.padEnd(roleWidth) + '  ' +
        columns.map(([name], i) => name.padEnd(widths[i])).join('  ');

    const rows = ROLE_KEYS.map(key => {
        const cells = columns.map(([, flag], i) => stateOf(map[key], flag).padEnd(widths[i]));
        return (ROLE_LABELS[key].padEnd(roleWidth) + '  ' + cells.join('  ')).trimEnd();
    });

    return '```\n' + [header.trimEnd(), ...rows].join('\n') + '\n```';
}

// Lists every cell where the planned matrix and the real one disagree.
function diffMaps(columns, planned, actual, label) {
    const diffs = [];
    for (const key of ROLE_KEYS) {
        for (const [name, flag] of columns) {
            const p = stateOf(planned[key], flag);
            const a = stateOf(actual[key], flag);
            if (p !== a) diffs.push(`${label} › ${ROLE_LABELS[key]} › ${name}: planned ${p}, actual ${a}`);
        }
    }
    return diffs;
}

module.exports = {
    ROLE_KEYS,
    ROLE_LABELS,
    ALLOW,
    DENY,
    NONE,
    buildOverwrites,
    requiredBotPermissions,
    columnsFor,
    overwritesToMap,
    channelToMap,
    stateOf,
    renderMatrix,
    diffMaps,
};
