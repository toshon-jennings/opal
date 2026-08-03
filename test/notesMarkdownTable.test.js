import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import { notesMarkdownTableComponents } from '../src/components/NotesMarkdownTable.jsx';

const TABLE_MARKDOWN = `| Tier | Best pick | Input |
| --- | --- | --- |
| Budget | DeepSeek-V4-Flash | $0.09/M |`;

describe('Workspace Notes Markdown tables', () => {
    it('renders readable spacing and horizontal overflow for wide tables', () => {
        const html = renderToStaticMarkup(
            React.createElement(
                ReactMarkdown,
                {
                    remarkPlugins: [remarkGfm],
                    components: notesMarkdownTableComponents,
                },
                TABLE_MARKDOWN,
            ),
        );

        expect(html).toContain('<table');
        expect(html).toContain('overflow-x-auto');
        expect(html).toMatch(/<th[^>]*class="[^"]*px-3[^"]*py-2/);
        expect(html).toMatch(/<td[^>]*class="[^"]*px-3[^"]*py-2/);
        expect(html).toContain('border-[var(--border)]');
    });
});
