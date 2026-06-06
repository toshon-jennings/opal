import React, { useEffect, useState } from 'react';
import {
    ActivitySquare,
    BookOpen,
    Bot,
    CheckCircle2,
    Code,
    Hammer,
    Layers3,
    MessageSquare,
    Sparkles,
    TerminalSquare,
    Users,
    X
} from 'lucide-react';

const modeCards = [
    {
        id: 'chat',
        label: 'Chat',
        icon: MessageSquare,
        summary: 'Best for normal conversation, quick questions, brainstorming, drafting, and lightweight tool-assisted help.',
        details: [
            'General-purpose assistant surface.',
            'Good when you want answers, writing help, or quick back-and-forth.',
            'Can be powerful, but it is still the least workflow-opinionated surface.'
        ]
    },
    {
        id: 'cowork',
        label: 'Cowork',
        icon: Users,
        summary: 'Best for agent-style task execution where the assistant may inspect files, use tools, and work through a task more autonomously.',
        details: [
            'Designed for session-based, tool-using work.',
            'Stronger fit than Chat when the task needs multiple steps and workspace interaction.',
            'Mission Control can track Cowork session starts, tool usage, and finish states.'
        ]
    },
    {
        id: 'code',
        label: 'Code',
        icon: Code,
        summary: 'Best for working directly in a code editor with file context, saves, and code-focused assistant turns.',
        details: [
            'Editor-oriented surface for reading and editing files.',
            'Useful when you want to stay anchored to the workspace instead of a plain conversation.',
            'Manual saves and assistant turns can feed Mission Control.'
        ]
    },
    {
        id: 'agents',
        label: 'Agents (Agent CLI)',
        icon: Bot,
        summary: 'Best for dispatching jobs to specific CLI agents like Codex, Claude Code, Aider, Copilot, OpenHands, and others.',
        details: [
            'Multi-agent control center rather than a single assistant conversation.',
            'Useful when you want to choose the agent, prompt it, watch job status, and inspect output.',
            'This is the right mode when the main question is “which coding agent should do this?” rather than “how should I chat about it?”'
        ]
    },
    {
        id: 'mission',
        label: 'Mission',
        icon: ActivitySquare,
        summary: 'Best for supervising, validating, and reviewing work that happened in other modes.',
        details: [
            'Operational dashboard, not the main execution surface.',
            'Shows runs, statuses, validation, risks, events, memory review, terminal snippets, and OpenClaw health.',
            'Use this when you want to know what happened, what still needs proof, and what should be remembered.'
        ]
    },
    {
        id: 'build',
        label: 'Build',
        icon: Hammer,
        summary: 'Best for generating app/UI files, previewing them, and iterating on a built artifact rather than only discussing code.',
        details: [
            'Generation-and-preview oriented workflow.',
            'Useful for creating or revising UI/app output with an immediate preview loop.',
            'Mission can track Build generation, preview validation, and resets.'
        ]
    }
];

const advancedCards = [
    {
        title: 'How to choose quickly',
        text: 'If you want to talk, use Chat. If you want an agentic work session, use Cowork. If you want direct editor context, use Code. If you want to dispatch a specific CLI coding agent, use Agents. If you want supervision and validation, use Mission. If you want generated app output plus preview, use Build.'
    },
    {
        title: 'Execution vs oversight',
        text: 'Chat, Cowork, Code, Agents, and Build are primarily work-producing surfaces. Mission is the oversight surface that helps you inspect, validate, and remember what those other modes did.'
    },
    {
        title: 'Single-agent vs multi-agent',
        text: 'Chat, Cowork, Code, and Build are generally single-surface experiences. Agents is explicitly about selecting among multiple external CLI agents and comparing their job activity.'
    },
    {
        title: 'State and artifacts',
        text: 'Code is file-centric, Build is generated-output-centric, Cowork is task-session-centric, Agents is job-centric, Chat is conversation-centric, and Mission is run-and-validation-centric.'
    }
];

function GuideSection({ title, icon: Icon, children }) {
    return (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
            <div className="flex items-center gap-2">
                <Icon size={16} className="text-[var(--accent)]" />
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
                {children}
            </div>
        </section>
    );
}

function BulletList({ items }) {
    return (
        <ul className="space-y-2">
            {items.map(item => (
                <li key={item} className="flex gap-2">
                    <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}

function TabButton({ active, label, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                active
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
        >
            {label}
        </button>
    );
}

function OverviewTab() {
    return (
        <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {modeCards.map(mode => {
                    const Icon = mode.icon;
                    return (
                        <div key={mode.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <div className="flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
                                    <Icon size={16} className="text-[var(--accent)]" />
                                </div>
                                <div className="text-sm font-semibold text-[var(--text-primary)]">{mode.label}</div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{mode.summary}</p>
                            <div className="mt-3">
                                <BulletList items={mode.details} />
                            </div>
                        </div>
                    );
                })}
            </div>

            <GuideSection title="The simple mental model" icon={BookOpen}>
                <BulletList
                    items={[
                        'Chat = talk with the assistant.',
                        'Cowork = collaborate with a more agentic assistant session.',
                        'Code = work inside the editor and file context.',
                        'Agents = dispatch work to specific CLI agents.',
                        'Mission = supervise and validate what happened.',
                        'Build = generate and preview an app or interface artifact.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="When Chat is the right choice" icon={MessageSquare}>
                <BulletList
                    items={[
                        'You want fast answers, planning help, writing help, or brainstorming.',
                        'You are still figuring out the problem before turning it into a more structured work session.',
                        'You do not need a heavy operational or editor-first workflow yet.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="When Cowork is the right choice" icon={Users}>
                <BulletList
                    items={[
                        'You want the assistant to operate more like a working partner than a simple responder.',
                        'The task likely needs several steps, tool usage, or workspace interaction.',
                        'You want an agentic session but not necessarily a separate external CLI agent job.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="When Code is the right choice" icon={Code}>
                <BulletList
                    items={[
                        'You want to stay close to files, file saves, and editor context.',
                        'You are making targeted coding changes and want a code-first workspace.',
                        'You care about the file tree and active file as much as the assistant response.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="When Agents is the right choice" icon={Bot}>
                <BulletList
                    items={[
                        'You want to choose a specific CLI coding agent such as Codex, Claude Code, Aider, Copilot, OpenHands, OpenCode, or others.',
                        'You want job-oriented control: prompt, working directory, status, output, and agent-specific dispatch.',
                        'You are comparing or operationalizing coding agents rather than just chatting with one built-in assistant surface.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="When Mission is the right choice" icon={ActivitySquare}>
                <BulletList
                    items={[
                        'You want to inspect runs, statuses, validation, risk, memory, and terminal/OpenClaw-related signals.',
                        'You want to answer “Did this actually work?” not just “What did the assistant say?”',
                        'You want a cross-surface operational view after work has been produced elsewhere.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="When Build is the right choice" icon={Hammer}>
                <BulletList
                    items={[
                        'You want generated files plus an immediate preview loop.',
                        'You are shaping an app, UI, or artifact rather than only editing source files manually.',
                        'You want a generation-and-preview workflow that is more artifact-oriented than the editor-first Code mode.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="If you are unsure, start here" icon={Sparkles}>
                <BulletList
                    items={[
                        'Start in Chat if the task is still vague.',
                        'Move to Cowork when it becomes a multi-step execution task.',
                        'Move to Code when file-level editing becomes the center of gravity.',
                        'Use Agents when you want a specific external CLI agent to own the work.',
                        'Use Build when the primary output is a generated app/interface plus preview.',
                        'Use Mission whenever you need confidence, validation, or operational clarity.'
                    ]}
                />
            </GuideSection>
        </div>
    );
}

function AdvancedTab() {
    return (
        <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {advancedCards.map(card => (
                    <div key={card.title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{card.title}</div>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{card.text}</p>
                    </div>
                ))}
            </div>

            <GuideSection title="Mode architecture differences" icon={Layers3}>
                <BulletList
                    items={[
                        'Chat is conversation-first.',
                        'Cowork is task-session-first.',
                        'Code is editor-and-workspace-first.',
                        'Agents is external-agent-job-first.',
                        'Mission is operations-and-validation-first.',
                        'Build is generated-artifact-and-preview-first.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="How Mission relates to the others" icon={ActivitySquare}>
                <BulletList
                    items={[
                        'Mission is not mainly for producing work. It is mainly for supervising recorded work.',
                        'Terminal, Cowork, Code, Build, and OpenClaw-related activity can all show up there as runs or related signals.',
                        'If the other modes are where action happens, Mission is where accountability happens.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Agents vs Cowork vs Code" icon={Bot}>
                <BulletList
                    items={[
                        'Use Cowork when you want the built-in agentic workflow inside the app.',
                        'Use Code when you want the editor and files to be the main surface.',
                        'Use Agents when you want to route work to named CLI agents and inspect jobs as jobs, not just as chat turns or editor interactions.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Build vs Code" icon={Hammer}>
                <BulletList
                    items={[
                        'Code is best when you are navigating and editing an existing codebase directly.',
                        'Build is best when you want the system to generate or revise a runnable artifact and then preview it quickly.',
                        'If your question is “which file should I edit?”, Code is usually right. If your question is “show me the generated result,” Build is usually right.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Recommended expert workflow" icon={CheckCircle2}>
                <BulletList
                    items={[
                        'Use Chat to clarify intent.',
                        'Use Cowork, Code, Agents, or Build to produce work in the most appropriate execution surface.',
                        'Use Mission to review the operational truth, validation state, and memory value of the result.',
                        'Switch modes intentionally based on the center of gravity: conversation, execution, editing, dispatch, preview, or supervision.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Practical caution" icon={TerminalSquare}>
                <p>
                    The modes overlap on purpose. The difference is not that one mode can do work and another cannot. The difference is what each mode optimizes for: conversation quality, agentic flow, editor context, CLI agent dispatch, operational oversight, or generated-preview workflow.
                </p>
            </GuideSection>
        </div>
    );
}

export function ModeGuideModal({ isOpen, onClose }) {
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        if (!isOpen) return undefined;

        setActiveTab('overview');
        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="mode-guide-title"
                className="flex h-[min(92vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
            >
                <div className="flex items-start gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-5">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
                        <BookOpen size={18} className="text-[var(--accent)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id="mode-guide-title" className="text-xl font-semibold text-[var(--text-primary)]">
                            Mode guide
                        </h2>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                            This guide explains the practical differences between Chat, Cowork, Code, Agents, Mission, and Build so you can choose the right surface for the job.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        aria-label="Close mode guide"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="border-b border-[var(--border)] px-6 py-3">
                    <div className="flex flex-wrap gap-2">
                        <TabButton active={activeTab === 'overview'} label="Guide" onClick={() => setActiveTab('overview')} />
                        <TabButton active={activeTab === 'advanced'} label="Advanced" onClick={() => setActiveTab('advanced')} />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                    {activeTab === 'overview' ? <OverviewTab /> : <AdvancedTab />}
                </div>
            </div>
        </div>
    );
}
