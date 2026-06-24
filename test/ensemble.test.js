import { describe, expect, it } from 'vitest';
import {
    buildContextBlock,
    buildResponsesBlock,
    renderTemplate,
    responseLabel,
    runEnsemble,
} from '../src/lib/ensemble.js';

// A streamModel stub that returns canned text per model and records every call.
function makeStreamModel(answers) {
    const calls = [];
    const streamModel = async ({ provider, modelId, system, user, onToken }) => {
        const text = answers[`${provider}::${modelId}`] ?? `reply from ${modelId}`;
        calls.push({ provider, modelId, system, user });
        // Emit in two chunks to exercise the token path.
        const mid = Math.ceil(text.length / 2);
        onToken?.(text.slice(0, mid));
        onToken?.(text.slice(mid));
        return text;
    };
    return { streamModel, calls };
}

describe('ensemble helpers', () => {
    it('labels responses A, B, … Z, AA', () => {
        expect(responseLabel(0)).toBe('A');
        expect(responseLabel(2)).toBe('C');
        expect(responseLabel(25)).toBe('Z');
        expect(responseLabel(26)).toBe('AA');
    });

    it('fills template placeholders', () => {
        expect(renderTemplate('Hi {{NAME}}, {{NAME}}!', { NAME: 'Perci' })).toBe('Hi Perci, Perci!');
        expect(renderTemplate('{{N}} models', { N: 3 })).toBe('3 models');
    });

    it('builds a context block, fencing files by path and skipping empties', () => {
        expect(buildContextBlock([])).toBe('');
        expect(buildContextBlock([{ path: 'a.js', content: '   ' }])).toBe('');
        const block = buildContextBlock([
            { path: 'src/a.js', content: 'export const a = 1;' },
            { path: 'README.md', content: '# Hi' },
            { path: 'empty.txt', content: '' },
        ]);
        expect(block).toContain('===== FILE: src/a.js =====');
        expect(block).toContain('export const a = 1;');
        expect(block).toContain('===== FILE: README.md =====');
        expect(block).not.toContain('empty.txt'); // empty content is dropped
    });

    it('anonymises panel responses by default', () => {
        const responses = [
            { model: { name: 'Opus', provider: 'anthropic' }, text: 'one' },
            { model: { name: 'GPT', provider: 'openai' }, text: 'two' },
        ];
        const block = buildResponsesBlock(responses, true);
        expect(block).toContain('--- Response A ---');
        expect(block).toContain('--- Response B ---');
        expect(block).not.toContain('Opus');

        const named = buildResponsesBlock(responses, false);
        expect(named).toContain('Opus (anthropic)');
    });
});

describe('runEnsemble pipeline', () => {
    const panel = [
        { provider: 'anthropic', modelId: 'opus', name: 'Opus' },
        { provider: 'openai', modelId: 'gpt', name: 'GPT' },
    ];
    const judge = { provider: 'anthropic', modelId: 'judge', name: 'Judge' };

    it('fans out, judges, synthesises and returns the final answer', async () => {
        const { streamModel, calls } = makeStreamModel({
            'anthropic::opus': 'opus answer',
            'openai::gpt': 'gpt answer',
            'anthropic::judge': 'JUDGE ANALYSIS',
        });

        const events = [];
        const result = await runEnsemble(
            { prompt: 'What is 2+2?', panel, judge, rounds: 1 },
            { streamModel, onEvent: (e) => events.push(e.type) },
        );

        // 2 panel calls + 1 judge + 1 synth.
        expect(calls).toHaveLength(4);
        // synth call (last) is the judge model by default and must see both drafts + judge text.
        const synthCall = calls[3];
        expect(synthCall.user).toContain('opus answer');
        expect(synthCall.user).toContain('JUDGE ANALYSIS');
        // synth defaults to the judge model, which returns 'JUDGE ANALYSIS'.
        expect(result.answer).toBe('JUDGE ANALYSIS');
        expect(result.responses).toHaveLength(2);
        expect(events).toContain('judge:done');
        expect(events.at(-1)).toBe('done');
    });

    it('injects attached context into every stage (panel, judge, synth)', async () => {
        const { streamModel, calls } = makeStreamModel({});
        const context = buildContextBlock([{ path: 'src/auth.js', content: 'const SECRET_MARKER = 42;' }]);
        await runEnsemble({ prompt: 'review this', panel, judge, rounds: 1, context }, { streamModel });
        // 2 panel + judge + synth = 4 calls, all carrying the context block.
        expect(calls).toHaveLength(4);
        for (const call of calls) {
            expect(call.user).toContain('SECRET_MARKER');
            expect(call.user).toContain('===== FILE: src/auth.js =====');
        }
    });

    it('uses a distinct synth model when provided', async () => {
        const synth = { provider: 'openai', modelId: 'gpt-synth', name: 'GPT Synth' };
        const { streamModel, calls } = makeStreamModel({});
        await runEnsemble({ prompt: 'hi', panel, judge, synth, rounds: 1 }, { streamModel });
        expect(calls.at(-1).modelId).toBe('gpt-synth');
    });

    it('loops extra rounds, feeding the candidate back via the refine template', async () => {
        const { streamModel, calls } = makeStreamModel({});
        await runEnsemble({ prompt: 'improve me', panel, judge, rounds: 2 }, { streamModel });
        // round 1: 2 panel + judge + synth = 4; round 2: same = 4 → 8 total.
        expect(calls).toHaveLength(8);
        // round-2 panel calls must include the round-1 candidate answer.
        const round2PanelCall = calls[4];
        expect(round2PanelCall.user).toContain('CANDIDATE ANSWER');
    });

    it('survives a single failing panel model', async () => {
        const streamModel = async ({ modelId, user, onToken }) => {
            if (modelId === 'opus') throw new Error('boom');
            const text = `ok-${modelId}`;
            onToken?.(text);
            return text;
        };
        const errors = [];
        const result = await runEnsemble(
            { prompt: 'x', panel, judge, rounds: 1 },
            { streamModel, onEvent: (e) => e.type === 'panel:error' && errors.push(e.error) },
        );
        expect(errors).toContain('boom');
        expect(result.responses).toHaveLength(1); // only GPT survived
    });

    it('throws when every panel model fails', async () => {
        const streamModel = async () => { throw new Error('all down'); };
        await expect(
            runEnsemble({ prompt: 'x', panel, judge, rounds: 1 }, { streamModel }),
        ).rejects.toThrow('All panel models failed');
    });

    it('validates required config', async () => {
        const { streamModel } = makeStreamModel({});
        await expect(runEnsemble({ prompt: '', panel, judge }, { streamModel })).rejects.toThrow('prompt is required');
        await expect(runEnsemble({ prompt: 'x', panel: [], judge }, { streamModel })).rejects.toThrow('at least one panel');
        await expect(runEnsemble({ prompt: 'x', panel, judge: null }, { streamModel })).rejects.toThrow('judge model');
    });
});
