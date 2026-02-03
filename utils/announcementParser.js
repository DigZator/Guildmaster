function normalizeItalics(text) {
    if (!text) return null;

    // Remove existing markdown emphasis
    const stripped = text.replace(/[*_~`]/g, '').trim();

    // Wrap once in italics
    return `*${stripped}*`;
}

module.exports = function parseAnnouncement(text) {
    const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    if (lines.length < 4) {
        throw new Error('Announcement must have at least 4 lines');
    }

    const strip = (s) => s.replace(/[*_]/g, '').trim();

    const title = strip(lines[0]);
    const metaLine = strip(lines[1]).toLowerCase();
    const date = strip(lines[2]);
    const time = strip(lines[3]);

    // ---- META LINE ----
    const [left, right] = metaLine.split(' for ');
    if (!left || !right) {
        throw new Error('Invalid meta line format');
    }

    let mode = null;
    let format = null;

    if (left.includes('in-person')) mode = 'In-Person';
    else if (left.includes('online')) mode = 'Online';

    if (left.includes('one-shot')) format = 'One-Shot';
    else if (left.includes('campaign')) format = 'Campaign';

    if (!mode || !format) {
        throw new Error('Could not determine session mode or format');
    }

    let difficulty = null;
    if (right.includes('newbie')) difficulty = 'newbies';
    else if (right.includes('intermediate')) difficulty = 'intermediates';
    else if (right.includes('veteran')) difficulty = 'veterans';

    if (!difficulty) {
        throw new Error('Could not determine difficulty');
    }

    const DIFFICULTY_COLORS = {
        beginners: 0x5DADEC,      // Light Blue
        intermediates: 0xF1C40F,  // Yellow
        veterans: 0xE74C3C        // Red
    };

    const embedColor = DIFFICULTY_COLORS[difficulty] ?? 0x5865F2;

    const sessionTypeLabel = `${mode} ${format}`;

    // ---- HELPERS ----
    const extractValue = (label) => {
        const line = lines.find(l =>
            strip(l).toLowerCase().startsWith(label.toLowerCase())
        );
        return line ? strip(line.split(':').slice(1).join(':')) : null;
    };

    // ---- BLURB ----
    const blurbStart = 4;
    const blurbEnd = lines.findIndex(l => strip(l).toLowerCase().startsWith('cw:'));
    const rawblurb = blurbEnd !== -1
        ? lines.slice(blurbStart, blurbEnd).join('\n')
        : lines.slice(blurbStart).join('\n');
    
    const blurb = normalizeItalics(rawblurb);
        

    // ---- OTHER NOTES ----
    const otherNotesIndex = lines.findIndex(l =>
        strip(l).toLowerCase() === 'other notes:'
    );

    const otherNotes = [];
    if (otherNotesIndex !== -1) {
        for (let i = otherNotesIndex + 1; i < lines.length; i++) {
            if (!lines[i].startsWith('-')) break;
            otherNotes.push(strip(lines[i].slice(1)));
        }
    }

    return {
        title,
        date,
        time,
        blurb,

        mode,
        format,
        difficulty,
        sessionTypeLabel,
        embedColor,

        contentWarnings: extractValue('cw'),
        dm: extractValue('dm'),
        system: extractValue('system'),
        level: extractValue('level'),
        classesAllowed: extractValue('classes allowed'),
        speciesAllowed: extractValue('species allowed'),
        campaignLink: extractValue('campaign link'),
        venue: extractValue('venue'),
        cost: extractValue('cost'),
        artCredits: extractValue('art credits'),

        otherNotes
    };
};
