function normalizeItalics(text) {
    if (!text) return null;
    const stripped = text.replace(/[*_~`]/g, '').trim();
    return `*${stripped}*`;
}

function stripMarkdown(text) {
    return text.replace(/[*_~`]/g, '').trim();
}

function extractField(lines, label) {
    const line = lines.find(l => 
        stripMarkdown(l).toLowerCase().startsWith(label.toLowerCase() + ':')
    );
    if (!line) return null;
    
    const value = line.split(':').slice(1).join(':').trim();
    return stripMarkdown(value) || '';
}

module.exports = function parseAnnouncement(text) {
    const errors = [];
    
    const allLines = text.split('\n');
    const nonEmptyLines = allLines.map(l => l.trim()).filter(Boolean);
    
    if (nonEmptyLines.length < 4) {
        throw new Error('Announcement is missing essential information');
    }

    // ===== PARSE FIXED HEADER (Lines 0-3) =====
    const title = stripMarkdown(nonEmptyLines[0]);
    const metaLine = stripMarkdown(nonEmptyLines[1]).toLowerCase();
    const date = stripMarkdown(nonEmptyLines[2]);
    const time = stripMarkdown(nonEmptyLines[3]);

    if (!title) errors.push('Title is empty');
    if (!date) errors.push('Date is empty');
    if (!time) errors.push('Time is empty');

    // ===== PARSE META LINE =====
    // Expected format: "[Mode] [Format] for [Difficulty]"
    const metaParts = metaLine.split(' for ');
    const isWorkshop = metaLine.includes('workshop');

    if (metaParts.length !== 2) {
        errors.push('Meta line must be in format: "[Mode] [Format] for [Difficulty]" or "[Mode] Workshop"');
    }

    const [leftMeta, rightMeta] = metaParts;

    let mode = null;
    if (leftMeta && leftMeta.includes('in-person')) mode = 'In-Person';
    else if (leftMeta && leftMeta.includes('online')) mode = 'Online';
    else if (leftMeta && leftMeta.includes('play-by-post')) mode = 'Play-By-Post';
    
    if (!mode) errors.push('Invalid mode in meta line (expected: In-Person, Online, or Play-By-Post)');

    let format = null;
    if (leftMeta && leftMeta.includes('one-shot')) format = 'One-Shot';
    else if (leftMeta && leftMeta.includes('mini-adventure')) format = 'Mini-Adventure';
    else if (leftMeta && leftMeta.includes('campaign')) format = 'Campaign';
    else if (leftMeta && leftMeta.includes('workshop')) format = 'Workshop';
    
    if (!format) errors.push('Invalid format in meta line (expected: One-Shot, Mini-Adventure, Campaign, or Workshop)');

    let difficulty = null;
    if (format !== 'Workshop') {
        if (rightMeta && rightMeta.includes('newbie')) difficulty = 'newbies';
        else if (rightMeta && rightMeta.includes('intermediate')) difficulty = 'intermediates';
        else if (rightMeta && rightMeta.includes('veteran')) difficulty = 'veterans';
    
        if (!difficulty) errors.push('Invalid difficulty in meta line (expected: Newbies, Intermediates, or Veterans)');
    }

    const DIFFICULTY_COLORS = {
        newbies: 0x5DADEC,        // Light Blue
        beginners: 0x52BE80,
        intermediates: 0xF1C40F,  // Yellow
        veterans: 0xE74C3C        // Red
    };

    const embedColor = DIFFICULTY_COLORS[difficulty] ?? 0x5865F2;
    const sessionTypeLabel = mode && format ? `${mode} ${format}` : '⚠️ INVALID SESSION TYPE';

    // ===== PARSE BLURB =====
    // Blurb starts at line 4 (index 4) and ends when we hit "CW:"
    let blurbLines = [];
    let cwIndex = -1;

    for (let i = 4; i < allLines.length; i++) {
        const line = allLines[i];
        const strippedLine = stripMarkdown(line).trim();
        
        if (strippedLine.toLowerCase().startsWith('cw:')) {
            cwIndex = i;
            break;
        }
        
        // Preserve blank lines and italicize paragraphs
        if (line.trim() === '') {
            blurbLines.push(''); // Preserve blank line
        } else {
            blurbLines.push(normalizeItalics(line));
        }
    }

    const blurb = blurbLines.join('\n').trim();
    if (!blurb) errors.push('Blurb is missing or empty');

    // ===== PARSE LABELED FIELDS =====
    // Get all lines from CW onwards as non-empty for field extraction
    const fieldLines = cwIndex !== -1 
        ? allLines.slice(cwIndex).map(l => l.trim()).filter(Boolean)
        : [];

    const contentWarnings = extractField(fieldLines, 'CW');
    const dm = extractField(fieldLines, 'DM');
    const system = extractField(fieldLines, 'System');
    const level = extractField(fieldLines, 'Level');
    const classesAllowed = extractField(fieldLines, 'Classes Allowed');
    const speciesAllowed = extractField(fieldLines, 'Species Allowed');
    const sessionType = extractField(fieldLines, 'Session Type');
    const venue = extractField(fieldLines, 'Venue');
    const cost = extractField(fieldLines, 'Cost');
    const dateRepeat = extractField(fieldLines, 'Date');
    const timeRepeat = extractField(fieldLines, 'Time');
    const artCredits = extractField(fieldLines, 'Art Credits');

    // Validate Date/Time/Session Type match
    if (dateRepeat && date && stripMarkdown(dateRepeat).toLowerCase() !== stripMarkdown(date).toLowerCase()) {
        throw new Error(`Date mismatch: "${date}" vs "${dateRepeat}". Please correct and try again.`);
    }
    
    if (timeRepeat && time && stripMarkdown(timeRepeat).toLowerCase() !== stripMarkdown(time).toLowerCase()) {
        throw new Error(`Time mismatch: "${time}" vs "${timeRepeat}". Please correct and try again.`);
    }
    
    if (sessionType && sessionTypeLabel && stripMarkdown(sessionType).toLowerCase() !== sessionTypeLabel.toLowerCase()) {
        throw new Error(`Session Type mismatch: Meta line says "${sessionTypeLabel}" but Session Type field says "${sessionType}". Please correct and try again.`);
    }

    // ===== PARSE OTHER NOTES =====
    const otherNotesIndex = fieldLines.findIndex(l =>
        stripMarkdown(l).toLowerCase() === 'other notes:'
    );

    const otherNotes = [];
    if (otherNotesIndex !== -1) {
        for (let i = otherNotesIndex + 1; i < fieldLines.length; i++) {
            const line = fieldLines[i].trim();
            if (!line.startsWith('-')) break;
            otherNotes.push(stripMarkdown(line.slice(1).trim()));
        }
    }

    // ===== PARSE REGISTRATION SECTION =====
    // Find lines containing "!! Register" and the link after it
    let registrationText = '**!! Register by clicking the link below !!**';
    let registrationLink = 'https://adventuringguildmumbai.fillout.com/player-sign-up';

    const artCreditsIndex = fieldLines.findIndex(l =>
    stripMarkdown(l).toLowerCase().startsWith('art credits:'));

    if (artCreditsIndex !== -1) {
        // Get lines after Art Credits from the original allLines array
        const artCreditsLineInAll = allLines.findIndex(l =>
            stripMarkdown(l).toLowerCase().startsWith('art credits:')
        );
        
        if (artCreditsLineInAll !== -1) {
            const linesAfterArtCredits = allLines.slice(artCreditsLineInAll + 1);
            
            // Find line with double exclamations
            const registerIndex = linesAfterArtCredits.findIndex(l =>
                l.includes('!!') && l.split('!!').length >= 3
            );
            
            if (registerIndex !== -1) {
                registrationText = linesAfterArtCredits[registerIndex].trim();
                
                // Look for URL in the next non-empty line
                for (let i = registerIndex + 1; i < linesAfterArtCredits.length; i++) {
                    const nextLine = linesAfterArtCredits[i].trim();
                    if (nextLine === '') continue;
                    
                    if (nextLine.includes('http://') || nextLine.includes('https://')) {
                        registrationLink = nextLine;
                        break;
                    }
                    
                    break;
                }
            }
        }
    }

    // ===== RETURN PARSED DATA =====
    return {
        // Basic info
        title: title || '⚠️ MISSING TITLE',
        date: date || '⚠️ MISSING DATE',
        time: time || '⚠️ MISSING TIME',
        blurb: blurb || '⚠️ MISSING BLURB',

        // Session details
        mode: mode || '⚠️ INVALID MODE',
        format: format || '⚠️ INVALID FORMAT',
        difficulty: difficulty || '⚠️ INVALID DIFFICULTY',
        sessionTypeLabel,
        embedColor,

        // Fields (with error markers for missing required fields)
        contentWarnings: contentWarnings ?? '',
        dm: dm ?? '⚠️ MISSING REQUIRED FIELD',
        system: system ?? '⚠️ MISSING REQUIRED FIELD',
        level: level ?? '⚠️ MISSING REQUIRED FIELD',
        classesAllowed: classesAllowed ?? '⚠️ MISSING REQUIRED FIELD',
        speciesAllowed: speciesAllowed ?? '⚠️ MISSING REQUIRED FIELD',
        venue: venue ?? '⚠️ MISSING REQUIRED FIELD',
        cost: cost ?? '⚠️ MISSING REQUIRED FIELD',
        artCredits: artCredits ?? '⚠️ MISSING REQUIRED FIELD',

        // Registration
        registrationText,
        registrationLink,

        // Other
        otherNotes,

        // Validation
        errors,
        hasErrors: errors.length > 0
    };
};