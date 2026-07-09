const REP_TIERS = [
	{ min: 1,  max: 2,  		discounts: { Common: 0, Uncommon: 10, Rare: 0,  'Very Rare': 0,  Legendary: 0  } },
	{ min: 3,  max: 5,  		discounts: { Common: 0, Uncommon: 20, Rare: 0,  'Very Rare': 0,  Legendary: 0  } },
	{ min: 6,  max: 11, 		discounts: { Common: 0, Uncommon: 30, Rare: 10, 'Very Rare': 0,  Legendary: 0  } },
	{ min: 12, max: 18, 		discounts: { Common: 0, Uncommon: 40, Rare: 20, 'Very Rare': 0,  Legendary: 0  } },
	{ min: 19, max: 27, 		discounts: { Common: 0, Uncommon: 50, Rare: 30, 'Very Rare': 10, Legendary: 0  } },
	{ min: 28, max: 36, 		discounts: { Common: 0, Uncommon: 50, Rare: 40, 'Very Rare': 20, Legendary: 0  } },
	{ min: 37, max: 45, 		discounts: { Common: 0, Uncommon: 50, Rare: 50, 'Very Rare': 30, Legendary: 10 } },
	{ min: 46, max: Infinity, 	discounts: { Common: 0, Uncommon: 50, Rare: 50, 'Very Rare': 40, Legendary: 20 } },
];

const DISCOUNT_RP_COST = {
	10: 1,
	20: 1,
	30: 5,
	40: 5,
	50: 10,
};

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary'];

const DISCOUNT_STEPS = [10, 20, 30, 40, 50];

const COMMON_DISCOUNT = { discount: 20, rpCost: 1 };

function tierForRep(repPoints) {
	return REP_TIERS.find(t => repPoints >= t.min && repPoints <= t.max) ?? null;
}

function maxDiscountFor(repPoints, rarity) {
	if (rarity === 'Common') {
		return repPoints >= COMMON_DISCOUNT.rpCost ? COMMON_DISCOUNT.discount : 0;
	}
	const tier = tierForRep(repPoints);
	if (!tier) return 0;
	return tier.discounts[rarity] ?? 0;
}

function availableDiscounts(repPoints, rarity) {
	if (rarity === 'Common') {
		return repPoints >= COMMON_DISCOUNT.rpCost ? [{ ...COMMON_DISCOUNT }] : [];
	}

	const ceiling = maxDiscountFor(repPoints, rarity);
	if (ceiling <= 0) return [];

	return DISCOUNT_STEPS
		.filter(step => step <= ceiling)
		.map(step => ({ discount: step, rpCost: DISCOUNT_RP_COST[step] }))
		.filter(d => d.rpCost <= repPoints); // can't spend more RP than they have
}

module.exports = {
	REP_TIERS,
	DISCOUNT_RP_COST,
	COMMON_DISCOUNT,
	RARITIES,
	DISCOUNT_STEPS,
	tierForRep,
	maxDiscountFor,
	availableDiscounts,
};
