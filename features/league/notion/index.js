const { withPageLock, withTwoPageLocks, updatePageProperty, getPageById } = require('./core');
const {
    getCharacterGold,
    getActiveCharacter,
    getCharactersByDiscordId,
    searchCharactersByName,
    queryLeaderboard,
    createCharacter,
    setCharacterStatus,
    findCharacterStatusIssues,
    adjustCharacterNumber,
    adjustCharacterNumbersUnlocked,
    setCharacterLevel,
    updateCharacterArt,
} = require('./characters');
const { createInventoryItem, getCharacterInventory, setItemStatus } = require('./inventory');
const { createQuestLogEntry, getCharacterQuestLog } = require('./questLog');
const {
    createDowntimeProgress,
    getDowntimeProgressById,
    getActiveDowntimeForCharacter,
    investDowntimeProgress,
    setDowntimeStatus,
} = require('./downtime');
const {
    getOpenListings,
    getListingById,
    createListing,
    generateListingId,
} = require('./marketplace');

module.exports = {
	// Helper
	updatePageProperty,
	getCharacterGold,
	getPageById,

	// Characters
	getActiveCharacter,
	getCharactersByDiscordId,
	searchCharactersByName,
	queryLeaderboard,
	createCharacter,
	setCharacterStatus,
	adjustCharacterNumber,
	adjustCharacterNumbersUnlocked,
	setCharacterLevel,
	updateCharacterArt,
	findCharacterStatusIssues,

	// Inventory
	createInventoryItem,
	getCharacterInventory,
	setItemStatus,

	// Quest Log
	createQuestLogEntry,
	getCharacterQuestLog,

	// Concurrency
	withPageLock,
	withTwoPageLocks,

	// Downtime
	createDowntimeProgress,
	getDowntimeProgressById,
	getActiveDowntimeForCharacter,
	investDowntimeProgress,
	setDowntimeStatus,

	// Marketplace
	getOpenListings,
	createListing,
	getListingById,
	generateListingId,

	// Trades
};
