import { useCallback, useEffect, useState } from 'react';
import { useMode, MODES } from '../context/ModeContext';
import PerciMascot from './PerciMascot';
import { AGENT_DEFINITIONS, ACTIVE_JOB_STATUSES, ATTENTION_JOB_STATUSES } from './AgentsPanel';
import './OfficePanel.css';

// Signature color for each agent's robot avatar.
const BOT_COLORS = {
    aider: '#2dd4bf',
    antigravity_cli: '#60a5fa',
    claude_code: '#d97757',
    codex: '#9aa5b1',
    copilot: '#a78bfa',
    cursor_cli: '#e4e4e7',
    hermes: '#eab308',
    jan: '#22d3ee',
    openclaw: '#ef4444',
    openhands: '#4ade80',
    opencode: '#f472b6',
    perci_code: '#cd9a3c',
    qwen_code: '#818cf8',
};

const POLL_MS = 5000;
const RECENT_DONE_MS = 2 * 60 * 1000;

// Mood drives the desk + avatar animation: working (typing), attention
// (last job failed/blocked), done (finished within the last 2 min), idle.
function agentMood(jobs, nowMs) {
    if (jobs.some((job) => ACTIVE_JOB_STATUSES.has(job.status))) return 'working';
    const latest = jobs[0];
    if (!latest) return 'idle';
    if (ATTENTION_JOB_STATUSES.has(latest.status)) return 'attention';
    if (latest.status === 'completed') {
        const finished = new Date(latest.completed_at || latest.created_at).getTime();
        if (Number.isFinite(finished) && nowMs - finished < RECENT_DONE_MS) return 'done';
    }
    return 'idle';
}

const MOOD_LABELS = {
    working: 'hard at work',
    attention: 'needs attention',
    done: 'just finished a job',
    idle: 'waiting for work',
};

function perciBubble({ working, attention, done }) {
    if (attention > 0) return attention === 1 ? 'One desk needs my help!' : `${attention} desks need my help!`;
    if (working > 0) return working === 1 ? 'Quiet please — 1 agent at work.' : `Quiet please — ${working} agents at work.`;
    if (done > 0) return 'Splendid work, team!';
    return 'All quiet at HQ. Send the crew a quest!';
}

// One robot coworker. Parts are class-tagged so OfficePanel.css can animate
// them per the desk's data-status (blink, type, shake, bounce).
function AgentBot({ color }) {
    return (
        <svg className="abot" viewBox="0 0 80 66" aria-hidden="true">
            <g className="abot-all">
                <g className="abot-antenna" stroke={color} fill={color} strokeLinecap="round">
                    <line x1="40" y1="12" x2="40" y2="5" strokeWidth="3" />
                    <circle cx="40" cy="4" r="3.5" />
                </g>
                <rect x="18" y="10" width="44" height="32" rx="10" fill={color} />
                <rect x="24" y="16" width="32" height="18" rx="6" fill="rgba(12,9,16,0.78)" />
                <g className="abot-eyes" fill="#ffd9a0">
                    <circle cx="34" cy="25" r="3" />
                    <circle cx="46" cy="25" r="3" />
                </g>
                <g className="abot-arms" fill={color}>
                    <rect className="abot-arm-l" x="10" y="46" width="11" height="6" rx="3" />
                    <rect className="abot-arm-r" x="59" y="46" width="11" height="6" rx="3" />
                </g>
                <rect x="26" y="44" width="28" height="16" rx="7" fill={color} opacity="0.85" />
            </g>
        </svg>
    );
}

// What's on the agent's monitor: scrolling code while working, a warning when
// the last job failed, a check right after success, a screensaver dot when idle.
function Screen({ mood }) {
    if (mood === 'working') {
        return (
            <div className="o-screen" data-mood="working">
                <span className="o-code-line" /><span className="o-code-line" />
                <span className="o-code-line" /><span className="o-code-line" />
            </div>
        );
    }
    if (mood === 'attention') return <div className="o-screen" data-mood="attention"><span className="o-glyph">!</span></div>;
    if (mood === 'done') return <div className="o-screen" data-mood="done"><span className="o-glyph">✓</span></div>;
    return <div className="o-screen" data-mood="idle"><span className="o-saver-dot" /></div>;
}

function WallClock({ now }) {
    const hour = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
    const minute = now.getMinutes() * 6;
    return (
        <svg className="o-clock" viewBox="0 0 60 60" aria-hidden="true">
            <circle cx="30" cy="30" r="27" fill="#1a1320" stroke="#cd9a3c" strokeWidth="3" />
            {[0, 90, 180, 270].map((a) => (
                <line key={a} x1="30" y1="7" x2="30" y2="11" stroke="#cd9a3c" strokeWidth="2"
                    strokeLinecap="round" transform={`rotate(${a} 30 30)`} />
            ))}
            <line x1="30" y1="30" x2="30" y2="18" stroke="#f5e6c8" strokeWidth="3"
                strokeLinecap="round" transform={`rotate(${hour} 30 30)`} />
            <line x1="30" y1="30" x2="30" y2="12" stroke="#fbbf24" strokeWidth="2"
                strokeLinecap="round" transform={`rotate(${minute} 30 30)`} />
            <circle cx="30" cy="30" r="2" fill="#fbbf24" />
        </svg>
    );
}

export default function OfficePanel() {
    const { openWindow } = useMode();
    const [jobsByAgent, setJobsByAgent] = useState({});
    const [now, setNow] = useState(() => new Date());
    const bridgeAvailable = Boolean(window.electron?.listAgentJobs);

    const loadJobs = useCallback(async () => {
        setNow(new Date());
        if (!window.electron?.listAgentJobs) return;
        try {
            const jobs = await window.electron.listAgentJobs({ limit: 50, source: 'office_panel' });
            const grouped = {};
            for (const job of jobs || []) {
                (grouped[job.agent] ??= []).push(job);
            }
            for (const list of Object.values(grouped)) {
                list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            }
            setJobsByAgent(grouped);
        } catch {
            // keep the last scene; the office just shows stale moods until the bridge returns
        }
    }, []);

    useEffect(() => {
        void loadJobs();
        const id = window.setInterval(() => void loadJobs(), POLL_MS);
        return () => window.clearInterval(id);
    }, [loadJobs]);

    const nowMs = now.getTime();
    const desks = AGENT_DEFINITIONS.map((agent) => ({
        agent,
        mood: agentMood(jobsByAgent[agent.id] ?? [], nowMs),
    }));
    const counts = desks.reduce((acc, d) => { acc[d.mood] += 1; return acc; }, { working: 0, attention: 0, done: 0, idle: 0 });

    const perciState = counts.attention > 0 ? 'error'
        : counts.done > 0 && counts.working === 0 ? 'happy'
        : counts.working > 0 ? 'working'
        : 'idle';

    return (
        <div className="office-root">
            <header className="o-header">
                <div>
                    <h1 className="o-title">Perci HQ</h1>
                    <p className="o-subtitle">The agent office — after hours, always open</p>
                </div>
                <div className="o-stats">
                    <span className="o-stat" data-mood="working">{counts.working} working</span>
                    <span className="o-stat" data-mood="done">{counts.done} done</span>
                    <span className="o-stat" data-mood="attention">{counts.attention} attention</span>
                    <span className="o-stat" data-mood="idle">{counts.idle} idle</span>
                </div>
            </header>

            <div className="o-scene">
                {/* back wall */}
                <div className="o-wall">
                    <div className="o-neon">PERCI&nbsp;HQ</div>
                    <div className="o-window">
                        <span className="o-moon" />
                        <span className="o-star" style={{ top: '18%', left: '14%' }} />
                        <span className="o-star" style={{ top: '34%', left: '64%', animationDelay: '1.1s' }} />
                        <span className="o-star" style={{ top: '12%', left: '78%', animationDelay: '2s' }} />
                        <span className="o-star" style={{ top: '48%', left: '30%', animationDelay: '0.6s' }} />
                        <span className="o-cloud" />
                        <span className="o-cloud o-cloud-2" />
                        <div className="o-skyline">
                            <i /><i /><i /><i /><i /><i /><i />
                        </div>
                    </div>
                    <WallClock now={now} />
                    <div className="o-portrait" title="Founder's portrait">
                        <PerciMascot state="idle" size={34} title="Sir Perci, founder" />
                    </div>
                    <span className="o-lamp" style={{ left: '22%' }} />
                    <span className="o-lamp" style={{ left: '50%', animationDelay: '1.4s' }} />
                    <span className="o-lamp" style={{ left: '78%', animationDelay: '0.7s' }} />
                </div>

                {/* office floor with one desk per agent */}
                <div className="o-floor">
                    <div className="o-desk-grid">
                        {desks.map(({ agent, mood }) => {
                            const latest = (jobsByAgent[agent.id] ?? [])[0];
                            const tip = `${agent.label} — ${MOOD_LABELS[mood]}${latest?.prompt_preview ? `\nLast job: ${latest.prompt_preview}` : ''}`;
                            return (
                                <button
                                    key={agent.id}
                                    type="button"
                                    className="o-desk-pod"
                                    data-status={mood}
                                    style={{ '--bot': BOT_COLORS[agent.id] || '#9aa5b1' }}
                                    title={tip}
                                    onClick={() => openWindow(MODES.AGENTS)}
                                >
                                    <AgentBot color={BOT_COLORS[agent.id] || '#9aa5b1'} />
                                    <div className="o-desk">
                                        <div className="o-monitor">
                                            <Screen mood={mood} />
                                            <span className="o-monitor-stand" />
                                        </div>
                                        <span className="o-mug">
                                            <i className="o-steam" /><i className="o-steam" /><i className="o-steam" />
                                        </span>
                                    </div>
                                    <span className="o-nameplate">
                                        <span className="o-led" />
                                        {agent.shortLabel}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="o-plant" aria-hidden="true">
                        <svg viewBox="0 0 60 80">
                            <g className="o-leaves" stroke="#3f8f5a" strokeWidth="5" strokeLinecap="round" fill="none">
                                <path d="M30 52 C30 36 22 28 14 22" />
                                <path d="M30 52 C30 32 30 24 30 14" />
                                <path d="M30 52 C30 36 38 28 46 22" />
                            </g>
                            <path d="M16 52 L44 52 L40 76 L20 76 Z" fill="#a85b32" />
                            <rect x="14" y="50" width="32" height="6" rx="3" fill="#c5692d" />
                        </svg>
                    </div>

                    {/* Sir Perci patrols the aisle */}
                    <div className="o-perci">
                        <div className="o-bubble">{perciBubble(counts)}</div>
                        <div className="o-perci-sprite">
                            <PerciMascot state={perciState} size={78} title={`Perci is ${perciState}`} />
                        </div>
                        <span className="o-perci-shadow" />
                    </div>
                </div>

                {!bridgeAvailable && (
                    <div className="o-note">Live agent activity needs the Perci desktop app — showing an idle crew.</div>
                )}
            </div>
        </div>
    );
}
