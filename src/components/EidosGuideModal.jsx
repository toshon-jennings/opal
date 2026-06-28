import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    Boxes,
    Brain,
    ExternalLink,
    GitBranch,
    Github,
    GripHorizontal,
    Layers,
    LifeBuoy,
    Power,
    RefreshCw,
    X,
} from 'lucide-react';

/*
 * Eidos — Field Guide.
 *
 * Deliberately NOT the Power Workspace / Mode field-manual look. This guide
 * borrows Eidos's own character: a calm, achromatic-slate observatory with a
 * soft-cyan telemetry accent, ambient orbs over a masked grid, uppercase
 * micro-labels, and a memory heat-grid signature instead of an orbit. Top pill
 * navigation replaces the numbered left rail. Scoped under `.eidg` with
 * `--eidg-*` tokens.
 */

const SECTIONS = [
    { id: 'what', label: 'Overview' },
    { id: 'boot', label: 'Startup' },
    { id: 'surfaces', label: 'Surfaces' },
    { id: 'visualizer', label: 'Visualizer' },
    { id: 'memory', label: 'Memory' },
    { id: 'help', label: 'When it sticks' },
];

const BOOT_STEPS = [
    { label: 'Check OrbStack / Docker', detail: 'Confirms a container runtime is installed and reachable.' },
    { label: 'Start the Docker runtime', detail: 'Wakes the engine if it is installed but not running.' },
    { label: 'Pull & start containers', detail: 'Brings up the Eidos services from the local compose stack.' },
    { label: 'Wait for the Eidos API', detail: 'Polls until the API answers, then opens the dashboard.' },
];

const KPIS = [
    { label: 'Open commits', meaning: 'Commits made locally that the remote has not seen yet — work waiting to be pushed.' },
    { label: 'Changed files', meaning: 'Uncommitted edits in the working tree across your active repos.' },
    { label: 'Need pull', meaning: 'Repos behind their remote, plus how many have gone stale.' },
    { label: 'Tracked repos', meaning: 'Everything Eidos is watching, and how many branches are live.' },
];

const STACK_BANDS = [
    { id: 'dirty', label: 'Changed', meaning: 'uncommitted edits' },
    { id: 'ahead', label: 'Open commits', meaning: 'ahead of remote' },
    { id: 'behind', label: 'Behind', meaning: 'remote is ahead' },
];

// Deterministic intensity so the hero mosaic is stable between renders.
const GRID_COLS = 16;
const GRID_ROWS = 7;
function cellIntensity(row, col) {
    const h = Math.sin((row * 12.9898 + col * 78.233) * 1.17) * 43758.5453;
    return h - Math.floor(h); // 0..1
}

function MemoryGrid() {
    const cells = [];
    for (let r = 0; r < GRID_ROWS; r += 1) {
        for (let c = 0; c < GRID_COLS; c += 1) {
            const v = cellIntensity(r, c);
            // Bucket into four legible levels, like a contribution graph.
            const level = v > 0.82 ? 4 : v > 0.62 ? 3 : v > 0.4 ? 2 : v > 0.2 ? 1 : 0;
            cells.push(
                <span
                    key={`${r}-${c}`}
                    className="eidg-cell"
                    data-level={level}
                    style={{ animationDelay: `${((r + c) % 9) * 0.22}s` }}
                />
            );
        }
    }
    return (
        <div className="eidg-grid" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}>
            {cells}
        </div>
    );
}

function Section({ id, eyebrow, title, refMap, children }) {
    return (
        <section
            id={`eidg-${id}`}
            ref={(node) => { refMap.current[id] = node; }}
            className="eidg-section"
        >
            <p className="eidg-eyebrow">{eyebrow}</p>
            <h3 className="eidg-h">{title}</h3>
            <div className="eidg-body">{children}</div>
        </section>
    );
}

export function EidosGuideModal({ isOpen, onClose }) {
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

    useEffect(() => {
        if (!isOpen) return undefined;
        const root = scrollRef.current;
        if (!root || typeof IntersectionObserver === 'undefined') return undefined;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (visible) setActiveId(visible.target.id.replace('eidg-', ''));
            },
            { root, rootMargin: '-42% 0px -50% 0px', threshold: [0, 0.25, 0.5, 1] }
        );
        Object.values(sectionRefs.current).forEach((node) => node && observer.observe(node));
        return () => observer.disconnect();
    }, [isOpen]);

    // Drag by the header, clamped inside the Eidos window.
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

    const goTo = (id) => {
        const node = sectionRefs.current[id];
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const styleBlock = useMemo(() => GUIDE_STYLES, []);

    if (!isOpen) return null;

    return (
        <div
            className="eidg-backdrop"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <style>{styleBlock}</style>
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="eidg-title"
                className="eidg"
                style={{ transform: `translate(-50%, -50%) translate(${drag.dx}px, ${drag.dy}px)` }}
            >
                {/* Ambient Eidos atmosphere */}
                <div className="eidg-atmos" aria-hidden="true">
                    <span className="eidg-orb eidg-orb-a" />
                    <span className="eidg-orb eidg-orb-b" />
                    <span className="eidg-mesh" />
                </div>

                {/* Header / drag handle */}
                <header
                    className={`eidg-header${dragging ? ' is-dragging' : ''}`}
                    onMouseDown={startDrag}
                    title="Drag to move"
                >
                    <div className="eidg-mark"><Boxes size={17} /></div>
                    <div className="eidg-head-text">
                        <p className="eidg-kicker"><LifeBuoy size={12} /> Eidos field guide</p>
                        <h2 id="eidg-title" className="eidg-title">Eidos</h2>
                    </div>
                    <GripHorizontal size={15} className="eidg-grip" aria-hidden="true" />
                    <button type="button" onClick={onClose} className="eidg-close" aria-label="Close guide">
                        <X size={15} />
                    </button>
                </header>

                {/* Pill navigation */}
                <nav className="eidg-nav" aria-label="Guide sections">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => goTo(s.id)}
                            className={`eidg-pill${activeId === s.id ? ' is-active' : ''}`}
                            aria-current={activeId === s.id ? 'true' : undefined}
                        >
                            {s.label}
                        </button>
                    ))}
                </nav>

                {/* Scrolling content */}
                <div className="eidg-scroll" ref={scrollRef}>
                    <div className="eidg-content">
                        <Section
                            id="what"
                            eyebrow="The stack"
                            title="A memory engine that runs on your machine"
                            refMap={sectionRefs}
                        >
                            <div className="eidg-hero">
                                <MemoryGrid />
                                <div className="eidg-hero-cap">
                                    <span className="eidg-hero-low">quiet</span>
                                    <span className="eidg-hero-track" />
                                    <span className="eidg-hero-high">active</span>
                                </div>
                            </div>
                            <p>
                                Eidos is a persistent-memory service Perci runs for you as a local Docker
                                stack. Open this window and it boots itself, then settles into two views: a
                                <strong> Git Visualizer</strong> that reads the live state of your local
                                repositories, and the full <strong>Eidos dashboard</strong> embedded straight
                                from <code> localhost:3000</code>.
                            </p>
                            <p className="eidg-aside">
                                Everything runs locally inside OrbStack or Docker. Nothing here leaves your
                                machine.
                            </p>
                        </Section>

                        <Section id="boot" eyebrow="Startup" title="How it comes online" refMap={sectionRefs}>
                            <ol className="eidg-steps">
                                {BOOT_STEPS.map((step, i) => (
                                    <li key={step.label} className="eidg-step">
                                        <span className="eidg-step-no">{i + 1}</span>
                                        <div>
                                            <div className="eidg-step-name">{step.label}</div>
                                            <p className="eidg-step-detail">{step.detail}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                            <div className="eidg-note">
                                <Power size={15} />
                                <span>
                                    Eidos needs OrbStack or Docker and only runs in the desktop app. If a step
                                    fails you get an error with <strong>Retry</strong>, plus an
                                    <strong> Install OrbStack</strong> link when the runtime is missing.
                                </span>
                            </div>
                        </Section>

                        <Section id="surfaces" eyebrow="Two views" title="Dashboard and Overview" refMap={sectionRefs}>
                            <div className="eidg-split">
                                <article className="eidg-card">
                                    <div className="eidg-card-head"><Layers size={15} /><h4>Dashboard</h4></div>
                                    <p>
                                        The full Eidos web app, live in an embedded frame. Its toolbar holds
                                        <strong> Overview</strong> (switch views), <strong>Reload dashboard</strong>,
                                        and <strong>Open in browser</strong>.
                                    </p>
                                </article>
                                <article className="eidg-card">
                                    <div className="eidg-card-head"><Github size={15} /><h4>Overview</h4></div>
                                    <p>
                                        The native Git Visualizer — an at-a-glance read of your repositories that
                                        refreshes itself every 30 seconds, or on demand with <strong>Refresh</strong>.
                                    </p>
                                </article>
                            </div>
                            <p className="eidg-aside">Switch between the two at any time; the stack keeps running underneath.</p>
                        </Section>

                        <Section id="visualizer" eyebrow="Reading the room" title="What the Git Visualizer shows" refMap={sectionRefs}>
                            <p className="eidg-lead">Four headline numbers sit across the top:</p>
                            <dl className="eidg-kpis">
                                {KPIS.map((k) => (
                                    <div key={k.label} className="eidg-kpi">
                                        <dt>{k.label}</dt>
                                        <dd>{k.meaning}</dd>
                                    </div>
                                ))}
                            </dl>

                            <p className="eidg-lead">Each repo that needs attention shows a single bar — read it left to right:</p>
                            <div className="eidg-legend">
                                <div className="eidg-legend-bar" aria-hidden="true">
                                    <span className="is-dirty" style={{ width: '38%' }} />
                                    <span className="is-ahead" style={{ width: '34%' }} />
                                    <span className="is-behind" style={{ width: '28%' }} />
                                </div>
                                <ul className="eidg-legend-keys">
                                    {STACK_BANDS.map((b) => (
                                        <li key={b.id}>
                                            <span className={`eidg-key-dot is-${b.id}`} />
                                            <strong>{b.label}</strong>
                                            <em>{b.meaning}</em>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="eidg-split">
                                <article className="eidg-card">
                                    <div className="eidg-card-head"><Activity size={15} /><h4>Service heartbeat</h4></div>
                                    <p>API and dashboard show <strong>online</strong> or <strong>offline</strong>, next to the active runtime.</p>
                                </article>
                                <article className="eidg-card">
                                    <div className="eidg-card-head"><GitBranch size={15} /><h4>Repository matrix</h4></div>
                                    <p>Every tracked repo as a tile — <strong>hot</strong> when it has open work, <strong>cool</strong> when it is clean.</p>
                                </article>
                            </div>
                            <p className="eidg-aside">Up top, the <strong>GitHub contribution graph</strong> tracks a year of your public GitHub activity — a different signal from the live local repo state in the cards above it. The footer tallies the folders and Git Shells projects Eidos scanned.</p>
                        </Section>

                        <Section id="memory" eyebrow="Underneath" title="The memory layer" refMap={sectionRefs}>
                            <div className="eidg-card eidg-card-feature">
                                <div className="eidg-card-head"><Brain size={15} /><h4>More than git insight</h4></div>
                                <p>
                                    The Git Visualizer is one lens, but Eidos is fundamentally Perci&apos;s long-term
                                    memory. Agents <strong>store</strong>, <strong>retrieve</strong>, and
                                    <strong> review</strong> memories through it, and keep evaluation baselines so
                                    results stay comparable over time. The embedded dashboard is where that memory
                                    actually lives.
                                </p>
                            </div>
                        </Section>

                        <Section id="help" eyebrow="When it sticks" title="If it won't start" refMap={sectionRefs}>
                            <ul className="eidg-bullets">
                                <li><strong>&ldquo;Eidos could not start.&rdquo;</strong> Usually OrbStack or Docker isn&apos;t running. Install OrbStack, then hit Retry.</li>
                                <li><strong>Dashboard blank?</strong> Use Reload dashboard, or Open in browser to confirm the stack is up at <code>localhost:3000</code>.</li>
                                <li><strong>On the web build?</strong> Eidos only runs in the desktop app — the browser shows a notice instead.</li>
                                <li>The stack and all its data live in your local Docker / OrbStack VM, never in the repo.</li>
                            </ul>
                            <div className="eidg-note eidg-note-quiet">
                                <RefreshCw size={14} />
                                <span><span className="eidg-kbd">Esc</span> closes this guide. Reopen it any time from the Eidos toolbar.</span>
                            </div>
                        </Section>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Scoped styles. Everything under `.eidg*`. Achromatic-slate with a soft-cyan
// telemetry accent so the guide reads as Eidos, not Power Workspace.
// ---------------------------------------------------------------------------

const GUIDE_STYLES = `
.eidg,
.eidg-backdrop {
    --eidg-accent: #57b6c9;
    --eidg-accent-soft: color-mix(in srgb, #57b6c9 16%, transparent);
    --eidg-accent-line: color-mix(in srgb, #57b6c9 32%, transparent);
    --eidg-line: color-mix(in srgb, var(--border) 80%, var(--text-primary));
    --eidg-panel: color-mix(in srgb, var(--bg-secondary) 94%, var(--text-primary) 6%);
    --eidg-panel-strong: color-mix(in srgb, var(--bg-tertiary, var(--bg-secondary)) 90%, var(--text-primary) 10%);
    --eidg-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
}

.eidg-backdrop {
    position: absolute;
    inset: 0;
    z-index: 30;
    overflow: hidden;
    border-radius: inherit;
    background: color-mix(in srgb, var(--bg-primary) 55%, rgba(8, 12, 16, 0.7));
    backdrop-filter: blur(4px);
}

.eidg {
    position: absolute;
    left: 50%;
    top: 50%;
    display: flex;
    flex-direction: column;
    width: min(86%, 900px);
    height: min(84%, 780px);
    overflow: hidden;
    border-radius: 16px;
    border: 1px solid var(--eidg-line);
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 36px 110px -30px rgba(0, 0, 0, 0.75);
    container-type: inline-size;
    will-change: transform;
    animation: eidg-rise 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes eidg-rise { from { opacity: 0; } to { opacity: 1; } }

/* Ambient atmosphere (Eidos orbs + masked grid) */
.eidg-atmos { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.eidg-orb { position: absolute; border-radius: 50%; filter: blur(72px); opacity: 0.5; animation: eidg-float 20s ease-in-out infinite; }
.eidg-orb-a { width: 360px; height: 360px; top: -150px; left: -90px; background: radial-gradient(circle, var(--eidg-accent-soft), transparent 70%); }
.eidg-orb-b { width: 300px; height: 300px; right: -90px; bottom: -130px; background: radial-gradient(circle, color-mix(in srgb, var(--text-primary) 10%, transparent), transparent 70%); animation-delay: -7s; }
.eidg-mesh {
    position: absolute; inset: 0;
    background-image:
        linear-gradient(color-mix(in srgb, var(--eidg-accent) 8%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--eidg-accent) 8%, transparent) 1px, transparent 1px);
    background-size: 46px 46px;
    mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%);
}
@keyframes eidg-float { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(24px, -16px) scale(1.05); } }

/* Header */
.eidg-header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 1.05rem 1.3rem;
    border-bottom: 1px solid var(--eidg-line);
    cursor: grab;
    user-select: none;
}
.eidg-header.is-dragging { cursor: grabbing; }
.eidg-mark {
    display: grid; place-items: center;
    width: 2.4rem; height: 2.4rem; flex-shrink: 0;
    border-radius: 0.7rem;
    border: 1px solid var(--eidg-accent-line);
    background: var(--eidg-accent-soft);
    color: var(--eidg-accent);
}
.eidg-head-text { flex: 1; min-width: 0; }
.eidg-kicker {
    display: inline-flex; align-items: center; gap: 6px;
    margin: 0;
    font-size: 0.62rem; font-weight: 700;
    letter-spacing: 0.2em; text-transform: uppercase;
    color: color-mix(in srgb, var(--eidg-accent) 70%, var(--text-secondary));
}
.eidg-kicker svg { color: var(--eidg-accent); }
.eidg-title { margin: 0.15rem 0 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; line-height: 1; }
.eidg-grip { color: var(--text-tertiary); opacity: 0.55; flex-shrink: 0; transition: opacity 140ms; }
.eidg-header:hover .eidg-grip { opacity: 0.9; }
.eidg-close {
    flex-shrink: 0; padding: 0.45rem; border-radius: 0.55rem;
    border: 1px solid var(--eidg-line); background: var(--bg-primary);
    color: var(--text-secondary); transition: color 140ms, background 140ms;
}
.eidg-close:hover { background: var(--bg-hover); color: var(--text-primary); }

/* Pill nav */
.eidg-nav {
    position: relative;
    display: flex; gap: 0.4rem; flex-wrap: wrap;
    padding: 0.7rem 1.3rem;
    border-bottom: 1px solid var(--eidg-line);
    background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
}
.eidg-pill {
    padding: 0.34rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--eidg-line);
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 0.72rem; font-weight: 600;
    letter-spacing: 0.02em;
    transition: color 140ms, border-color 140ms, background 140ms;
}
.eidg-pill:hover { color: var(--text-primary); border-color: color-mix(in srgb, var(--eidg-accent) 40%, var(--border)); }
.eidg-pill.is-active {
    color: var(--bg-primary);
    background: var(--eidg-accent);
    border-color: transparent;
}

/* Scroll body */
.eidg-scroll { position: relative; flex: 1; min-height: 0; overflow-y: auto; scroll-behavior: smooth; }
.eidg-content { padding: 1.6rem 1.8rem 2.6rem; max-width: 720px; }

.eidg-section { padding: 1.5rem 0; border-top: 1px solid var(--eidg-line); }
.eidg-section:first-child { padding-top: 0.3rem; border-top: none; }
.eidg-eyebrow {
    margin: 0 0 0.45rem;
    font-size: 0.6rem; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: color-mix(in srgb, var(--eidg-accent) 60%, var(--text-tertiary));
}
.eidg-h { margin: 0 0 0.9rem; font-size: 1.22rem; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2; }
.eidg-body { font-size: 0.86rem; line-height: 1.66; color: var(--text-secondary); }
.eidg-body p + p { margin-top: 0.75rem; }
.eidg-body strong { color: var(--text-primary); font-weight: 600; }
.eidg-body code {
    font-family: var(--eidg-mono); font-size: 0.78em;
    padding: 0.05rem 0.35rem; border-radius: 0.3rem;
    background: var(--eidg-panel-strong);
    color: color-mix(in srgb, var(--eidg-accent) 60%, var(--text-primary));
}
.eidg-lead { color: var(--text-primary); font-weight: 500; }
.eidg-aside { font-size: 0.8rem; color: var(--text-tertiary); }

/* Hero memory grid */
.eidg-hero {
    margin-bottom: 1.2rem;
    padding: 1.1rem 1.2rem 0.9rem;
    border-radius: 0.9rem;
    border: 1px solid var(--eidg-accent-line);
    background:
        linear-gradient(135deg, var(--eidg-accent-soft), transparent 45%),
        var(--eidg-panel);
}
.eidg-grid { display: grid; gap: 4px; }
.eidg-cell {
    aspect-ratio: 1 / 1;
    border-radius: 2.5px;
    background: var(--eidg-accent);
    animation: eidg-pulse 4.5s ease-in-out infinite;
}
.eidg-cell[data-level='0'] { opacity: 0.07; }
.eidg-cell[data-level='1'] { opacity: 0.22; }
.eidg-cell[data-level='2'] { opacity: 0.42; }
.eidg-cell[data-level='3'] { opacity: 0.66; }
.eidg-cell[data-level='4'] { opacity: 0.92; }
@keyframes eidg-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); filter: brightness(1.25); } }
.eidg-hero-cap {
    margin-top: 0.7rem;
    display: flex; align-items: center; gap: 0.6rem;
    font-size: 0.6rem; font-weight: 700;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--text-tertiary);
}
.eidg-hero-track {
    flex: 1; height: 3px; border-radius: 999px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--eidg-accent) 12%, transparent), var(--eidg-accent));
}

/* Steps */
.eidg-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.eidg-step {
    display: flex; align-items: flex-start; gap: 0.8rem;
    padding: 0.75rem 0.9rem;
    border-radius: 0.7rem;
    border: 1px solid var(--eidg-line);
    background: var(--eidg-panel);
}
.eidg-step-no {
    display: grid; place-items: center;
    width: 1.5rem; height: 1.5rem; flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid var(--eidg-accent-line);
    background: var(--eidg-accent-soft);
    font-family: var(--eidg-mono); font-size: 0.7rem; font-weight: 600;
    color: var(--eidg-accent);
}
.eidg-step-name { font-size: 0.88rem; font-weight: 600; color: var(--text-primary); }
.eidg-step-detail { margin: 0.15rem 0 0; font-size: 0.8rem; line-height: 1.5; color: var(--text-secondary); }

/* Cards / split */
.eidg-split { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin: 0.9rem 0; }
.eidg-card {
    padding: 0.85rem 0.95rem;
    border-radius: 0.75rem;
    border: 1px solid var(--eidg-line);
    background: var(--eidg-panel);
    backdrop-filter: blur(8px);
}
.eidg-card-feature { margin-top: 0.4rem; border-color: var(--eidg-accent-line); }
.eidg-card-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.45rem; color: var(--eidg-accent); }
.eidg-card-head h4 { margin: 0; font-size: 0.84rem; font-weight: 650; color: var(--text-primary); }
.eidg-card p { font-size: 0.8rem; line-height: 1.55; color: var(--text-secondary); }

/* KPI definitions */
.eidg-kpis { margin: 0.7rem 0 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.eidg-kpi {
    padding: 0.7rem 0.8rem;
    border-radius: 0.65rem;
    border: 1px solid var(--eidg-line);
    background: var(--eidg-panel);
}
.eidg-kpi dt {
    font-size: 0.62rem; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: color-mix(in srgb, var(--eidg-accent) 64%, var(--text-tertiary));
}
.eidg-kpi dd { margin: 0.3rem 0 0; font-size: 0.78rem; line-height: 1.45; color: var(--text-secondary); }

/* Stack-bar legend */
.eidg-legend { margin: 0.7rem 0 1rem; padding: 0.9rem; border-radius: 0.75rem; border: 1px solid var(--eidg-line); background: var(--eidg-panel); }
.eidg-legend-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; border: 1px solid var(--eidg-line); background: var(--bg-primary); }
.eidg-legend-bar .is-dirty { background: linear-gradient(90deg, #57b6c9, #4f9bb0); }
.eidg-legend-bar .is-ahead { background: linear-gradient(90deg, #6f9bd6, #57b6c9); }
.eidg-legend-bar .is-behind { background: linear-gradient(90deg, #c9a45a, #b98f6f); }
.eidg-legend-keys { list-style: none; margin: 0.7rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.6rem 1.1rem; }
.eidg-legend-keys li { display: flex; align-items: center; gap: 0.4rem; font-size: 0.76rem; color: var(--text-secondary); }
.eidg-legend-keys strong { color: var(--text-primary); font-weight: 600; }
.eidg-legend-keys em { font-style: normal; color: var(--text-tertiary); }
.eidg-key-dot { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
.eidg-key-dot.is-dirty { background: #57b6c9; }
.eidg-key-dot.is-ahead { background: #6f9bd6; }
.eidg-key-dot.is-behind { background: #c9a45a; }

/* Notes / bullets */
.eidg-note {
    display: flex; gap: 0.7rem; align-items: flex-start;
    margin-top: 1rem; padding: 0.8rem 0.95rem;
    border-radius: 0.7rem;
    border: 1px solid var(--eidg-accent-line);
    background: var(--eidg-accent-soft);
    font-size: 0.8rem; line-height: 1.55; color: var(--text-secondary);
}
.eidg-note svg { color: var(--eidg-accent); flex-shrink: 0; margin-top: 0.1rem; }
.eidg-note-quiet { border-color: var(--eidg-line); background: var(--eidg-panel); }
.eidg-note-quiet svg { color: var(--text-tertiary); }
.eidg-bullets { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.55rem; }
.eidg-bullets li { position: relative; padding-left: 1.1rem; font-size: 0.83rem; line-height: 1.55; color: var(--text-secondary); }
.eidg-bullets li::before {
    content: ""; position: absolute; left: 0; top: 0.55rem;
    width: 6px; height: 6px; border-radius: 2px; background: var(--eidg-accent);
}
.eidg-kbd {
    display: inline-grid; place-items: center;
    min-width: 1.8rem; padding: 0.05rem 0.35rem;
    border-radius: 0.3rem; border: 1px solid var(--eidg-line);
    background: var(--bg-primary);
    font-family: var(--eidg-mono); font-size: 0.68rem; color: var(--text-secondary);
}

/* Responsive — by panel width so it reflows when dragged in a small window */
@container (max-width: 560px) {
    .eidg-split, .eidg-kpis { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
    .eidg-content { padding: 1.3rem 1.1rem 2.2rem; }
    .eidg-split, .eidg-kpis { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
    .eidg, .eidg-orb, .eidg-cell { animation: none !important; }
    .eidg-scroll { scroll-behavior: auto; }
}
`;
