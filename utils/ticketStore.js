const path = require('path');
const { createJsonStore } = require('./jsonStore');

const ticketsStore  = createJsonStore(path.join(__dirname, '../data/tickets.json'), []);
const countersStore = createJsonStore(path.join(__dirname, '../data/ticketCounters.json'), {});

const locks = new Map();

function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(key, next.catch(() => {}));
    return next;
}

function nextTicketNumber(slug) {
    return withLock(slug, () => {
        const counters = countersStore.load();
        const current = counters[slug] ?? 0;
        const next = current > 999 ? 0 : current;
        counters[slug] = next + 1;
        countersStore.save(counters);
        return String(next).padStart(3, '0');
    });
}

function resetCounter(slug) {
    return withLock(slug, () => {
        const counters = countersStore.load();
        counters[slug] = 0;
        countersStore.save(counters);
    });
}

function resetAllCounters() {
    return withLock('__all__', () => {
        countersStore.save({});
    });
}

// ─── Ticket records ─────────────────────────────────────────────────────────

function loadTickets() {
    return ticketsStore.load();
}

function saveTickets(tickets) {
    ticketsStore.save(tickets);
}

function getTicketByChannelId(channelId) {
    return loadTickets().find(t => t.channelId === channelId) || null;
}

function getTicketById(id) {
    return loadTickets().find(t => t.id === id) || null;
}

function addTicket(record) {
    return withLock('__tickets__', () => {
        const tickets = loadTickets();
        tickets.push(record);
        saveTickets(tickets);
        return record;
    });
}

function updateTicket(id, patch) {
    return withLock('__tickets__', () => {
        const tickets = loadTickets();
        const idx = tickets.findIndex(t => t.id === id);
        if (idx === -1) return null;
        tickets[idx] = { ...tickets[idx], ...patch };
        saveTickets(tickets);
        return tickets[idx];
    });
}

module.exports = {
    nextTicketNumber,
    resetCounter,
    resetAllCounters,
    loadTickets,
    saveTickets,
    getTicketByChannelId,
    getTicketById,
    addTicket,
    updateTicket,
};
