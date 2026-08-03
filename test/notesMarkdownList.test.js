import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import { notesMarkdownListComponents } from '../src/components/NotesMarkdownList.jsx';

const INTERRUPTED_ORDERED_LIST = `1. First item

An unindented paragraph between items.

\`\`\`
An unindented code block between items.
\`\`\`

2. Second item`;

describe('Workspace Notes ordered Markdown lists', () => {
    it('preserves the authored number when an ordered list resumes', () => {
        const html = renderToStaticMarkup(
            React.createElement(
                ReactMarkdown,
                {
                    remarkPlugins: [remarkGfm],
                    components: notesMarkdownListComponents,
                },
                INTERRUPTED_ORDERED_LIST,
            ),
        );

        expect(html).toMatch(/<ol[^>]*>\s*<li>First item<\/li>\s*<\/ol>/);
        expect(html).toMatch(/<ol[^>]*start="2"[^>]*>\s*<li>Second item<\/li>\s*<\/ol>/);
    });
});
