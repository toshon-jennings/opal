import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    MessageSquare,
    BookOpen,
    HelpCircle,
    X,
    GripHorizontal,
    VolumeX,
    Code,
    SlidersHorizontal,
    Shield,
    Globe,
    Clock,
    ArrowUp,
    ArrowDown,
    Plus,
    Lock,
    Sparkles,
    ArrowRight,
    Search
} from 'lucide-react';

const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'caveman', label: 'Caveman Mode' },
    { id: 'ponytail', label: 'Ponytail Mode' },
    { id: 'research', label: 'Deep Research' },
    { id: 'features', label: 'Key Features' },
];

function Section({ id, eyebrow, title, refMap, children }) {
    return (
        <section
            id={`chg-${id}`}
            ref={(node) => { refMap.current[id] = node; }}
            className="chg-section"
        >
            <div className="chg-section-head">
                <span className="chg-section-eyebrow">{eyebrow}</span>
                <h3 className="chg-section-title">{title}</h3>
            </div>
            <div className="chg-section-body">{children}</div>
        </section>
    );
}

export function ChatGuideModal({ isOpen, onClose }) {
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
                if (visible) setActiveId(visible.target.id.replace('chg-', ''));
            },
            { root, rootMargin: '-42% 0px -50% 0px', threshold: [0, 0.25, 0.5, 1] }
        );
        Object.values(sectionRefs.current).forEach((node) => node && observer.observe(node));
        return () => observer.disconnect();
    }, [isOpen]);

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
            className="chg-backdrop"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <style>{styleBlock}</style>
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="chg-title"
                className="chg"
                style={{ transform: `translate(-50%, -50%) translate(${drag.dx}px, ${drag.dy}px)` }}
            >
                {/* Ambient atmosphere (Chat warm gradients + masked grid) */}
                <div className="chg-atmos" aria-hidden="true">
                    <span className="chg-orb chg-orb-a" />
                    <span className="chg-orb chg-orb-b" />
                    <span className="chg-mesh" />
                </div>

                {/* Header / drag handle */}
                <header
                    className={`chg-header${dragging ? ' is-dragging' : ''}`}
                    onMouseDown={startDrag}
                    title="Drag to move"
                >
                    <div className="chg-mark"><MessageSquare size={17} /></div>
                    <div className="chg-head-text">
                        <p className="chg-kicker"><BookOpen size={12} /> Chat Field Manual</p>
                        <h2 id="chg-title" className="chg-title">Chat Interface Guide</h2>
                    </div>
                    <GripHorizontal size={15} className="chg-grip" aria-hidden="true" />
                    <button type="button" onClick={onClose} className="chg-close" aria-label="Close guide">
                        <X size={15} />
                    </button>
                </header>

                {/* Pill navigation */}
                <nav className="chg-nav" aria-label="Guide sections">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => goTo(s.id)}
                            className={`chg-pill${activeId === s.id ? ' is-active' : ''}`}
                            aria-current={activeId === s.id ? 'true' : undefined}
                        >
                            {s.label}
                        </button>
                    ))}
                </nav>

                {/* Scrolling content */}
                <div className="chg-scroll" ref={scrollRef}>
                    <div className="chg-content">
                        
                        {/* Section 1: Overview */}
                        <Section
                            id="overview"
                            eyebrow="Context"
                            title="Interactive Assistant & Workspace Integrations"
                            refMap={sectionRefs}
                        >
                            <p>
                                Chat Mode is Perci's general-purpose conversation surface. It communicates
                                directly with LLM providers to answer questions, brainstorm architecture,
                                run scripts, and write code.
                            </p>
                            <p>
                                What makes Perci Chat unique is its direct connection to your local codebase and tools.
                                Instead of pasting code manually, you can attach local files, toggle search tools, and
                                configure precise code output filters right from the conversation input container.
                            </p>
                            <div className="chg-aside">
                                💡 <strong>Pro Tip:</strong> Chat is completely local-first. When configured with local
                                providers like Ollama or LM Studio, your conversations and workspace files never leave your computer.
                            </div>
                        </Section>

                        {/* Section 2: Caveman Mode */}
                        <Section
                            id="caveman"
                            eyebrow="System prompt compression"
                            title="Caveman Mode: Cut conversational fluff"
                            refMap={sectionRefs}
                        >
                            <p>
                                AI assistants can be overly chatty, writing paragraphs of introductory or transition filler
                                before showing you the output you need. <strong>Caveman Mode</strong> compresses model replies,
                                forcing the assistant to drop conversational filler without losing technical accuracy.
                            </p>

                            <div className="chg-levels-grid">
                                <div className="chg-level-card">
                                    <div className="chg-level-badge level-off">Off</div>
                                    <div className="chg-level-desc">
                                        <strong>Normal verbosity.</strong> Conversational politeness, full articles, and descriptive explanations.
                                    </div>
                                </div>

                                <div className="chg-level-card">
                                    <div className="chg-level-badge level-lite">Lite</div>
                                    <div className="chg-level-desc">
                                        <strong>Trim filler.</strong> Keeps complete sentences, but strips standard intro/outro boilerplate.
                                    </div>
                                </div>

                                <div className="chg-level-card">
                                    <div className="chg-level-badge level-full">Full</div>
                                    <div className="chg-level-desc">
                                        <strong>Classic Caveman.</strong> Drops articles (a, an, the), uses sentence fragments, and picks short synonyms. No tool narration or decorative tables.
                                    </div>
                                </div>

                                <div className="chg-level-card">
                                    <div className="chg-level-badge level-ultra">Ultra</div>
                                    <div className="chg-level-desc">
                                        <strong>Telegraphic.</strong> Abbreviates prose words (DB, auth, config, req, res, fn), drops conjunctions, and uses causal arrows (X → Y). Max density.
                                    </div>
                                </div>

                                <div className="chg-level-card">
                                    <div className="chg-level-badge level-wenyan">文言</div>
                                    <div className="chg-level-desc">
                                        <strong>Classical Chinese.</strong> Replies fully in Wenyanwen (文言文) for maximum character compression (80-90% reduction).
                                    </div>
                                </div>
                            </div>
                        </Section>

                        {/* Section 3: Ponytail Mode */}
                        <Section
                            id="ponytail"
                            eyebrow="Laziness as an engineering virtue"
                            title="Ponytail Mode: Code minimalism ladder"
                            refMap={sectionRefs}
                        >
                            <p>
                                While Caveman Mode controls <em>how the model speaks</em>, <strong>Ponytail Mode</strong> controls <em>what the model builds</em>.
                                It guides the model to adopt a "lazy senior developer" persona—climbing a strict ladder of minimalism to avoid writing redundant or speculative code.
                            </p>

                            <div className="chg-ladder">
                                <h4 className="chg-ladder-title">The Ponytail Minimalism Ladder</h4>
                                <ol className="chg-ladder-steps">
                                    <li><span>1</span> <strong>Need (YAGNI):</strong> Does this code need to exist? Skip if speculative.</li>
                                    <li><span>2</span> <strong>Reuse:</strong> Check for existing helpers, utilities, or types in the project first.</li>
                                    <li><span>3</span> <strong>Stdlib:</strong> Can standard library tools cover this?</li>
                                    <li><span>4</span> <strong>Platform Native:</strong> Prefer CSS over JS, DB constraints over app code, native inputs over UI libraries.</li>
                                    <li><span>5</span> <strong>Dependencies:</strong> Reuse existing installed dependencies; never add a new package for a 10-line task.</li>
                                    <li><span>6</span> <strong>One-Liner:</strong> Can it be a single clean line?</li>
                                    <li><span>7</span> <strong>Min Diff:</strong> Write only the bare minimum code needed to satisfy the request.</li>
                                </ol>
                            </div>

                            <div className="chg-levels-grid mt-4">
                                <div className="chg-level-card">
                                    <div className="chg-level-badge level-off">Off</div>
                                    <div className="chg-level-desc">
                                        <strong>Normal build.</strong> Standard architectural patterns and boilerplate is permitted.
                                    </div>
                                </div>

                                <div className="chg-level-card">
                                    <div className="chg-level-badge level-lite">Lite</div>
                                    <div className="chg-level-desc">
                                        <strong>Name options.</strong> Builds the requested feature, but suggests a lazier alternative in one line and asks for confirmation.
                                    </div>
                                </div>

                                <div className="chg-level-card">
                                    <div className="chg-level-badge level-full">Full</div>
                                    <div className="chg-level-desc">
                                        <strong>Enforce ladder.</strong> Enforces standard-library and native-first patterns, delivering the shortest possible git diff.
                                    </div>
                                </div>

                                <div className="chg-level-card">
                                    <div className="chg-level-badge level-ultra">Ultra</div>
                                    <div className="chg-level-desc">
                                        <strong>YAGNI extremist.</strong> Deletes code before adding it. Ships the minimum one-liner and actively questions the requirements in the response.
                                    </div>
                                </div>
                            </div>
                        </Section>

                        {/* Section 4: Deep Research */}
                        <Section
                            id="research"
                            eyebrow="Autonomous Scientist"
                            title="Deep Research Mode: Multi-page web synthesis"
                            refMap={sectionRefs}
                        >
                            <p>
                                Standard web search pulls single queries and displays plain snippets.
                                <strong>Deep Research Mode</strong> delegates the work to an autonomous scientist agent
                                that operates beyond a single search box.
                            </p>
                            <p>
                                When activated, Deep Research decomposes your main query into multiple logical
                                sub-questions, executes parallel iterative web searches, evaluates search source quality,
                                cross-verifies conflicting claims, and synthesizes the findings into a comprehensive research report.
                            </p>
                            <div className="chg-aside">
                                ✨ <strong>How to trigger:</strong> Click the <strong>Sparkles</strong> icon in the chat input bar,
                                or prefix your prompt with <code>Deep Research: </code> (e.g. <code>Deep Research: compare React and Svelte reactive systems</code>).
                            </div>
                            <p>
                                When a Deep Research run completes:
                            </p>
                            <ul className="list-disc pl-6 space-y-1.5" style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}>
                                <li>
                                    <strong>Research Paper Artifact:</strong> A beautifully formatted, multi-page document is generated
                                    and pinned to the right-hand Artifact Panel.
                                </li>
                                <li>
                                    <strong>Research Results Window:</strong> The raw queries, elapsed runtime, and list of all
                                    cross-referenced web sources are loaded into a dedicated floating panel (use the Dock to show or refocus this window).
                                </li>
                            </ul>
                        </Section>

                        {/* Section 5: Key Features */}
                        <Section
                            id="features"
                            eyebrow="Toolbar & Mechanics"
                            title="Essential Chat Toolbar Controls"
                            refMap={sectionRefs}
                        >
                            <p>
                                The bottom chat container holds specialized tools to control model behavior, manage attachments,
                                and interact with the filesystem.
                            </p>

                            <div className="chg-features-list">
                                <div className="chg-feature-row">
                                    <div className="chg-feature-icon"><Shield size={16} /></div>
                                    <div>
                                        <h5 className="chg-feature-name">Permissions Dropdown</h5>
                                        <p className="chg-feature-desc">
                                            Sets sandbox authorization. Restrict models to Read Only, Read & Write, or full Run Command capabilities depending on how much you trust the task.
                                        </p>
                                    </div>
                                </div>

                                <div className="chg-feature-row">
                                    <div className="chg-feature-icon"><Globe size={16} /></div>
                                    <div>
                                        <h5 className="chg-feature-name">Intelligent Search</h5>
                                        <p className="chg-feature-desc">
                                            Toggles real-time search queries to search the web or your documents. Feeds recent documentation and search citations directly into the LLM context.
                                        </p>
                                    </div>
                                </div>

                                <div className="chg-feature-row">
                                    <div className="chg-feature-icon"><Sparkles size={16} /></div>
                                    <div>
                                        <h5 className="chg-feature-name">Deep Research Scientist</h5>
                                        <p className="chg-feature-desc">
                                            Toggles multi-query iterative deep search. Decomposes prompts, crawls web engines, cross-verifies facts, and synthesizes structured reports as artifacts.
                                        </p>
                                    </div>
                                </div>

                                <div className="chg-feature-row">
                                    <div className="chg-feature-icon"><Clock size={16} /></div>
                                    <div>
                                        <h5 className="chg-feature-name">Prompt History</h5>
                                        <p className="chg-feature-desc">
                                            The clock icon opens a dropdown of recently sent prompts, letting you restore complex prompt patterns without re-typing.
                                        </p>
                                    </div>
                                </div>

                                <div className="chg-feature-row">
                                    <div className="chg-feature-icon flex flex-col -space-y-1"><ArrowUp size={10} /><ArrowDown size={10} /></div>
                                    <div>
                                        <h5 className="chg-feature-name">Prompt Navigation</h5>
                                        <p className="chg-feature-desc">
                                            Navigate through past prompts in this session using up and down buttons, similar to your terminal's history recall.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Section>

                    </div>
                </div>
            </div>
        </div>
    );
}

const GUIDE_STYLES = `
.chg,
.chg-backdrop {
    --chg-accent: #f97316;
    --chg-accent-soft: color-mix(in srgb, #f97316 16%, transparent);
    --chg-accent-line: color-mix(in srgb, #f97316 32%, transparent);
    --chg-line: color-mix(in srgb, var(--border) 80%, var(--text-primary));
    --chg-panel: color-mix(in srgb, var(--bg-secondary) 94%, var(--text-primary) 6%);
    --chg-panel-strong: color-mix(in srgb, var(--bg-tertiary, var(--bg-secondary)) 90%, var(--text-primary) 10%);
    --chg-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
}

.chg-backdrop {
    position: absolute;
    inset: 0;
    z-index: 9999;
    overflow: hidden;
    border-radius: inherit;
    background: color-mix(in srgb, var(--bg-primary) 55%, rgba(8, 12, 16, 0.7));
    backdrop-filter: blur(4px);
}

.chg {
    position: absolute;
    left: 50%;
    top: 50%;
    display: flex;
    flex-direction: column;
    width: min(86%, 860px);
    height: min(84%, 740px);
    overflow: hidden;
    border-radius: 16px;
    border: 1px solid var(--chg-line);
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 36px 110px -30px rgba(0, 0, 0, 0.75);
    container-type: inline-size;
    will-change: transform;
    animation: chg-rise 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes chg-rise { from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

/* Atmosphere decoration */
.chg-atmos { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.chg-orb { position: absolute; border-radius: 50%; filter: blur(72px); opacity: 0.4; animation: chg-float 20s ease-in-out infinite; }
.chg-orb-a { width: 360px; height: 360px; top: -150px; left: -90px; background: radial-gradient(circle, var(--chg-accent-soft), transparent 70%); }
.chg-orb-b { width: 300px; height: 300px; right: -90px; bottom: -130px; background: radial-gradient(circle, color-mix(in srgb, var(--text-primary) 10%, transparent), transparent 70%); animation-delay: -7s; }
.chg-mesh {
    position: absolute; inset: 0;
    background-image:
        linear-gradient(color-mix(in srgb, var(--chg-accent) 6%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--chg-accent) 6%, transparent) 1px, transparent 1px);
    background-size: 46px 46px;
    mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%);
}
@keyframes chg-float { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(24px, -16px) scale(1.05); } }

/* Header */
.chg-header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 24px;
    border-bottom: 1px solid var(--chg-line);
    background: var(--chg-panel-strong);
    cursor: grab;
    user-select: none;
    z-index: 10;
}
.chg-header.is-dragging { cursor: grabbing; }
.chg-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--chg-accent);
    color: white;
    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.35);
}
.chg-head-text { flex: 1; min-width: 0; }
.chg-kicker {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--chg-accent);
}
.chg-title {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text-primary);
    margin-top: 1px;
}
.chg-grip { color: var(--text-tertiary); opacity: 0.5; margin-right: 8px; }
.chg-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.chg-close:hover { 
    background: var(--bg-hover); 
    color: var(--text-primary); 
    transform: scale(1.08); 
}
.chg-close:active {
    transform: scale(0.92);
}
.chg-close svg {
    transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.chg-close:hover svg {
    transform: rotate(90deg);
}

/* Navigation */
.chg-nav {
    display: flex;
    gap: 8px;
    padding: 12px 24px;
    border-bottom: 1px solid var(--chg-line);
    background: var(--bg-secondary);
    overflow-x: auto;
    z-index: 10;
}
.chg-pill {
    flex-shrink: 0;
    padding: 6px 14px;
    border: 1px solid var(--chg-line);
    border-radius: 30px;
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.18s, color 0.18s, background-color 0.18s, transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.18s;
}
.chg-pill:hover { 
    border-color: var(--text-tertiary); 
    color: var(--text-primary); 
    transform: translateY(-1.5px);
}
.chg-pill:active {
    transform: translateY(0) scale(0.96);
}
.chg-pill.is-active {
    background: var(--chg-accent);
    border-color: var(--chg-accent);
    color: white;
    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.25);
}
.chg-pill.is-active:hover {
    background: color-mix(in srgb, var(--chg-accent) 92%, white);
    box-shadow: 0 6px 16px rgba(249, 115, 22, 0.35);
}

/* Scroll area */
.chg-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 24px;
    z-index: 5;
}
.chg-content {
    display: flex;
    flex-direction: column;
    gap: 36px;
    max-width: 760px;
    margin: 0 auto;
}

/* Sections */
.chg-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    scroll-margin-top: 16px;
}
.chg-section-head {
    border-left: 3px solid var(--chg-accent);
    padding-left: 12px;
}
.chg-section-eyebrow {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
}
.chg-section-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
    margin-top: 2px;
}
.chg-section-body {
    font-size: 14px;
    line-height: 1.65;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.chg-aside {
    padding: 14px 18px;
    border-radius: 10px;
    border: 1px solid var(--chg-accent-line);
    background: var(--chg-accent-soft);
    color: var(--text-primary);
    font-size: 13.5px;
    line-height: 1.6;
    transition: transform 0.2s, box-shadow 0.2s;
}
.chg-aside:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.06);
}

/* Caveman & Ponytail levels */
.chg-levels-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-top: 8px;
}
.chg-level-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--chg-panel);
    transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.2s, box-shadow 0.2s;
}
.chg-level-card:hover {
    transform: translateY(-2px) scale(1.02);
    border-color: var(--chg-accent-line);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}
.chg-level-badge {
    align-self: flex-start;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: white;
}
.chg-level-badge.level-off { background: #6b7280; }
.chg-level-badge.level-lite { background: #3b82f6; }
.chg-level-badge.level-full { background: #f97316; }
.chg-level-badge.level-ultra { background: #dc2626; }
.chg-level-badge.level-wenyan { background: #8b5cf6; }

.chg-level-desc {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-secondary);
}

/* Ladder of code minimalism */
.chg-ladder {
    padding: 18px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--chg-panel-strong);
}
.chg-ladder-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 12px;
}
.chg-ladder-steps {
    display: flex;
    flex-direction: column;
    gap: 10px;
    list-style: none;
    padding: 0;
    margin: 0;
}
.chg-ladder-steps li {
    display: flex;
    gap: 12px;
    font-size: 13.5px;
    line-height: 1.5;
    transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.2s;
}
.chg-ladder-steps li:hover {
    transform: translateX(4px);
    color: var(--text-primary);
}
.chg-ladder-steps li span {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--chg-accent);
    color: white;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(249, 115, 22, 0.2);
    transition: transform 0.2s ease, background-color 0.2s;
}
.chg-ladder-steps li:hover span {
    transform: scale(1.15) rotate(10deg);
    background: color-mix(in srgb, var(--chg-accent) 80%, white);
}

/* Features list */
.chg-features-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 8px;
}
.chg-feature-row {
    display: flex;
    gap: 16px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--chg-panel);
    transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.2s, box-shadow 0.2s;
}
.chg-feature-row:hover {
    transform: translateY(-2px) scale(1.015);
    border-color: var(--chg-accent-line);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}
.chg-feature-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--chg-accent-soft);
    color: var(--chg-accent);
    flex-shrink: 0;
    transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.chg-feature-row:hover .chg-feature-icon {
    transform: scale(1.1) rotate(-8deg);
}
.chg-feature-name {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 2px;
}
.chg-feature-desc {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-secondary);
}
`;
