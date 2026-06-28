import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowUpRight,
    Bot,
    CheckCircle2,
    CircleDollarSign,
    ClipboardList,
    Clock3,
    ListChecks,
    Plus,
    RadioTower,
    Search,
} from 'lucide-react';
import { useMode, MODES } from '../context/ModeContext';
import { MISSION_UPDATED_EVENT, readMissionRuns } from '../lib/missionControl';
import {
    answerPerciQuestion,
    createManualTask,
    createPerciContextSnapshot,
    readPerciDeskTasks,
    savePerciDeskTasks,
} from '../lib/perciContext';
import './PerciDeskMode.css';

const JOBS_POLL_MS = 10000;

const STATUS_LABELS = {
    overdue: 'Overdue',
    blocked: 'Blocked',
    now: 'Now',
    waiting: 'Waiting',
    done: 'Done',
};

const FILTERS = [
    ['open', 'Open'],
    ['answer', 'Answer'],
    ['overdue', 'Overdue'],
    ['waiting', 'Waiting'],
    ['done', 'Done'],
];

export default function PerciDeskMode({ openClawStatus }) {
    const { windows, openWindow } = useMode();
    const [missionRuns, setMissionRuns] = useState(() => readMissionRuns());
    const [agentJobs, setAgentJobs] = useState([]);
    const [manualTasks, setManualTasks] = useState(() => readPerciDeskTasks());
    const [taskText, setTaskText] = useState('');
    const [question, setQuestion] = useState('What needs action now?');
    const [filter, setFilter] = useState('open');

    useEffect(() => {
        const handleMissionUpdate = () => setMissionRuns(readMissionRuns());
        window.addEventListener(MISSION_UPDATED_EVENT, handleMissionUpdate);
        return () => window.removeEventListener(MISSION_UPDATED_EVENT, handleMissionUpdate);
    }, []);

    const loadJobs = useCallback(async () => {
        if (!window.electron?.listAgentJobs) return;
        try {
            const list = await window.electron.listAgentJobs({ limit: 30, source: 'perci-desk' });
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

    const snapshot = useMemo(() => createPerciContextSnapshot({
        windows,
        missionRuns,
        agentJobs,
        openClawStatus,
        manualTasks,
    }), [agentJobs, manualTasks, missionRuns, openClawStatus, windows]);

    const answer = useMemo(() => answerPerciQuestion(question, snapshot), [question, snapshot]);
    const visibleObligations = useMemo(() => {
        const source = filter === 'answer' ? answer.items : snapshot.obligations;
        if (filter === 'open') return source.filter(item => item.status !== 'done');
        if (filter === 'overdue') return source.filter(item => item.status === 'overdue');
        if (filter === 'waiting') return source.filter(item => item.status === 'waiting' || item.status === 'blocked');
        if (filter === 'done') return snapshot.manual.tasks.filter(item => item.status === 'done');
        return source;
    }, [answer.items, filter, snapshot]);
    const openWork = snapshot.counts.now + snapshot.counts.overdue + snapshot.counts.waiting;
    const featuredItems = visibleObligations.slice(0, 3);
    const queueItems = visibleObligations.slice(3, 12);
    const commandFeed = answer.items.length ? answer.items.slice(0, 5) : snapshot.obligations.slice(0, 5);
    const barsPreview = snapshot.bars.lastIdea;

    const addManualTask = (event) => {
        event.preventDefault();
        const task = createManualTask(taskText);
        if (!task) return;
        const next = savePerciDeskTasks([task, ...manualTasks]);
        setManualTasks(next);
        setTaskText('');
    };

    const toggleTask = (task) => {
        if (task.sourceType !== 'manual') return;
        const next = savePerciDeskTasks(manualTasks.map(item => (
            item.id === task.id
                ? { ...item, status: item.status === 'done' ? 'now' : 'done', updatedAt: new Date().toISOString() }
                : item
        )));
        setManualTasks(next);
    };

    const openSource = (item) => {
        if (item.sourceType === 'bars') openWindow(MODES.BARS);
        if (item.sourceType === 'billboard') openWindow(MODES.CONCERNS);
        if (item.sourceType === 'mission') openWindow(MODES.MISSION);
        if (item.sourceType === 'agent_job') openWindow(MODES.AGENTS);
        if (item.sourceType === 'openclaw') openWindow('openclaw');
    };

    return (
        <div className="perci-desk-mode">
            <div className="perci-desk-shell">
                <aside className="perci-desk-left" aria-label="Desk telemetry">
                    <header className="perci-desk-brand">
                        <span><ClipboardList size={15} /> Perci OS</span>
                        <strong>Desk</strong>
                    </header>

                    <section className="perci-desk-providers">
                        <h2>Navigation</h2>
                        {snapshot.providers.map(provider => (
                            <button
                                key={provider.id}
                                type="button"
                                className="perci-desk-signal"
                                onClick={() => provider.surfaceId && openWindow(provider.surfaceId)}
                            >
                                <ProviderIcon id={provider.id} />
                                <span>
                                    <strong>{provider.label}</strong>
                                    <em>{provider.detail}</em>
                                </span>
                                <b>{provider.count}</b>
                            </button>
                        ))}
                    </section>

                    <form className="perci-desk-add" onSubmit={addManualTask}>
                        <label htmlFor="perci-desk-task">Capture</label>
                        <div>
                            <input
                                id="perci-desk-task"
                                value={taskText}
                                onChange={event => setTaskText(event.target.value)}
                                placeholder="Validate result, pay invoice..."
                            />
                            <button type="submit" title="Add task"><Plus size={16} /></button>
                        </div>
                    </form>
                </aside>

                <main className="perci-desk-center" aria-label="Perci Desk operating picture">
                    <header className="perci-desk-topbar">
                        <div className="perci-desk-welcome">
                            <h1>Welcome</h1>
                            <p>{openWork ? `${openWork} things need your attention.` : 'Everything visible to Desk is calm.'}</p>
                        </div>
                        <nav aria-label="Desk views">
                            {FILTERS.map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    aria-current={filter === id ? 'page' : undefined}
                                    className={filter === id ? 'is-active' : ''}
                                    onClick={() => setFilter(id)}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>
                    </header>

                    <section className="perci-desk-hero">
                        <div className="perci-desk-core" aria-label="Perci context core">
                            <div className="perci-desk-core-copy">
                                <span>Your focus</span>
                                <h2>{answer.title}</h2>
                                <p>{answer.body}</p>
                            </div>
                            <div className="perci-desk-orbit">
                                <span className="desk-orbit-a" />
                                <span className="desk-orbit-b" />
                                <span className="desk-orbit-c" />
                                <strong>{openWork}</strong>
                                <em>open</em>
                            </div>
                            <div className="perci-desk-appointment-bar">
                                <span>{snapshot.counts.overdue} overdue</span>
                                <span>{snapshot.counts.now} now</span>
                                <span>{snapshot.counts.waiting} waiting</span>
                            </div>
                        </div>

                        <form className="perci-desk-ask" onSubmit={(event) => event.preventDefault()}>
                            <label htmlFor="perci-desk-question">
                                <Search size={15} />
                                Ask Perci
                            </label>
                            <input
                                id="perci-desk-question"
                                value={question}
                                onChange={event => {
                                    setQuestion(event.target.value);
                                    setFilter('answer');
                                }}
                                placeholder="What did I last write in BARS? What bills are overdue?"
                            />
                        </form>
                    </section>

                    <section className="perci-desk-feature-grid" aria-label="Featured actions">
                        {featuredItems.length ? featuredItems.map((item, index) => (
                            <FeaturedAction
                                key={item.id}
                                item={item}
                                index={index}
                                onOpen={() => openSource(item)}
                            />
                        )) : (
                            <div className="perci-desk-empty is-featured">
                                <CheckCircle2 size={28} />
                                <p>No pressure in this view.</p>
                            </div>
                        )}
                    </section>

                    <section className="perci-desk-queue" aria-label="Desk queue">
                        <div className="perci-desk-section-title">
                            <h2>Action queue</h2>
                            <span>{visibleObligations.length} visible</span>
                        </div>
                        <div className="perci-desk-list">
                            {queueItems.length ? queueItems.map(item => (
                                <ActionItem
                                    key={item.id}
                                    item={item}
                                    onToggle={() => toggleTask(item)}
                                    onOpen={() => openSource(item)}
                                />
                            )) : (
                                <div className="perci-desk-empty">
                                    <CheckCircle2 size={24} />
                                    <p>Queue is clear.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </main>

                <aside className="perci-desk-right" aria-label="Desk command feed">
                    <div className="perci-desk-right-head">
                        <ArrowUpRight size={18} />
                        <span>Appointment queue</span>
                    </div>

                    <section className="perci-desk-feed">
                        {commandFeed.map(item => (
                            <button key={item.id} type="button" onClick={() => openSource(item)}>
                                <span className={`desk-feed-dot is-${item.status}`} />
                                <strong>{item.sourceLabel}</strong>
                                <em>{item.title}</em>
                            </button>
                        ))}
                    </section>

                    <section className="perci-desk-system-card">
                        <div>
                            <RadioTower size={18} />
                            <span>System message</span>
                        </div>
                        <p>{snapshot.counts.overdue ? `${snapshot.counts.overdue} overdue item${snapshot.counts.overdue === 1 ? '' : 's'} need attention.` : 'No overdue obligations detected.'}</p>
                    </section>

                    <section className="perci-desk-bars-card">
                        <h2>BARS last entry</h2>
                        {barsPreview ? (
                            <button type="button" onClick={() => openWindow(MODES.BARS)}>
                                <strong>{barsPreview.title}</strong>
                                <span>{barsPreview.next || barsPreview.notes || 'No next action set.'}</span>
                            </button>
                        ) : (
                            <p>No BARS entries found.</p>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
}

function ActionItem({ item, onToggle, onOpen }) {
    const canToggle = item.sourceType === 'manual';
    return (
        <article className={`perci-desk-item is-${item.status}`}>
            <button
                type="button"
                className="perci-desk-check"
                onClick={onToggle}
                disabled={!canToggle}
                title={canToggle ? 'Toggle task' : 'Derived from another Perci surface'}
            >
                <CheckCircle2 size={17} />
            </button>
            <div>
                <div className="perci-desk-item-title">
                    <strong>{item.title}</strong>
                    <span>{STATUS_LABELS[item.status] || item.status}</span>
                </div>
                <p>{item.reason}</p>
                <em>{item.suggestedAction}</em>
            </div>
            <button type="button" className="perci-desk-source" onClick={onOpen}>
                {item.sourceLabel}
            </button>
        </article>
    );
}

function FeaturedAction({ item, index, onOpen }) {
    const icon = item.status === 'overdue' || item.status === 'blocked'
        ? <AlertTriangle size={42} />
        : item.sourceType === 'billboard'
            ? <CircleDollarSign size={42} />
            : item.status === 'waiting'
                ? <Clock3 size={42} />
                : <ListChecks size={42} />;

    return (
        <button type="button" className={`perci-desk-feature is-${index % 3}`} onClick={onOpen}>
            <span className="perci-desk-feature-icon">{icon}</span>
            <span className="perci-desk-feature-body">
                <strong>{item.title}</strong>
                <em>{item.suggestedAction}</em>
            </span>
            <span className="perci-desk-feature-source">{item.sourceLabel}</span>
        </button>
    );
}

function ProviderIcon({ id }) {
    if (id === 'billboard') return <CircleDollarSign size={16} />;
    if (id === 'live') return <RadioTower size={16} />;
    if (id === 'manual') return <ListChecks size={16} />;
    return <Bot size={16} />;
}
