const TLR_MOD_ROLE_IDS = [
    process.env.ADMINS_ROLE_ID,
    process.env.CLERK_OF_MORTAL_AFFAIRS_ROLE_ID,
].filter(Boolean);

const TLR_MOD_PING_ROLE_ID = process.env.TLR_MOD_PING_ROLE_ID || null;

function isTlrMod(member) {
    if (!member || TLR_MOD_ROLE_IDS.length === 0) return false;
    return member.roles?.cache?.some(r => TLR_MOD_ROLE_IDS.includes(r.id)) ?? false;
}

module.exports = { TLR_MOD_PING_ROLE_ID, isTlrMod };
