import { describe, expect, it } from 'vitest';
import {
    normalizeNoteTags,
    parseNoteTags,
    setNoteTags,
    stripNoteFrontmatter,
} from '../src/lib/notesTags.js';

describe('notesTags', () => {
    it('normalizes comma-separated tag input', () => {
        expect(normalizeNoteTags('AI, #Product Ideas, ai')).toEqual(['AI', 'Product-Ideas']);
    });

    it('parses inline YAML frontmatter tags', () => {
        const note = `---\ntags: ["ai", "product"]\n---\n\n# Note`;
        expect(parseNoteTags(note)).toEqual(['ai', 'product']);
    });

    it('parses list YAML frontmatter tags', () => {
        const note = `---\ntitle: Tagged\nTags:\n  - design\n  - "daily notes"\n---\n\nBody`;
        expect(parseNoteTags(note)).toEqual(['design', 'daily-notes']);
    });

    it('writes tags while preserving existing frontmatter fields', () => {
        const next = setNoteTags(`---\ntitle: Existing\n---\n# Existing`, ['research', 'ai']);
        expect(next).toBe(`---\ntags: ["research", "ai"]\ntitle: Existing\n---\n\n# Existing`);
    });

    it('removes tags and strips empty frontmatter', () => {
        expect(setNoteTags(`---\ntags: ["old"]\n---\n\n# Note`, [])).toBe('# Note');
    });

    it('strips frontmatter for preview rendering', () => {
        expect(stripNoteFrontmatter(`---\ntags: ["old"]\n---\n\n# Note`)).toBe('# Note');
    });

    it('leaves notes without frontmatter unchanged for preview rendering', () => {
        expect(stripNoteFrontmatter('\n\n# Plain')).toBe('\n\n# Plain');
    });
});
