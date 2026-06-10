import { useCallback, useEffect, useState } from 'react';
import { useMode } from '../context/ModeContext';
import { AGENT_DEFINITIONS, ACTIVE_JOB_STATUSES, ATTENTION_JOB_STATUSES } from './AgentsPanel';
import OfficeScene from './OfficeScene';
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

export default function OfficePanel() {
    const { openAgentWindow } = useMode();
    const [jobsByAgent, setJobsByAgent] = useState({});
    const [nowMs, setNowMs] = useState(() => Date.now());
    const bridgeAvailable = Boolean(window.electron?.listAgentJobs);

    const loadJobs = useCallback(async () => {
        setNowMs(Date.now());
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

    const desks = AGENT_DEFINITIONS.map((agent) => {
        const jobs = jobsByAgent[agent.id] ?? [];
        const mood = agentMood(jobs, nowMs);
        const latest = jobs[0];
        return {
            agent,
            mood,
            color: BOT_COLORS[agent.id] || '#9aa5b1',
            tip: `${agent.label} — ${MOOD_LABELS[mood]}${latest?.prompt_preview ? `\nLast job: ${latest.prompt_preview}` : ''}`,
        };
    });
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
                    <p className="o-subtitle">The agent office — drag to look around</p>
                </div>
                <div className="o-stats">
                    <span className="o-stat" data-mood="working">{counts.working} working</span>
                    <span className="o-stat" data-mood="done">{counts.done} done</span>
                    <span className="o-stat" data-mood="attention">{counts.attention} attention</span>
                    <span className="o-stat" data-mood="idle">{counts.idle} idle</span>
                </div>
            </header>

            <div className="o-scene">
                <OfficeScene
                    desks={desks}
                    perciState={perciState}
                    bubble={perciBubble(counts)}
                    onDeskClick={(agentId) => openAgentWindow(agentId)}
                />
                {!bridgeAvailable && (
                    <div className="o-note">Live agent activity needs the Perci desktop app — showing an idle crew.</div>
                )}
            </div>
        </div>
    );
}
