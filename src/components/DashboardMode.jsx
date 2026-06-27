/* global __APP_VERSION__ */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    MessageSquare, Bot,
    Plus, ArrowUpRight, Server, Sparkles, CheckCircle2, AlertTriangle, Layers, Settings,
    GraduationCap, Globe, X, TerminalSquare, ChevronRight, Terminal, BookOpen,
    ArrowDownAZ, GripVertical,
} from 'lucide-react';
import { useMode, MODES, OPENCLAW_WINDOW_ID, HERMES_WINDOW_ID, GDASH_WINDOW_ID, KLIPIT_WINDOW_ID } from '../context/ModeContext';
import { useChat } from '../context/ChatContext';
import DashboardPerciNowGlance from './DashboardPerciNowGlance';
import { AGENT_DEFINITIONS, ACTIVE_JOB_STATUSES, ATTENTION_JOB_STATUSES } from './AgentsPanel';
import OnboardingCard, { hasOnboardingBeenSeen } from './OnboardingCard';
import { BeginnerGuideModal } from './BeginnerGuideModal';
import { NATIVE_TILES, SYSTEM_TILES, LOGO_WHITE_BOX_IDS, LOGO_FILL_COVER_IDS } from '../lib/appCatalog';
import { readJsonStorage, writeStringStorage } from '../lib/persistentStore';
import './DashboardMode.css';

const JOBS_POLL_MS = 10000;
const DASHBOARD_TILE_ORDER_KEY = 'perci_dashboard_tile_order';

function normalizeTileOrder(tiles, savedOrder) {
    const tileIds = new Set(tiles.map((tile) => tile.id));
    const ordered = Array.isArray(savedOrder) ? savedOrder.filter((id) => tileIds.has(id)) : [];
    const missing = tiles.map((tile) => tile.id).filter((id) => !ordered.includes(id));
    return [...ordered, ...missing];
}

function orderTiles(tiles, order) {
    const byId = new Map(tiles.map((tile) => [tile.id, tile]));
    return normalizeTileOrder(tiles, order).map((id) => byId.get(id)).filter(Boolean);
}

function sortTilesByTitle(tiles) {
    return [...tiles].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

function moveIdWithinOrder(order, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return order;
    const next = order.filter((id) => id !== fromId);
    const toIndex = next.indexOf(toId);
    if (toIndex === -1) return order;
    next.splice(toIndex, 0, fromId);
    return next;
}

const NATIVE_TOOL_MODALS = {
    chronicle: {
        eyebrow: 'GitHub story layer',
        title: 'Perci Story',
        accent: '#fb923c',
        tabs: [
            {
                id: 'overview',
                label: 'Overview',
                summary: 'Turns noisy commit ranges into an evidence-backed product history. Reads Git, clusters changed files by surface, adds GitHub compare links, and pulls Graphify context when available. Install globally with npm install -g perci-story.',
                commands: [
                    { label: 'install', code: 'npm install -g perci-story' },
                    { label: 'by range', code: 'story --range v1.0.0..HEAD' },
                    { label: 'by date', code: 'story --since 2026-06-20' },
                ],
                stats: [
                    { label: 'Output', value: 'Markdown + JSON' },
                    { label: 'Evidence', value: 'Git + Graphify' },
                    { label: 'Best for', value: 'Large grouped commits' },
                ],
                signals: [
                    'Detects IPC handlers, storage keys, React components, test coverage, and visual assets across all commits in the range.',
                    'Reports Graphify coverage so stale architecture indexes do not become false certainty.',
                    'Add a perci-story.config.mjs to your project root to define custom surfaces for your codebase.',
                    'Keeps a commit ledger and GitHub compare link beside the higher-level narrative.',
                ],
            },
            {
                id: 'examples',
                label: 'Examples',
                description: 'In this repo: npm run story -- (the -- passes flags through). Globally installed: perci-story. Mix and match --range or --since/--until with any output flags.',
                commands: [
                    { label: 'by range', code: 'story --range v1.0.0..HEAD' },
                    { label: 'by date', code: 'story --since 2026-06-20' },
                    { label: 'date+limit', code: 'story --since 2026-06-20 --max-commits 40' },
                    { label: 'to file', code: 'story --range HEAD~10..HEAD --out CHANGES.md' },
                    { label: '--json', code: 'story --range HEAD~20..HEAD --json story.json' },
                    { label: 'both out', code: 'story --range v1.0.0..HEAD --out STORY.md --json STORY.json' },
                    { label: '--github', code: 'story --range v1.0.0..HEAD --github https://github.com/owner/repo' },
                    { label: '--config', code: 'story --range HEAD~10..HEAD --config ./my-surfaces.mjs' },
                ],
            },
            {
                id: 'options',
                label: 'Options',
                description: 'When using npm run story, pass flags after the -- separator. When using the global install, pass flags directly.',
                flags: [
                    { flag: '--range <rev-range>', description: 'Git revision range, e.g. v1.0.0..HEAD or HEAD~10..HEAD.' },
                    { flag: '--since <date>', description: 'Include commits since this date (ISO 8601 or natural, e.g. 2026-06-20).' },
                    { flag: '--until <date>', description: 'Include commits up to this date.' },
                    { flag: '--max-commits <n>', description: 'Limit the number of commits when --range is omitted (default: 50).' },
                    { flag: '--out <path>', description: 'Write Markdown output to a file. Defaults to stdout.' },
                    { flag: '--json <path>', description: 'Write the structured story JSON to a file.' },
                    { flag: '--github <url>', description: 'GitHub repo URL used to generate commit and compare links.' },
                    { flag: '--graph <path>', description: 'Path to Graphify graph.json. Auto-detected from graphify-out/ if omitted.' },
                    { flag: '--config <path>', description: 'Path to a perci-story.config.mjs file defining custom surfaces for your project.' },
                ],
            },
        ],
    },
    'graphify-diff': {
        eyebrow: 'Architecture diff lens',
        title: 'gdiff  (graphify-diff)',
        accent: '#60a5fa',
        tabs: [
            {
                id: 'overview',
                label: 'Overview',
                summary: 'Incrementally patches a Graphify knowledge graph from git diffs — no full re-extraction needed. Run any subcommand from inside the repo with no arguments; the diff baseline is auto-detected from the last graph build timestamp.',
                commands: [
                    { label: 'patch', code: 'gdiff patch' },
                    { label: 'analyze', code: 'gdiff analyze' },
                    { label: 'impact', code: 'gdiff impact' },
                ],
                stats: [
                    { label: 'Mode', value: 'Incremental' },
                    { label: 'Baseline', value: 'Auto-detected' },
                    { label: 'Subcommands', value: 'analyze · patch · impact' },
                ],
                signals: [
                    'Run any subcommand from inside the repo with no arguments — baseline is auto-detected from the last graph build.',
                    'gdiff analyze is safe to run at any time: read-only, no graph required, shows what would change.',
                    'gdiff impact traces cascading transitive effects on the existing graph without modifying it.',
                    'Pass a repo path as the first argument to run from outside the repo directory.',
                ],
            },
            {
                id: 'patch',
                label: 'patch',
                description: 'Apply a git diff to an existing Graphify graph.json. Changed symbols cascade through dependent nodes up to --cascade-depth levels (default: 3). The baseline is the last graph build; override with --since.',
                commands: [
                    { label: 'in repo', code: 'gdiff patch' },
                    { label: '--since', code: 'gdiff patch --since HEAD~1' },
                    { label: 'branch', code: 'gdiff patch . --since main' },
                    { label: 'dry run', code: 'gdiff patch --dry-run' },
                    { label: 'staged', code: 'gdiff patch --staged' },
                    { label: 'remote', code: 'gdiff patch /path/to/repo --since main' },
                    { label: '--json', code: 'gdiff patch --json' },
                ],
                flags: [
                    { flag: '--since / -s <ref>', description: 'Git ref to diff against (HEAD~1, a branch, a SHA). Auto-detected from the last graph build if omitted.' },
                    { flag: '--staged', description: 'Diff staged changes instead of unstaged — useful right before a commit.' },
                    { flag: '--dry-run / -n', description: 'Show what would change without writing to graph.json.' },
                    { flag: '--cascade-depth / -d <n>', description: 'How far to cascade dependency changes (default: 3).' },
                    { flag: '--graph / -g <path>', description: 'Path to graph.json (default: REPO/graphify-out/graph.json).' },
                    { flag: '--output / -o <path>', description: 'Output path (default: overwrite the input graph.json).' },
                    { flag: '--json', description: 'Emit machine-readable JSON output.' },
                ],
            },
            {
                id: 'analyze',
                label: 'analyze',
                description: 'Read-only — no graph required. Parses the git diff and shows which files, symbols, and potential dependencies would be affected. Safe to run at any time without touching the graph.',
                commands: [
                    { label: 'in repo', code: 'gdiff analyze' },
                    { label: '--since', code: 'gdiff analyze --since HEAD~1' },
                    { label: 'staged', code: 'gdiff analyze --staged' },
                ],
                flags: [
                    { flag: '--since / -s <ref>', description: 'Git ref to diff against. Auto-detected from the last graph build if omitted.' },
                    { flag: '--staged', description: 'Diff staged changes.' },
                ],
            },
            {
                id: 'impact',
                label: 'impact',
                description: 'Loads the existing graph and traces which nodes would be affected by the diff, including transitive dependencies up to the specified depth. Does not modify the graph.',
                commands: [
                    { label: 'in repo', code: 'gdiff impact' },
                    { label: '--since', code: 'gdiff impact --since HEAD~1' },
                    { label: 'depth', code: 'gdiff impact --depth 5' },
                    { label: 'custom graph', code: 'gdiff impact --graph ./graphify-out/graph.json' },
                ],
                flags: [
                    { flag: '--since / -s <ref>', description: 'Git ref to diff against. Auto-detected from the last graph build if omitted.' },
                    { flag: '--depth / -d <n>', description: 'Cascade depth for impact analysis.' },
                    { flag: '--graph / -g <path>', description: 'Path to graph.json.' },
                ],
            },
        ],
    },
};

const AGENT_LABELS = Object.fromEntries(AGENT_DEFINITIONS.map((a) => [a.id, a.shortLabel]));

function greetingFor(hour) {
    if (hour < 5) return 'Up late';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 22) return 'Good evening';
    return 'Up late';
}

function relativeTime(value, nowMs) {
    const ms = nowMs - new Date(value).getTime();
    if (!Number.isFinite(ms) || ms < 0) return 'now';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'yesterday' : `${days}d ago`;
}

function jobTone(status) {
    if (ACTIVE_JOB_STATUSES.has(status)) return 'active';
    if (ATTENTION_JOB_STATUSES.has(status)) return 'attention';
    return 'done';
}

export default function DashboardMode({ openClawStatus, onOpenSettings }) {
    const { openWindow, windows } = useMode();
    const { chats, createNewChat, switchToChat, userName, updateProvider } = useChat();
    const [now, setNow] = useState(() => new Date());
    const [jobs, setJobs] = useState([]);
    const [showOnboarding, setShowOnboarding] = useState(() => !hasOnboardingBeenSeen());
    const [showBeginnerGuide, setShowBeginnerGuide] = useState(false);
    const [nativeToolModal, setNativeToolModal] = useState(null);
    const [tileOrder, setTileOrder] = useState(() => {
        const saved = readJsonStorage(DASHBOARD_TILE_ORDER_KEY, {});
        return {
            native: normalizeTileOrder(NATIVE_TILES, saved?.native),
            system: normalizeTileOrder(SYSTEM_TILES, saved?.system),
        };
    });
    const [alphabeticalSections, setAlphabeticalSections] = useState({ native: false, system: false });
    const [dragState, setDragState] = useState(null);

    // Drop the user straight into Settings focused on OpenRouter, with its
    // API-key field revealed. Used by the beginner guide's OpenRouter CTA.
    // beginner guide's OpenRouter CTA.
    const openOpenRouterSettings = useCallback(() => {
        updateProvider?.('openrouter');
        onOpenSettings?.();
    }, [updateProvider, onOpenSettings]);
    const bridgeAvailable = Boolean(window.electron?.listAgentJobs);

    // Clock tick
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    // Agent job pulse (shares the bridge the Agents/Office panels use)
    const loadJobs = useCallback(async () => {
        if (!window.electron?.listAgentJobs) return;
        try {
            const list = await window.electron.listAgentJobs({ limit: 30, source: 'dashboard' });
            setJobs((list || []).slice().sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ));
        } catch {
            // keep last data; the dashboard degrades to stale stats silently
        }
    }, []);

    useEffect(() => {
        void loadJobs();
        const id = window.setInterval(() => void loadJobs(), JOBS_POLL_MS);
        return () => window.clearInterval(id);
    }, [loadJobs]);

    const nowMs = now.getTime();
    const jobStats = useMemo(() => ({
        active: jobs.filter((j) => ACTIVE_JOB_STATUSES.has(j.status)).length,
        attention: jobs.filter((j) => ATTENTION_JOB_STATUSES.has(j.status)).length,
        done: jobs.filter((j) => j.status === 'completed').length,
    }), [jobs]);

    const recentJobs = jobs.slice(0, 4);
    const recentChats = useMemo(
        () => chats
            .filter((c) => (c.messages?.length ?? 0) > 0)
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
            .slice(0, 5),
        [chats]
    );

    // Live gateway summary for the OpenClaw tile, from the 30s health poll in App.jsx.
    const openClawDesc = useMemo(() => {
        if (openClawStatus?.state === 'checking') return 'Checking gateway…';
        if (openClawStatus?.state !== 'online') return 'Gateway offline';
        const health = openClawStatus?.result?.health;
        if (!health) return 'Gateway online';
        const agents = health.agents?.length ?? 0;
        const active = health.tasks?.active ?? 0;
        const parts = [
            `${agents} agent${agents === 1 ? '' : 's'}`,
            `${active} active task${active === 1 ? '' : 's'}`,
        ];
        if (health.tasks?.failures) parts.push(`${health.tasks.failures} failed`);
        if (health.runtimeVersion) parts.push(`v${health.runtimeVersion}`);
        return parts.join(' · ');
    }, [openClawStatus]);

    const openIds = useMemo(() => new Set(windows.map((w) => w.modeId)), [windows]);
    const orderedNativeTiles = useMemo(() => {
        const tiles = orderTiles(NATIVE_TILES, tileOrder.native);
        return alphabeticalSections.native ? sortTilesByTitle(tiles) : tiles;
    }, [alphabeticalSections.native, tileOrder.native]);
    const orderedSystemTiles = useMemo(() => {
        const tiles = orderTiles(SYSTEM_TILES, tileOrder.system);
        return alphabeticalSections.system ? sortTilesByTitle(tiles) : tiles;
    }, [alphabeticalSections.system, tileOrder.system]);

    const persistTileOrder = useCallback((nextOrder) => {
        writeStringStorage(DASHBOARD_TILE_ORDER_KEY, JSON.stringify(nextOrder));
    }, []);

    const toggleAlphabeticalSection = useCallback((section) => {
        setAlphabeticalSections((current) => ({
            ...current,
            [section]: !current[section],
        }));
        setDragState(null);
    }, []);

    const moveDashboardTile = useCallback((section, fromId, toId) => {
        if (alphabeticalSections[section]) return;
        setTileOrder((current) => {
            const next = {
                ...current,
                [section]: moveIdWithinOrder(current[section], fromId, toId),
            };
            persistTileOrder(next);
            return next;
        });
    }, [alphabeticalSections, persistTileOrder]);

    const startTileDrag = useCallback((section, id, event) => {
        if (alphabeticalSections[section]) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
        setDragState({ section, id });
    }, [alphabeticalSections]);

    const endTileDrag = useCallback(() => {
        setDragState(null);
    }, []);

    const handleTileDragOver = useCallback((section, id, event) => {
        if (!dragState || dragState.section !== section || dragState.id === id || alphabeticalSections[section]) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, [alphabeticalSections, dragState]);

    const handleTileDrop = useCallback((section, id, event) => {
        event.preventDefault();
        const draggedId = dragState?.id || event.dataTransfer.getData('text/plain');
        if (dragState?.section !== section) return;
        moveDashboardTile(section, draggedId, id);
        setDragState(null);
    }, [dragState, moveDashboardTile]);

    const openChat = (chatId) => {
        if (chatId) switchToChat(chatId);
        openWindow(MODES.CHAT);
    };

    const startNewChat = () => {
        createNewChat();
        openWindow(MODES.CHAT);
    };

    const timeText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateText = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <div className="dash-root">
            <div className="dash-bg" aria-hidden="true">
                <span className="dash-orb dash-orb-1" />
                <span className="dash-orb dash-orb-2" />
                <span className="dash-orb dash-orb-3" />
                <span className="dash-grid" />
            </div>

            <div className="dash-scroll">
                <div className="dash-scroll-inner">
                {/* ── Hero ── */}
                <section className="dash-hero">
                    <div className="dash-hero-text">
                        <p className="dash-kicker">
                            <Sparkles size={13} />
                            {dateText}
                        </p>
                        <h1 className="dash-clock">{timeText}</h1>
                        <p className="dash-greeting">
                            {greetingFor(now.getHours())}{userName ? `, ${userName}` : ''} — what shall we build?
                        </p>
                        <div className="dash-hero-actions">
                            <button type="button" className="dash-cta" onClick={startNewChat}>
                                <Plus size={15} />
                                New chat
                            </button>
                            <button type="button" className="dash-cta dash-cta-ghost" onClick={() => openWindow(MODES.AGENTS)}>
                                <Bot size={15} />
                                Send an agent
                            </button>
                            <button type="button" className="dash-cta dash-cta-ghost" onClick={() => setShowBeginnerGuide(true)}>
                                <GraduationCap size={15} />
                                Beginner&apos;s guide
                            </button>
                            {onOpenSettings && (
                                <button type="button" className="dash-cta dash-cta-ghost" onClick={onOpenSettings}>
                                    <Settings size={15} />
                                    Settings
                                </button>
                            )}
                            {!showOnboarding && (
                                <button
                                    type="button"
                                    className="dash-cta dash-cta-ghost dash-cta-icon-only"
                                    onClick={() => setShowOnboarding(true)}
                                    title="Show onboarding walkthrough"
                                >
                                    <BookOpen size={15} />
                                </button>
                            )}
                        </div>
                        <p className="dash-version">v{__APP_VERSION__}</p>
                        <div className="dash-hero-system">
                            <span className={`dash-chip ${openClawStatus?.state === 'online' ? 'is-online' : openClawStatus?.state === 'checking' ? 'is-checking' : 'is-off'}`}>
                                <Server size={12} />
                                {openClawStatus?.state === 'online' ? 'Gateway online'
                                    : openClawStatus?.state === 'checking' ? 'Gateway…'
                                    : 'Gateway offline'}
                            </span>
                            <span className="dash-chip">
                                <Layers size={12} />
                                {windows.length} window{windows.length === 1 ? '' : 's'} open
                            </span>
                            <span className="dash-chip">{window.electron ? 'Desktop' : 'Web'}</span>
                            <button
                                type="button"
                                className="dash-tool-btn"
                                onClick={() => setNativeToolModal('chronicle')}
                            >
                                <Terminal size={13} strokeWidth={2.5} />
                                <span>story</span>
                                <ChevronRight size={13} strokeWidth={2.5} />
                            </button>
                            <button
                                type="button"
                                className="dash-tool-btn"
                                onClick={() => setNativeToolModal('graphify-diff')}
                            >
                                <Terminal size={13} strokeWidth={2.5} />
                                <span>gdiff</span>
                                <ChevronRight size={13} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                    <DashboardPerciNowGlance
                        windows={windows}
                        agentJobs={jobs}
                        openClawStatus={openClawStatus}
                        now={now}
                        onOpen={() => openWindow(MODES.PERCI_NOW)}
                    />
                </section>

                {/* ── Body: launchpad + live rail ── */}
                <div className="dash-body">
                    <section className="dash-launch">
                        <div className="dash-launch-group">
                            <DashboardSectionHeader
                                title="Perci native"
                                alphabetical={alphabeticalSections.native}
                                onToggleAlphabetical={() => toggleAlphabeticalSection('native')}
                            />
                            <div className="dash-tiles">
                                {orderedNativeTiles.map(({ id, icon: Icon, logo, title, desc, hue }, i) => (
                                <button
                                    key={id}
                                    type="button"
                                    draggable={!alphabeticalSections.native}
                                    className={`dash-tile${dragState?.id === id ? ' is-dragging' : ''}`}
                                    style={{ '--tile': hue, '--i': i }}
                                    onDragStart={(event) => startTileDrag('native', id, event)}
                                    onDragEnd={endTileDrag}
                                    onDragOver={(event) => handleTileDragOver('native', id, event)}
                                    onDrop={(event) => handleTileDrop('native', id, event)}
                                    onClick={() => openWindow(id)}
                                >
                                    <span className="dash-tile-drag" aria-hidden="true">
                                        <GripVertical size={14} />
                                    </span>
                                    <span className="dash-tile-icon">
                                        {logo ? <img src={logo} alt="" className="dash-tile-logo" /> : <Icon size={18} />}
                                    </span>
                                    <span className="dash-tile-text">
                                        <span className="dash-tile-name">{title}</span>
                                        <span className="dash-tile-desc">{desc}</span>
                                    </span>
                                    {openIds.has(id) && <span className="dash-tile-open">open</span>}
                                    {id === MODES.AGENTS && jobStats.active > 0 && (
                                        <span className="dash-tile-badge">{jobStats.active}</span>
                                    )}
                                    <ArrowUpRight size={13} className="dash-tile-arrow" />
                                </button>
                                ))}
                            </div>
                        </div>

                        <div className="dash-launch-group">
                            <DashboardSectionHeader
                                title="System & external"
                                alphabetical={alphabeticalSections.system}
                                onToggleAlphabetical={() => toggleAlphabeticalSection('system')}
                            />
                            <div className="dash-tiles dash-tiles-system">
                                {orderedSystemTiles.map(({ id, icon: Icon, logo, title, desc, hue, artwork, bgImage }, i) => {
                                    const isWhiteBox = LOGO_WHITE_BOX_IDS.has(id);
                                    const isFillCover = LOGO_FILL_COVER_IDS.has(id);
                                    let logoStyle;
                                    if (id === GDASH_WINDOW_ID || id === MODES.LIGHTHOUSE) logoStyle = { width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'contain', padding: '5px' };
                                    else if (id === MODES.STUDIOOS) logoStyle = { width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'contain', padding: '2px' };
                                    else if (isFillCover) logoStyle = { width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' };
                                    else if (id === HERMES_WINDOW_ID) logoStyle = { width: '28px', height: '28px' };

                                    return (
                                    <button
                                        key={id}
                                        type="button"
                                        draggable={!alphabeticalSections.system}
                                        className={`dash-tile dash-tile-system${artwork ? ' dash-tile-hero' : ''}${id === HERMES_WINDOW_ID ? ' dash-tile-hermes' : ''}${id === MODES.LIGHTHOUSE ? ' dash-tile-lighthouse' : ''}${dragState?.id === id ? ' is-dragging' : ''}`}
                                        style={{ '--tile': hue, '--i': i + NATIVE_TILES.length }}
                                        onDragStart={(event) => startTileDrag('system', id, event)}
                                        onDragEnd={endTileDrag}
                                        onDragOver={(event) => handleTileDragOver('system', id, event)}
                                        onDrop={(event) => handleTileDrop('system', id, event)}
                                        onClick={() => openWindow(id)}
                                    >
                                        <span className="dash-tile-drag" aria-hidden="true">
                                            <GripVertical size={14} />
                                        </span>
                                        {artwork && (
                                            <span
                                                className="dash-tile-art flex items-center justify-center overflow-hidden"
                                                aria-hidden="true"
                                                style={bgImage ? { backgroundImage: `url('${bgImage}')` } : undefined}
                                            >
                                                {id === KLIPIT_WINDOW_ID && (
                                                    <Globe className="absolute -right-6 -bottom-6 text-white/80" size={140} strokeWidth={1.5} />
                                                )}
                                            </span>
                                        )}
                                        <span className={`dash-tile-icon ${isWhiteBox || isFillCover ? 'overflow-hidden' : ''} ${isWhiteBox ? '!bg-white' : ''}`}>
                                            {logo ? <img src={logo} alt="" className="dash-tile-logo" style={logoStyle} /> : <Icon size={20} />}
                                        </span>
                                    <span className="dash-tile-name">
                                        {title}
                                        {id === OPENCLAW_WINDOW_ID && (
                                            <span className={`dash-dot ${openClawStatus?.state === 'online' ? 'is-online' : 'is-off'}`} />
                                        )}
                                    </span>
                                    <span className="dash-tile-desc">{id === OPENCLAW_WINDOW_ID ? openClawDesc : desc}</span>
                                    {openIds.has(id) && <span className="dash-tile-open">open</span>}
                                    <ArrowUpRight size={13} className="dash-tile-arrow" />
                                </button>
                                );
                                })}
                            </div>
                        </div>
                    </section>

                    <aside className="dash-rail">
                        {/* Onboarding walkthrough */}
                        {showOnboarding && (
                            <OnboardingCard
                                onComplete={() => setShowOnboarding(false)}
                                onOpenSettings={onOpenSettings}
                                onOpenMode={(modeId) => openWindow(modeId)}
                            />
                        )}

                        {/* Agent pulse */}
                        <div className="dash-card" style={{ '--i': 2 }}>
                            <div className="dash-card-head">
                                <h2 className="dash-section-title">Agent pulse</h2>
                                <button type="button" className="dash-link" onClick={() => openWindow(MODES.AGENTS)}>
                                    View all
                                </button>
                            </div>
                            <div className="dash-pulse">
                                <div className="dash-pulse-stat" data-tone="active">
                                    <strong>{jobStats.active}</strong>
                                    <span>running</span>
                                </div>
                                <div className="dash-pulse-stat" data-tone="done">
                                    <strong>{jobStats.done}</strong>
                                    <span>done</span>
                                </div>
                                <div className="dash-pulse-stat" data-tone="attention">
                                    <strong>{jobStats.attention}</strong>
                                    <span>attention</span>
                                </div>
                            </div>
                            {bridgeAvailable ? (
                                recentJobs.length > 0 ? (
                                    <ul className="dash-list">
                                        {recentJobs.map((job) => (
                                            <li key={job.id}>
                                                <button type="button" className="dash-row" onClick={() => openWindow(MODES.AGENTS)}>
                                                    <span className={`dash-row-icon is-${jobTone(job.status)}`}>
                                                        {jobTone(job.status) === 'attention' ? <AlertTriangle size={13} />
                                                            : jobTone(job.status) === 'done' ? <CheckCircle2 size={13} />
                                                            : <Layers size={13} />}
                                                    </span>
                                                    <span className="dash-row-main">
                                                        <span className="dash-row-title">{AGENT_LABELS[job.agent] || job.agent}</span>
                                                        <span className="dash-row-sub">{job.prompt_preview || job.status}</span>
                                                    </span>
                                                    <span className="dash-row-time">{relativeTime(job.created_at, nowMs)}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="dash-empty">No agent jobs yet — send one from the Agents window.</p>
                                )
                            ) : (
                                <p className="dash-empty">Agent telemetry needs the Perci desktop app.</p>
                            )}
                        </div>

                        {/* Recent chats */}
                        <div className="dash-card" style={{ '--i': 3 }}>
                            <div className="dash-card-head">
                                <h2 className="dash-section-title">Recent chats</h2>
                                <button type="button" className="dash-link" onClick={startNewChat}>
                                    New
                                </button>
                            </div>
                            {recentChats.length > 0 ? (
                                <ul className="dash-list">
                                    {recentChats.map((chat) => (
                                        <li key={chat.id}>
                                            <button type="button" className="dash-row" onClick={() => openChat(chat.id)}>
                                                <span className="dash-row-icon is-chat"><MessageSquare size={13} /></span>
                                                <span className="dash-row-main">
                                                    <span className="dash-row-title">{chat.title || 'Untitled chat'}</span>
                                                    <span className="dash-row-sub">{chat.messages.length} messages</span>
                                                </span>
                                                <span className="dash-row-time">{relativeTime(chat.updatedAt || chat.createdAt, nowMs)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="dash-empty">No conversations yet — start one and it&apos;ll appear here.</p>
                            )}
                        </div>

                    </aside>
                </div>
                </div>
            </div>

            <BeginnerGuideModal
                isOpen={showBeginnerGuide}
                onClose={() => setShowBeginnerGuide(false)}
                onGetOpenRouterKey={() => {
                    setShowBeginnerGuide(false);
                    openOpenRouterSettings();
                }}
            />
            <NativeToolModal
                tool={nativeToolModal ? NATIVE_TOOL_MODALS[nativeToolModal] : null}
                onClose={() => setNativeToolModal(null)}
            />
        </div>
    );
}

function DashboardSectionHeader({ title, alphabetical, onToggleAlphabetical }) {
    return (
        <div className="dash-section-head">
            <h2 className="dash-section-title">{title}</h2>
            <button
                type="button"
                className={`dash-sort-toggle${alphabetical ? ' is-active' : ''}`}
                onClick={onToggleAlphabetical}
                aria-pressed={alphabetical}
                title={alphabetical ? 'Return to manual tile order' : 'Arrange this section alphabetically'}
            >
                <ArrowDownAZ size={14} />
                <span>{alphabetical ? 'Manual' : 'A-Z'}</span>
            </button>
        </div>
    );
}

function ToolCommands({ commands }) {
    return (
        <div className="dash-tool-modal-commands">
            {commands.map(({ label, code }) => (
                <div key={code} className="dash-tool-modal-command">
                    <span>{label}</span>
                    <code>{code}</code>
                </div>
            ))}
        </div>
    );
}

function ToolStats({ stats }) {
    return (
        <div className="dash-tool-modal-stats">
            {stats.map(stat => (
                <div key={stat.label}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                </div>
            ))}
        </div>
    );
}

function ToolSignals({ signals }) {
    return (
        <div className="dash-tool-modal-signals">
            {signals.map(signal => (
                <div key={signal}>
                    <CheckCircle2 size={15} />
                    <span>{signal}</span>
                </div>
            ))}
        </div>
    );
}

function ToolFlags({ flags }) {
    return (
        <div className="dash-tool-modal-flags">
            {flags.map(({ flag, description }) => (
                <div key={flag} className="dash-tool-modal-flag">
                    <code>{flag}</code>
                    <span>{description}</span>
                </div>
            ))}
        </div>
    );
}

function NativeToolModal({ tool, onClose }) {
    const [activeTab, setActiveTab] = useState(0);

    useEffect(() => { setActiveTab(0); }, [tool]);

    useEffect(() => {
        if (!tool) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tool, onClose]);

    if (!tool) return null;

    const hasTabs = Boolean(tool.tabs?.length);
    const tab = hasTabs ? tool.tabs[activeTab] : null;

    return createPortal(
        <div
            className="dash-tool-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                className="dash-tool-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dash-tool-modal-title"
                style={{ '--tool': tool.accent }}
            >
                <div className="dash-tool-modal-rail" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </div>

                <button
                    type="button"
                    className="dash-tool-modal-close"
                    onClick={onClose}
                    aria-label="Close tool details"
                >
                    <X size={16} />
                </button>

                <div className="dash-tool-modal-head">
                    <div className="dash-tool-modal-mark">
                        <TerminalSquare size={22} />
                    </div>
                    <div>
                        <p>{tool.eyebrow}</p>
                        <h2 id="dash-tool-modal-title">{tool.title}</h2>
                    </div>
                </div>

                {hasTabs ? (
                    <>
                        <div className="dash-tool-modal-tabs" role="tablist">
                            {tool.tabs.map((t, i) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={i === activeTab}
                                    className={`dash-tool-modal-tab${i === activeTab ? ' active' : ''}`}
                                    onClick={() => setActiveTab(i)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="dash-tool-modal-tab-body" role="tabpanel">
                            {tab.summary && <p className="dash-tool-modal-summary">{tab.summary}</p>}
                            {tab.description && <p className="dash-tool-modal-description">{tab.description}</p>}
                            {tab.commands && <ToolCommands commands={tab.commands} />}
                            {tab.flags && <ToolFlags flags={tab.flags} />}
                            {tab.stats && <ToolStats stats={tab.stats} />}
                            {tab.signals && <ToolSignals signals={tab.signals} />}
                        </div>
                    </>
                ) : (
                    <>
                        <p className="dash-tool-modal-summary">{tool.summary}</p>
                        {tool.commands
                            ? <ToolCommands commands={tool.commands} />
                            : (
                                <div className="dash-tool-modal-command">
                                    <span>CLI</span>
                                    <code>{tool.command}</code>
                                </div>
                            )}
                        <ToolStats stats={tool.stats} />
                        <ToolSignals signals={tool.signals} />
                    </>
                )}
            </section>
        </div>,
        document.body
    );
}
