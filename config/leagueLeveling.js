const LEVEL_CONFIG = {
	// Tier 1 (levels 1-4)
	1:  { tier: 1, milestoneCost: 1 },
	2:  { tier: 1, milestoneCost: 1 },
	3:  { tier: 1, milestoneCost: 1 },
	4:  { tier: 1, milestoneCost: 1 },
	// Tier 2 (levels 5-10)
	5:  { tier: 2, milestoneCost: 2 },
	6:  { tier: 2, milestoneCost: 2 },
	7:  { tier: 2, milestoneCost: 2 },
	8:  { tier: 2, milestoneCost: 2 },
	9:  { tier: 2, milestoneCost: 2 },
	10: { tier: 2, milestoneCost: 2 },
	// Tier 3 (levels 11-16)
	11: { tier: 3, milestoneCost: 3 },
	12: { tier: 3, milestoneCost: 3 },
	13: { tier: 3, milestoneCost: 3 },
	14: { tier: 3, milestoneCost: 3 },
	15: { tier: 3, milestoneCost: 3 },
	16: { tier: 3, milestoneCost: 3 },
	// Tier 4 (levels 17-20)
	17: { tier: 4, milestoneCost: 3 },
	18: { tier: 4, milestoneCost: 3 },
	19: { tier: 4, milestoneCost: 3 },
	20: { tier: 4, milestoneCost: null }, // max level, no further cost
}

const MAX_LEVEL = 20;

function resolveLevelUps(currentLevel, currentMilstones) {
	let level = currentLevel;
	let milestone = currentMilstones;
	let consumed = 0;
	let levelUps = 0;

	while (level < MAX_LEVEL) {
		const config = LEVEL_CONFIG[level];
		if (!config || config.milestoneCost === null) break;
		if (milestone < config.milestoneCost) break;

		milestone -= config.milestoneCost;
		consumed += config.milestoneCost;
		level += 1;
		levelUps += 1;
	}

	return {
		newLevel:level,
		milestonesConsumed: consumed,
		milestonesRemaining: milestone,
		levelUps,
	};
}

module.exports = { LEVEL_CONFIG, MAX_LEVEL, resolveLevelUps }
