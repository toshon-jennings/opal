import { describe, it, expect, vi } from 'vitest';
import { runChatWithTools } from '../src/lib/integrationTools.js';

// A client that asks for one round of tool calls, then answers.
function makeClient(toolCalls) {
    let round = 0;
    return {
        streamChatWithTools: vi.fn(async () => {
            round += 1;
            return round === 1
                ? { content: '', toolCalls }
                : { content: 'done', toolCalls: [] };
        })
    };
}

function call(name, i) {
    return { id: `c${i}`, name, args: {} };
}

// Records execution order and holds each call open long enough for an abort
// fired between ticks to land mid-flight.
function makeExecuteTool(started, delayMs = 20) {
    return async (name) => {
        started.push(name);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return { ok: true };
    };
}

const TOOLS = [
    { name: 'github_get_repo' },
    { name: 'github_list_issues' },
    { name: 'github_create_issue' }
];

async function run({ toolCalls, abortAfterMs }) {
    const started = [];
    const controller = new AbortController();
    const promise = runChatWithTools({
        client: makeClient(toolCalls),
        messages: [{ role: 'user', content: 'go' }],
        tools: TOOLS,
        executeTool: makeExecuteTool(started),
        signal: controller.signal
    }).catch(error => ({ aborted: error?.name === 'AbortError' }));

    if (abortAfterMs != null) {
        setTimeout(() => controller.abort(), abortAfterMs);
    }
    await promise;
    // Let anything already in flight settle before asserting.
    await new Promise(resolve => setTimeout(resolve, 120));
    return started;
}

describe('runChatWithTools tool-call abort', () => {
    it('stops queued writes when the user aborts mid-turn', async () => {
        const toolCalls = [
            call('github_create_issue', 1),
            call('github_create_issue', 2),
            call('github_create_issue', 3)
        ];
        const started = await run({ toolCalls, abortAfterMs: 10 });

        // The first write is already away; the rest must never start.
        expect(started).toEqual(['github_create_issue']);
    });

    it('runs a turn containing a write sequentially, in call order', async () => {
        const toolCalls = [
            call('github_get_repo', 1),
            call('github_create_issue', 2),
            call('github_list_issues', 3)
        ];
        const started = await run({ toolCalls });

        expect(started).toEqual(['github_get_repo', 'github_create_issue', 'github_list_issues']);
    });

    it('fans out a read-only turn concurrently', async () => {
        const toolCalls = [
            call('github_get_repo', 1),
            call('github_list_issues', 2),
            call('github_get_repo', 3)
        ];
        const start = Date.now();
        const started = await run({ toolCalls });
        const elapsed = Date.now() - start;

        expect(started).toHaveLength(3);
        // Three 20ms reads: concurrent lands well under the 60ms serial floor.
        expect(elapsed).toBeLessThan(160);
    });
});
