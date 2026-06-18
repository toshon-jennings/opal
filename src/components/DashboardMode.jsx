import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    MessageSquare, Users, Code, Bot, FlaskConical, Building2, ActivitySquare, Hammer,
    Plus, ArrowUpRight, Server, Sparkles, CheckCircle2, AlertTriangle, Layers, Settings,
    Radar, BookOpen, GraduationCap,
} from 'lucide-react';
import { useMode, MODES, OPENCLAW_WINDOW_ID, HERMES_WINDOW_ID, GDASH_WINDOW_ID } from '../context/ModeContext';
import { useChat } from '../context/ChatContext';
import PerciMascot from './PerciMascot';
import { AGENT_DEFINITIONS, ACTIVE_JOB_STATUSES, ATTENTION_JOB_STATUSES } from './AgentsPanel';
import OnboardingCard, { hasOnboardingBeenSeen } from './OnboardingCard';
import { BeginnerGuideModal } from './BeginnerGuideModal';
import lhLogo from '../assets/lh-logo.png';
import hermesLogo from '../assets/nousresearch.png';
import gdashLogo from '../assets/gdash-logo.png';
import barsLogo from '../assets/bars-logo.svg';
import billboardLogo from '../assets/billboard-logo.svg';
import openclawLogo from '../assets/openclaw-logo.svg';
import studioosLogo from '../assets/studioos-logo-dark.png';
import './DashboardMode.css';

const JOBS_POLL_MS = 10000;

// Native Perci surfaces — first-class workspace modes.
const NATIVE_TILES = [
    { id: MODES.CHAT, icon: MessageSquare, title: 'Chat', desc: 'Converse with any model', hue: '#f97316' },
    { id: MODES.COWORK, icon: Users, title: 'Cowork', desc: 'Session-based deep work', hue: '#22d3ee' },
    { id: MODES.CODE, icon: Code, title: 'Code', desc: 'Edit and run your repos', hue: '#a78bfa' },
    { id: MODES.NOTES, icon: BookOpen, title: 'Notes', desc: 'Markdown wiki with backlinks', hue: '#10b981' },
    { id: MODES.AGENTS, icon: Bot, title: 'Agents', desc: 'Queue jobs for the CLI crew', hue: '#4ade80' },
    { id: MODES.AUTORESEARCH, icon: FlaskConical, title: 'Research', desc: 'Prompt-optimization loops', hue: '#f472b6' },
    { id: MODES.OFFICE, icon: Building2, title: 'Office', desc: 'Visit the crew at Perci HQ', hue: '#fbbf24' },
    { id: MODES.MISSION, icon: ActivitySquare, title: 'Mission', desc: 'Supervise runs and checks', hue: '#60a5fa' },
    { id: MODES.BUILD, icon: Hammer, title: 'Build', desc: 'Generate and ship projects', hue: '#fb7185' },
];

// OS-level tools and external runtimes. Bars belongs here when its Perci
// surface is wired, not in the native Perci app group.
const SYSTEM_TILES = [
    { id: MODES.LIGHTHOUSE, icon: Radar, logo: lhLogo, title: 'Lighthouse', desc: 'Scan ports and find conflicts', hue: '#ffbf45' },
    { id: OPENCLAW_WINDOW_ID, icon: Server, logo: openclawLogo, title: 'OpenClaw', desc: 'Gateway dashboard', hue: '#ef4444' },
    { id: HERMES_WINDOW_ID, icon: null, logo: hermesLogo, title: 'Hermes', desc: 'CLI agent — chat, console, sessions', hue: '#eab308', artwork: true },
    { id: GDASH_WINDOW_ID, icon: null, logo: gdashLogo, title: 'G-Dash', desc: 'Google Workspace dashboard', hue: '#4285f4' },
    { id: MODES.BARS, icon: null, logo: barsLogo, title: 'BARS', desc: 'Idea notebook', hue: '#f59e0b' },
    { id: MODES.CONCERNS, icon: null, logo: billboardLogo, title: 'Bill Board', desc: 'Services, keys & subscriptions', hue: '#06b6d4' },
    { id: MODES.STUDIOOS, icon: Layers, logo: studioosLogo, title: 'StudioOS', desc: 'View/manage your StudioOS workspace', hue: '#3b82f6' },
];

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

    const perciState = jobStats.attention > 0 ? 'error' : jobStats.active > 0 ? 'working' : 'idle';
    const openIds = useMemo(() => new Set(windows.map((w) => w.modeId)), [windows]);

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
                                Beginner's guide
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
                    </div>
                    <button
                        type="button"
                        className="dash-perci"
                        onClick={() => openWindow(MODES.OFFICE)}
                        title="Visit Perci HQ"
                    >
                        <PerciMascot state={perciState} size={148} title={`Perci is ${perciState}`} variant="classic" />
                        <span className="dash-perci-caption">
                            {perciState === 'error' ? 'A job needs attention'
                                : perciState === 'working' ? `${jobStats.active} job${jobStats.active === 1 ? '' : 's'} running`
                                : 'All quiet'}
                        </span>
                    </button>
                </section>

                {/* ── Body: launchpad + live rail ── */}
                <div className="dash-body">
                    <section className="dash-launch">
                        <div className="dash-launch-group">
                            <h2 className="dash-section-title">Perci native</h2>
                            <div className="dash-tiles">
                                {NATIVE_TILES.map(({ id, icon: Icon, logo, title, desc, hue }, i) => (
                                <button
                                    key={id}
                                    type="button"
                                    className="dash-tile"
                                    style={{ '--tile': hue, '--i': i }}
                                    onClick={() => openWindow(id)}
                                >
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
                            <div className="dash-tiles dash-tiles-system">
                                {SYSTEM_TILES.map(({ id, icon: Icon, logo, title, desc, hue, artwork }, i) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={`dash-tile dash-tile-system${artwork ? ' dash-tile-hero' : ''}`}
                                    style={{ '--tile': hue, '--i': i + NATIVE_TILES.length }}
                                    onClick={() => openWindow(id)}
                                >
                                    {artwork && <span className="dash-tile-art" aria-hidden="true" />}
                                    <span className="dash-tile-icon">
                                        {logo ? <img src={logo} alt="" className="dash-tile-logo" /> : <Icon size={20} />}
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
                                ))}
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
                                <p className="dash-empty">No conversations yet — start one and it'll appear here.</p>
                            )}
                        </div>

                        {/* System strip */}
                        <div className="dash-card dash-system" style={{ '--i': 4 }}>
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
                        </div>
                    </aside>
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
        </div>
    );
}
