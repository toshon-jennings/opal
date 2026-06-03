import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    OpenAIClient,
    GroqClient,
    AnthropicClient,
    MistralClient,
    OpenRouterClient,
} from '../src/lib/llm/clients.js';

// A streaming Response stand-in that yields a single SSE chunk then closes,
// while recording the AbortSignal it was handed.
function makeStreamingFetchMock() {
    const calls = [];
    const fetchMock = vi.fn(async (url, options = {}) => {
        calls.push({ url, signal: options.signal });
        const encoder = new TextEncoder();
        const payloads = [
            encoder.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n'),
            encoder.encode('data: [DONE]\n'),
        ];
        let i = 0;
        return {
            ok: true,
            body: {
                getReader() {
                    return {
                        read() {
                            if (i < payloads.length) {
                                return Promise.resolve({ done: false, value: payloads[i++] });
                            }
                            return Promise.resolve({ done: true, value: undefined });
                        },
                    };
                },
            },
        };
    });
    return { fetchMock, calls };
}

const clients = [
    ['OpenAI', () => new OpenAIClient('test-key'), 'gpt-4o'],
    ['Groq', () => new GroqClient('test-key'), 'llama-3.3-70b-versatile'],
    ['Mistral', () => new MistralClient('test-key'), 'mistral-large-latest'],
    ['OpenRouter', () => new OpenRouterClient('test-key'), 'openai/gpt-4o'],
];

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('abort signal propagation', () => {
    it.each(clients)('%s.streamChat forwards the caller AbortSignal to fetch', async (_name, make, modelId) => {
        const { fetchMock, calls } = makeStreamingFetchMock();
        vi.stubGlobal('fetch', fetchMock);

        const controller = new AbortController();
        const client = make();
        await client.streamChat([{ role: 'user', content: 'hello' }], () => {}, modelId, {
            signal: controller.signal,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(calls[0].signal).toBe(controller.signal);
    });

    it('Anthropic.streamChat forwards the caller AbortSignal to fetch', async () => {
        // Anthropic uses an event-stream parser; a done-immediately body is enough
        // to confirm the signal reaches fetch without exercising chunk parsing.
        const calls = [];
        const fetchMock = vi.fn(async (url, options = {}) => {
            calls.push({ signal: options.signal });
            return {
                ok: true,
                body: {
                    getReader: () => ({
                        read: () => Promise.resolve({ done: true, value: undefined }),
                    }),
                },
            };
        });
        vi.stubGlobal('fetch', fetchMock);

        const controller = new AbortController();
        const client = new AnthropicClient('test-key');
        await client.streamChat([{ role: 'user', content: 'hello' }], () => {}, 'claude-sonnet-4-5', {
            signal: controller.signal,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(calls[0].signal).toBe(controller.signal);
    });

    it('propagates an AbortError thrown by fetch when the signal is aborted', async () => {
        const fetchMock = vi.fn(async (url, options = {}) => {
            if (options.signal?.aborted) {
                const err = new Error('The operation was aborted.');
                err.name = 'AbortError';
                throw err;
            }
            throw new Error('expected an aborted signal');
        });
        vi.stubGlobal('fetch', fetchMock);

        const controller = new AbortController();
        controller.abort();
        const client = new OpenAIClient('test-key');

        await expect(
            client.streamChat([{ role: 'user', content: 'hello' }], () => {}, 'gpt-4o', {
                signal: controller.signal,
            })
        ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('runs without a signal when none is supplied (signal is undefined)', async () => {
        const { fetchMock, calls } = makeStreamingFetchMock();
        vi.stubGlobal('fetch', fetchMock);

        const client = new OpenAIClient('test-key');
        await client.streamChat([{ role: 'user', content: 'hello' }], () => {}, 'gpt-4o');

        expect(calls[0].signal).toBeUndefined();
    });
});
