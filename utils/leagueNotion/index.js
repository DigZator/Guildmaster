const { clearSchemaCache, withPageLock, withTwoPageLocks, updatePageProperty, getPageById, queryAllPages } = require('./core');
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
    adjustCharacterNumbers,
    adjustCharacterNumbersUnlocked,
    setCharacterLevel,
    updateCharacterArt,
} = require('./characters');
const { createInventoryItem, getCharacterInventory, destroyAllCharacterItems, setItemStatus } = require('./inventory');
const { createQuestLogEntry, getCharacterQuestLog } = require('./questLog');
const {
    createDowntimeProgress,
    getDowntimeProgressById,
    getActiveDowntimeForCharacter,
    getDowntimeForCharacterByStatus,
    getDowntimeByStatus,
    investDowntimeProgress,
    setDowntimeStatus,
} = require('./downtime');
const {
    getOpenListings,
    getListingById,
    createListing,
    generateListingId,
    createListingWithUniqueId,
    createTrade,
} = require('./marketplace');

module.exports = {
	// Helper
	updatePageProperty,
	getCharacterGold,
	getPageById,
	queryAllPages,

	// Characters
	getActiveCharacter,
	getCharactersByDiscordId,
	searchCharactersByName,
	queryLeaderboard,
	createCharacter,
	setCharacterStatus,
	adjustCharacterNumber,
	adjustCharacterNumbers,
	adjustCharacterNumbersUnlocked,
	setCharacterLevel,
	updateCharacterArt,
	findCharacterStatusIssues,

	// Inventory
	createInventoryItem,
	getCharacterInventory,
	destroyAllCharacterItems,
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
	clearSchemaCache,
	getDowntimeForCharacterByStatus,
	getDowntimeByStatus,
	investDowntimeProgress,
	setDowntimeStatus,

	// Marketplace
	getOpenListings,
	createListing,
	getListingById,
	generateListingId,
	createListingWithUniqueId,

	// Trades
	createTrade,
};
