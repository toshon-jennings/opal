import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Bot,
    CheckCircle2,
    LayoutGrid,
    RadioTower,
    Server,
} from 'lucide-react';
import PerciMascot from './PerciMascot';
import {
    MISSION_UPDATED_EVENT,
    readMissionRuns,
} from '../lib/missionControl';
import { createPerciNowSnapshot } from '../lib/perciNow';
import {
    PERCI_SURFACE_STATIONS,
    SURFACE_MAP_DISTRICTS,
} from '../lib/perciSurfaceMap';

const MAP_WIDTH = 1320;
const MAP_HEIGHT = 860;

const DISTRICT_COLORS = {
    'core-concourse': '#14b8a6',
    'knowledge-quarter': '#10b981',
    'creation-yard': '#fb7185',
    'operations-terminal': '#f59e0b',
    'local-systems-depot': '#38bdf8',
    'business-office': '#a3e635',
};

const FALLBACK_NODES = [
    { id: 'core', label: 'Core', x: 50, y: 46, color: DISTRICT_COLORS['core-concourse'] },
    { id: 'creation', label: 'Creation', x: 24, y: 30, color: DISTRICT_COLORS['creation-yard'] },
    { id: 'operations', label: 'Ops', x: 78, y: 32, color: DISTRICT_COLORS['operations-terminal'] },
    { id: 'systems', label: 'Systems', x: 76, y: 72, color: DISTRICT_COLORS['local-systems-depot'] },
    { id: 'knowledge', label: 'Knowledge', x: 25, y: 70, color: DISTRICT_COLORS['knowledge-quarter'] },
];

const STATUS_META = {
    attention: {
        label: 'Needs attention',
        icon: AlertTriangle,
        mascotState: 'error',
    },
    active: {
        label: 'Active now',
        icon: RadioTower,
        mascotState: 'working',
    },
    quiet: {
        label: 'Quiet',
        icon: CheckCircle2,
        mascotState: 'idle',
    },
};

export default function DashboardPerciNowGlance({
    windows,
    agentJobs,
    openClawStatus,
    now,
    onOpen,
}) {
    const [missionRuns, setMissionRuns] = useState(() => readMissionRuns());

    useEffect(() => {
        const handleMissionUpdate = () => setMissionRuns(readMissionRuns());
        window.addEventListener(MISSION_UPDATED_EVENT, handleMissionUpdate);
        return () => window.removeEventListener(MISSION_UPDATED_EVENT, handleMissionUpdate);
    }, []);

    const liveSnapshot = useMemo(() => createPerciNowSnapshot({
        windows,
        missionRuns,
        agentJobs,
        openClawStatus,
        stations: PERCI_SURFACE_STATIONS,
        districts: SURFACE_MAP_DISTRICTS,
    }), [windows, missionRuns, agentJobs, openClawStatus]);

    const status = STATUS_META[liveSnapshot.status] || STATUS_META.quiet;
    const StatusIcon = status.icon;
    const activeWorkCount = liveSnapshot.counts.activeMissions + liveSnapshot.counts.activeAgentJobs;
    const attentionCount = liveSnapshot.counts.attentionMissions + liveSnapshot.counts.attentionAgentJobs;
    const surfaceNodes = useMemo(() => buildSurfaceNodes(liveSnapshot.openWindows || liveSnapshot.visibleWindows), [liveSnapshot.openWindows, liveSnapshot.visibleWindows]);
    const nodes = surfaceNodes.length > 0 ? surfaceNodes : FALLBACK_NODES;
    const activeDistricts = liveSnapshot.districtActivity.slice(0, 3);
    const gatewayLabel = formatGatewayLabel(liveSnapshot.openClaw.state);
    const timeText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <button
            type="button"
            className={`dash-now-glance is-${liveSnapshot.status}`}
            onClick={onOpen}
            aria-label={`Open Perci Now. ${status.label}. ${liveSnapshot.counts.visibleWindows} visible surfaces, ${activeWorkCount} active work items, ${attentionCount} attention items. Gateway ${gatewayLabel}.`}
        >
            <span className="dash-now-head">
                <span className="dash-now-title">
                    <StatusIcon size={15} />
                    <span>Perci Now</span>
                </span>
                <span className="dash-now-status">
                    <span>{status.label}</span>
                    <strong>{timeText}</strong>
                </span>
            </span>

            <span className="dash-now-map" aria-hidden="true">
                <svg className="dash-now-routes" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M18 30 C36 18 64 18 82 30" />
                    <path d="M18 70 C38 82 64 82 82 70" />
                    <path d="M18 30 C12 48 12 58 18 70" />
                    <path d="M82 30 C88 48 88 58 82 70" />
                    <path d="M25 72 C38 45 62 45 75 28" />
                    <path d="M25 28 C40 54 61 54 75 72" />
                </svg>
                {nodes.map((node) => (
                    <span
                        key={node.id}
                        className={`dash-now-node${surfaceNodes.length === 0 ? ' is-muted' : ''}`}
                        style={{ '--node-x': `${node.x}%`, '--node-y': `${node.y}%`, '--node': node.color }}
                        title={node.label}
                    />
                ))}
                <span className="dash-now-core">
                    <PerciMascot
                        state={status.mascotState}
                        size={58}
                        title={`Perci Now is ${status.label}`}
                        variant="classic"
                    />
                </span>
            </span>

            <span className="dash-now-metrics">
                <Metric icon={LayoutGrid} label="Surfaces" value={liveSnapshot.counts.openWindows} />
                <Metric icon={Bot} label="Work" value={activeWorkCount} />
                <Metric icon={AlertTriangle} label="Attention" value={attentionCount} tone={attentionCount > 0 ? 'attention' : 'normal'} />
                <Metric icon={Server} label="Gateway" value={gatewayLabel} tone={liveSnapshot.openClaw.state === 'online' ? 'online' : 'normal'} />
            </span>

            <span className="dash-now-districts">
                {activeDistricts.length > 0 ? activeDistricts.map((district) => (
                    <span
                        key={district.id}
                        className="dash-now-district"
                        style={{ '--district': DISTRICT_COLORS[district.id] || 'var(--accent)' }}
                    >
                        <span>{district.label}</span>
                        <strong>{district.count}</strong>
                    </span>
                )) : (
                    <span className="dash-now-empty-district">No mapped surfaces open</span>
                )}
            </span>
        </button>
    );
}

function Metric({ icon: Icon, label, value, tone = 'normal' }) {
    return (
        <span className={`dash-now-metric is-${tone}`}>
            <Icon size={13} />
            <span>{label}</span>
            <strong>{value}</strong>
        </span>
    );
}

function buildSurfaceNodes(visibleWindows) {
    const stationByTarget = new Map(PERCI_SURFACE_STATIONS.map(station => [station.targetId, station]));
    return visibleWindows.slice(0, 7).map((windowState) => {
        const station = stationByTarget.get(windowState.modeId);
        if (!station) return null;
        return {
            id: windowState.id || station.id,
            label: windowState.title,
            color: DISTRICT_COLORS[station.districtId] || 'var(--accent)',
            ...stationToGlancePoint(station),
        };
    }).filter(Boolean);
}

function stationToGlancePoint(station) {
    return {
        x: clamp(14 + (Number(station.x) / MAP_WIDTH) * 72, 12, 88),
        y: clamp(18 + (Number(station.y) / MAP_HEIGHT) * 64, 16, 86),
    };
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Math.round(value)));
}

function formatGatewayLabel(state) {
    if (state === 'online') return 'On';
    if (state === 'checking') return 'Check';
    if (state === 'offline') return 'Off';
    return 'N/A';
}
