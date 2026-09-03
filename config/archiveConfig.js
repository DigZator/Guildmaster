const path = require('path');
const { createJsonStore } = require('../utils/jsonStore');

const configStore = createJsonStore(path.join(__dirname, '../data/archiveConfig.json'), {
    categoryId: null,
});

function getArchiveCategoryId() {
    const stored = configStore.load();
    return stored.categoryId || process.env.ARCHIVE_CATEGORY_ID || null;
}

function setArchiveCategoryId(categoryId) {
    const next = { categoryId };
    configStore.save(next);
    return next;
}

module.exports = {
    getArchiveCategoryId,
    setArchiveCategoryId,
};
