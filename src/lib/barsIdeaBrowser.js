const IDEA_URL_PATTERN = /https?:\/\/(?:www\.)?ideabrowser\.com\/idea\/[^\s)\]]+/i;

const TAG_RULES = [
    ['glp-1', /\bglp[-\s]?1\b|\bweight[-\s]?loss\b|\bcompounded\b/i],
    ['healthcare', /\bpatient|\bmedication|\bhealth\b|\btelehealth\b/i],
    ['pharmacy', /\bpharmac/i],
    ['telehealth', /\btelehealth\b/i],
    ['pricing', /\bprice|\bpricing|\$\d/i],
    ['compliance', /\blegal|\bregulation|\bjurisdiction|\bvetted\b/i],
    ['marketplace', /\bcomparison\b|\bside by side\b|\bmarketplace\b/i],
    ['reviews', /\breview/i],
];

function cleanText(value) {
    return String(value || '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function canonicalIdeaBrowserUrl(value) {
    const match = String(value || '').match(IDEA_URL_PATTERN);
    if (!match) return '';
    try {
        const url = new URL(match[0]);
        return `${url.origin}${url.pathname}`;
    } catch {
        return match[0];
    }
}

function titleCaseSlug(slug) {
    const smallWords = new Set(['and', 'or', 'for', 'the', 'a', 'an', 'to', 'of', 'in', 'on', 'with']);
    return slug
        .replace(/-[a-f0-9]{8,}$/i, '')
        .split('-')
        .filter(Boolean)
        .map((word, index) => {
            if (/^glp$/i.test(word)) return 'GLP';
            if (/^\d+$/.test(word)) return word;
            const lower = word.toLowerCase();
            if (index > 0 && smallWords.has(lower)) return lower;
            return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
        })
        .join(' ')
        .replace(/\bGLP 1\b/g, 'GLP-1');
}

function titleFromIdeaUrl(sourceUrl) {
    if (!sourceUrl) return '';
    try {
        const slug = new URL(sourceUrl).pathname.split('/idea/')[1] || '';
        return titleCaseSlug(slug);
    } catch {
        return '';
    }
}

function titleFromSubject(text) {
    const match = String(text || '').match(/^\s*(?:Subject:\s*)?Idea of the Day:\s*([^\n]+)/im);
    return cleanText(match?.[1] || '');
}

function isIdeaBlockEnd(line) {
    return [
        /^\[?(Browse this idea|Featured image|View full idea)/i,
        /^Today's report is free/i,
        /^Also released today:/i,
        /^Today's Sponsor/i,
        /^HIDDEN NICHE OPPORTUNITY/i,
        /^Founder Playbook/i,
        /^BUILDER BOOKMARKS/i,
        /^Sneak peek/i,
        /^PS\b/i,
    ].some(pattern => pattern.test(line));
}

function extractIdeaBlock(text) {
    const lines = String(text || '').split(/\r?\n/);
    const markerIndex = lines.findIndex(line => /^Idea of the Day\s*$/i.test(line.trim()));
    const startIndex = markerIndex >= 0 ? markerIndex + 1 : 0;
    const block = [];

    for (const line of lines.slice(startIndex)) {
        const trimmed = line.trim();
        if (trimmed && isIdeaBlockEnd(trimmed)) break;
        block.push(line);
    }

    return block.join('\n').trim();
}

function paragraphsFromBlock(block) {
    return String(block || '')
        .split(/\n\s*\n/)
        .map(paragraph => cleanText(paragraph.replace(/\n/g, ' ')))
        .filter(paragraph => paragraph && !/^https?:\/\//i.test(paragraph));
}

function splitSentences(value) {
    return cleanText(value)
        .split(/(?<=[.!?])\s+/)
        .map(sentence => sentence.trim())
        .filter(Boolean);
}

function inferTags(text) {
    const tags = TAG_RULES
        .filter(([, pattern]) => pattern.test(text))
        .map(([tag]) => tag);
    return [...new Set(tags)].slice(0, 7).concat('ideabrowser');
}

function categoryFromTags(tags) {
    if (tags.includes('healthcare') && tags.includes('marketplace')) return 'Healthcare marketplace';
    if (tags.includes('healthcare')) return 'Healthcare';
    if (tags.includes('marketplace')) return 'Marketplace';
    return 'IdeaBrowser';
}

function followUpAngles(tags, text) {
    if (tags.includes('glp-1') || tags.includes('pharmacy')) {
        return [
            'Verify pharmacy pricing, concentration, and legality data sources.',
            'Interview GLP-1 buyers about trust, price, and safety comparison pain.',
            'Check jurisdiction update cadence before sketching a provider index.',
        ];
    }
    if (tags.includes('compliance')) {
        return [
            'Map the regulatory source of truth and how often it changes.',
            'Find users who already compare options manually.',
        ];
    }
    if (/pricing|comparison/i.test(text)) {
        return ['Validate the comparison data source and willingness to pay.'];
    }
    return ['Validate the sharpest user pain and the first data source.'];
}

export function parseIdeaBrowserBar(rawText) {
    const text = String(rawText || '').trim();
    const sourceUrl = canonicalIdeaBrowserUrl(text);
    const looksLikeIdeaBrowser = /Idea of the Day/i.test(text) || /ideabrowser\.com\/idea\//i.test(text);
    if (!text || !looksLikeIdeaBrowser) return null;

    const ideaBlock = extractIdeaBlock(text);
    const paragraphs = paragraphsFromBlock(ideaBlock);
    const combined = [text, ideaBlock].join('\n');
    const tags = inferTags(combined);
    const thesis = paragraphs.find(paragraph => /\bis\b.+\b(platform|tool|product|dashboard|marketplace)\b/i.test(paragraph))
        || paragraphs[1]
        || paragraphs[0]
        || (sourceUrl ? 'Imported from IdeaBrowser for follow-up.' : '');
    const supportParagraph = paragraphs.find(paragraph => paragraph !== thesis) || '';
    const supportingNotes = splitSentences(supportParagraph).slice(0, 4);
    const angles = followUpAngles(tags, combined);
    const title = titleFromSubject(text) || titleFromIdeaUrl(sourceUrl) || 'IdeaBrowser idea';
    const notes = [
        'Core thesis:',
        thesis,
        '',
        'Supporting notes:',
        ...(supportingNotes.length ? supportingNotes.map(note => `- ${note}`) : ['- Source needs review.']),
        '',
        'Follow-up angles:',
        ...angles.map(angle => `- ${angle}`),
        ...(sourceUrl ? ['', `Source: ${sourceUrl}`] : []),
    ].join('\n');

    return {
        kind: 'Idea',
        title,
        notes,
        category: categoryFromTags(tags),
        status: 'New',
        impact: tags.includes('healthcare') ? '4' : '3',
        effort: tags.includes('compliance') ? '3' : '2',
        next: angles[0],
        tags,
    };
}
