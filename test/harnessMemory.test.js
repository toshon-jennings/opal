import { describe, it, expect } from 'vitest';
import {
    evaluateMemoryQuality,
    addHarnessMemory,
    readHarnessMemory,
    ingestRunMemory,
} from '../src/lib/harnessMemory.js';

describe('evaluateMemoryQuality', () => {
    it('rates an actionable, file-specific note as strong', () => {
        const result = evaluateMemoryQuality(
            'Build run blocked: fix the failing import in src/lib/clients.js before you retry the validation step.'
        );
        expect(result.verdict).toBe('strong');
        expect(result.score).toBeGreaterThanOrEqual(6);
        expect(result.reasons).toContain('actionable');
        expect(result.reasons).toContain('specific context');
    });

    it('penalises generic boilerplate outcomes to a weak verdict', () => {
        const result = evaluateMemoryQuality('Assistant response was recorded.');
        expect(result.verdict).toBe('weak');
        expect(result.reasons).toContain('generic outcome');
        expect(result.score).toBeLessThan(4);
    });

    it('marks too-short notes as weak', () => {
        const result = evaluateMemoryQuality('done');
        expect(result.verdict).toBe('weak');
        expect(result.reasons).toContain('too short');
    });

    it('clamps the score into the 0..8 range', () => {
        const result = evaluateMemoryQuality(
            'Next: verify and re-run the build. Check src/lib/modelRouter.js and avoid the gateway that failed with exit code 130.'
        );
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(8);
    });

    it('detects duplicates against existing memory in the same scope', () => {
        const text = 'Run blocked: fix src/lib/clients.js and re-run validation.';
        const existing = [{ text, scope: '/proj', sourceType: 'build' }];
        const result = evaluateMemoryQuality(text, {
            scope: '/proj',
            sourceType: 'build',
            existing,
        });
        expect(result.reasons).toContain('duplicate');
    });
});

describe('addHarnessMemory', () => {
    const strongNote = {
        text: 'Build run blocked: fix the failing import in src/lib/clients.js before you retry the validation step.',
        scope: '/proj',
        sourceType: 'build',
        sourceRunId: 'build-1',
        title: 'Build blocked',
        status: 'blocked',
    };

    it('persists a strong note and stamps a quality verdict', () => {
        const saved = addHarnessMemory(strongNote);
        expect(saved).toHaveLength(1);
        expect(saved[0].quality.verdict).toBe('strong');
        expect(readHarnessMemory()).toHaveLength(1);
    });

    it('rejects weak notes unless forced', () => {
        const weak = { text: 'done', scope: '/proj', sourceType: 'build', sourceRunId: 'w1' };
        expect(addHarnessMemory(weak)).toHaveLength(0);
        expect(addHarnessMemory({ ...weak, force: true })).toHaveLength(1);
    });

    it('replaces an earlier note from the same source run', () => {
        addHarnessMemory(strongNote);
        const updated = addHarnessMemory({
            ...strongNote,
            text: 'Build run blocked again: still fix src/lib/clients.js import and re-run validation now.',
        });
        expect(updated).toHaveLength(1);
        expect(updated[0].text).toMatch(/again/);
    });
});

describe('ingestRunMemory', () => {
    it('ignores runs that are still in progress', () => {
        expect(ingestRunMemory({ id: 'r1', status: 'running' })).toBeNull();
    });

    it('captures a blocked terminal run with useful signals', () => {
        const memory = ingestRunMemory({
            id: 'terminal-7',
            agent: 'Opal Terminal',
            status: 'blocked',
            title: 'Terminal task',
            objective: 'Run the build',
            workingDirectory: '/proj',
            commands: ['npm run build'],
            files: ['src/lib/clients.js'],
            events: [{ detail: 'Build failed: missing module in src/lib/clients.js' }],
            next: 'Fix the import and retry the build',
        });
        expect(memory).not.toBeNull();
        expect(memory.sourceType).toBe('terminal');
        expect(memory.status).toBe('blocked');
        expect(readHarnessMemory()).toHaveLength(1);
    });

    it('skips low-signal completed runs', () => {
        const memory = ingestRunMemory({
            id: 'terminal-8',
            agent: 'Opal Terminal',
            status: 'completed',
            title: 'Empty run',
            workingDirectory: '/proj',
            commands: [],
            files: [],
            events: [{ detail: 'Command exited with code 0.' }],
        });
        expect(memory).toBeNull();
    });
});
