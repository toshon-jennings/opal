// Perci Brain — deterministic retrieval over the Perci Notes vault.
//
// Pipeline (mirrors the "brain.js" second-brain pattern):
//   1. Index every note once per session — title, tags, headings, term
//      frequencies, outgoing wikilinks. No note content is kept in the index.
//   2. A query is tokenized (relevance.js) and scored against the index
//      WITHOUT re-reading any file.
//   3. Only the winning note is read; only its best-matching section is
//      returned — that section is all the LLM ever sees.
//   4. If the winning section is just a pointer stub ("see [[Other Note]]"),
//      the pointer is followed automatically (bounded hops).
//
// Exposed to the agent as the `notes_lookup` tool via integrationTools.js.
// Electron-only: relies on window.electron file IPC (guarded by callers).

import { tokenizeForRelevance } from './relevance';
import { parseNoteTags, stripNoteFrontmatter, tagKey } from './notesTags';
import { isEncrypted } from '../utils/note-crypto';
import { readStringStorage } from './persistentStore';

// Same key NotesMode persists the vault folder under.
const NOTES_FOLDER_KEY = 'perci_notes_folder';

const INDEX_TTL_MS = 2 * 60 * 1000; // rebuild window; edits show up within this
const SECTION_CHAR_LIMIT = 2600;
const POINTER_STUB_MAX_CHARS = 160;
const MAX_POINTER_HOPS = 2;
const MAX_OTHER_MATCHES = 4;

let cache = null; // { folder, builtAt, notes: [entry] }

function noteIdFromFileName(file) {
    return String(file || '').replace(/\.enc\.md$/, '').replace(/\.md$/, '');
}

function extractLinkTargets(body) {
    const targets = [];
    const wikiRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    const mdRe = /\[[^\]]+\]\(([^)]+\.md)\)/g;
    let m;
    while ((m = wikiRe.exec(body)) !== null) targets.push(m[1].trim());
    while ((m = mdRe.exec(body)) !== null) targets.push(m[1].split('/').pop().replace(/\.md$/, ''));
    return targets;
}

export function indexNote(file, content) {
    const id = noteIdFromFileName(file);
    const tags = parseNoteTags(content);
    const body = stripNoteFrontmatter(content);

    const headings = [];
    for (const line of body.split('\n')) {
        const m = line.match(/^#{1,6}\s+(.+)/);
        if (m) headings.push(m[1].trim());
    }

    const terms = {};
    for (const token of tokenizeForRelevance(body)) {
        terms[token] = (terms[token] || 0) + 1;
    }

    return {
        id,
        file,
        tags,
        headings,
        terms,
        links: extractLinkTargets(body),
        chars: body.length,
        // Precomputed lowercase forms so query-time scoring never re-lowers.
        idLower: id.toLowerCase(),
        baseLower: id.split('/').pop().toLowerCase(),
        tagKeys: tags.map(tagKey),
        headingsLower: headings.map(h => h.toLowerCase()),
    };
}

export function scoreNote(entry, tokens) {
    let score = 0;
    for (const token of tokens) {
        if (entry.idLower.includes(token)) score += 6;
        if (entry.tagKeys.some(t => t.includes(token))) score += 4;
        if (entry.headingsLower.some(h => h.includes(token))) score += 3;
        const tf = entry.terms[token] || 0;
        if (tf) score += Math.min(tf, 5);
    }
    return score;
}

export function splitSections(body) {
    const sections = [];
    let current = { heading: '', lines: [] };
    for (const line of String(body || '').split('\n')) {
        const m = line.match(/^#{1,6}\s+(.+)/);
        if (m) {
            if (current.heading || current.lines.some(l => l.trim())) sections.push(current);
            current = { heading: m[1].trim(), lines: [] };
        } else {
            current.lines.push(line);
        }
    }
    sections.push(current);
    return sections.map(s => ({ heading: s.heading, text: s.lines.join('\n').trim() }));
}

export function pickSection(sections, tokens) {
    if (!sections.length) return { heading: '', text: '' };
    if (sections.length === 1 || !tokens.length) return sections[0];
    let best = sections[0];
    let bestScore = -1;
    for (const section of sections) {
        const headingLower = section.heading.toLowerCase();
        const textLower = section.text.toLowerCase();
        let score = 0;
        for (const token of tokens) {
            if (headingLower.includes(token)) score += 4;
            let idx = 0;
            let hits = 0;
            while (hits < 5 && (idx = textLower.indexOf(token, idx)) !== -1) {
                hits += 1;
                idx += token.length;
            }
            score += hits;
        }
        if (score > bestScore) {
            bestScore = score;
            best = section;
        }
    }
    return best;
}

function findNote(notes, name) {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return null;
    return notes.find(e => e.idLower === target) || notes.find(e => e.baseLower === target) || null;
}

// A "pointer stub" is a near-empty section whose only substance is a link to
// another note — follow it instead of returning the stub.
export function findPointerTarget(section, notes, currentEntry) {
    if (section.text.length > POINTER_STUB_MAX_CHARS) return null;
    const targets = extractLinkTargets(section.text);
    for (const name of targets) {
        const entry = findNote(notes, name);
        if (entry && entry.id !== currentEntry.id) return entry;
    }
    return null;
}

async function resolveNotesFolder() {
    let folder = readStringStorage(NOTES_FOLDER_KEY, '');
    if (folder) {
        // Custom folders must be re-registered with the main process each
        // session before file IPC will accept them (same as NotesMode).
        await window.electron.registerWorkspace?.(folder);
    } else if (window.electron.getDefaultNotesPath) {
        folder = await window.electron.getDefaultNotesPath();
    }
    if (!folder) throw new Error('No Perci Notes folder is configured. Open Notes mode once to set one.');
    return String(folder).replace(/\/+$/, '');
}

async function buildIndex(folder) {
    const files = (await window.electron.listFiles(folder))
        .filter(f => f.toLowerCase().endsWith('.md'));
    const notes = [];
    await Promise.all(files.map(async (file) => {
        let content = '';
        try {
            content = await window.electron.readFile(`${folder}/${file}`);
        } catch {
            return; // unreadable file — leave it out of the index
        }
        if (isEncrypted(content)) return; // locked notes stay private
        notes.push(indexNote(file, content));
    }));
    return { folder, builtAt: Date.now(), notes };
}

async function getIndex() {
    const folder = await resolveNotesFolder();
    if (!cache || cache.folder !== folder || Date.now() - cache.builtAt > INDEX_TTL_MS) {
        cache = await buildIndex(folder);
    }
    return cache;
}

async function retrieveSection(index, entry, tokens) {
    let current = entry;
    let followedFrom = null;
    for (let hop = 0; hop <= MAX_POINTER_HOPS; hop++) {
        const raw = await window.electron.readFile(`${index.folder}/${current.file}`);
        const section = pickSection(splitSections(stripNoteFrontmatter(raw)), tokens);
        const pointer = hop < MAX_POINTER_HOPS
            ? findPointerTarget(section, index.notes, current)
            : null;
        if (!pointer) return { section, entry: current, followedFrom };
        followedFrom = followedFrom || current.id;
        current = pointer;
    }
    // Unreachable: the loop always returns by the final hop.
}

// Agent-tool entry point. Never throws — tool errors are returned as data so
// the chat loop keeps streaming.
export async function lookupNotes({ query = '', note = '' } = {}) {
    try {
        if (!window.electron?.listFiles) {
            return { error: 'Perci Notes lookup is only available in the desktop app.' };
        }
        const index = await getIndex();
        if (!index.notes.length) {
            return { error: 'The Perci Notes vault is empty (or every note is encrypted).' };
        }

        const tokens = tokenizeForRelevance(query || note);
        let entry = null;
        let otherMatches = [];

        if (note) {
            entry = findNote(index.notes, note);
            if (!entry) {
                return { error: `No note titled "${note}". Retry with a query to search instead.` };
            }
        } else {
            if (!tokens.length) {
                return { error: 'Provide a query with at least one content word.' };
            }
            const scored = index.notes
                .map(e => ({ entry: e, score: scoreNote(e, tokens) }))
                .filter(s => s.score > 0)
                .sort((a, b) => b.score - a.score);
            if (!scored.length) {
                return { found: false, message: `No notes matched. The vault has ${index.notes.length} notes.` };
            }
            entry = scored[0].entry;
            otherMatches = scored.slice(1, 1 + MAX_OTHER_MATCHES)
                .map(s => ({ note: s.entry.id, score: s.score }));
        }

        const { section, entry: source, followedFrom } = await retrieveSection(index, entry, tokens);
        const content = section.text.length > SECTION_CHAR_LIMIT
            ? `${section.text.slice(0, SECTION_CHAR_LIMIT)}\n\n[truncated ${section.text.length - SECTION_CHAR_LIMIT} chars — call notes_lookup with note:"${source.id}" and a narrower query for more]`
            : section.text;

        return {
            note: source.id,
            file: `${index.folder}/${source.file}`,
            tags: source.tags,
            section_heading: section.heading,
            content,
            ...(followedFrom ? { followed_pointer_from: followedFrom } : {}),
            linked_notes: source.links.slice(0, 10),
            other_matches: otherMatches,
        };
    } catch (err) {
        return { error: `Notes lookup failed: ${err.message}` };
    }
}
