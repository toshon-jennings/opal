import { MODES, WINDOW_TITLES } from '../context/ModeContext';
import { readJsonStorage, writeStringStorage } from './persistentStore';

export const PERCI_NOW_SNAPSHOTS_KEY = 'perci_now_snapshots';

const MAX_SNAPSHOTS = 12;
const ACTIVE_MISSION_STATUSES = new Set(['running', 'waiting', 'needs_validation']);
const ATTENTION_MISSION_STATUSES = new Set(['blocked', 'failed', 'error']);
const ACTIVE_JOB_STATUSES = new Set(['pending', 'claimed', 'running', 'retry_queued']);
const ATTENTION_JOB_STATUSES = new Set(['failed', 'cancelled', 'blocked', 'denied']);

export function readPerciNowSnapshots() {
    const saved = readJsonStorage(PERCI_NOW_SNAPSHOTS_KEY, []);
    return Array.isArray(saved) ? saved.map(normalizeSnapshot).filter(Boolean) : [];
}

export function savePerciNowSnapshot(snapshot) {
    const snapshots = [normalizeSnapshot(snapshot), ...readPerciNowSnapshots()]
        .filter(Boolean)
        .slice(0, MAX_SNAPSHOTS);
    writeStringStorage(PERCI_NOW_SNAPSHOTS_KEY, JSON.stringify(snapshots));
    return snapshots;
}

export function deletePerciNowSnapshot(snapshotId) {
    const snapshots = readPerciNowSnapshots().filter(snapshot => snapshot.id !== snapshotId);
    writeStringStorage(PERCI_NOW_SNAPSHOTS_KEY, JSON.stringify(snapshots));
    return snapshots;
}

export function createPerciNowSnapshot({ windows = [], missionRuns = [], agentJobs = [], openClawStatus = {}, stations = [], districts = [] }) {
    const createdAt = new Date().toISOString();
    const stationByTarget = new Map(stations.map(station => [station.targetId, station]));
    const districtById = new Map(districts.map(district => [district.id, district]));
    const liveWindows = windows.filter(windowState => windowState.modeId !== MODES.PERCI_NOW).map(windowState => {
        const station = stationByTarget.get(windowState.modeId);
        const district = districtById.get(station?.districtId);
        return {
            id: windowState.id,
            modeId: windowState.modeId,
            title: WINDOW_TITLES[windowState.modeId] || windowState.title || windowState.modeId,
            state: windowState.state || 'normal',
            focusedAt: windowState.focusedAt || 0,
            stationId: station?.id || null,
            districtId: district?.id || null,
            districtLabel: district?.label || 'Unmapped',
        };
    }).sort((a, b) => (b.focusedAt || 0) - (a.focusedAt || 0));
    const observedWindows = liveWindows;
    const visibleWindows = observedWindows.filter(windowState => windowState.state !== 'minimized');
    const activeMissionRuns = missionRuns.filter(run => ACTIVE_MISSION_STATUSES.has(run.status));
    const attentionMissionRuns = missionRuns.filter(run => ATTENTION_MISSION_STATUSES.has(run.status));
    const activeAgentJobs = agentJobs.filter(job => ACTIVE_JOB_STATUSES.has(job.status));
    const attentionAgentJobs = agentJobs.filter(job => ATTENTION_JOB_STATUSES.has(job.status));
    const districtActivity = countBy(
        observedWindows.filter(windowState => windowState.districtId),
        windowState => windowState.districtId,
        windowState => windowState.districtLabel
    );
    const attentionCount = attentionMissionRuns.length
        + attentionAgentJobs.length
        + (openClawStatus?.state === 'offline' || openClawStatus?.state === 'unsupported' ? 1 : 0);
    const activityCount = observedWindows.length + activeMissionRuns.length + activeAgentJobs.length;

    return normalizeSnapshot({
        id: `perci-now-${Date.now()}`,
        createdAt,
        status: attentionCount > 0 ? 'attention' : activityCount > 0 ? 'active' : 'quiet',
        counts: {
            openWindows: observedWindows.length,
            visibleWindows: visibleWindows.length,
            activeMissions: activeMissionRuns.length,
            attentionMissions: attentionMissionRuns.length,
            activeAgentJobs: activeAgentJobs.length,
            attentionAgentJobs: attentionAgentJobs.length,
        },
        openClaw: {
            state: openClawStatus?.state || 'unknown',
            checkedAt: openClawStatus?.checkedAt || null,
            summary: summarizeOpenClaw(openClawStatus),
        },
        openWindows: observedWindows.slice(0, 12),
        visibleWindows: visibleWindows.slice(0, 10),
        activeMissionRuns: activeMissionRuns.slice(0, 6).map(compactRun),
        attentionMissionRuns: attentionMissionRuns.slice(0, 6).map(compactRun),
        activeAgentJobs: activeAgentJobs.slice(0, 6).map(compactJob),
        attentionAgentJobs: attentionAgentJobs.slice(0, 6).map(compactJob),
        districtActivity,
    });
}

function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
        id: snapshot.id || `perci-now-${Date.now()}`,
        createdAt: snapshot.createdAt || new Date().toISOString(),
        status: snapshot.status || 'quiet',
        counts: {
            openWindows: Number(snapshot.counts?.openWindows) || 0,
            visibleWindows: Number(snapshot.counts?.visibleWindows) || 0,
            activeMissions: Number(snapshot.counts?.activeMissions) || 0,
            attentionMissions: Number(snapshot.counts?.attentionMissions) || 0,
            activeAgentJobs: Number(snapshot.counts?.activeAgentJobs) || 0,
            attentionAgentJobs: Number(snapshot.counts?.attentionAgentJobs) || 0,
        },
        openClaw: snapshot.openClaw || { state: 'unknown', checkedAt: null, summary: 'Unknown' },
        openWindows: Array.isArray(snapshot.openWindows) ? snapshot.openWindows : (Array.isArray(snapshot.visibleWindows) ? snapshot.visibleWindows : []),
        visibleWindows: Array.isArray(snapshot.visibleWindows) ? snapshot.visibleWindows : [],
        activeMissionRuns: Array.isArray(snapshot.activeMissionRuns) ? snapshot.activeMissionRuns : [],
        attentionMissionRuns: Array.isArray(snapshot.attentionMissionRuns) ? snapshot.attentionMissionRuns : [],
        activeAgentJobs: Array.isArray(snapshot.activeAgentJobs) ? snapshot.activeAgentJobs : [],
        attentionAgentJobs: Array.isArray(snapshot.attentionAgentJobs) ? snapshot.attentionAgentJobs : [],
        districtActivity: Array.isArray(snapshot.districtActivity) ? snapshot.districtActivity : [],
    };
}

function compactRun(run) {
    return {
        id: run.id,
        title: run.title || 'Untitled run',
        status: run.status || 'waiting',
        agent: run.agent || 'Perci',
        updatedAt: run.updatedAt || run.startedAt || null,
        next: run.next || '',
    };
}

function compactJob(job) {
    return {
        id: job.id,
        title: job.title || job.prompt || job.request_type || 'Agent job',
        status: job.status || 'unknown',
        agent: job.agent || job.request_type || 'agent',
        updatedAt: job.updated_at || job.created_at || null,
    };
}

function countBy(items, keyFn, labelFn) {
    const counts = new Map();
    for (const item of items) {
        const key = keyFn(item);
        if (!key) continue;
        const previous = counts.get(key) || { id: key, label: labelFn(item), count: 0 };
        previous.count += 1;
        counts.set(key, previous);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function summarizeOpenClaw(openClawStatus) {
    if (!openClawStatus?.state) return 'No gateway check yet';
    if (openClawStatus.state === 'checking') return 'Checking gateway';
    if (openClawStatus.state !== 'online') return openClawStatus.result?.error || 'Gateway offline';
    const health = openClawStatus.result?.health;
    if (!health) return 'Gateway online';
    const agents = health.agents?.length ?? 0;
    const active = health.tasks?.active ?? 0;
    return `${agents} agent${agents === 1 ? '' : 's'}, ${active} active task${active === 1 ? '' : 's'}`;
}
