import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowUpRight,
    Bot,
    Camera,
    CheckCircle2,
    Clock3,
    LayoutGrid,
    Map as MapIcon,
    RadioTower,
    Trash2,
} from 'lucide-react';
import { useMode, MODES } from '../context/ModeContext';
import {
    MISSION_UPDATED_EVENT,
    readMissionRuns,
} from '../lib/missionControl';
import {
    PERCI_SURFACE_STATIONS,
    SURFACE_MAP_DISTRICTS,
    getSurfaceDistrict,
} from '../lib/perciSurfaceMap';
import {
    createPerciNowSnapshot,
    deletePerciNowSnapshot,
    readPerciNowSnapshots,
    savePerciNowSnapshot,
} from '../lib/perciNow';
import {
    MAP_HEIGHT,
    MAP_WIDTH,
    Districts,
    MapGrid,
    MapZoomBar,
    Station,
    useMapZoom,
} from './PerciSurfaceCanvas';
import './PerciNowMode.css';

const JOBS_POLL_MS = 10000;

const STATION_STATUS_LABELS = {
    attention: 'Needs attention',
    active: 'Active now',
    docked: 'Open · minimized',
    idle: 'Idle',
};

export default function PerciNowMode({ openClawStatus }) {
    const { windows, openWindow, setCurrentMode } = useMode();
    const [now, setNow] = useState(() => new Date());
    const [missionRuns, setMissionRuns] = useState(() => readMissionRuns());
    const [agentJobs, setAgentJobs] = useState([]);
    const [snapshots, setSnapshots] = useState(() => readPerciNowSnapshots());
    const [view, setView] = useState('overview');
    const [selectedMapStationId, setSelectedMapStationId] = useState('dashboard');
    const { zoom, setBoundedZoom, zoomOut, zoomIn, resetZoom } = useMapZoom(0.9);

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        const handleMissionUpdate = () => setMissionRuns(readMissionRuns());
        window.addEventListener(MISSION_UPDATED_EVENT, handleMissionUpdate);
        return () => window.removeEventListener(MISSION_UPDATED_EVENT, handleMissionUpdate);
    }, []);

    const loadJobs = useCallback(async () => {
        if (!window.electron?.listAgentJobs) return;
        try {
            const list = await window.electron.listAgentJobs({ limit: 30, source: 'perci-now' });
            setAgentJobs(Array.isArray(list) ? list : []);
        } catch {
            setAgentJobs(current => current);
        }
    }, []);

    useEffect(() => {
        void loadJobs();
        const id = window.setInterval(() => void loadJobs(), JOBS_POLL_MS);
        return () => window.clearInterval(id);
    }, [loadJobs]);

    const liveSnapshot = useMemo(() => createPerciNowSnapshot({
        windows,
        missionRuns,
        agentJobs,
        openClawStatus,
        stations: PERCI_SURFACE_STATIONS,
        districts: SURFACE_MAP_DISTRICTS,
    }), [windows, missionRuns, agentJobs, openClawStatus]);

    const stationById = useMemo(
        () => new Map(PERCI_SURFACE_STATIONS.map(station => [station.id, station])),
        []
    );
    const openStationIds = useMemo(
        () => new Set(liveSnapshot.visibleWindows.map(windowState => windowState.stationId).filter(Boolean)),
        [liveSnapshot]
    );
    const dockedStationIds = useMemo(
        () => new Set(
            liveSnapshot.openWindows
                .filter(windowState => windowState.state === 'minimized')
                .map(windowState => windowState.stationId)
                .filter(Boolean)
        ),
        [liveSnapshot]
    );
    const openWindowStationIds = useMemo(
        () => new Set(liveSnapshot.openWindows.map(windowState => windowState.stationId).filter(Boolean)),
        [liveSnapshot]
    );
    const attentionStationIds = useMemo(() => {
        const ids = new Set();
        if (liveSnapshot.attentionMissionRuns.length > 0) ids.add('mission');
        if (liveSnapshot.attentionAgentJobs.length > 0) ids.add('agents');
        if (liveSnapshot.openClaw.state === 'offline' || liveSnapshot.openClaw.state === 'unsupported') ids.add('openclaw');
        return ids;
    }, [liveSnapshot]);
    const workingStationIds = useMemo(() => {
        const ids = new Set();
        if (liveSnapshot.activeMissionRuns.length > 0) ids.add('mission');
        if (liveSnapshot.activeAgentJobs.length > 0) ids.add('agents');
        if (liveSnapshot.openClaw.state === 'online') ids.add('openclaw');
        return ids;
    }, [liveSnapshot]);
    const districtHeatById = useMemo(() => {
        const counts = new Map(liveSnapshot.districtActivity.map(district => [district.id, district.count]));
        const addWeight = (stationId) => {
            const station = stationById.get(stationId);
            if (!station) return;
            counts.set(station.districtId, (counts.get(station.districtId) || 0) + 1);
        };
        attentionStationIds.forEach(addWeight);
        workingStationIds.forEach(addWeight);
        const max = Math.max(1, ...counts.values());
        return new Map(Array.from(counts, ([id, count]) => [id, count / max]));
    }, [liveSnapshot, attentionStationIds, workingStationIds, stationById]);

    const getStationStatus = useCallback((stationId) => {
        if (attentionStationIds.has(stationId)) return 'attention';
        if (openStationIds.has(stationId) || workingStationIds.has(stationId)) return 'active';
        if (dockedStationIds.has(stationId)) return 'docked';
        return 'idle';
    }, [attentionStationIds, openStationIds, workingStationIds, dockedStationIds]);

    const selectedMapStation = stationById.get(selectedMapStationId) || PERCI_SURFACE_STATIONS[0];
    const selectedMapDistrict = getSurfaceDistrict(selectedMapStation);
    const selectedMapStatus = getStationStatus(selectedMapStation.id);
    const selectedMapWindow = liveSnapshot.openWindows.find(windowState => windowState.stationId === selectedMapStation.id);
    const selectedMapActivity = selectedMapStation.id === 'mission'
        ? [...liveSnapshot.attentionMissionRuns, ...liveSnapshot.activeMissionRuns]
        : selectedMapStation.id === 'agents'
            ? [...liveSnapshot.attentionAgentJobs, ...liveSnapshot.activeAgentJobs]
            : [];

    const openMapStation = (station) => {
        setSelectedMapStationId(station.id);
        if (station.targetId === MODES.DASHBOARD) {
            setCurrentMode(MODES.DASHBOARD);
        } else {
            openWindow(station.targetId);
        }
    };

    const statusLabel = liveSnapshot.status === 'attention'
        ? 'Needs attention'
        : liveSnapshot.status === 'active'
            ? 'Active now'
            : 'Quiet';

    const saveSnapshot = () => {
        setSnapshots(savePerciNowSnapshot({
            ...liveSnapshot,
            id: `perci-now-${Date.now()}`,
            createdAt: new Date().toISOString(),
        }));
    };

    const deleteSnapshot = (snapshotId) => {
        setSnapshots(deletePerciNowSnapshot(snapshotId));
    };

    const openWindows = liveSnapshot.openWindows || liveSnapshot.visibleWindows;
    const activeWork = [
        ...liveSnapshot.attentionMissionRuns,
        ...liveSnapshot.activeMissionRuns,
        ...liveSnapshot.attentionAgentJobs,
        ...liveSnapshot.activeAgentJobs,
    ].slice(0, 8);

    return (
        <div className="perci-now-mode">
            <header className="perci-now-header">
                <div>
                    <p className="perci-now-kicker">
                        <RadioTower size={15} />
                        Live workspace state
                    </p>
                    <h1>Perci Now</h1>
                    <p>
                        A moment-by-moment readout of visible surfaces, active work, agent pressure,
                        and local gateway health. Nothing is kept unless you save a snapshot.
                    </p>
                </div>
                <div className={`perci-now-state is-${liveSnapshot.status}`}>
                    <span>{statusLabel}</span>
                    <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
                </div>
            </header>

            <section className="perci-now-summary" aria-label="Current Perci state summary">
                <Metric icon={LayoutGrid} label="Visible surfaces" value={liveSnapshot.counts.visibleWindows} />
                <Metric icon={Clock3} label="Active missions" value={liveSnapshot.counts.activeMissions} />
                <Metric icon={Bot} label="Active agent jobs" value={liveSnapshot.counts.activeAgentJobs} />
                <Metric
                    icon={AlertTriangle}
                    label="Attention"
                    value={liveSnapshot.counts.attentionMissions + liveSnapshot.counts.attentionAgentJobs}
                    tone={liveSnapshot.status === 'attention' ? 'attention' : 'normal'}
                />
            </section>

            <nav className="perci-now-tabs" role="tablist" aria-label="Perci Now views">
                <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'overview'}
                    className={view === 'overview' ? 'is-active' : ''}
                    onClick={() => setView('overview')}
                >
                    <LayoutGrid size={14} />
                    Overview
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'map'}
                    className={view === 'map' ? 'is-active' : ''}
                    onClick={() => setView('map')}
                >
                    <MapIcon size={14} />
                    Map
                </button>
            </nav>

            {view === 'map' ? (
                <div className="perci-now-map-layout">
                    <section className="perci-map-canvas" aria-label="Perci live activity map">
                        <MapZoomBar
                            zoom={zoom}
                            onZoomOut={zoomOut}
                            onZoomIn={zoomIn}
                            onReset={resetZoom}
                            onChange={setBoundedZoom}
                        />
                        <svg
                            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                            role="img"
                            aria-labelledby="perci-now-map-title perci-now-map-desc"
                            style={{
                                '--map-width': `${Math.round(MAP_WIDTH * zoom)}px`,
                                '--map-height': `${Math.round(MAP_HEIGHT * zoom)}px`,
                            }}
                        >
                            <title id="perci-now-map-title">Perci live activity map</title>
                            <desc id="perci-now-map-desc">Stations light up where Perci is currently active right now: open surfaces, active mission and agent work, and local runtime health.</desc>
                            <Districts districts={SURFACE_MAP_DISTRICTS} heatById={districtHeatById} />
                            <MapGrid />
                            {PERCI_SURFACE_STATIONS.map(station => (
                                <Station
                                    key={station.id}
                                    station={station}
                                    selected={selectedMapStation.id === station.id}
                                    extraClassNames={[
                                        `is-${getStationStatus(station.id)}`,
                                        openWindowStationIds.has(station.id) ? 'is-open-window' : '',
                                    ]}
                                    onOpen={() => openMapStation(station)}
                                />
                            ))}
                        </svg>
                    </section>

                    <aside className="perci-map-inspector" aria-label="Selected station live detail">
                        <div className="perci-station-detail">
                            <span className={`perci-now-map-status is-${selectedMapStatus}`}>
                                {STATION_STATUS_LABELS[selectedMapStatus]}
                            </span>
                            <h2>{selectedMapStation.label}</h2>
                            {selectedMapDistrict && (
                                <span className="perci-station-district">{selectedMapDistrict.label}</span>
                            )}
                            <p>{selectedMapStation.description}</p>
                            {selectedMapWindow && (
                                <small className="perci-now-muted">
                                    {selectedMapWindow.state === 'minimized' ? 'Docked in the bottom bar' : 'Open now'}
                                    {selectedMapWindow.focusedAt ? ` · focused ${relativeTime(selectedMapWindow.focusedAt, now)}` : ''}
                                </small>
                            )}
                            <button type="button" className="perci-open-station" onClick={() => openMapStation(selectedMapStation)}>
                                <ArrowUpRight size={15} />
                                Open surface
                            </button>
                        </div>

                        <div className="perci-now-map-activity">
                            <h3>Happening here now</h3>
                            {selectedMapStation.id === 'openclaw' ? (
                                <p className="perci-now-map-empty">{liveSnapshot.openClaw.summary}</p>
                            ) : selectedMapActivity.length === 0 ? (
                                <p className="perci-now-map-empty">Nothing active at this station right now.</p>
                            ) : (
                                <div className="perci-now-work-list">
                                    {selectedMapActivity.map(item => (
                                        <WorkRow key={`${item.id}-${item.status}`} item={item} now={now} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            ) : (
            <div className="perci-now-content">
                <main className="perci-now-main">
                    <section className="perci-now-panel">
                        <div className="perci-now-panel-heading">
                            <h2>Open surfaces</h2>
                            <span>{liveSnapshot.counts.visibleWindows} visible · {openWindows.length} open</span>
                        </div>
                        {openWindows.length === 0 ? (
                            <EmptyState text="No open windows. The dashboard is the only active surface." />
                        ) : (
                            <div className="perci-now-surface-list">
                                {openWindows.map(windowState => (
                                    <button
                                        key={windowState.id}
                                        type="button"
                                        className={`perci-now-surface-row${windowState.state === 'minimized' ? ' is-minimized' : ''}`}
                                        onClick={() => openWindow(windowState.modeId)}
                                    >
                                        <span className="perci-now-surface-dot" />
                                        <span>
                                            <strong>{windowState.title}</strong>
                                            <small>{windowState.districtLabel}{windowState.state === 'minimized' ? ' · docked' : ''}</small>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="perci-now-panel">
                        <div className="perci-now-panel-heading">
                            <h2>Active work</h2>
                            <span>{activeWork.length} items</span>
                        </div>
                        {activeWork.length === 0 ? (
                            <EmptyState text="No Mission runs or agent jobs are currently active." />
                        ) : (
                            <div className="perci-now-work-list">
                                {activeWork.map(item => (
                                    <WorkRow key={`${item.id}-${item.status}`} item={item} now={now} />
                                ))}
                            </div>
                        )}
                    </section>
                </main>

                <aside className="perci-now-side">
                    <section className="perci-now-panel">
                        <div className="perci-now-panel-heading">
                            <h2>Local runtime</h2>
                            <span className={`perci-now-runtime is-${openClawStatus?.state || 'unknown'}`}>
                                {openClawStatus?.state || 'unknown'}
                            </span>
                        </div>
                        <p className="perci-now-runtime-text">{liveSnapshot.openClaw.summary}</p>
                        {liveSnapshot.openClaw.checkedAt && (
                            <small className="perci-now-muted">Checked {relativeTime(liveSnapshot.openClaw.checkedAt, now)}</small>
                        )}
                    </section>

                    <section className="perci-now-panel">
                        <div className="perci-now-panel-heading">
                            <h2>District pressure</h2>
                        </div>
                        {liveSnapshot.districtActivity.length === 0 ? (
                            <EmptyState text="No mapped districts are active." />
                        ) : (
                            <div className="perci-now-district-list">
                                {liveSnapshot.districtActivity.map(district => (
                                    <div key={district.id} className="perci-now-district-row">
                                        <span>{district.label}</span>
                                        <strong>{district.count}</strong>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="perci-now-panel">
                        <div className="perci-now-panel-heading">
                            <h2>Snapshots</h2>
                            <button type="button" className="perci-now-snapshot-button" onClick={saveSnapshot}>
                                <Camera size={14} />
                                Save
                            </button>
                        </div>
                        {snapshots.length === 0 ? (
                            <EmptyState text="No snapshots saved." />
                        ) : (
                            <div className="perci-now-snapshot-list">
                                {snapshots.map(snapshot => (
                                    <div key={snapshot.id} className="perci-now-snapshot-row">
                                        <span className={`perci-now-snapshot-mark is-${snapshot.status}`} />
                                        <span>
                                            <strong>{formatSnapshotTime(snapshot.createdAt)}</strong>
                                            <small>
                                                {snapshot.counts.visibleWindows} surfaces · {snapshot.counts.activeMissions + snapshot.counts.activeAgentJobs} active
                                            </small>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => deleteSnapshot(snapshot.id)}
                                            aria-label={`Delete snapshot from ${formatSnapshotTime(snapshot.createdAt)}`}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </aside>
            </div>
            )}
        </div>
    );
}

function Metric({ icon: Icon, label, value, tone = 'normal' }) {
    return (
        <div className={`perci-now-metric is-${tone}`}>
            <Icon size={16} />
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function EmptyState({ text }) {
    return (
        <div className="perci-now-empty">
            <CheckCircle2 size={16} />
            <span>{text}</span>
        </div>
    );
}

function WorkRow({ item, now }) {
    const attention = ['blocked', 'failed', 'error', 'cancelled', 'denied'].includes(item.status);
    return (
        <div className={`perci-now-work-row${attention ? ' is-attention' : ''}`}>
            <span className="perci-now-work-status">{item.status}</span>
            <span>
                <strong>{item.title}</strong>
                <small>{item.agent}{item.updatedAt ? ` · ${relativeTime(item.updatedAt, now)}` : ''}</small>
            </span>
        </div>
    );
}

function relativeTime(value, now) {
    const ms = now.getTime() - new Date(value).getTime();
    if (!Number.isFinite(ms) || ms < 0) return 'now';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'yesterday' : `${days}d ago`;
}

function formatSnapshotTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Saved snapshot';
    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
