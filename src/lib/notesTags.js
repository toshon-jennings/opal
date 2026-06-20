const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

function unquote(value) {
    return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function parseInlineTags(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return trimmed
            .slice(1, -1)
            .split(',')
            .map(unquote);
    }

    return trimmed.split(',').map(unquote);
}

function yamlQuote(value) {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function splitFrontmatter(content) {
    const text = String(content || '');
    const match = text.match(FRONTMATTER_RE);
    if (!match) return { frontmatter: null, body: text };
    return {
        frontmatter: match[1],
        body: text.slice(match[0].length),
    };
}

export function normalizeTagValue(value) {
    return String(value || '')
        .trim()
        .replace(/^#+/, '')
        .replace(/\s+/g, '-')
        .replace(/[{},]/g, '')
        .replaceAll('[', '')
        .replaceAll(']', '')
        .replace(/^['"]|['"]$/g, '');
}

export function tagKey(value) {
    return normalizeTagValue(value).toLowerCase();
}

export function normalizeNoteTags(input) {
    const raw = Array.isArray(input)
        ? input
        : String(input || '').split(/[,;\n]/);

    const seen = new Set();
    const tags = [];

    raw.forEach(value => {
        const tag = normalizeTagValue(value);
        const key = tag.toLowerCase();
        if (!tag || seen.has(key)) return;
        seen.add(key);
        tags.push(tag);
    });

    return tags;
}

export function parseNoteTags(content) {
    const { frontmatter } = splitFrontmatter(content);
    if (!frontmatter) return [];

    const lines = frontmatter.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^\s*tags\s*:\s*(.*)$/i);
        if (!match) continue;

        const tags = parseInlineTags(match[1]);
        for (let j = i + 1; j < lines.length; j++) {
            const item = lines[j].match(/^\s*-\s+(.+)$/);
            if (!item) break;
            tags.push(unquote(item[1]));
        }
        return normalizeNoteTags(tags);
    }

    return [];
}

export function stripNoteFrontmatter(content) {
    const parsed = splitFrontmatter(content);
    return parsed.frontmatter == null ? parsed.body : parsed.body.replace(/^\n+/, '');
}

function removeTagsField(lines) {
    const next = [];

    for (let i = 0; i < lines.length; i++) {
        if (/^\s*tags\s*:/i.test(lines[i])) {
            i += 1;
            while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
                i += 1;
            }
            i -= 1;
            continue;
        }
        next.push(lines[i]);
    }

    return next;
}

export function setNoteTags(content, tags) {
    const normalizedTags = normalizeNoteTags(tags);
    const tagLine = normalizedTags.length
        ? `tags: [${normalizedTags.map(yamlQuote).join(', ')}]`
        : '';
    const { frontmatter, body } = splitFrontmatter(content);

    if (frontmatter == null) {
        if (!tagLine) return String(content || '');
        return `---\n${tagLine}\n---\n\n${String(content || '').replace(/^\n+/, '')}`;
    }

    const lines = removeTagsField(frontmatter.split(/\r?\n/))
        .filter((line, index, all) => line.trim() || (index > 0 && index < all.length - 1));

    if (tagLine) {
        lines.unshift(tagLine);
    }

    if (!lines.some(line => line.trim())) {
        return body.replace(/^\n+/, '');
    }

    return `---\n${lines.join('\n')}\n---\n${body.startsWith('\n') ? '' : '\n'}${body}`;
}
