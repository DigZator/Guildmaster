const { randomInt } = require('crypto');

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function words(n) {
    if (n < 20) return ONES[n];
    const t = TENS[Math.floor(n / 10)];
    return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const FORMATS = [
    () => { const a = randomInt(10, 90), b = randomInt(10, 90); return { q: `${a} + ${b} = ?`, a: a + b }; },
    () => { const a = randomInt(30, 99), b = randomInt(10, a); return { q: `${a} - ${b} = ?`, a: a - b }; },
    () => { const b = randomInt(2, 60), c = randomInt(b + 1, 99); return { q: `${b} + ? = ${c}`, a: c - b }; },
    () => { const b = randomInt(2, 60), c = randomInt(b + 1, 99); return { q: `? + ${b} = ${c}`, a: c - b }; },
    () => { const c = randomInt(20, 99), a = randomInt(1, c); return { q: `${c} - ? = ${a}`, a: c - a }; },
    () => { const a = randomInt(11, 99), b = randomInt(11, 99); return { q: `${cap(words(a))} plus ${words(b)} = ?`, a: a + b }; },
    () => { const a = randomInt(30, 99), b = randomInt(11, a); return { q: `${cap(words(a))} minus ${words(b)} = ?`, a: a - b }; },
];

const LABEL_LIMIT = 45;

function generateProblem(previousQuestion = null) {
    for (let i = 0; i < 50; i++) {
        const { q, a } = FORMATS[randomInt(FORMATS.length)]();
        if (q.length > LABEL_LIMIT || a < 1 || q === previousQuestion) continue;
        return { question: q, answer: a };
    }
    const a = randomInt(10, 50), b = randomInt(10, 50);
    return { question: `${a} + ${b} = ?`, answer: a + b };
}

function parseAnswer(raw) {
    const s = String(raw ?? '').trim();
    return /^\d{1,4}$/.test(s) ? Number(s) : null;
}

module.exports = { generateProblem, parseAnswer, LABEL_LIMIT };
