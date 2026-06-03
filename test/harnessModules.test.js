import { describe, it, expect } from 'vitest';
import {
    createBudgetRun,
    recordBudgetIteration,
    recordBudgetToolCalls,
    recordBudgetResponse,
    estimateCharsFromMessages,
} from '../src/lib/budgetGovernor.js';
import { chooseModelForTask, buildRoutingPrompt } from '../src/lib/modelRouter.js';
import { createIntentReview, readIntentReviews, formatIntentReview } from '../src/lib/diffReview.js';

describe('budgetGovernor', () => {
    it('flags and blocks when the iteration limit is exceeded', () => {
        let run = createBudgetRun('test', { maxIterations: 2 });
        run = recordBudgetIteration(run, 10);
        expect(run.blocked).toBe(false);
        run = recordBudgetIteration(run, 10);
        expect(run.blocked).toBe(true);
        expect(run.warnings.some(w => /Iteration limit/.test(w))).toBe(true);
    });

    it('blocks when the tool-call budget is reached', () => {
        let run = createBudgetRun('test', { maxToolCalls: 1 });
        run = recordBudgetToolCalls(run, 1);
        expect(run.blocked).toBe(true);
        expect(run.warnings.some(w => /Tool-call limit/.test(w))).toBe(true);
    });

    it('accumulates response characters across calls', () => {
        let run = createBudgetRun('test', { maxResponseChars: 100 });
        run = recordBudgetResponse(run, 40);
        run = recordBudgetResponse(run, 40);
        expect(run.responseChars).toBe(80);
        expect(run.blocked).toBe(false);
        run = recordBudgetResponse(run, 40);
        expect(run.blocked).toBe(true);
    });

    it('estimates characters from string and structured message content', () => {
        const total = estimateCharsFromMessages([
            { content: 'hello' },
            { content: [{ text: 'world' }] },
        ]);
        expect(total).toBe('hello'.length + 'world'.length);
    });
});

describe('modelRouter', () => {
    const availableModels = {
        anthropic: [{ id: 'claude-opus-4' }, { id: 'claude-sonnet-4-5' }],
        groq: [{ id: 'llama-3.3-70b-versatile' }],
        ollama: [{ id: 'llama2' }],
    };
    const apiKeys = { anthropic: 'k', groq: 'k' };

    it('routes a hard task to a strong provider with a capable model', () => {
        const route = chooseModelForTask({
            task: 'Refactor the architecture and debug the failing multi-file build',
            availableModels,
            apiKeys,
        });
        expect(route.complexity).toBe('hard');
        expect(route.provider).toBe('anthropic');
        expect(route.model).toBe('claude-opus-4');
    });

    it('skips providers that require a key when none is configured', () => {
        const route = chooseModelForTask({
            task: 'Refactor the architecture and debug the failing multi-file build',
            availableModels,
            apiKeys: {}, // no keys at all
        });
        // Falls through to a local provider that requires no key.
        expect(route.provider).toBe('ollama');
    });

    it('keeps an explicitly selected, available model for a simple task', () => {
        const route = chooseModelForTask({
            task: 'summarize this short note',
            selectedProvider: 'groq',
            selectedModel: 'llama-3.3-70b-versatile',
            availableModels,
            apiKeys,
        });
        expect(route.provider).toBe('groq');
        expect(route.model).toBe('llama-3.3-70b-versatile');
        expect(route.reason).toMatch(/kept selected/);
    });

    it('reports no route when nothing is available', () => {
        const route = chooseModelForTask({ task: 'do something', availableModels: {}, apiKeys: {} });
        expect(route.provider).toBeNull();
        expect(buildRoutingPrompt(route)).toMatch(/no automatic route/);
    });
});

describe('diffReview', () => {
    it('parses git diff stat output into files and stats and persists the review', () => {
        const output = [
            ' src/lib/modelRouter.js | 12 ++++++--',
            ' src/components/CodeMode.jsx | 4 +-',
            ' 2 files changed, 10 insertions(+), 4 deletions(-)',
        ].join('\n');
        const review = createIntentReview({ command: 'git diff --stat', output });
        expect(review.files).toContain('src/lib/modelRouter.js');
        expect(review.stats.insertions).toBe(10);
        expect(review.stats.deletions).toBe(4);
        expect(review.stats.filesChanged).toBe(2);
        expect(readIntentReviews()).toHaveLength(1);
    });

    it('infers a passed validation from a clean build and flags model-area risk', () => {
        const review = createIntentReview({
            command: 'npm run build',
            output: 'vite v5 building... ✓ built in 3s',
            files: ['src/lib/llm/clients.js'],
        });
        expect(review.validation.status).toBe('passed');
        expect(review.risks.some(r => /provider/.test(r))).toBe(true);
        expect(formatIntentReview(review)).toMatch(/Intent review:/);
    });

    it('infers a failed validation when output contains an error', () => {
        const review = createIntentReview({
            command: 'npm run build',
            output: 'error: build failed with exit code 1',
        });
        expect(review.validation.status).toBe('failed');
    });
});
