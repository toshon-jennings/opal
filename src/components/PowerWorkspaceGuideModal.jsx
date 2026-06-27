import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowRight,
    Bot,
    Brain,
    Compass,
    FolderOpen,
    GripHorizontal,
    Layers,
    Lightbulb,
    Link2,
    MessageSquare,
    Rocket,
    ScrollText,
    ShieldCheck,
    Target,
    TerminalSquare,
    X,
} from 'lucide-react';

/*
 * Power Workspace — Field Manual.
 *
 * This modal doubles as the reference template for future in-app guides. Its
 * visual system is intentionally scoped under the `.pwfm` namespace and driven
 * by a small set of `--pw-*` tokens at the top of the stylesheet, so a future
 * guide can be reskinned by editing the token block alone.
 */

// ---------------------------------------------------------------------------
// Manual content — every section below is derived from the real Power
// Workspace surface (src/components/PowerWorkspaceMode.jsx + lib/powerWorkspace.js).
// ---------------------------------------------------------------------------

const STATIONS = [
    { id: 'ideas', label: 'Ideas', icon: Lightbulb },
    { id: 'runs', label: 'Runs', icon: Bot },
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'memory', label: 'Memory', icon: Brain },
    { id: 'exec', label: 'Execution', icon: TerminalSquare },
    { id: 'context', label: 'Context', icon: ScrollText },
];

const LOOP_STEPS = [
    {
        step: 'Define',
        body: 'Name the workspace, point it at a folder, and write the goal in one sentence. Everything downstream reads from this.',
    },
    {
        step: 'Decide',
        body: 'Next action reads the current state of the project and tells you the single most useful thing to do right now.',
    },
    {
        step: 'Execute',
        body: 'Open the target surface — Cowork, BARS, Mission, Git Shells, or Notes — carrying the goal and folder with you.',
    },
    {
        step: 'Validate',
        body: 'Prove the work actually landed. A run being "done" and a run being trusted are two different states.',
    },
    {
        step: 'Remember',
        body: 'Promote the outcome worth keeping into workspace memory, then loop back with sharper context.',
    },
];

const SURFACES = [
    {
        id: 'ideas',
        icon: Lightbulb,
        title: 'Recent BARS ideas',
        what: 'The latest ideas captured in BARS, with their status and suggested next step.',
        does: [
            'Open an idea back in BARS, or plan it directly in Cowork with the idea as context.',
            'Link an idea to pin it to this workspace so it stays at the top of the list.',
        ],
    },
    {
        id: 'runs',
        icon: Bot,
        title: 'Recent Mission runs',
        what: 'Agent runs relevant to this workspace, each with a status and a validation state.',
        does: [
            'Open a run in Mission, or send a run that needs proof into Git Shells to validate it.',
            'Link a run to keep it attached even when its folder changes.',
        ],
    },
    {
        id: 'chats',
        icon: MessageSquare,
        title: 'Workspace chats',
        what: 'Conversations scoped to this workspace — same goal and folder, no lost thread.',
        does: [
            'Start a new chat that inherits the workspace goal and working directory.',
            'Reopen any chat exactly where the decision was being made.',
        ],
    },
    {
        id: 'memory',
        icon: Brain,
        title: 'Workspace memory',
        what: 'Candidate memories from Mission runs, plus memory already saved for this project.',
        does: [
            'Save a candidate to keep it, or discard it to keep memory lean.',
            'Read saved memory so the next run starts with what the last one learned.',
        ],
    },
    {
        id: 'exec',
        icon: TerminalSquare,
        title: 'Execution surfaces',
        what: 'Live Cowork agent activity and the attached Git Shells project and terminals.',
        does: [
            'Start Cowork with full workspace context, or jump to a session awaiting review.',
            'Open Git Shells against the workspace folder for terminal work.',
        ],
    },
    {
        id: 'context',
        icon: ScrollText,
        title: 'Context surfaces',
        what: 'The folder context and the notes you have pinned to this workspace.',
        does: [
            'Link a note by title or filename so it travels with the workspace.',
            'Send a note straight into Cowork as planning context.',
        ],
    },
];

// The real priority ladder from chooseNextWorkspaceAction(), top to bottom.
const NEXT_ACTION_LADDER = [
    { when: 'No goal yet', then: 'Write the workspace goal', tone: 'accent' },
    { when: 'A run is blocked or failed', then: 'Review the blocked run', tone: 'red' },
    { when: 'A run needs validation', then: 'Validate the latest agent work', tone: 'amber' },
    { when: 'Cowork has work awaiting review', then: 'Review the latest Cowork result', tone: 'amber' },
    { when: 'An idea is active', then: 'Turn an idea into the next plan', tone: 'sky' },
    { when: 'No folder attached', then: 'Attach a local project folder', tone: 'sky' },
    { when: 'Everything is clear', then: 'Continue the current project', tone: 'emerald' },
];

const SECTIONS = [
    { id: 'overview', no: '01', label: 'Overview' },
    { id: 'loop', no: '02', label: 'The loop' },
    { id: 'define', no: '03', label: 'Define' },
    { id: 'next', no: '04', label: 'Next action' },
    { id: 'surfaces', no: '05', label: 'Six surfaces' },
    { id: 'linking', no: '06', label: 'Linking & handoff' },
    { id: 'field', no: '07', label: 'Field notes' },
];

const TONE_DOT = {
    accent: 'var(--pw-accent)',
    red: '#f87171',
    amber: '#fbbf24',
    sky: '#60a5fa',
    emerald: '#34d399',
};

// ---------------------------------------------------------------------------
// Signature element — the workspace loop, drawn as an orbital flight path.
// ---------------------------------------------------------------------------

function OrbitHero() {
    // Ellipse geometry shared by the path and the station placement.
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
            className="pwfm-orbit"
            viewBox="0 0 720 300"
            role="img"
            aria-label="The Power Workspace loop: a central workspace core orbited by six surfaces — Ideas, Runs, Chats, Memory, Execution, and Context."
        >
            <defs>
                <radialGradient id="pwfm-core" cx="50%" cy="42%" r="65%">
                    <stop offset="0%" stopColor="#fdba74" />
                    <stop offset="55%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#c2410c" />
                </radialGradient>
                <filter id="pwfm-glow" x="-60%" y="-60%" width="220%" height="220%">
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
                stroke="var(--pw-accent-line)"
                strokeWidth="1.25"
                strokeDasharray="2 7"
            />

            {/* Comet tracing the loop */}
            <circle r="4" fill="var(--pw-accent)" filter="url(#pwfm-glow)" className="pwfm-comet">
                <animateMotion
                    dur="14s"
                    repeatCount="indefinite"
                    path={`M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`}
                />
            </circle>

            {/* Stations */}
            {points.map((p) => (
                <g key={p.id} className="pwfm-station">
                    <circle cx={p.x} cy={p.y} r="15" fill="var(--bg-primary)" stroke="var(--pw-accent-line)" strokeWidth="1.25" />
                    <circle cx={p.x} cy={p.y} r="2.5" fill="var(--pw-accent)" />
                    <text
                        x={p.x}
                        y={p.y > cy ? p.y + 30 : p.y - 22}
                        textAnchor="middle"
                        className="pwfm-station-label"
                    >
                        {p.label}
                    </text>
                </g>
            ))}

            {/* Core */}
            <circle cx={cx} cy={cy} r="46" fill="url(#pwfm-core)" filter="url(#pwfm-glow)" />
            <circle cx={cx} cy={cy} r="46" fill="none" stroke="#fed7aa" strokeOpacity="0.35" strokeWidth="1" />
            <text x={cx} y={cy - 4} textAnchor="middle" className="pwfm-core-label">WORKSPACE</text>
            <text x={cx} y={cy + 13} textAnchor="middle" className="pwfm-core-sub">define · decide · loop</text>
        </svg>
    );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Eyebrow({ children }) {
    return <div className="pwfm-eyebrow">{children}</div>;
}

function Section({ id, no, title, lede, refMap, children }) {
    return (
        <section
            id={`pwfm-${id}`}
            ref={(node) => { refMap.current[id] = node; }}
            className="pwfm-section"
        >
            <div className="pwfm-section-head">
                <span className="pwfm-section-no">{no}</span>
                <div>
                    <h3 className="pwfm-section-title">{title}</h3>
                    {lede && <p className="pwfm-section-lede">{lede}</p>}
                </div>
            </div>
            <div className="pwfm-section-body">{children}</div>
        </section>
    );
}

function FieldRow({ icon: Icon, term, children }) {
    return (
        <div className="pwfm-field">
            <span className="pwfm-field-icon"><Icon size={15} /></span>
            <div>
                <div className="pwfm-field-term">{term}</div>
                <p className="pwfm-field-desc">{children}</p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function PowerWorkspaceGuideModal({ isOpen, onClose }) {
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
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onCloseRef.current();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Drag the panel by its header, clamped to stay inside the window.
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
                    setActiveId(visible.target.id.replace('pwfm-', ''));
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

    return (
        <div
            className="pwfm-backdrop"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <style>{styleBlock}</style>
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pwfm-title"
                className="pwfm"
                style={{ transform: `translate(-50%, -50%) translate(${drag.dx}px, ${drag.dy}px)` }}
            >
                {/* Header doubles as the drag handle */}
                <header
                    className={`pwfm-header${dragging ? ' is-dragging' : ''}`}
                    onMouseDown={startDrag}
                    title="Drag to move"
                >
                    <div className="pwfm-header-mark"><Rocket size={18} /></div>
                    <div className="pwfm-header-text">
                        <Eyebrow>Operator&rsquo;s manual</Eyebrow>
                        <h2 id="pwfm-title" className="pwfm-title">Power Workspace</h2>
                        <p className="pwfm-subtitle">
                            One project loop for ideas, notes, agents, terminals, validation, and memory — and the single next action that ties them together.
                        </p>
                    </div>
                    <GripHorizontal size={15} className="pwfm-grip" aria-hidden="true" />
                    <button type="button" onClick={onClose} className="pwfm-close" aria-label="Close manual">
                        <X size={16} />
                    </button>
                </header>

                {/* Body: TOC rail + scrolling manual */}
                <div className="pwfm-body">
                    <nav className="pwfm-toc" aria-label="Manual contents">
                        <div className="pwfm-toc-label">Contents</div>
                        <ul>
                            {SECTIONS.map((s) => (
                                <li key={s.id}>
                                    <button
                                        type="button"
                                        onClick={() => goTo(s.id)}
                                        className={`pwfm-toc-link${activeId === s.id ? ' is-active' : ''}`}
                                        aria-current={activeId === s.id ? 'true' : undefined}
                                    >
                                        <span className="pwfm-toc-no">{s.no}</span>
                                        <span className="pwfm-toc-text">{s.label}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <div className="pwfm-scroll" ref={scrollRef}>
                        <div className="pwfm-content">
                            {/* 01 — Overview */}
                            <Section
                                id="overview"
                                no="01"
                                title="What Power Workspace is"
                                lede="A command deck that keeps one project — its ideas, agents, terminals, conversations, and memory — orbiting a single goal."
                                refMap={sectionRefs}
                            >
                                <div className="pwfm-hero">
                                    <OrbitHero />
                                </div>
                                <p>
                                    Most surfaces in Perci do one job. Power Workspace does none of them itself —
                                    it is the deck that points all of them at the same goal and folder, then tells
                                    you where to go next. Think of it as the cockpit, not the engine.
                                </p>
                                <div className="pwfm-callout">
                                    <Compass size={16} />
                                    <span>
                                        Nothing here is busywork. Every card is a launch button into the surface
                                        that actually does the work — carrying your goal and folder with it.
                                    </span>
                                </div>
                            </Section>

                            {/* 02 — The loop */}
                            <Section
                                id="loop"
                                no="02"
                                title="The loop"
                                lede="Five moves, run in order, then again. The whole surface is built to keep you moving through them."
                                refMap={sectionRefs}
                            >
                                <ol className="pwfm-steps">
                                    {LOOP_STEPS.map((s, i) => (
                                        <li key={s.step} className="pwfm-step">
                                            <span className="pwfm-step-no">{i + 1}</span>
                                            <div>
                                                <div className="pwfm-step-name">{s.step}</div>
                                                <p className="pwfm-step-body">{s.body}</p>
                                            </div>
                                            {i < LOOP_STEPS.length - 1 && <ArrowRight size={14} className="pwfm-step-arrow" />}
                                        </li>
                                    ))}
                                </ol>
                            </Section>

                            {/* 03 — Define */}
                            <Section
                                id="define"
                                no="03"
                                title="Define the workspace"
                                lede="Three fields. They are not metadata — they are the inputs every other surface reads."
                                refMap={sectionRefs}
                            >
                                <div className="pwfm-fields">
                                    <FieldRow icon={Target} term="Name">
                                        How the workspace introduces itself in chats, Cowork sessions, and handoff
                                        prompts. Defaults to the active project folder if you leave it blank.
                                    </FieldRow>
                                    <FieldRow icon={FolderOpen} term="Folder">
                                        The local path Perci works against. It also decides which Mission runs and
                                        chats count as &ldquo;this workspace&rdquo; — see Linking. Set it and agents act on
                                        real files instead of guessing.
                                    </FieldRow>
                                    <FieldRow icon={Compass} term="Goal">
                                        One sentence on what this project is trying to accomplish. With no goal,
                                        Next action does nothing but ask you to write one. Keep it short and true.
                                    </FieldRow>
                                </div>
                                <div className="pwfm-callout pwfm-callout--quiet">
                                    <ShieldCheck size={16} />
                                    <span>Save writes the workspace to local app state. Refresh re-reads every surface so the deck reflects what just happened elsewhere.</span>
                                </div>
                            </Section>

                            {/* 04 — Next action */}
                            <Section
                                id="next"
                                no="04"
                                title="How Next action is chosen"
                                lede="Perci walks a fixed priority ladder over the project state and surfaces the first rule that matches."
                                refMap={sectionRefs}
                            >
                                <ol className="pwfm-ladder">
                                    {NEXT_ACTION_LADDER.map((rung, i) => (
                                        <li key={rung.then} className="pwfm-rung">
                                            <span className="pwfm-rung-no">{String(i + 1).padStart(2, '0')}</span>
                                            <span className="pwfm-rung-dot" style={{ background: TONE_DOT[rung.tone] }} />
                                            <span className="pwfm-rung-when">{rung.when}</span>
                                            <ArrowRight size={13} className="pwfm-rung-arrow" />
                                            <span className="pwfm-rung-then">{rung.then}</span>
                                        </li>
                                    ))}
                                </ol>
                                <p className="pwfm-note">
                                    The first matching rung wins, so a blocked run always outranks a fresh idea.
                                    Clear what is above and the ladder naturally walks you down to real work.
                                </p>
                            </Section>

                            {/* 05 — Surfaces */}
                            <Section
                                id="surfaces"
                                no="05"
                                title="The six surfaces"
                                lede="Each card is a window into another part of Perci, filtered to this workspace."
                                refMap={sectionRefs}
                            >
                                <div className="pwfm-surfaces">
                                    {SURFACES.map((s) => {
                                        const Icon = s.icon;
                                        return (
                                            <article key={s.id} className="pwfm-surface">
                                                <div className="pwfm-surface-head">
                                                    <span className="pwfm-surface-icon"><Icon size={15} /></span>
                                                    <h4>{s.title}</h4>
                                                </div>
                                                <p className="pwfm-surface-what">{s.what}</p>
                                                <ul className="pwfm-surface-list">
                                                    {s.does.map((d) => <li key={d}>{d}</li>)}
                                                </ul>
                                            </article>
                                        );
                                    })}
                                </div>
                            </Section>

                            {/* 06 — Linking & handoff */}
                            <Section
                                id="linking"
                                no="06"
                                title="Linking & handoff"
                                lede="Two mechanisms decide what belongs to a workspace and how context travels out of it."
                                refMap={sectionRefs}
                            >
                                <div className="pwfm-fields">
                                    <FieldRow icon={Link2} term="Relevance">
                                        An item counts as part of the workspace if you explicitly link it, or if its
                                        folder matches the workspace folder. Linking pins items to the top and keeps
                                        them even when their path changes.
                                    </FieldRow>
                                    <FieldRow icon={Layers} term="Handoff">
                                        When you launch a surface, Perci packs the goal, folder, and linked notes into
                                        the prompt and sets the working directory — so Cowork, Chat, and Git Shells all
                                        open already knowing the project. No re-briefing.
                                    </FieldRow>
                                </div>
                            </Section>

                            {/* 07 — Field notes */}
                            <Section
                                id="field"
                                no="07"
                                title="Field notes"
                                lede="How to fly the deck well."
                                refMap={sectionRefs}
                            >
                                <ul className="pwfm-bullets">
                                    <li>Write the goal first. An empty goal stalls the whole loop at rung one.</li>
                                    <li>Link deliberately. A short linked list beats a long noisy one — pin what matters, leave the rest discoverable.</li>
                                    <li>Treat &ldquo;done&rdquo; and &ldquo;validated&rdquo; as different states. Validate before you trust a run.</li>
                                    <li>Let Next action triage for you instead of scanning every card — it already walked the ladder.</li>
                                    <li>Save only memory that would sharpen the next run. Discard the rest to keep the deck legible.</li>
                                </ul>
                                <div className="pwfm-callout pwfm-callout--quiet">
                                    <span className="pwfm-kbd">Esc</span>
                                    <span>closes this manual. Workspace data lives locally in the encrypted app state — nothing here leaves your machine.</span>
                                </div>
                            </Section>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Scoped styles. Everything lives under `.pwfm*` so nothing here can collide
// with app-wide CSS. Recolor a future guide by editing the token block only.
// ---------------------------------------------------------------------------

const GUIDE_STYLES = `
.pwfm,
.pwfm-backdrop {
    --pw-accent: #f97316;
    --pw-accent-bright: #fb923c;
    --pw-accent-soft: rgba(249, 115, 22, 0.12);
    --pw-accent-line: rgba(249, 115, 22, 0.30);
    --pw-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Fira Code", Menlo, monospace;
}

.pwfm-backdrop {
    position: absolute;
    inset: 0;
    z-index: 30;
    overflow: hidden;
    border-radius: inherit;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(3px);
}

.pwfm {
    position: absolute;
    left: 50%;
    top: 50%;
    display: flex;
    flex-direction: column;
    width: min(84%, 900px);
    height: min(82%, 820px);
    overflow: hidden;
    border-radius: 1rem;
    border: 1px solid var(--border);
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 30px 90px -25px rgba(0, 0, 0, 0.75);
    container-type: inline-size;
    will-change: transform;
    animation: pwfm-rise 200ms ease-out;
}

/* Opacity-only so it never overrides the centering+drag transform. */
@keyframes pwfm-rise {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* Header */
.pwfm-header {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.4rem 1.6rem;
    border-bottom: 1px solid var(--border);
    background:
        radial-gradient(120% 140% at 0% 0%, var(--pw-accent-soft), transparent 55%),
        var(--bg-secondary);
    cursor: grab;
    user-select: none;
}
.pwfm-header.is-dragging { cursor: grabbing; }
.pwfm-grip {
    align-self: center;
    flex-shrink: 0;
    color: var(--text-tertiary);
    opacity: 0.55;
    transition: opacity 140ms;
}
.pwfm-header:hover .pwfm-grip { opacity: 0.9; }
.pwfm-header-mark {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    flex-shrink: 0;
    border-radius: 0.85rem;
    border: 1px solid var(--pw-accent-line);
    background: var(--pw-accent-soft);
    color: var(--pw-accent-bright);
}
.pwfm-header-text { min-width: 0; flex: 1; }
.pwfm-subtitle {
    margin-top: 0.4rem;
    max-width: 52ch;
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--text-secondary);
}
.pwfm-title {
    margin-top: 0.15rem;
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.1;
}
.pwfm-eyebrow {
    font-family: var(--pw-mono);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--pw-accent-bright);
}
.pwfm-close {
    flex-shrink: 0;
    padding: 0.5rem;
    border-radius: 0.6rem;
    border: 1px solid var(--border);
    background: var(--bg-primary);
    color: var(--text-secondary);
    transition: color 140ms, background 140ms;
}
.pwfm-close:hover { background: var(--bg-hover); color: var(--text-primary); }

/* Body layout */
.pwfm-body { display: flex; min-height: 0; flex: 1; }

/* Table of contents rail */
.pwfm-toc {
    flex-shrink: 0;
    width: 184px;
    padding: 1.4rem 0.9rem;
    border-right: 1px solid var(--border);
    background: var(--bg-secondary);
    overflow-y: auto;
}
.pwfm-toc-label {
    padding: 0 0.6rem;
    margin-bottom: 0.7rem;
    font-family: var(--pw-mono);
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    color: var(--text-tertiary);
}
.pwfm-toc ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.pwfm-toc-link {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    border-radius: 0.55rem;
    text-align: left;
    color: var(--text-secondary);
    transition: color 140ms, background 140ms;
}
.pwfm-toc-link:hover { background: var(--bg-hover); color: var(--text-primary); }
.pwfm-toc-link.is-active { background: var(--pw-accent-soft); color: var(--text-primary); }
.pwfm-toc-link.is-active::before {
    content: "";
    position: absolute;
    left: -0.9rem;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 1.1rem;
    border-radius: 0 3px 3px 0;
    background: var(--pw-accent);
}
.pwfm-toc-no {
    font-family: var(--pw-mono);
    font-size: 0.62rem;
    color: var(--pw-accent-bright);
    opacity: 0.85;
}
.pwfm-toc-text { font-size: 0.82rem; font-weight: 500; }

/* Scroll region */
.pwfm-scroll { flex: 1; min-width: 0; overflow-y: auto; scroll-behavior: smooth; }
.pwfm-content { padding: 1.8rem 2rem 3rem; max-width: 760px; }

/* Sections */
.pwfm-section { padding: 1.6rem 0; border-top: 1px solid var(--border); }
.pwfm-section:first-child { padding-top: 0.4rem; border-top: none; }
.pwfm-section-head { display: flex; gap: 0.9rem; margin-bottom: 1.1rem; }
.pwfm-section-no {
    font-family: var(--pw-mono);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--pw-accent);
    padding-top: 0.2rem;
}
.pwfm-section-title { font-size: 1.12rem; font-weight: 620; letter-spacing: -0.01em; }
.pwfm-section-lede { margin-top: 0.3rem; font-size: 0.86rem; line-height: 1.55; color: var(--text-secondary); }
.pwfm-section-body { font-size: 0.86rem; line-height: 1.65; color: var(--text-secondary); }
.pwfm-section-body p + p { margin-top: 0.8rem; }

/* Hero */
.pwfm-hero {
    margin-bottom: 1.3rem;
    padding: 0.5rem 0.5rem 0.2rem;
    border-radius: 1rem;
    border: 1px solid var(--border);
    background:
        radial-gradient(80% 120% at 50% 0%, var(--pw-accent-soft), transparent 60%),
        var(--bg-secondary);
}
.pwfm-orbit { display: block; width: 100%; height: auto; }
.pwfm-station-label {
    font-family: var(--pw-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    fill: var(--text-secondary);
    text-transform: uppercase;
}
.pwfm-core-label {
    font-family: var(--pw-mono);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    fill: #fff7ed;
}
.pwfm-core-sub {
    font-family: var(--pw-mono);
    font-size: 8.5px;
    letter-spacing: 0.18em;
    fill: #ffedd5;
    opacity: 0.85;
    text-transform: uppercase;
}

/* Callouts */
.pwfm-callout {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
    margin-top: 1.1rem;
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--pw-accent-line);
    background: var(--pw-accent-soft);
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--text-secondary);
}
.pwfm-callout svg { color: var(--pw-accent-bright); flex-shrink: 0; margin-top: 0.1rem; }
.pwfm-callout--quiet { border-color: var(--border); background: var(--bg-secondary); }
.pwfm-callout--quiet svg { color: var(--text-tertiary); }

/* Loop steps */
.pwfm-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.pwfm-step {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
}
.pwfm-step-no {
    display: grid;
    place-items: center;
    width: 1.55rem;
    height: 1.55rem;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid var(--pw-accent-line);
    background: var(--pw-accent-soft);
    font-family: var(--pw-mono);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--pw-accent-bright);
}
.pwfm-step-name { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); }
.pwfm-step-body { margin-top: 0.2rem; font-size: 0.82rem; line-height: 1.5; color: var(--text-secondary); }
.pwfm-step-arrow { position: absolute; right: 1rem; top: 1.05rem; color: var(--text-tertiary); }

/* Next-action ladder */
.pwfm-ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.pwfm-rung {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.62rem 0.4rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.83rem;
}
.pwfm-rung:last-child { border-bottom: none; }
.pwfm-rung-no { font-family: var(--pw-mono); font-size: 0.68rem; color: var(--text-tertiary); width: 1.4rem; }
.pwfm-rung-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.pwfm-rung-when { color: var(--text-secondary); flex: 1; min-width: 0; }
.pwfm-rung-arrow { color: var(--text-tertiary); flex-shrink: 0; }
.pwfm-rung-then { color: var(--text-primary); font-weight: 550; flex: 1; min-width: 0; }
.pwfm-note { margin-top: 1rem; font-size: 0.82rem; line-height: 1.55; color: var(--text-secondary); }

/* Surfaces grid */
.pwfm-surfaces { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
.pwfm-surface {
    padding: 0.95rem 1rem;
    border-radius: 0.8rem;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
}
.pwfm-surface-head { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.5rem; }
.pwfm-surface-head h4 { font-size: 0.86rem; font-weight: 620; color: var(--text-primary); }
.pwfm-surface-icon {
    display: grid;
    place-items: center;
    width: 1.7rem;
    height: 1.7rem;
    flex-shrink: 0;
    border-radius: 0.55rem;
    border: 1px solid var(--pw-accent-line);
    background: var(--pw-accent-soft);
    color: var(--pw-accent-bright);
}
.pwfm-surface-what { font-size: 0.8rem; line-height: 1.5; color: var(--text-secondary); }
.pwfm-surface-list { margin: 0.6rem 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
.pwfm-surface-list li {
    position: relative;
    padding-left: 0.95rem;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--text-tertiary);
}
.pwfm-surface-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.5rem;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--pw-accent);
    opacity: 0.7;
}

/* Field rows */
.pwfm-fields { display: flex; flex-direction: column; gap: 0.65rem; }
.pwfm-field {
    display: flex;
    gap: 0.8rem;
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
}
.pwfm-field-icon {
    display: grid;
    place-items: center;
    width: 1.85rem;
    height: 1.85rem;
    flex-shrink: 0;
    border-radius: 0.6rem;
    border: 1px solid var(--pw-accent-line);
    background: var(--pw-accent-soft);
    color: var(--pw-accent-bright);
}
.pwfm-field-term {
    font-family: var(--pw-mono);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-primary);
}
.pwfm-field-desc { margin-top: 0.25rem; font-size: 0.82rem; line-height: 1.55; color: var(--text-secondary); }

/* Bullets */
.pwfm-bullets { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.55rem; }
.pwfm-bullets li {
    position: relative;
    padding-left: 1.15rem;
    font-size: 0.84rem;
    line-height: 1.55;
    color: var(--text-secondary);
}
.pwfm-bullets li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.6rem;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--pw-accent);
}

.pwfm-kbd {
    display: inline-grid;
    place-items: center;
    min-width: 1.9rem;
    padding: 0.1rem 0.4rem;
    border-radius: 0.35rem;
    border: 1px solid var(--border);
    background: var(--bg-primary);
    font-family: var(--pw-mono);
    font-size: 0.7rem;
    color: var(--text-secondary);
    flex-shrink: 0;
}

/* Responsive — driven by the panel's own width so it reflows when dragged
   inside a small window, not just on small viewports. */
@container (max-width: 560px) {
    .pwfm-surfaces { grid-template-columns: 1fr; }
}
@container (max-width: 500px) {
    .pwfm-toc { display: none; }
    .pwfm-content { padding: 1.4rem 1.2rem 2.4rem; }
}
@media (max-width: 720px) {
    .pwfm-toc { display: none; }
    .pwfm-content { padding: 1.4rem 1.2rem 2.4rem; }
    .pwfm-surfaces { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
    .pwfm { animation: none; }
    .pwfm-comet, .pwfm-scroll { animation: none !important; scroll-behavior: auto; }
    .pwfm-comet animateMotion { display: none; }
}
`;
