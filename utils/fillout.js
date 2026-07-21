require('dotenv').config();

const FILLOUT_API_KEY = process.env.FILLOUT_API_KEY;
const FORM_ID = process.env.FILLOUT_FORM_ID;

const TABLE_QUESTION_NAME = 'Select the table you want to be a part of';
const CONTACT_QUESTION_NAME = 'How should we contact you?';
const NAME_QUESTION_NAME = "What's your full name?";
const SEAT_QUESTION_NAME = 'Select Seats';
const EXPERIENCE_QUESTION_NAME = "What's your Level of Experience?";

function normalizeUid(uid) {
	return (uid || '').replace(/-/g, '');
}

async function fetchFilloutSubmissions() {
	const submissions = [];
	const pageSize = 150;
	let offset = 0;

	while (true) {
		const url = `https://api.fillout.com/v1/api/forms/${FORM_ID}/submissions?sort=desc&limit=${pageSize}&offset=${offset}`;

		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${FILLOUT_API_KEY}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Fillout API error ${response.status}: ${errText}`);
		}

		const data = await response.json();
		const batch = data.responses || [];
		submissions.push(...batch);

		if (batch.length < pageSize) break;
		offset += pageSize;
	}

	return submissions;
}

function getAnswer(questions, name) {
	return questions.find(q => q.name === name)?.value ?? null;
}

function extractPlayer(submission) {
	const questions = submission.questions || [];

	const tableAnswer = getAnswer(questions, TABLE_QUESTION_NAME);
	const recordID = tableAnswer?.[0]?.recordID ?? null;

	const contactAnswer = getAnswer(questions, CONTACT_QUESTION_NAME);
	const discordUsername = contactAnswer?.[0]?.['Discord Username'] || 'N/A';

	const seatAnswer = getAnswer(questions, SEAT_QUESTION_NAME);
	const seatCount = Array.isArray(seatAnswer) ? seatAnswer.length : (seatAnswer ? 1 : 0);
	const seat = seatAnswer?.[0]?.Name ?? 'N/A';

	return {
		submissionId: submission.submissionId,
		submissionTime: submission.submissionTime,
		fullName: getAnswer(questions, NAME_QUESTION_NAME) || 'N/A',
		discordUsername,
		seat,
		seatCount,
		experience: getAnswer(questions, EXPERIENCE_QUESTION_NAME) || 'N/A',
		recordID,
	};
}

async function getPlayers(uid) {
	const normalizedUid = normalizeUid(uid);
	const submissions = await fetchFilloutSubmissions();

	return submissions
		.map(extractPlayer)
		.filter(player => player.recordID === normalizedUid);
}

function truncate(str, maxLen) {
	str = String(str ?? '');
	if (str.length <= maxLen) return str;
	return str.slice(0, maxLen - 1) + '…';
}

function pad(str, len) {
	str = String(str ?? '');
	if (str.length >= len) return str;
	return str + ' '.repeat(len - str.length);
}

function formatDateIST(isoString) {
	if (!isoString) return 'N/A';
	const date = new Date(isoString);
	if (isNaN(date.getTime())) return String(isoString);

	return date.toLocaleString('en-IN', {
		timeZone: 'Asia/Kolkata',
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		fractionalSecondDigits: 3,
		hour12: true,
	}).replace(',', '');
}

async function formatPlayerList(uid, totalSeats) {
	const players = await getPlayers(uid);

	players.sort((a, b) => new Date(a.submissionTime) - new Date(b.submissionTime));

	const COL_DATE = 23;
	const COL_NAME = 20;
	const COL_DISCORD = 18;
	const COL_EXP = 14;

	const header =
		pad('Date/Time', COL_DATE) + ' | ' +
		pad('Name', COL_NAME) + ' | ' +
		pad('Discord ID', COL_DISCORD) + ' | ' +
		pad('Experience', COL_EXP);

	const separator =
		'-'.repeat(COL_DATE) + '-|-' +
		'-'.repeat(COL_NAME) + '-|-' +
		'-'.repeat(COL_DISCORD) + '-|-' +
		'-'.repeat(COL_EXP);

	const rows = [header, separator];

	let seatsSoFar = 0;
	let dividerInserted = false;
	let totalSeatsClaimed = 0;

	players.forEach((p, i) => {
		const count = p.seatCount || 1;
		const nameLabel = count > 1 ? `${p.fullName} (×${count})` : p.fullName;

		rows.push(
			pad(truncate(formatDateIST(p.submissionTime), COL_DATE), COL_DATE) + ' | ' +
			pad(truncate(nameLabel, COL_NAME), COL_NAME) + ' | ' +
			pad(truncate(p.discordUsername, COL_DISCORD), COL_DISCORD) + ' | ' +
			pad(truncate(p.experience, COL_EXP), COL_EXP)
		);

		seatsSoFar += count;
		totalSeatsClaimed += count;

		if (!dividerInserted && totalSeats > 0 && seatsSoFar >= totalSeats && i + 1 < players.length) {
			rows.push(`----- SEATS FULL (capacity: ${totalSeats}) - below is waitlist -----`);
			dividerInserted = true;
		}
	});

	if (totalSeats > 0 && totalSeatsClaimed <= totalSeats) {
		rows.push(`----- ${totalSeats - totalSeatsClaimed} seat(s) remaining -----`);
	}

	return '```\n' + rows.join('\n') + '\n```';
}

module.exports = { getPlayers, formatPlayerList };
