const { getActiveCharacter } = require('../../utils/leagueNotion');
const questDrafts = require('../../utils/questDrafts');
const { getQuestById } = require('../leagueQuest');

const DM_ROLE_ID = process.env.DM_ROLE_ID;
const REP_MAX    = 2;

const ENTRY_TYPE_TO_LINE_TYPE = {
    gold: 'gold',
    reputation: 'rep',
    milestone: 'milestone',
    item: 'item',
};

function extractPairs(interaction, amountGetter = 'getInteger') {
	const pairs = [];
	for (let i = 1; i <= 6; i++) {
		const user   = interaction.options.getUser(`user${i}`);
		const amount = interaction.options[amountGetter](`amount${i}`);
		if (user && amount !== null) pairs.push({ user, amount });
	}
	return pairs;
}

// ─── Quest validation (used by gold/rep/milestone/item grant commands) ───────
function isDMOnQuest(interaction, questId) {
    const draft = questDrafts.getDraft(questId);
    const ownerId = draft?.dm?.discordId;
    if (!ownerId) return false;
    return ownerId === interaction.user.id;
}

async function resolveActiveQuest(interaction) {
    const questId = interaction.options.getString('quest_id')?.toUpperCase();
    if (!questId) return { error: '❌ `quest_id` is required.' };

    const quest = await getQuestById(questId);
    if (!quest) return { error: `❌ No quest found with ID \`${questId}\`.` };

    const status = quest.properties['Status']?.select?.name;
    if (status !== 'Active') {
        return { error: `❌ Quest \`${questId}\` is not Active (current status: ${status}). Grants can only be made against an active quest.` };
    }

    const questName    = quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const characterIds = quest.properties['Characters']?.relation?.map(r => r.id) ?? [];

    return { questId, questName, questPageId: quest.id, characterIds };
}

// ─── Shared resolvers ─────────────────────────────────────────────────────────
async function resolveTarget(interaction) {
    const targetUser = interaction.options.getUser('user');
    const character  = await getActiveCharacter(targetUser.id);
    if (!character) {
        await interaction.editReply({
            content: `❌ **${targetUser.displayName}** does not have an active character.`,
        });
        return null;
    }
    return { targetUser, character };
}

module.exports = {
    DM_ROLE_ID,
    REP_MAX,
    ENTRY_TYPE_TO_LINE_TYPE,
    extractPairs,
    isDMOnQuest,
    resolveActiveQuest,
    resolveTarget,
};
