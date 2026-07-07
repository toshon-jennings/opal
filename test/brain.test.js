import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    indexNote,
    scoreNote,
    splitSections,
    pickSection,
    findPointerTarget,
    lookupNotes,
} from '../src/lib/brain.js';
import { tokenizeForRelevance } from '../src/lib/relevance.js';

// In-memory vault backing the mocked window.electron file IPC. Each test uses
// its own folder name so brain.js's module-level index cache never carries over.
function mockVault(folder, files) {
    globalThis.window = globalThis.window || {};
    globalThis.window.electron = {
        listFiles: vi.fn(async () => Object.keys(files)),
        readFile: vi.fn(async (path) => {
            const name = path.replace(`${folder}/`, '');
            if (!(name in files)) throw new Error(`ENOENT: ${path}`);
            return files[name];
        }),
        registerWorkspace: vi.fn(async () => true),
        getDefaultNotesPath: vi.fn(async () => folder),
    };
    return globalThis.window.electron;
}

describe('indexNote', () => {
    it('extracts headings, terms, tags, and link targets without keeping content', () => {
        const entry = indexNote('Espresso.md', [
            '---',
            'tags: [coffee, brewing]',
            '---',
            '# Espresso',
            'Grind fine and pull the shot for 28 seconds.',
            '## Dialing in',
            'See [[Grinder Settings]] and [notes](Water%20Chemistry.md).',
        ].join('\n'));

        expect(entry.id).toBe('Espresso');
        expect(entry.headings).toEqual(['Espresso', 'Dialing in']);
        expect(entry.tagKeys).toContain('coffee');
        expect(entry.terms.grind).toBe(1);
        expect(entry.links).toContain('Grinder Settings');
        expect(entry.links).toContain('Water%20Chemistry');
        expect(entry.content).toBeUndefined();
    });
});

describe('scoreNote', () => {
    it('ranks a title match above a body-only match', () => {
        const titleHit = indexNote('Kombucha Recipe.md', 'Ferment for ten days.');
        const bodyHit = indexNote('Journal.md', 'Tried kombucha today, quite fizzy. kombucha kombucha.');
        const tokens = tokenizeForRelevance('kombucha recipe');
        expect(scoreNote(titleHit, tokens)).toBeGreaterThan(scoreNote(bodyHit, tokens));
    });
});

describe('splitSections / pickSection', () => {
    const body = [
        'Intro line before any heading.',
        '# Setup',
        'Install the dependencies.',
        '# Deployment',
        'Ship with the deploy script on Fridays.',
    ].join('\n');

    it('keeps the pre-heading preamble as its own section', () => {
        const sections = splitSections(body);
        expect(sections).toHaveLength(3);
        expect(sections[0].heading).toBe('');
        expect(sections[0].text).toBe('Intro line before any heading.');
    });

    it('picks the section matching the query tokens', () => {
        const best = pickSection(splitSections(body), tokenizeForRelevance('how do I deploy'));
        expect(best.heading).toBe('Deployment');
    });
});

describe('findPointerTarget', () => {
    const notes = [indexNote('Target.md', 'Real content'), indexNote('Stub.md', 'See [[Target]]')];

    it('follows a short pointer stub to the linked note', () => {
        const section = { heading: 'Ref', text: 'See [[Target]]' };
        expect(findPointerTarget(section, notes, notes[1])?.id).toBe('Target');
    });

    it('ignores links inside substantive sections', () => {
        const section = { heading: 'Ref', text: `See [[Target]]. ${'x'.repeat(200)}` };
        expect(findPointerTarget(section, notes, notes[1])).toBeNull();
    });
});

describe('lookupNotes', () => {
    beforeEach(() => {
        delete globalThis.window?.electron;
    });

    it('returns only the best-matching section of the winning note', async () => {
        const electron = mockVault('/vault-basic', {
            'Sourdough.md': '# Starter\nFeed daily.\n# Baking\nBake at 240C with steam for the first 20 minutes.',
            'Taxes.md': '# Deadlines\nFile by April.',
        });
        const result = await lookupNotes({ query: 'what temperature do I bake sourdough at' });
        expect(result.note).toBe('Sourdough');
        expect(result.section_heading).toBe('Baking');
        expect(result.content).toContain('240C');
        expect(result.content).not.toContain('Feed daily');
        // Index build reads both files; retrieval re-reads only the winner.
        expect(electron.readFile).toHaveBeenCalledTimes(3);
    });

    it('follows pointer stubs and reports the hop', async () => {
        mockVault('/vault-pointer', {
            'Deploy.md': '# Deploy\nSee [[Runbook]]',
            'Runbook.md': '# Steps\nRun the release script, then verify the health check endpoint.',
        });
        const result = await lookupNotes({ query: 'deploy' });
        expect(result.note).toBe('Runbook');
        expect(result.followed_pointer_from).toBe('Deploy');
        expect(result.content).toContain('release script');
    });

    it('skips encrypted notes and reads a named note directly', async () => {
        mockVault('/vault-mixed', {
            'Secret.md': '<!--ENC:v1-->{"data":"..."}',
            'Public.md': 'Visible content about gardening.',
        });
        const byQuery = await lookupNotes({ query: 'secret' });
        expect(byQuery.found).toBe(false);
        const byName = await lookupNotes({ note: 'public' });
        expect(byName.note).toBe('Public');
        expect(byName.content).toContain('gardening');
    });

    it('returns an error payload instead of throwing without electron', async () => {
        const result = await lookupNotes({ query: 'anything' });
        expect(result.error).toMatch(/desktop app/);
    });
});
