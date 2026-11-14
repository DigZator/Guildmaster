const ITEM_TYPE_CHOICES = [
    { name: 'Armor',            value: 'Armor' },
    { name: 'Shield',           value: 'Shield' },
    { name: 'Weapon',           value: 'Weapon' },
    { name: 'Melee Weapon',     value: 'Melee Weapon' },
    { name: 'Ranged Weapon',    value: 'Ranged Weapon' },
    { name: 'Ammunition',       value: 'Ammunition' },
    { name: 'Tool',             value: 'Tool' },
    { name: 'Gaming Set',       value: 'Gaming Set' },
    { name: 'Instrument',       value: 'Instrument' },
    { name: 'Adventuring Gear', value: 'Adventuring Gear' },
    { name: 'Gear',             value: 'Gear' },
    { name: 'Potion',           value: 'Potion' },
    { name: 'Scroll',           value: 'Scroll' },
    { name: 'Rod',              value: 'Rod' },
    { name: 'Ring',             value: 'Ring' },
    { name: 'Wand',             value: 'Wand' },
    { name: 'Staff',            value: 'Staff' },
    { name: 'Wondrous Item',    value: 'Wondrous Item' },
    { name: 'Treasure',         value: 'Treasure' },
    { name: 'Trade Good',       value: 'Trade Good' },
    { name: 'Vehicle',          value: 'Vehicle' },
];

const ITEM_SUBTYPE_CHOICES = [
    { name: 'Potion',       value: 'Potion' },
    { name: 'Spell Scroll', value: 'Spell Scroll' },
    { name: 'Gear',         value: 'Gear' },
    { name: 'Ammo',         value: 'Ammo' },
    { name: 'Other',        value: 'Other' },
];

const ITEM_RARITY_CHOICES = [
    { name: 'Common',    value: 'Common' },
    { name: 'Uncommon',  value: 'Uncommon' },
    { name: 'Rare',      value: 'Rare' },
    { name: 'Very Rare', value: 'Very Rare' },
    { name: 'Legendary', value: 'Legendary' },
];

module.exports = { ITEM_TYPE_CHOICES, ITEM_SUBTYPE_CHOICES, ITEM_RARITY_CHOICES };
