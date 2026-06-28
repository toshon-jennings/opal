import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ActivitySquare,
    ArrowRight,
    BookOpen,
    Bot,
    Code,
    Compass,
    GripHorizontal,
    Hammer,
    MessageSquare,
    ShieldCheck,
    Sparkles,
    TerminalSquare,
    Users,
    X,
} from 'lucide-react';

/*
 * Mode Guide — Field Manual.
 *
 * This modal uses the same visual system and structure as the Power Workspace Field Manual.
 * It is scoped under the `.mgfm` namespace and driven by `--mg-*` tokens.
 */

const STATIONS = [
    { id: 'chat', label: 'Chat', icon: MessageSquare, accent: '#f97316' },
    { id: 'cowork', label: 'Cowork', icon: Users, accent: '#22d3ee' },
    { id: 'code', label: 'Code', icon: Code, accent: '#a78bfa' },
    { id: 'agents', label: 'Agents', icon: Bot, accent: '#4ade80' },
    { id: 'build', label: 'Build', icon: Hammer, accent: '#fb7185' },
    { id: 'mission', label: 'Mission', icon: ActivitySquare, accent: '#60a5fa' },
];

const modeCards = [
    {
        id: 'chat',
        label: 'Chat',
        icon: MessageSquare,
        accent: '#f97316',
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
        accent: '#22d3ee',
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
        accent: '#a78bfa',
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
        accent: '#4ade80',
        summary: 'Best for dispatching jobs to specific CLI agents like Codex, Claude Code, Aider, Copilot, OpenHands, and others.',
        details: [
            'Multi-agent control center rather than a single assistant conversation.',
            'Useful when you want to choose the agent, prompt it, watch job status, and inspect output.',
            'This is the right mode when the main question is "which coding agent should do this?" rather than "how should I chat about it?"'
        ]
    },
    {
        id: 'mission',
        label: 'Mission',
        icon: ActivitySquare,
        accent: '#60a5fa',
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
        accent: '#fb7185',
        summary: 'Best for generating app/UI files, previewing them, and iterating on a built artifact rather than only discussing code.',
        details: [
            'Generation-and-preview oriented workflow.',
            'Useful for creating or revising UI/app output with an immediate preview loop.',
            'Mission can track Build generation, preview validation, and resets.'
        ]
    }
];

const SECTIONS = [
    { id: 'overview', no: '01', label: 'Overview' },
    { id: 'surfaces', no: '02', label: 'Six surfaces' },
    { id: 'triage', no: '03', label: 'How to choose' },
    { id: 'execution', no: '04', label: 'Work vs oversight' },
    { id: 'comparisons', no: '05', label: 'Key comparisons' },
    { id: 'workflow', no: '06', label: 'Expert workflow' },
    { id: 'field', no: '07', label: 'Field notes' },
];

function OrbitHero() {
    const cx = 360;
    const cy = 150;
    const rx = 250;
    const ry = 104;
    const points = STATIONS.map((station, i) => {
        const angle = (-90 + i * (360 / STATIONS.length)) * (Math.PI / 180);
        return {
            ...station,
            x: cx + rx * Math.cos(angle),
            y: cy + ry * Math.sin(angle),
        };
    });

    return (
        <svg
            className="mgfm-orbit"
            viewBox="0 0 720 300"
            role="img"
            aria-label="Perci Modes loop: a central Perci core orbited by six modes — Chat, Cowork, Code, Agents, Build, and Mission."
        >
            <defs>
                <radialGradient id="mgfm-core" cx="50%" cy="42%" r="65%">
                    <stop offset="0%" stopColor="#fdba74" />
                    <stop offset="55%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#c2410c" />
                </radialGradient>
                <filter id="mgfm-glow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="6" result="b" />
                    <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Orbit path */}
            <ellipse
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill="none"
                stroke="var(--mg-accent-line)"
                strokeWidth="1.25"
                strokeDasharray="2 7"
            />

            {/* Comet tracing the loop */}
            <circle r="4" fill="var(--mg-accent)" filter="url(#mgfm-glow)" className="mgfm-comet">
                <animateMotion
                    dur="14s"
                    repeatCount="indefinite"
                    path={`M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`}
                />
            </circle>

            {/* Stations */}
            {points.map((p) => {
                const Icon = p.icon;
                return (
                    <g key={p.id} className="mgfm-station">
                        <circle cx={p.x} cy={p.y} r="16" fill="var(--bg-primary)" stroke={p.accent} strokeWidth="1.25" />
                        <g transform={`translate(${p.x - 8}, ${p.y - 8})`} style={{ color: p.accent }}>
                            <g className="mgfm-station-icon-wrap">
                                <Icon size={16} />
                            </g>
                        </g>
                        <text
                            x={p.x}
                            y={p.y > cy ? p.y + 30 : p.y - 22}
                            textAnchor="middle"
                            className="mgfm-station-label"
                        >
                            {p.label}
                        </text>
                    </g>
                );
            })}

            {/* Core */}
            <circle cx={cx} cy={cy} r="46" fill="url(#mgfm-core)" filter="url(#mgfm-glow)" />
            <circle cx={cx} cy={cy} r="46" fill="none" stroke="#fed7aa" strokeOpacity="0.35" strokeWidth="1" />
            <text x={cx} y={cy - 4} textAnchor="middle" className="mgfm-core-label">PERCI</text>
            <text x={cx} y={cy + 13} textAnchor="middle" className="mgfm-core-sub">modes · workflow · control</text>
        </svg>
    );
}

function Eyebrow({ children }) {
    return <div className="mgfm-eyebrow">{children}</div>;
}

function Section({ id, no, title, lede, refMap, children }) {
    return (
        <section
            id={`mgfm-${id}`}
            ref={(node) => { refMap.current[id] = node; }}
            className="mgfm-section"
        >
            <div className="mgfm-section-head">
                <span className="mgfm-section-no">{no}</span>
                <div>
                    <h3 className="mgfm-section-title">{title}</h3>
                    {lede && <p className="mgfm-section-lede">{lede}</p>}
                </div>
            </div>
            <div className="mgfm-section-body">{children}</div>
        </section>
    );
}

function FieldRow({ icon: Icon, term, children }) {
    return (
        <div className="mgfm-field">
            <span className="mgfm-field-icon"><Icon size={15} /></span>
            <div>
                <div className="mgfm-field-term">{term}</div>
                <p className="mgfm-field-desc">{children}</p>
            </div>
        </div>
    );
}

export function ModeGuideModal({ isOpen, onClose }) {
    const onCloseRef = useRef(onClose);
    const scrollRef = useRef(null);
    const sectionRefs = useRef({});
    const panelRef = useRef(null);
    const dragOrigin = useRef(null);
    const [activeId, setActiveId] = useState(SECTIONS[0].id);
    const [drag, setDrag] = useState({ dx: 0, dy: 0 });
    const [dragging, setDragging] = useState(false);

    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        setActiveId(SECTIONS[0].id);
        setDrag({ dx: 0, dy: 0 });
        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onCloseRef.current();
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Drag the panel by its header, clamped to stay inside the window bounds.
    const startDrag = (event) => {
        if (event.button !== 0 || event.target.closest('button')) return;
        const panel = panelRef.current;
        const parent = panel?.parentElement;
        if (!panel || !parent) return;
        const parentRect = parent.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const maxDx = Math.max(0, (parentRect.width - panelRect.width) / 2 - 8);
        const maxDy = Math.max(0, (parentRect.height - panelRect.height) / 2 - 8);
        dragOrigin.current = { startX: event.clientX, startY: event.clientY, dx: drag.dx, dy: drag.dy, maxDx, maxDy };
        setDragging(true);
        event.preventDefault();

        const clamp = (value, max) => Math.max(-max, Math.min(max, value));
        const onMove = (moveEvent) => {
            const origin = dragOrigin.current;
            if (!origin) return;
            setDrag({
                dx: clamp(origin.dx + moveEvent.clientX - origin.startX, origin.maxDx),
                dy: clamp(origin.dy + moveEvent.clientY - origin.startY, origin.maxDy),
            });
        };
        const onUp = () => {
            setDragging(false);
            dragOrigin.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // Scroll spy — highlight the table-of-contents entry for the section in view.
    useEffect(() => {
        if (!isOpen) return undefined;
        const root = scrollRef.current;
        if (!root || typeof IntersectionObserver === 'undefined') return undefined;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (visible) {
                    setActiveId(visible.target.id.replace('mgfm-', ''));
                }
            },
            { root, rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.25, 0.5, 1] }
        );
        Object.values(sectionRefs.current).forEach((node) => node && observer.observe(node));
        return () => observer.disconnect();
    }, [isOpen]);

    const goTo = (id) => {
        const node = sectionRefs.current[id];
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const styleBlock = useMemo(() => GUIDE_STYLES, []);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="mgfm-backdrop"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <style>{styleBlock}</style>
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="mgfm-title"
                className="mgfm"
                style={{ transform: `translate(-50%, -50%) translate(${drag.dx}px, ${drag.dy}px)` }}
            >
                {/* Header doubles as drag handle */}
                <header
                    className={`mgfm-header${dragging ? ' is-dragging' : ''}`}
                    onMouseDown={startDrag}
                    title="Drag to move"
                >
                    <div className="mgfm-header-mark"><BookOpen size={18} /></div>
                    <div className="mgfm-header-text">
                        <Eyebrow>Operator&rsquo;s manual</Eyebrow>
                        <h2 id="mgfm-title" className="mgfm-title">Perci Modes</h2>
                        <p className="mgfm-subtitle">
                            Six specialized surfaces optimized for conversation, execution, code editing, CLI agent routing, generated preview loops, and validation.
                        </p>
                    </div>
                    <GripHorizontal size={15} className="mgfm-grip" aria-hidden="true" />
                    <button type="button" onClick={onClose} className="mgfm-close" aria-label="Close manual">
                        <X size={16} />
                    </button>
                </header>

                {/* Body: TOC rail + scrolling manual */}
                <div className="mgfm-body">
                    <nav className="mgfm-toc" aria-label="Manual contents">
                        <div className="mgfm-toc-label">Contents</div>
                        <ul>
                            {SECTIONS.map((s) => (
                                <li key={s.id}>
                                    <button
                                        type="button"
                                        onClick={() => goTo(s.id)}
                                        className={`mgfm-toc-link${activeId === s.id ? ' is-active' : ''}`}
                                        aria-current={activeId === s.id ? 'true' : undefined}
                                    >
                                        <span className="mgfm-toc-no">{s.no}</span>
                                        <span className="mgfm-toc-text">{s.label}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <div className="mgfm-scroll" ref={scrollRef}>
                        <div className="mgfm-content">
                            {/* 01 — Overview */}
                            <Section
                                id="overview"
                                no="01"
                                title="What the modes are"
                                lede="Six interaction decks, each built to optimize a specific part of your project lifecycle."
                                refMap={sectionRefs}
                            >
                                <div className="mgfm-hero">
                                    <OrbitHero />
                                </div>
                                <p>
                                    Rather than forcing every interaction into a generic chat box, Perci provides dedicated workspaces.
                                    Each mode is tailored to a specific way of working — whether you need to brainstorm, edit files in context,
                                    orchestrate external CLI agents, preview generated UI, or inspect validation logs.
                                </p>
                                <div className="mgfm-callout">
                                    <Compass size={16} />
                                    <span>
                                        You can switch modes at any time. Your context and files travel with you, allowing you to move smoothly
                                        from planning to execution to oversight.
                                    </span>
                                </div>
                            </Section>

                            {/* 02 — Six surfaces */}
                            <Section
                                id="surfaces"
                                no="02"
                                title="The six surfaces"
                                lede="Detailed breakdown of Chat, Cowork, Code, Agents, Mission, and Build."
                                refMap={sectionRefs}
                            >
                                <div className="mgfm-surfaces">
                                    {modeCards.map((mode) => {
                                        const Icon = mode.icon;
                                        return (
                                            <article key={mode.id} className="mgfm-surface" style={{ borderColor: `${mode.accent}4d`, '--mg-card-accent': mode.accent, '--mg-card-accent-soft': `${mode.accent}0d` }}>
                                                <div className="mgfm-surface-head">
                                                    <span className="mgfm-surface-icon" style={{ backgroundColor: `${mode.accent}14`, color: mode.accent, borderColor: `${mode.accent}33` }}>
                                                        <Icon size={15} />
                                                    </span>
                                                    <h4 style={{ color: mode.accent }}>{mode.label}</h4>
                                                </div>
                                                <p className="mgfm-surface-what">{mode.summary}</p>
                                                <ul className="mgfm-surface-list">
                                                    {mode.details.map((d) => (
                                                        <li key={d} style={{ '--mg-accent-bullet': mode.accent }}>{d}</li>
                                                    ))}
                                                </ul>
                                            </article>
                                        );
                                    })}
                                </div>
                            </Section>

                            {/* 03 — How to choose */}
                            <Section
                                id="triage"
                                no="03"
                                title="How to choose"
                                lede="Start with your intent, and let the interface structure the conversation."
                                refMap={sectionRefs}
                            >
                                <ol className="mgfm-steps">
                                    <li className="mgfm-step">
                                        <span className="mgfm-step-no">1</span>
                                        <div>
                                            <div className="mgfm-step-name">Brainstorm & Chat</div>
                                            <p className="mgfm-step-body">Start in <strong>Chat</strong> if you have a quick question, need to flesh out a plan, or want lightweight conversational help.</p>
                                        </div>
                                        <ArrowRight size={14} className="mgfm-step-arrow" />
                                    </li>
                                    <li className="mgfm-step">
                                        <span className="mgfm-step-no">2</span>
                                        <div>
                                            <div className="mgfm-step-name">Execute Tasks</div>
                                            <p className="mgfm-step-body">Move to <strong>Cowork</strong> when the task requires autonomous step-by-step file inspection, editing, and tool usage.</p>
                                        </div>
                                        <ArrowRight size={14} className="mgfm-step-arrow" />
                                    </li>
                                    <li className="mgfm-step">
                                        <span className="mgfm-step-no">3</span>
                                        <div>
                                            <div className="mgfm-step-name">Code Directly</div>
                                            <p className="mgfm-step-body">Use <strong>Code</strong> when you want to work side-by-side with an editor, staying close to active files and editor state.</p>
                                        </div>
                                        <ArrowRight size={14} className="mgfm-step-arrow" />
                                    </li>
                                    <li className="mgfm-step">
                                        <span className="mgfm-step-no">4</span>
                                        <div>
                                            <div className="mgfm-step-name">Dispatch CLI Agents</div>
                                            <p className="mgfm-step-body">Use <strong>Agents</strong> if you want to run a dedicated external coding CLI like Claude Code, Aider, or Copilot on a job.</p>
                                        </div>
                                        <ArrowRight size={14} className="mgfm-step-arrow" />
                                    </li>
                                    <li className="mgfm-step">
                                        <span className="mgfm-step-no">5</span>
                                        <div>
                                            <div className="mgfm-step-name">Generate & Preview UI</div>
                                            <p className="mgfm-step-body">Choose <strong>Build</strong> when you are generating web apps or components and need an instant visual preview feedback loop.</p>
                                        </div>
                                        <ArrowRight size={14} className="mgfm-step-arrow" />
                                    </li>
                                    <li className="mgfm-step">
                                        <span className="mgfm-step-no">6</span>
                                        <div>
                                            <div className="mgfm-step-name">Supervise & Validate</div>
                                            <p className="mgfm-step-body">Check in on <strong>Mission</strong> to verify runs, review terminal histories, check validation status, or capture memories.</p>
                                        </div>
                                    </li>
                                </ol>
                                <div className="mgfm-callout mgfm-callout--quiet">
                                    <Sparkles size={16} />
                                    <span><strong>Quick Triage:</strong> Chat is for talking. Cowork, Code, Agents, and Build are for producing work. Mission is for reviewing and auditing that work.</span>
                                </div>
                            </Section>

                            {/* 04 — Work vs oversight */}
                            <Section
                                id="execution"
                                no="04"
                                title="Work vs oversight"
                                lede="The division between active execution and operational accountability."
                                refMap={sectionRefs}
                            >
                                <div className="mgfm-fields">
                                    <FieldRow icon={TerminalSquare} term="Execution modes">
                                        Chat, Cowork, Code, Agents, and Build are primarily work-producing surfaces. They are where you type prompts, write code, run compilers, and generate artifacts.
                                    </FieldRow>
                                    <FieldRow icon={ActivitySquare} term="Oversight (Mission)">
                                        Mission is the operational deck. It does not produce files itself; instead, it observes what happens in the other modes. Run statuses, command logs, memory suggestions, and system checks all gather in Mission so you can evaluate the results.
                                    </FieldRow>
                                </div>
                                <div className="mgfm-callout">
                                    <ShieldCheck size={16} />
                                    <span>If execution modes are where action happens, Mission is where accountability and project history are recorded.</span>
                                </div>
                            </Section>

                            {/* 05 — Key comparisons */}
                            <Section
                                id="comparisons"
                                no="05"
                                title="Key comparisons"
                                lede="Distinguishing between surfaces that seem similar but solve different problems."
                                refMap={sectionRefs}
                            >
                                <div className="mgfm-fields">
                                    <FieldRow icon={Users} term="Cowork vs Agents vs Code">
                                        Use <strong>Cowork</strong> for Perci&rsquo;s native, browser-driven agentic flow. Use <strong>Code</strong> when you want to edit files with active editor context. Use <strong>Agents</strong> when you want to dispatch a specific named external CLI agent (e.g., Claude Code) to run a background job.
                                    </FieldRow>
                                    <FieldRow icon={Hammer} term="Build vs Code">
                                        Use <strong>Code</strong> when you are navigating or manually modifying a complex codebase. Use <strong>Build</strong> when you want the AI to write a self-contained component or app, spin it up, and display a live visual preview frame.
                                    </FieldRow>
                                </div>
                            </Section>

                            {/* 06 — Expert workflow */}
                            <Section
                                id="workflow"
                                no="06"
                                title="Expert workflow"
                                lede="How to combine these modes into a high-leverage development loop."
                                refMap={sectionRefs}
                            >
                                <ol className="mgfm-ladder">
                                    <li className="mgfm-rung">
                                        <span className="mgfm-rung-no">01</span>
                                        <span className="mgfm-rung-dot" style={{ background: '#f97316' }} />
                                        <span className="mgfm-rung-when">Brainstorming & Planning</span>
                                        <ArrowRight size={13} className="mgfm-rung-arrow" />
                                        <span className="mgfm-rung-then">Use Chat to map the architecture</span>
                                    </li>
                                    <li className="mgfm-rung">
                                        <span className="mgfm-rung-no">02</span>
                                        <span className="mgfm-rung-dot" style={{ background: '#22d3ee' }} />
                                        <span className="mgfm-rung-when">Autonomous Implementation</span>
                                        <ArrowRight size={13} className="mgfm-rung-arrow" />
                                        <span className="mgfm-rung-then">Use Cowork to run multi-file edits</span>
                                    </li>
                                    <li className="mgfm-rung">
                                        <span className="mgfm-rung-no">03</span>
                                        <span className="mgfm-rung-dot" style={{ background: '#fb7185' }} />
                                        <span className="mgfm-rung-when">Interface & UI Iteration</span>
                                        <ArrowRight size={13} className="mgfm-rung-arrow" />
                                        <span className="mgfm-rung-then">Use Build to polish the visual outcome</span>
                                    </li>
                                    <li className="mgfm-rung">
                                        <span className="mgfm-rung-no">04</span>
                                        <span className="mgfm-rung-dot" style={{ background: '#60a5fa' }} />
                                        <span className="mgfm-rung-when">Supervision & Validation</span>
                                        <ArrowRight size={13} className="mgfm-rung-arrow" />
                                        <span className="mgfm-rung-then">Use Mission to review logs and commit memory</span>
                                    </li>
                                </ol>
                                <p className="mgfm-note">
                                    Experienced operators shift modes intentionally. If your context shifts from brainstorming to code editing, do not force the chat to compile code — click Code or Build to switch to a deck optimized for that task.
                                </p>
                            </Section>

                            {/* 07 — Field notes */}
                            <Section
                                id="field"
                                no="07"
                                title="Field notes"
                                lede="Best practices for fluid operator transitions."
                                refMap={sectionRefs}
                            >
                                <ul className="mgfm-bullets">
                                    <li><strong>Single vs Multi-agent:</strong> Chat, Cowork, Code, and Build are single-surface experiences. Agents is a multi-agent dashboard designed to compare and dispatch different third-party CLIs.</li>
                                    <li><strong>Shared context:</strong> Switching modes preserves your workspace parameters, meaning the goal and folder flow seamlessly across decks without re-briefing.</li>
                                    <li><strong>Verification is distinct from execution:</strong> Never assume a run is correct just because an agent says it is finished. Always validate outputs before committing.</li>
                                    <li><strong>Don&rsquo;t get stuck:</strong> If a task stalls in Cowork, drop back to Chat to brainstorm the blocker, or use Code to edit the block yourself.</li>
                                </ul>
                                <div className="mgfm-callout mgfm-callout--quiet">
                                    <span className="mgfm-kbd">Esc</span>
                                    <span>closes this guide. Mode states and histories are stored locally in your encrypted app configuration.</span>
                                </div>
                            </Section>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

const GUIDE_STYLES = `
.mgfm,
.mgfm-backdrop {
    --mg-accent: #f97316;
    --mg-accent-bright: #fb923c;
    --mg-accent-soft: rgba(249, 115, 22, 0.12);
    --mg-accent-line: rgba(249, 115, 22, 0.30);
    --mg-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Fira Code", Menlo, monospace;
}

.mgfm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
}

.mgfm {
    position: absolute;
    left: 50%;
    top: 50%;
    display: flex;
    flex-direction: column;
    width: min(86%, 960px);
    height: min(84%, 820px);
    overflow: hidden;
    border-radius: 1rem;
    border: 1px solid var(--border);
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 30px 90px -25px rgba(0, 0, 0, 0.75);
    container-type: inline-size;
    will-change: transform;
    animation: mgfm-rise 200ms ease-out;
}

@keyframes mgfm-rise {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* Header */
.mgfm-header {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.4rem 1.6rem;
    border-bottom: 1px solid var(--border);
    background:
        radial-gradient(120% 140% at 0% 0%, var(--mg-accent-soft), transparent 55%),
        var(--bg-secondary);
    cursor: grab;
    user-select: none;
}
.mgfm-header.is-dragging { cursor: grabbing; }
.mgfm-grip {
    align-self: center;
    flex-shrink: 0;
    color: var(--text-tertiary);
    opacity: 0.55;
    transition: opacity 140ms;
}
.mgfm-header:hover .mgfm-grip { opacity: 0.9; }
.mgfm-header-mark {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    flex-shrink: 0;
    border-radius: 0.85rem;
    border: 1px solid var(--mg-accent-line);
    background: var(--mg-accent-soft);
    color: var(--mg-accent-bright);
}
.mgfm-header-text { min-width: 0; flex: 1; }
.mgfm-subtitle {
    margin-top: 0.4rem;
    max-width: 52ch;
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--text-secondary);
}
.mgfm-title {
    margin-top: 0.15rem;
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.1;
}
.mgfm-eyebrow {
    font-family: var(--mg-mono);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--mg-accent-bright);
}
.mgfm-close {
    flex-shrink: 0;
    padding: 0.5rem;
    border-radius: 0.6rem;
    border: 1px solid var(--border);
    background: var(--bg-primary);
    color: var(--text-secondary);
    transition: color 140ms, background-color 140ms, transform 200ms ease;
}
.mgfm-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    transform: rotate(90deg);
}

/* Body layout */
.mgfm-body { display: flex; min-height: 0; flex: 1; }

/* Table of contents rail */
.mgfm-toc {
    flex-shrink: 0;
    width: 184px;
    padding: 1.4rem 0.9rem;
    border-right: 1px solid var(--border);
    background: var(--bg-secondary);
    overflow-y: auto;
}
.mgfm-toc-label {
    padding: 0 0.6rem;
    margin-bottom: 0.7rem;
    font-family: var(--mg-mono);
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    color: var(--text-tertiary);
}
.mgfm-toc ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.mgfm-toc-link {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    border-radius: 0.55rem;
    text-align: left;
    color: var(--text-secondary);
    transition: color 150ms ease, background-color 150ms ease, transform 150ms ease;
}
.mgfm-toc-link:hover:not(.is-active) {
    background: var(--bg-hover);
    color: var(--text-primary);
    transform: translateX(4px);
}
.mgfm-toc-link.is-active {
    background: var(--mg-accent-soft);
    color: var(--text-primary);
}
.mgfm-toc-link::before {
    content: "";
    position: absolute;
    left: -0.9rem;
    top: 50%;
    transform: translateY(-50%) scaleY(0);
    width: 3px;
    height: 1.1rem;
    border-radius: 0 3px 3px 0;
    background: var(--mg-accent);
    transition: transform 200ms ease;
}
.mgfm-toc-link.is-active::before {
    transform: translateY(-50%) scaleY(1);
}
.mgfm-toc-no {
    font-family: var(--mg-mono);
    font-size: 0.62rem;
    color: var(--mg-accent-bright);
    opacity: 0.85;
}
.mgfm-toc-text { font-size: 0.82rem; font-weight: 500; }

/* Scroll region */
.mgfm-scroll { flex: 1; min-width: 0; overflow-y: auto; scroll-behavior: smooth; }
.mgfm-content { padding: 1.8rem 2rem 3rem; max-width: 760px; }

/* Sections */
.mgfm-section { padding: 1.6rem 0; border-top: 1px solid var(--border); }
.mgfm-section:first-child { padding-top: 0.4rem; border-top: none; }
.mgfm-section-head { display: flex; gap: 0.9rem; margin-bottom: 1.1rem; }
.mgfm-section-no {
    font-family: var(--mg-mono);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--mg-accent);
    padding-top: 0.2rem;
}
.mgfm-section-title { font-size: 1.12rem; font-weight: 620; letter-spacing: -0.01em; }
.mgfm-section-lede { margin-top: 0.3rem; font-size: 0.86rem; line-height: 1.55; color: var(--text-secondary); }
.mgfm-section-body { font-size: 0.86rem; line-height: 1.65; color: var(--text-secondary); }
.mgfm-section-body p + p { margin-top: 0.8rem; }

/* Hero */
.mgfm-hero {
    margin-bottom: 1.3rem;
    padding: 0.5rem 0.5rem 0.2rem;
    border-radius: 1rem;
    border: 1px solid var(--border);
    background:
        radial-gradient(80% 120% at 50% 0%, var(--mg-accent-soft), transparent 60%),
        var(--bg-secondary);
}
.mgfm-orbit { display: block; width: 100%; height: auto; }
.mgfm-station { cursor: pointer; }
.mgfm-station circle,
.mgfm-station-icon-wrap {
    transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), stroke-width 200ms ease;
    transform-origin: center;
    transform-box: fill-box;
}
.mgfm-station:hover circle {
    transform: scale(1.15);
    stroke-width: 2px;
}
.mgfm-station:hover .mgfm-station-icon-wrap {
    transform: scale(1.15);
}
.mgfm-station text {
    transition: fill 200ms ease, font-weight 200ms ease;
}
.mgfm-station:hover text {
    fill: var(--text-primary);
    font-weight: 700;
}
.mgfm-station-label {
    font-family: var(--mg-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    fill: var(--text-secondary);
    text-transform: uppercase;
}
.mgfm-core-label {
    font-family: var(--mg-mono);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    fill: #f5f3ff;
}
.mgfm-core-sub {
    font-family: var(--mg-mono);
    font-size: 8.5px;
    letter-spacing: 0.18em;
    fill: #ede9fe;
    opacity: 0.85;
    text-transform: uppercase;
}

/* Callouts */
.mgfm-callout {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
    margin-top: 1.1rem;
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--mg-accent-line);
    background: var(--mg-accent-soft);
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--text-secondary);
}
.mgfm-callout svg { color: var(--mg-accent-bright); flex-shrink: 0; margin-top: 0.1rem; }
.mgfm-callout--quiet { border-color: var(--border); background: var(--bg-secondary); }
.mgfm-callout--quiet svg { color: var(--text-tertiary); }

/* Loop steps */
.mgfm-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.mgfm-step {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    transition: transform 200ms ease, border-color 200ms ease, background-color 200ms ease;
}
.mgfm-step:hover {
    transform: translateX(4px);
    border-color: var(--mg-accent-line);
    background: var(--bg-hover);
}
.mgfm-step-no {
    display: grid;
    place-items: center;
    width: 1.55rem;
    height: 1.55rem;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid var(--mg-accent-line);
    background: var(--mg-accent-soft);
    font-family: var(--mg-mono);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--mg-accent-bright);
    transition: transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.mgfm-step:hover .mgfm-step-no {
    transform: scale(1.1) rotate(-10deg);
}
.mgfm-step-name { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); }
.mgfm-step-body { margin-top: 0.2rem; font-size: 0.82rem; line-height: 1.5; color: var(--text-secondary); }
.mgfm-step-arrow { position: absolute; right: 1rem; top: 1.05rem; color: var(--text-tertiary); }

/* Next-action ladder */
.mgfm-ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.mgfm-rung {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.62rem 0.5rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.83rem;
    border-radius: 0.5rem;
    transition: transform 200ms ease, background-color 200ms ease;
}
.mgfm-rung:hover {
    transform: translateX(6px);
    background: var(--bg-secondary);
}
.mgfm-rung:last-child { border-bottom: none; }
.mgfm-rung-no { font-family: var(--mg-mono); font-size: 0.68rem; color: var(--text-tertiary); width: 1.4rem; }
.mgfm-rung-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: transform 200ms ease, box-shadow 200ms ease;
}
.mgfm-rung:hover .mgfm-rung-dot {
    transform: scale(1.4);
    box-shadow: 0 0 8px currentColor;
}
.mgfm-rung-when { color: var(--text-secondary); flex: 1; min-width: 0; }
.mgfm-rung-arrow { color: var(--text-tertiary); flex-shrink: 0; }
.mgfm-rung-then { color: var(--text-primary); font-weight: 550; flex: 1; min-width: 0; }
.mgfm-note { margin-top: 1rem; font-size: 0.82rem; line-height: 1.55; color: var(--text-secondary); }

/* Surfaces grid */
.mgfm-surfaces { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
.mgfm-surface {
    padding: 0.95rem 1rem;
    border-radius: 0.8rem;
    border: 1px solid var(--border);
    background: 
        radial-gradient(120% 120% at 100% 0%, var(--mg-card-accent-soft), transparent 70%),
        var(--bg-secondary);
    transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 200ms ease, box-shadow 200ms ease;
}
.mgfm-surface:hover {
    transform: translateY(-3px) scale(1.015);
    border-color: var(--mg-card-accent) !important;
    background: 
        radial-gradient(120% 120% at 100% 0%, var(--mg-card-accent-soft), transparent 50%),
        var(--bg-secondary);
    box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.5), 
                0 0 20px -5px var(--mg-card-accent);
}
.mgfm-surface-head { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.5rem; }
.mgfm-surface-head h4 { font-size: 0.86rem; font-weight: 620; }
.mgfm-surface-icon {
    display: grid;
    place-items: center;
    width: 1.7rem;
    height: 1.7rem;
    flex-shrink: 0;
    border-radius: 0.55rem;
    border: 1px solid var(--mg-accent-line);
    background: var(--mg-accent-soft);
    color: var(--mg-accent-bright);
    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.mgfm-surface:hover .mgfm-surface-icon {
    transform: scale(1.15) rotate(5deg);
}
.mgfm-surface-what { font-size: 0.84rem; line-height: 1.55; color: var(--text-primary); }
.mgfm-surface-list { margin: 0.6rem 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
.mgfm-surface-list li {
    position: relative;
    padding-left: 0.95rem;
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--text-secondary);
}
.mgfm-surface-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.5rem;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--mg-accent-bullet, var(--mg-accent));
    opacity: 0.7;
}

/* Field rows */
.mgfm-fields { display: flex; flex-direction: column; gap: 0.65rem; }
.mgfm-field {
    display: flex;
    gap: 0.8rem;
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
}
.mgfm-field-icon {
    display: grid;
    place-items: center;
    width: 1.85rem;
    height: 1.85rem;
    flex-shrink: 0;
    border-radius: 0.6rem;
    border: 1px solid var(--mg-accent-line);
    background: var(--mg-accent-soft);
    color: var(--mg-accent-bright);
}
.mgfm-field-term {
    font-family: var(--mg-mono);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-primary);
}
.mgfm-field-desc { margin-top: 0.25rem; font-size: 0.82rem; line-height: 1.55; color: var(--text-secondary); }

/* Bullets */
.mgfm-bullets { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.55rem; }
.mgfm-bullets li {
    position: relative;
    padding-left: 1.15rem;
    font-size: 0.84rem;
    line-height: 1.55;
    color: var(--text-secondary);
    transition: transform 150ms ease, color 150ms ease;
}
.mgfm-bullets li:hover {
    transform: translateX(4px);
    color: var(--text-primary);
}
.mgfm-bullets li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.6rem;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--mg-accent);
    transition: transform 200ms ease, background-color 200ms ease;
}
.mgfm-bullets li:hover::before {
    transform: scale(1.4);
    background-color: var(--mg-accent-bright);
}

.mgfm-kbd {
    display: inline-grid;
    place-items: center;
    min-width: 1.9rem;
    padding: 0.1rem 0.4rem;
    border-radius: 0.35rem;
    border: 1px solid var(--border);
    background: var(--bg-primary);
    font-family: var(--mg-mono);
    font-size: 0.7rem;
    color: var(--text-secondary);
    flex-shrink: 0;
}

@container (max-width: 560px) {
    .mgfm-surfaces { grid-template-columns: 1fr; }
}
@container (max-width: 500px) {
    .mgfm-toc { display: none; }
    .mgfm-content { padding: 1.4rem 1.2rem 2.4rem; }
}
@media (max-width: 720px) {
    .mgfm-toc { display: none; }
    .mgfm-content { padding: 1.4rem 1.2rem 2.4rem; }
    .mgfm-surfaces { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
    .mgfm { animation: none; }
    .mgfm-comet, .mgfm-scroll { animation: none !important; scroll-behavior: auto; }
    .mgfm-comet animateMotion { display: none; }
}
`;
