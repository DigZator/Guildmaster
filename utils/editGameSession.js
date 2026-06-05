const sessions = new Map();
const timeouts = new Map();

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function set(userId, data) {
	if (timeouts.has(userId)) {
		clearTimeout(timeouts.get(userId));
	}

	sessions.set(userId, data);

	const timeout = setTimeout(() => {
		sessions.delete(userId);
		timeouts.delete(userId);
	}, SESSION_TIMEOUT_MS);

	timeouts.set(userId, timeout);
}

function get(userId) {
	return sessions.get(userId);
}

function has(userId) {
	return sessions.has(userId);
}

function remove(userId) {
	if (timeouts.has(userId)) {
		clearTimeout(timeouts.get(userId));
		timeouts.delete(userId);
	}
	sessions.delete(userId);
}

module.exports = { set, get, has, remove };
