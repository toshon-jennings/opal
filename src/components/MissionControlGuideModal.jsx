import React, { useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    BookOpen,
    CheckCircle2,
    ClipboardCheck,
    GitBranch,
    Server,
    Sparkles,
    TerminalSquare,
    X
} from 'lucide-react';

const statusItems = [
    {
        label: 'Running',
        tone: 'text-sky-400 border-sky-500/25 bg-sky-500/10',
        description: 'The run is currently active or Mission Control believes work is still in progress.'
    },
    {
        label: 'Waiting',
        tone: 'text-amber-400 border-amber-500/25 bg-amber-500/10',
        description: 'The run is paused, queued, or waiting for the next step.'
    },
    {
        label: 'Blocked',
        tone: 'text-red-400 border-red-500/25 bg-red-500/10',
        description: 'Something failed or needs attention before the work can continue.'
    },
    {
        label: 'Done',
        tone: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10',
        description: 'The recorded run reached a completed state.'
    },
    {
        label: 'Cancelled',
        tone: 'text-zinc-300 border-zinc-500/25 bg-zinc-500/10',
        description: 'The run was cancelled or marked cancelled from Mission Control.'
    }
];

const advancedCards = [
    {
        title: 'Run sources',
        text: 'Mission Control currently records structured activity from terminal commands, Cowork sessions, Code assistant turns, manual Code saves, Build generation/preview events, and OpenClaw health or restart flows.'
    },
    {
        title: 'Validation semantics',
        text: 'A run can be operationally complete and still not be product-safe. “Completed” means the tracked run ended; “passed validation” means there is explicit proof that the result worked.'
    },
    {
        title: 'Memory curation',
        text: 'Not every event becomes durable memory. Mission scores candidate quality and keeps review as an explicit approval step so memory stays useful instead of noisy.'
    },
    {
        title: 'Audit posture',
        text: 'Think of Mission as a local operations ledger: what ran, what touched files, what failed, what was validated, and what deserves to be remembered later.'
    }
];

function GuideSection({ title, icon: Icon, children }) {
    return (
        <section className="focus-card rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
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
        <>
            <div className="focus-field grid gap-4 md:grid-cols-3">
                <div className="focus-card rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Track</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        See what your AI is doing in Code, Cowork, Build, Terminal, and OpenClaw-related flows.
                    </p>
                </div>
                <div className="focus-card rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Validate</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        Record whether a change actually worked, instead of treating a generated answer as automatically correct.
                    </p>
                </div>
                <div className="focus-card rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Remember</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        Review memory candidates and save only the outcomes worth keeping for future work.
                    </p>
                </div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                <div className="focus-field space-y-5">
                    <GuideSection title="What this page is for" icon={BookOpen}>
                        <p>
                            Mission Control is meant to answer a practical question: “What just happened, what changed, what still needs validation, and what should the AI remember?”
                        </p>
                        <BulletList
                            items={[
                                'It is not just a chat transcript. It is a structured run log.',
                                'It helps you inspect AI work after the fact instead of trusting a single assistant reply.',
                                'It keeps execution, validation, and memory review in one place.',
                                'It is especially useful when multiple surfaces have been involved: Chat, Code, Cowork, Build, terminal commands, and OpenClaw integration checks.'
                            ]}
                        />
                    </GuideSection>

                    <GuideSection title="How to read the page layout" icon={ClipboardCheck}>
                        <div className="space-y-4">
                            <div>
                                <div className="text-sm font-semibold text-[var(--text-primary)]">Left column: run list and filters</div>
                                <BulletList
                                    items={[
                                        'Shows the current list of Mission runs.',
                                        'Lets you filter by All, Active, Blocked, Needs validation, Done, or by source lane such as OpenClaw, Terminal, Cowork, Code, and Build.',
                                        'Each row shows status, validation attention, and last update time.',
                                        'The metric row at the top gives a fast count of active work, blocked work, validation work, and pending memory review.'
                                    ]}
                                />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-[var(--text-primary)]">Center column: selected run inspector</div>
                                <BulletList
                                    items={[
                                        'This is the detailed view for the currently selected run.',
                                        'It shows the run title, objective, reason, next action, checkpoints, risk notes, commands, touched files/context, finish report, validation state, and event timeline.',
                                        'If the run came from the terminal, you may also see a compact output snippet and exit code.',
                                        'If Mission detects diff-like output, it can add an Intent-First Review summary to help you understand what changed before reading a raw diff.'
                                    ]}
                                />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-[var(--text-primary)]">Right column: side systems</div>
                                <BulletList
                                    items={[
                                        'OpenClaw Integration shows gateway reachability and the currently active profile details.',
                                        'Memory Review lets you approve or discard memory candidates and add manual notes.',
                                        'Transit Map visualizes relationships between runs, files, memory, and control nodes, with a larger expanded map available from the page itself.'
                                    ]}
                                />
                            </div>
                        </div>
                    </GuideSection>

                    <GuideSection title="Status glossary" icon={AlertTriangle}>
                        <div className="focus-field space-y-3">
                            {statusItems.map(item => (
                                <div key={item.label} className="focus-card rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${item.tone}`}>
                                        {item.label}
                                    </span>
                                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.description}</p>
                                </div>
                            ))}
                        </div>
                        <p>
                            A separate <span className="font-medium text-[var(--text-primary)]">Needs validation</span> badge appears when a run has recorded work that still has not been proven by a build, test, preview check, or explicit manual validation.
                        </p>
                    </GuideSection>

                    <GuideSection title="What you can do with a selected run" icon={TerminalSquare}>
                        <BulletList
                            items={[
                                'Pause or Resume changes the run state shown in Mission Control so you can reflect what is happening operationally.',
                                'Retry resets the tracked run back into a running state and records that retry was requested.',
                                'Cancel marks the run cancelled. For active terminal runs, Mission Control also attempts to send a real interrupt through the local terminal server.',
                                'Validation Actions let you record a pass or failure note, which updates the run’s finish report and removes it from the “Needs validation” queue when appropriate.',
                                'Run Events provide a lightweight timeline so you can understand what happened without reading the entire surrounding conversation or terminal history.'
                            ]}
                        />
                        <p>
                            Important nuance: Mission Control is partly an execution dashboard and partly an audit log. Some actions update the tracked operational state, but they do not always guarantee that an external provider or background process has literally paused or restarted underneath.
                        </p>
                    </GuideSection>

                    <GuideSection title="Validation workflow" icon={CheckCircle2}>
                        <BulletList
                            items={[
                                'Mission Control treats “the AI said it is done” and “the work is validated” as two different things.',
                                'Saved files, generated build output, and certain assistant actions can explicitly mark a run as still needing validation.',
                                'Common terminal validation commands such as build, test, lint, typecheck, check, Vitest, Jest, Pytest, and similar commands can be linked back to the run that needs proof.',
                                'The Finish Report summarizes outcome, validation state, remaining risk, next action, commands attempted, and touched context in one place.'
                            ]}
                        />
                    </GuideSection>

                    <GuideSection title="Memory Review, in plain English" icon={Sparkles}>
                        <p>
                            Mission Control tries to stop useful operational lessons from disappearing into scrollback.
                        </p>
                        <BulletList
                            items={[
                                'When a relevant run finishes or gets blocked, Mission Control can propose a short memory candidate.',
                                'You review that candidate before saving it. This keeps memory auditable instead of silently auto-growing.',
                                'You can also write a manual note for a decision, warning, rejected approach, or recurring fix.',
                                'Saved memory is intended to help future runs start with better context.'
                            ]}
                        />
                        <p>
                            Right now, automatic memory candidates are focused on terminal, build, and OpenClaw-related runs. Other run types are still visible in Mission history even if they do not automatically produce a candidate yet.
                        </p>
                    </GuideSection>

                    <GuideSection title="Transit Map and Mission Pulse" icon={GitBranch}>
                        <BulletList
                            items={[
                                'Transit Map is the visual layer of Mission Control.',
                                'It connects runs to files, memory, and control nodes so you can see how work is moving through the system.',
                                'Clicking a node on the map reveals details for that node.',
                                'The expanded map includes a legend, a detail rail, and Mission Pulse metrics such as active runs, validation count, file touch count, and completed runs.'
                            ]}
                        />
                    </GuideSection>
                </div>

                <div className="focus-field space-y-5">
                    <GuideSection title="OpenClaw Integration" icon={Server}>
                        <BulletList
                            items={[
                                'This panel shows whether the configured OpenClaw gateway is reachable.',
                                'You can inspect the active profile name, mode, gateway URL, control URL, last check time, and any current error.',
                                'Check performs a connection probe, Open opens the dashboard, and Restart is available for supported local setups.',
                                'This panel matters most when OpenClaw-backed work is part of your flow. Code and Cowork can still function independently.'
                            ]}
                        />
                    </GuideSection>

                    <GuideSection title="What gets tracked automatically" icon={ClipboardCheck}>
                        <BulletList
                            items={[
                                'Terminal commands and terminal command results.',
                                'Cowork sessions, including some recorded tool usage.',
                                'Code assistant runs and manual file saves.',
                                'Build generation, preview validation, and build resets.',
                                'OpenClaw health checks and gateway restart attempts.'
                            ]}
                        />
                    </GuideSection>

                    <GuideSection title="Technical notes" icon={TerminalSquare}>
                        <BulletList
                            items={[
                                'Mission Control data is currently stored locally in the app profile via localStorage.',
                                'Recent Mission history keeps up to 30 runs, with up to 24 events stored per run.',
                                'Pending memory candidates are stored separately from saved memory so you can review them before approval.',
                                'A fresh profile can include starter Mission entries so the page is not completely empty the first time you open it.',
                                'Terminal output shown here is a compact snippet, not a full raw session transcript.'
                            ]}
                        />
                    </GuideSection>

                    <GuideSection title="Practical limitations" icon={AlertTriangle}>
                        <BulletList
                            items={[
                                'A successful status inside Mission Control does not automatically prove the user-facing product behavior is correct. Validation still matters.',
                                'Cancel is strongest for local terminal runs. Provider-backed work may already be in flight even if the Mission run is marked cancelled locally.',
                                'Retry and Pause/Resume are useful operational controls, but they should be understood as Mission tracking controls unless the underlying system explicitly supports runtime control.',
                                'Memory quality is intentionally selective. Very vague notes may not become durable harness memory even if you typed them manually.'
                            ]}
                        />
                    </GuideSection>

                    <GuideSection title="How to use Mission Control well" icon={BookOpen}>
                        <BulletList
                            items={[
                                'Use the run list as your triage view: What is active, what is blocked, and what still needs proof?',
                                'Open the selected run and read the Next Action field before jumping back into the workspace.',
                                'Record validation as soon as you have it, so “done” means something real.',
                                'Save only memory that would genuinely help future work, not every tiny event.',
                                'Use the Transit Map when you want a system-level view instead of a single-run view.'
                            ]}
                        />
                    </GuideSection>
                </div>
            </div>
        </>
    );
}

function AdvancedTab() {
    return (
        <div className="focus-field space-y-5">
            <div className="focus-field grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {advancedCards.map(card => (
                    <div key={card.title} className="focus-card rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{card.title}</div>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{card.text}</p>
                    </div>
                ))}
            </div>

            <GuideSection title="Lifecycle model" icon={TerminalSquare}>
                <BulletList
                    items={[
                        'A Mission run usually begins when another surface records a structured event: a terminal dispatch, a Cowork run, a Code request, a file save, a Build generation, or an OpenClaw check.',
                        'The run then accumulates metadata such as commands, touched files, checkpoints, events, validation state, and next action guidance.',
                        'When the run completes, blocks, or is cancelled, Mission can optionally ingest that outcome into durable harness memory or propose a reviewable memory candidate.',
                        'Mission Control is therefore not the producer of most work; it is the cross-surface observer, organizer, and reviewer of that work.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Data model, without the code jargon" icon={ClipboardCheck}>
                <BulletList
                    items={[
                        'A run is the main record. It carries a title, agent name, status, objective, reason, next action, checkpoints, risks, commands, files, validation, and event history.',
                        'Validation is separate from status. A run can be completed while validation is still needed or failed.',
                        'Events are short timestamped timeline entries. They help explain why the status changed.',
                        'Finish Report is a synthesized summary built from the run, not a separately-authored document.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Validation linking for power users" icon={CheckCircle2}>
                <p>
                    Mission Control tries to connect proof back to the thing that needed proof. This matters most when you validate from the terminal.
                </p>
                <BulletList
                    items={[
                        'Certain commands are recognized as validation commands: build, test, lint, typecheck, check, Vitest, Jest, Pytest, and similar patterns.',
                        'If a run is marked as needing validation, Mission can treat a later terminal command as evidence for that run instead of as unrelated shell activity.',
                        'A zero exit code helps mark the target as passed; a non-zero exit code can mark it failed.',
                        'This is intentionally conservative: shell success is evidence, not automatic proof of broader UX correctness.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Memory pipeline" icon={Sparkles}>
                <BulletList
                    items={[
                        'Mission uses quality scoring before promoting text into durable memory. Concision, specificity, actionable content, and outcome detail all matter.',
                        'Duplicate or generic outcomes are intentionally penalized.',
                        'Pending memory candidates are separate from saved memory so the user can curate what becomes durable context.',
                        'This keeps memory from turning into an unreadable dump of every single run event.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Transit Map semantics" icon={GitBranch}>
                <BulletList
                    items={[
                        'Runs are one node class, but not the only one. Files, memory, and control nodes also appear so you can see relationships, not just chronology.',
                        'The graph is for shape recognition: which lanes are active, which files were touched repeatedly, where memory was derived, and where control dependencies live.',
                        'Mission Pulse complements this by compressing lane activity into a more operational dashboard view rather than a detailed object-by-object graph.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Operational caveats" icon={AlertTriangle}>
                <BulletList
                    items={[
                        'Mission is local-state oriented right now. If you are thinking about durability, portability, or multi-user auditing, treat the current implementation as workstation-local rather than authoritative infrastructure.',
                        'Pause/Resume and Retry are best understood as Mission-level control states unless the underlying subsystem explicitly supports stronger runtime control.',
                        'Terminal snippets are compacted for readability. If you need the full transcript, use the terminal surface itself.',
                        'Some automatic memory candidate generation is intentionally narrow today; absence of a candidate does not mean the run was unimportant.'
                    ]}
                />
            </GuideSection>

            <GuideSection title="Recommended advanced workflow" icon={BookOpen}>
                <BulletList
                    items={[
                        'Use Chat, Cowork, Code, or Build to do the work; use Mission to supervise the truth of what happened.',
                        'Treat “completed” as an operational state and “validated” as a trust state.',
                        'Use terminal validation deliberately when you want evidence attached back to a specific run.',
                        'Only save memory that improves future judgment, not memory that merely records history.'
                    ]}
                />
            </GuideSection>
        </div>
    );
}

export function MissionControlGuideModal({ isOpen, onClose }) {
    const [activeTab, setActiveTab] = useState('overview');
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;

        setActiveTab('overview');
        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onCloseRef.current();
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

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
                aria-labelledby="mission-control-guide-title"
                className="flex h-[min(92vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
            >
                <div className="flex items-start gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-5">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
                        <BookOpen size={18} className="text-[var(--accent)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id="mission-control-guide-title" className="text-xl font-semibold text-[var(--text-primary)]">
                            Mission Control guide
                        </h2>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                            Mission Control is Opal&apos;s operational dashboard for AI work. It gives you a live, inspectable view of runs, validation, risk, memory, terminal activity, and OpenClaw health across the rest of the app.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        aria-label="Close Mission Control guide"
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
