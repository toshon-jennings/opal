import { describe, expect, it } from 'vitest';
import {
    CODEX_REASONING_LEVELS,
    CODEX_WORKFLOWS,
    codexJobResponse,
    codexJobTone,
    mergeCodexJobs,
    normalizeCodexMicroSettings,
    selectCodexMicroJobs,
    sortCodexJobs,
} from '../src/lib/codexMicro';

describe('Codex Micro model', () => {
    it('normalizes persisted controls to supported values', () => {
        expect(normalizeCodexMicroSettings({
            reasoning: 'xhigh',
            workflowId: 'debug',
            prompt: 'Find the crash',
        })).toEqual({
            reasoning: 'xhigh',
            workflowId: 'debug',
            prompt: 'Find the crash',
        });

        expect(normalizeCodexMicroSettings({
            reasoning: 'impossible',
            workflowId: 'unknown',
            prompt: 42,
        })).toEqual({
            reasoning: 'medium',
            workflowId: null,
            prompt: '',
        });
    });

    it('provides four reasoning stops and four joystick workflows', () => {
        expect(CODEX_REASONING_LEVELS.map((level) => level.id)).toEqual(['low', 'medium', 'high', 'xhigh']);
        expect(CODEX_WORKFLOWS.map((workflow) => workflow.direction)).toEqual(['up', 'right', 'down', 'left']);
    });

    it('sorts, filters, and bounds Codex job keys', () => {
        const jobs = [
            { id: 'old', agent: 'codex', created_at: '2026-07-15T10:00:00.000Z' },
            { id: 'other', agent: 'claude_code', created_at: '2026-07-17T10:00:00.000Z' },
            { id: 'new', agent: 'codex', created_at: '2026-07-16T10:00:00.000Z' },
        ];

        expect(sortCodexJobs(jobs, 1).map((job) => job.id)).toEqual(['new']);
    });

    it('merges live job updates without duplicating persisted jobs', () => {
        const current = [
            { id: 'one', agent: 'codex', status: 'running', created_at: '2026-07-16T09:00:00.000Z' },
        ];
        const incoming = [
            { id: 'one', agent: 'codex', status: 'completed', created_at: '2026-07-16T09:00:00.000Z' },
            { id: 'two', agent: 'codex', status: 'running', created_at: '2026-07-16T10:00:00.000Z' },
        ];

        const merged = mergeCodexJobs(current, incoming);
        expect(merged.map((job) => job.id)).toEqual(['two', 'one']);
        expect(merged.find((job) => job.id === 'one')?.status).toBe('completed');
    });

    it('keeps older active jobs visible ahead of newer finished work', () => {
        const jobs = Array.from({ length: 7 }, (_, index) => ({
            id: `finished-${index}`,
            agent: 'codex',
            status: 'completed',
            created_at: `2026-07-16T1${index}:00:00.000Z`,
        }));
        jobs.push({
            id: 'older-running',
            agent: 'codex',
            status: 'running',
            created_at: '2026-07-16T08:00:00.000Z',
        });

        const visible = selectCodexMicroJobs(jobs);
        expect(visible).toHaveLength(6);
        expect(visible[0].id).toBe('older-running');
    });

    it('maps backend statuses to distinct RGB tones', () => {
        expect(codexJobTone('running')).toBe('running');
        expect(codexJobTone('pending')).toBe('waiting');
        expect(codexJobTone('completed')).toBe('complete');
        expect(codexJobTone('failed')).toBe('failed');
        expect(codexJobTone('cancelled')).toBe('cancelled');
    });

    it('extracts the visible assistant response from completed Codex terminal output', () => {
        const output = [
            'Are you here?\r',
            '^D\b\bOpenAI Codex v0.144.1\r',
            '\u001b[36muser\u001b[0m\r',
            'Are you here?\r',
            '\u001b[35m\u001b[3mcodex\u001b[0m\u001b[0m\r',
            'Yep, I’m here. What do you need?\r',
            '\u001b[2mtokens used\u001b[0m\r',
            '27,081\r',
        ].join('\n');

        expect(codexJobResponse({ status: 'completed', output })).toBe(
            'Yep, I’m here. What do you need?'
        );
    });
});
