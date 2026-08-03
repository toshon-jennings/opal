import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSeedMissionRuns } from '../src/lib/missionControl.js';

describe('missionControl - createSeedMissionRuns', () => {
    const NOW_MS = 1700000000000;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(NOW_MS));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns an array of exactly 3 seed mission runs', () => {
        const runs = createSeedMissionRuns();

        expect(Array.isArray(runs)).toBe(true);
        expect(runs).toHaveLength(3);
    });

    it('has the expected IDs and static properties for each run', () => {
        const runs = createSeedMissionRuns();

        // Verify 'mission-memory-review'
        expect(runs[0].id).toBe('mission-memory-review');
        expect(runs[0].title).toBe('Session memory capture');
        expect(runs[0].agent).toBe('Perci Memory Reviewer');
        expect(runs[0].status).toBe('waiting');
        expect(runs[0].workingDirectory).toBe('/Users/toshonjennings/opal');

        // Verify 'mission-openclaw-health'
        expect(runs[1].id).toBe('mission-openclaw-health');
        expect(runs[1].title).toBe('OpenClaw integration health');
        expect(runs[1].agent).toBe('Perci Integration Monitor');
        expect(runs[1].status).toBe('waiting');

        // Verify 'mission-diff-quality'
        expect(runs[2].id).toBe('mission-diff-quality');
        expect(runs[2].title).toBe('Intent-first diff review');
        expect(runs[2].agent).toBe('Perci Review Gate');
        expect(runs[2].status).toBe('blocked');
    });

    it('calculates startedAt and updatedAt dates relative to now', () => {
        const runs = createSeedMissionRuns();

        // Run 0 offsets: -42 mins, -18 mins
        expect(runs[0].startedAt).toBe(new Date(NOW_MS - 42 * 60 * 1000).toISOString());
        expect(runs[0].updatedAt).toBe(new Date(NOW_MS - 18 * 60 * 1000).toISOString());

        // Run 1 offsets: -7 mins, -22 mins
        expect(runs[1].startedAt).toBe(new Date(NOW_MS - 7 * 60 * 1000).toISOString());
        expect(runs[1].updatedAt).toBe(new Date(NOW_MS - 22 * 60 * 1000).toISOString());

        // Run 2 offsets: -3 hours, -2 hours
        expect(runs[2].startedAt).toBe(new Date(NOW_MS - 3 * 60 * 60 * 1000).toISOString());
        expect(runs[2].updatedAt).toBe(new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString());
    });

    it('contains expected shape for complex properties like arrays and checkpoints', () => {
        const runs = createSeedMissionRuns();
        const run = runs[0];

        expect(Array.isArray(run.commands)).toBe(true);
        expect(run.commands).toContain('scan run summary');

        expect(Array.isArray(run.files)).toBe(true);

        expect(Array.isArray(run.checkpoints)).toBe(true);
        expect(run.checkpoints[0]).toHaveProperty('label');
        expect(run.checkpoints[0]).toHaveProperty('state');

        expect(Array.isArray(run.risks)).toBe(true);
        expect(typeof run.next).toBe('string');
        expect(Array.isArray(run.events)).toBe(true);
    });
});
