const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

function unquote(value) {
    return String(value || '').trim().replace(/^['"]|['"]$/g, '');
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

function parseFrontmatterFields(frontmatter) {
    const fields = {};
    if (!frontmatter) return fields;

    frontmatter.split(/\r?\n/).forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return;
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        fields[key] = unquote(value);
    });

    return fields;
}

function parseTagsFromFrontmatter(frontmatter) {
    if (!frontmatter) return [];
    const lines = frontmatter.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^\s*tags\s*:\s*(.*)$/i);
        if (!match) continue;
        const raw = match[1].trim();
        if (raw.startsWith('[') && raw.endsWith(']')) {
            return raw.slice(1, -1).split(',').map(unquote).filter(Boolean);
        }
        const tags = [unquote(raw)];
        for (let j = i + 1; j < lines.length; j++) {
            const item = lines[j].match(/^\s*-\s+(.+)$/);
            if (!item) break;
            tags.push(unquote(item[1]));
        }
        return tags;
    }
    return [];
}

export function parseNoteOKF(content) {
    const { frontmatter, body } = splitFrontmatter(content);
    const fields = parseFrontmatterFields(frontmatter);
    const tags = parseTagsFromFrontmatter(frontmatter);

    return {
        type: fields.type || '',
        title: fields.title || '',
        description: fields.description || '',
        resource: fields.resource || '',
        tags,
        timestamp: fields.timestamp || '',
        body,
        hasOKF: frontmatter !== null,
    };
}

export function ensureOKFDefaults(parsed, fileName) {
    const now = new Date().toISOString();
    const noteId = String(fileName || '').replace(/\.enc\.md$/, '').replace(/\.md$/, '');

    let title = parsed.title || '';
    if (!title) {
        const h1Match = /^#\s+(.+)$/m.exec(parsed.body || '');
        title = h1Match ? h1Match[1].trim() : noteId;
    }

    let description = parsed.description || '';
    if (!description) {
        const cleanLines = (parsed.body || '')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('#'));
        description = cleanLines.length > 0
            ? cleanLines[0].substring(0, 100)
            : `Note about ${noteId}`;
    }

    return {
        type: parsed.type || 'Note',
        title,
        description,
        resource: parsed.resource || '',
        tags: parsed.tags && parsed.tags.length > 0 ? parsed.tags : [],
        timestamp: parsed.timestamp || now,
    };
}

export function buildNoteOKF(fields, body) {
    const lines = ['---'];

    if (fields.type) lines.push(`type: ${fields.type}`);
    if (fields.title) lines.push(`title: "${fields.title.replace(/"/g, '\\"')}"`);
    if (fields.description) lines.push(`description: "${fields.description.replace(/"/g, '\\"')}"`);
    if (fields.resource) lines.push(`resource: ${fields.resource}`);
    if (fields.tags && fields.tags.length > 0) {
        lines.push(`tags: [${fields.tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]`);
    }
    if (fields.timestamp) lines.push(`timestamp: ${fields.timestamp}`);

    lines.push('---');
    return lines.join('\n') + '\n\n' + (body || '').replace(/^\n+/, '');
}

export function migrateLegacyFrontmatter(content) {
    const { frontmatter, body } = splitFrontmatter(content);
    if (!frontmatter) return null;

    const fields = parseFrontmatterFields(frontmatter);
    if (fields.type) return null;

    const tags = parseTagsFromFrontmatter(frontmatter);
    if (tags.length === 0) return null;

    return { tags, fields, body };
}

export function updateOKFField(content, field, value) {
    const { frontmatter, body } = splitFrontmatter(content);

    if (frontmatter === null) {
        const newFM = value ? `---\n${field}: ${value}\n---\n\n` : '';
        return newFM + content;
    }

    const lines = frontmatter.split(/\r?\n/);
    let updated = false;
    const newLines = lines.map(line => {
        if (line.startsWith(`${field}:`)) {
            updated = true;
            return value ? `${field}: ${value}` : null;
        }
        return line;
    }).filter(l => l !== null);

    if (!updated && value) {
        newLines.push(`${field}: ${value}`);
    }

    return `---\n${newLines.join('\n')}\n---\n${body}`;
}

export function updateOKFTags(content, tags) {
    const { frontmatter, body } = splitFrontmatter(content);

    if (frontmatter === null) {
        if (!tags || tags.length === 0) return content;
        const tagLine = `tags: [${tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]`;
        return `---\n${tagLine}\n---\n\n${content}`;
    }

    const lines = frontmatter.split(/\r?\n/);
    const newLines = [];
    let skipNext = false;

    for (let i = 0; i < lines.length; i++) {
        if (skipNext) {
            if (/^\s*-\s+/.test(lines[i])) continue;
            skipNext = false;
        }
        if (/^\s*tags\s*:/i.test(lines[i])) {
            skipNext = true;
            continue;
        }
        newLines.push(lines[i]);
    }

    if (tags && tags.length > 0) {
        newLines.unshift(`tags: [${tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]`);
    }

    return `---\n${newLines.join('\n')}\n---\n${body}`;
}
