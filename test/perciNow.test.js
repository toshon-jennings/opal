import { describe, expect, it } from 'vitest';
import { MODES } from '../src/context/ModeContext.jsx';
import { createPerciNowSnapshot } from '../src/lib/perciNow.js';
import { PERCI_SURFACE_STATIONS, SURFACE_MAP_DISTRICTS } from '../src/lib/perciSurfaceMap.js';

describe('perciNow', () => {
    it('derives live state without requiring an event log', () => {
        const snapshot = createPerciNowSnapshot({
            windows: [
                { id: MODES.SURFACE_MAP, modeId: MODES.SURFACE_MAP, state: 'normal', focusedAt: 20 },
                { id: MODES.MISSION, modeId: MODES.MISSION, state: 'minimized', focusedAt: 10 },
                { id: MODES.PERCI_NOW, modeId: MODES.PERCI_NOW, state: 'normal', focusedAt: 30 },
            ],
            missionRuns: [
                { id: 'run-1', title: 'Running', status: 'running', updatedAt: '2026-06-24T11:59:00.000Z' },
                { id: 'run-2', title: 'Blocked', status: 'blocked', updatedAt: '2026-06-24T11:58:00.000Z' },
            ],
            agentJobs: [
                { id: 'job-1', request_type: 'codex', status: 'running', updated_at: '2026-06-24T11:59:30.000Z' },
            ],
            openClawStatus: { state: 'online', result: { health: { agents: [{ id: 'a' }], tasks: { active: 2 } } } },
            stations: PERCI_SURFACE_STATIONS,
            districts: SURFACE_MAP_DISTRICTS,
        });

        expect(snapshot.status).toBe('attention');
        expect(snapshot.counts.openWindows).toBe(2);
        expect(snapshot.counts.visibleWindows).toBe(1);
        expect(snapshot.counts.activeMissions).toBe(1);
        expect(snapshot.counts.attentionMissions).toBe(1);
        expect(snapshot.counts.activeAgentJobs).toBe(1);
        expect(snapshot.visibleWindows.map(windowState => windowState.title)).toEqual(['Perci Map']);
        expect(snapshot.districtActivity).toEqual([{ id: 'core-concourse', label: 'Core Concourse', count: 1 }]);
        expect(snapshot.openClaw.summary).toBe('1 agent, 2 active tasks');
    });
});
