import { describe, it, expect, vi } from 'vitest';
import { OpenAIClient } from '../src/lib/llm/clients.js';

// Build a fetch mock whose body streams the given byte chunks, so we can
// reproduce SSE `data:` lines split across network read boundaries.
function mockFetchStream(chunks) {
    const encoder = new TextEncoder();
    let i = 0;
    globalThis.fetch = vi.fn(async () => ({
        ok: true,
        body: {
            getReader: () => ({
                read: async () => (i < chunks.length
                    ? { done: false, value: encoder.encode(chunks[i++]) }
                    : { done: true, value: undefined }),
            }),
        },
    }));
}

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

describe('_openAIStreamWithTools SSE parsing', () => {
    it('parses a tool call whose data line is split across read chunks', async () => {
        const events =
            sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'create_card', arguments: '' } }] } }] }) +
            sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"title":"Audit StudioOS Blog Page","column":"Backlog"}' } }] } }] }) +
            'data: [DONE]\n\n';

        // Split in the middle of the arguments JSON of the second event.
        const cut = events.indexOf('StudioOS');
        mockFetchStream([events.slice(0, cut), events.slice(cut)]);

        const client = new OpenAIClient('test-key');
        const { toolCalls } = await client.streamChatWithTools(
            [{ role: 'user', content: 'add a card' }],
            [{ name: 'create_card', description: 'Add a card.', parameters: { title: 'Title', column: 'Column' } }],
            () => {},
            'gpt-4o'
        );

        expect(toolCalls).toHaveLength(1);
        expect(toolCalls[0].name).toBe('create_card');
        expect(toolCalls[0].args).toEqual({ title: 'Audit StudioOS Blog Page', column: 'Backlog' });
    });

    it('accumulates text content split across read chunks', async () => {
        const events =
            sse({ choices: [{ delta: { content: 'Card created — ' } }] }) +
            sse({ choices: [{ delta: { content: 'it is in Backlog.' } }] }) +
            'data: [DONE]\n\n';
        const cut = events.indexOf('created') + 3;
        mockFetchStream([events.slice(0, cut), events.slice(cut)]);

        const client = new OpenAIClient('test-key');
        const { content, toolCalls } = await client.streamChatWithTools(
            [{ role: 'user', content: 'hi' }], [], () => {}, 'gpt-4o'
        );

        expect(content).toBe('Card created — it is in Backlog.');
        expect(toolCalls).toBeNull();
    });
});
