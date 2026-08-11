// League-standard gold caps per quest tier.
const TIER_GOLD_LIMITS = {
    'Tier 1': 500,
    'Tier 2': 5000,
    'Tier 3': 50000,
    'Tier 4': 100000,
};

function checkGoldAgainstTierLimit(tier, totalGold) {
    if (!tier) return null;
    const limit = TIER_GOLD_LIMITS[tier];
    if (limit == null) return null;
    if (totalGold <= limit) return null;

    return `⚠️ Gold awarded (**${totalGold} gp**) exceeds the **${tier}** league standard (**${limit} gp**). ` +
        `This report is likely to be rejected by the League Admins.`;
}

module.exports = { TIER_GOLD_LIMITS, checkGoldAgainstTierLimit };
