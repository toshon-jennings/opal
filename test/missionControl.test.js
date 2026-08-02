import { describe, it, expect } from 'vitest';
import { createSeedMissionRuns } from '../src/lib/missionControl.js';

describe('createSeedMissionRuns', () => {
    it('returns an array with exactly 3 seed runs', () => {
        const runs = createSeedMissionRuns();
        expect(Array.isArray(runs)).toBe(true);
        expect(runs).toHaveLength(3);
    });

    it('returns objects with expected IDs and keys', () => {
        const runs = createSeedMissionRuns();
        const ids = runs.map(r => r.id);

        expect(ids).toEqual([
            'mission-memory-review',
            'mission-openclaw-health',
            'mission-diff-quality'
        ]);

        for (const run of runs) {
            expect(run).toHaveProperty('id');
            expect(run).toHaveProperty('title');
            expect(run).toHaveProperty('agent');
            expect(run).toHaveProperty('status');
            expect(run).toHaveProperty('startedAt');
            expect(run).toHaveProperty('updatedAt');
            expect(run).toHaveProperty('workingDirectory');
            expect(run).toHaveProperty('objective');
            expect(run).toHaveProperty('reason');
            expect(run).toHaveProperty('commands');
            expect(run).toHaveProperty('files');
            expect(run).toHaveProperty('checkpoints');
            expect(run).toHaveProperty('risks');
            expect(run).toHaveProperty('next');
            expect(run).toHaveProperty('events');

            expect(Array.isArray(run.commands)).toBe(true);
            expect(Array.isArray(run.files)).toBe(true);
            expect(Array.isArray(run.checkpoints)).toBe(true);
            expect(Array.isArray(run.risks)).toBe(true);
            expect(Array.isArray(run.events)).toBe(true);
        }
    });

    it('returns valid ISO strings for startedAt and updatedAt', () => {
        const runs = createSeedMissionRuns();

        for (const run of runs) {
            // Verify it can be parsed to a valid Date object
            const startedAtDate = new Date(run.startedAt);
            const updatedAtDate = new Date(run.updatedAt);

            expect(startedAtDate.toString()).not.toBe('Invalid Date');
            expect(updatedAtDate.toString()).not.toBe('Invalid Date');

            // Validate the ISO formatting
            const isoStringRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
            expect(run.startedAt).toMatch(isoStringRegex);
            expect(run.updatedAt).toMatch(isoStringRegex);
        }
    });
});
