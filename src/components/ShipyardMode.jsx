import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Settings2, Ship, StickyNote, ListTodo, History, MessageCircle, Send, Square, Trash2, GitBranch, ExternalLink, Cat, HelpCircle } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useMode } from '../context/ModeContext';
import { LLMFactory } from '../lib/llm/clients';
import {
    ASSERTIVENESS_LEVELS, RAIL_COLUMNS,
    readShipyardState, subscribeShipyard, getActiveProject, getProjectColumns,
    createProject, setActiveProject, updateProjectMeta, setPetEnabled, setProjectNotes,
    addCard, updateCard, deleteCard, moveCard,
    executeRailAction, dispatchCardToJules, refreshJulesStatuses,
    setProjectChat, runPmAgentTurn,
} from '../lib/shipyard';
import { getWorkspaceContextSummary } from '../lib/perciContext';
import { readMissionRuns } from '../lib/missionControl';
import './ShipyardMode.css';

const PRIORITY_HUES = { low: '#94a3b8', medium: '#f59e0b', high: '#ef4444' };

// Detect the GitHub remote + branch of a local repo folder through the
// existing run-local-command IPC (workspace-scoped, shell-free).
async function detectRepo(repoPath) {
    if (!window.electron?.runLocalCommand || !repoPath) return {};
    try {
        await window.electron.registerWorkspace?.(repoPath);
        const remote = await window.electron.runLocalCommand('git', ['remote', 'get-url', 'origin'], repoPath);
        const branch = await window.electron.runLocalCommand('git', ['branch', '--show-current'], repoPath);
        const url = (remote?.output || '').trim();
        const match = url.match(/github\.com[/:]([^/]+\/[^/\s]+?)(?:\.git)?$/);
        return {
            repoFullName: match ? match[1] : '',
            branch: (branch?.output || '').trim() || 'main',
        };
    } catch {
        return {};
    }
}

function CardChip({ card }) {
    const git = card.git;
    const jules = card.jules;
    return (
        <>
            {git && (
                <span className={`sy-chip sy-chip-git is-${git.status}`} title={git.detail || git.action}>
                    <GitBranch size={11} />
                    {git.status === 'working' ? `${git.action}…` : git.status === 'ok' ? git.detail : `${git.action} failed`}
                </span>
            )}
            {jules && (
                <span className={`sy-chip sy-chip-jules is-${jules.status || 'pending'}`} title={`Jules: ${jules.status || 'pending'}`}>
                    Jules · {jules.status || 'pending'}
                </span>
            )}
            {jules?.prUrl && (
                <button
                    type="button"
                    className="sy-chip sy-chip-pr"
                    onClick={(e) => { e.stopPropagation(); window.electron?.openExternal?.(jules.prUrl); }}
                >
                    <ExternalLink size={11} /> PR
                </button>
            )}
        </>
    );
}

function ShipyardGuide({ open, onClose }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open) return null;
    return (
        <div className="sy-modal-backdrop" onClick={onClose}>
            <div className="sy-modal sy-modal-wide sy-guide" onClick={e => e.stopPropagation()}>
                <h3><Ship size={15} className="sy-guide-title-icon" /> Shipyard guide</h3>

                <section className="sy-guide-section">
                    <h4>The board</h4>
                    <p>Flow columns (Backlog, In Progress, Review, Done by default — edit them anytime, or ask Perci to) hold your cards. Drag a card between flow columns, use <strong>+ Add card</strong> at the bottom of a column for a quick title, or click a card to open the full editor for description, file list, and priority.</p>
                </section>

                <section className="sy-guide-section">
                    <h4>The GitHub rail</h4>
                    <p>Four fixed columns on the right run real git commands when you drop a card on them:</p>
                    <ul>
                        <li><strong>Stage</strong> — <code>git add</code> the card&rsquo;s files (or everything, if the card has no files listed).</li>
                        <li><strong>Commit</strong> — add + commit, using the card title as the message (or its description too, if present).</li>
                        <li><strong>Push</strong> — add + commit + push.</li>
                        <li><strong>Jules</strong> — hands the card to Google&rsquo;s cloud coding agent, which opens a PR when it&rsquo;s done.</li>
                    </ul>
                    <p>The rail needs a repo folder set in project settings (the gear icon) — otherwise stage/commit/push will error. Jules and status polling need the Perci desktop app.</p>
                </section>

                <section className="sy-guide-section">
                    <h4>Perci&rsquo;s assertiveness dial</h4>
                    <p>Controls what Perci (the PM agent, not you) may do on its own. Your manual drags and clicks always work regardless of this dial.</p>
                    <ul>
                        <li><strong>Observer</strong> — read-only. Perci answers questions but touches nothing.</li>
                        <li><strong>Advisor</strong> (default) — Perci manages cards, columns, and notes freely, but proposes git/Jules moves instead of running them.</li>
                        <li><strong>Manager</strong> — Perci can also stage and commit. Push and Jules dispatch still need your explicit approval first.</li>
                        <li><strong>Autopilot</strong> — full initiative: board, git rail, and Jules, no approval needed.</li>
                    </ul>
                </section>

                <section className="sy-guide-section">
                    <h4>Talking to Perci PM</h4>
                    <p>Open the chat panel with the message icon in the header. Perci can read the whole board, create/edit/move/delete cards, reshape columns, keep project notes current, check <code>git status</code>, and run rail/Jules actions within its current assertiveness level. When a reply includes a ✓ or ✗ chip, that&rsquo;s a tool call Perci actually made — ✓ succeeded, ✗ failed or was blocked by the dial (hover the chip for why). If Perci describes an action with no chip attached, it didn&rsquo;t actually happen.</p>
                </section>

                <section className="sy-guide-section">
                    <h4>Notes &amp; Activity</h4>
                    <p><strong>Notes</strong> is a shared markdown scratchpad for decisions and open questions — you and Perci both read and write it. <strong>Activity</strong> is a running log of every board change, git action, and Jules dispatch, newest first.</p>
                </section>

                <div className="sy-modal-actions">
                    <span className="sy-spacer" />
                    <button type="button" className="sy-btn sy-btn-primary" onClick={onClose}>Got it</button>
                </div>
            </div>
        </div>
    );
}

export default function ShipyardMode({ openClawStatus = {} }) {
    const { windows, codeState } = useMode();
    const { selectedProvider, selectedModel, apiKeys, lmStudioUrl, janUrl, chats } = useChat();
    const [store, setStore] = useState(readShipyardState);
    const [view, setView] = useState('board');
    const [chatOpen, setChatOpen] = useState(true);
    const [chatInput, setChatInput] = useState('');
    const [streamText, setStreamText] = useState('');
    const [agentBusy, setAgentBusy] = useState(false);
    const [toast, setToast] = useState(null);
    const [dragCardId, setDragCardId] = useState(null);
    const [hoverColumnId, setHoverColumnId] = useState(null);
    const [editorCard, setEditorCard] = useState(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRepoPath, setNewRepoPath] = useState('');
    const abortRef = useRef(null);
    const chatEndRef = useRef(null);
    const notesTimerRef = useRef(null);

    const project = getActiveProject(store);
    const columns = project ? getProjectColumns(project) : [];
    const noProjects = store.projects.length === 0;

    useEffect(() => subscribeShipyard(() => setStore(readShipyardState())), []);
    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [project?.chat?.length, streamText]);

    // Poll Jules job status while any card is tracked.
    useEffect(() => {
        if (!project?.cards.some(c => c.jules?.jobId)) return;
        const timer = setInterval(() => { refreshJulesStatuses(project.id); }, 15000);
        return () => clearInterval(timer);
    }, [project?.id, project?.cards]);

    const showToast = useCallback((text, kind = 'info') => {
        setToast({ text, kind });
        setTimeout(() => setToast(current => (current?.text === text ? null : current)), 4000);
    }, []);

    const handleResult = useCallback((res, okText) => {
        if (res?.error) showToast(res.error, 'error');
        else if (okText) showToast(okText);
        return !res?.error;
    }, [showToast]);

    // ── Project creation / settings ─────────────────────────────────────────
    const pickFolder = async (setter) => {
        const dir = await window.electron?.selectDirectory?.();
        if (dir) setter(typeof dir === 'string' ? dir : dir?.filePaths?.[0] || '');
    };

    const handleCreateProject = async () => {
        const name = newName.trim() || (newRepoPath ? newRepoPath.split('/').pop() : '');
        if (!name) { showToast('Give the project a name.', 'error'); return; }
        setCreating(true);
        const detected = newRepoPath ? await detectRepo(newRepoPath) : {};
        createProject({ name, repoPath: newRepoPath, ...detected });
        setCreating(false);
        setNewName('');
        setNewRepoPath('');
        showToast(detected.repoFullName ? `Linked to ${detected.repoFullName}.` : 'Project created.');
    };

    // ── Drag & drop ─────────────────────────────────────────────────────────
    const handleDrop = async (event, columnId) => {
        // dataTransfer is the source of truth; dragCardId state is for styling
        // and can lag a render behind the drop event.
        const cardId = event?.dataTransfer?.getData('text/plain') || dragCardId;
        setDragCardId(null);
        setHoverColumnId(null);
        if (!cardId || !project) return;
        const column = columns.find(c => c.id === columnId);
        if (!column) return;
        if (column.kind === 'flow') {
            handleResult(moveCard(project.id, cardId, columnId));
        } else if (column.kind === 'jules') {
            showToast('Dispatching to Jules…');
            handleResult(await dispatchCardToJules(project.id, cardId, {}), 'Sent to Jules — it will open a PR when done.');
        } else {
            handleResult(await executeRailAction(project.id, cardId, column.kind, {}));
        }
    };

    // ── PM chat ─────────────────────────────────────────────────────────────
    const sendToAgent = useCallback(async (text) => {
        const trimmed = text.trim();
        if (!trimmed || !project || agentBusy) return;
        const providerKey = apiKeys[selectedProvider];
        const history = project.chat || [];
        const nextChat = [...history, { role: 'user', content: trimmed }];
        setProjectChat(project.id, nextChat);
        setChatInput('');
        setAgentBusy(true);
        setStreamText('');
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const missionRuns = readMissionRuns();
            const workspaceSummary = getWorkspaceContextSummary({
                windows,
                missionRuns,
                openClawStatus,
                chats,
                codeState,
                project
            });
            const client = LLMFactory.getClient(selectedProvider, providerKey, { lmStudioUrl, janUrl });
            let live = '';
            const result = await runPmAgentTurn({
                projectId: project.id,
                client,
                model: selectedModel,
                history,
                userText: trimmed,
                onChunk: (chunk) => { live += chunk; setStreamText(live); },
                signal: controller.signal,
                workspaceSummary,
            });
            const reply = result.error ? `⚠️ ${result.error}` : (result.content || live || '(no reply)');
            const assistantMsg = { role: 'assistant', content: reply };
            if (result.toolEvents?.length) assistantMsg.tools = result.toolEvents;
            setProjectChat(project.id, [...nextChat, assistantMsg]);
        } catch (err) {
            if (err?.name !== 'AbortError') {
                setProjectChat(project.id, [...nextChat, { role: 'assistant', content: `⚠️ ${err.message}` }]);
            }
        } finally {
            setAgentBusy(false);
            setStreamText('');
            abortRef.current = null;
        }
    }, [project, agentBusy, apiKeys, selectedProvider, selectedModel, lmStudioUrl, janUrl, windows, codeState, chats]);

    // ── Notes autosave ──────────────────────────────────────────────────────
    const handleNotesChange = (value) => {
        setStore(prev => ({
            ...prev,
            projects: prev.projects.map(p => (p.id === project.id ? { ...p, notes: value } : p)),
        }));
        clearTimeout(notesTimerRef.current);
        notesTimerRef.current = setTimeout(() => setProjectNotes(project.id, value), 500);
    };

    const cardsFor = (columnId) => (project?.cards || []).filter(c => c.columnId === columnId);

    // ── Empty state ─────────────────────────────────────────────────────────
    if (noProjects) {
        return (
            <div className="sy-shell sy-empty">
                <div className="sy-hero">
                    <Ship size={40} className="sy-hero-icon" />
                    <h2>Welcome to Shipyard</h2>
                    <p>Perci runs your kanban board, drives the GitHub rail — Stage, Commit, Push — and hands the heavy builds to Jules. Point it at a repo and start talking.</p>
                    <input className="sy-input" placeholder="Project name" value={newName} onChange={e => setNewName(e.target.value)} />
                    <div className="sy-row">
                        <input className="sy-input" placeholder="Repo folder (optional)" value={newRepoPath} onChange={e => setNewRepoPath(e.target.value)} />
                        <button type="button" className="sy-btn" onClick={() => pickFolder(setNewRepoPath)}>Browse…</button>
                    </div>
                    <button type="button" className="sy-btn sy-btn-primary" disabled={creating} onClick={handleCreateProject}>
                        {creating ? 'Setting up…' : 'Launch project'}
                    </button>
                    <button type="button" className="sy-link-btn" onClick={() => setGuideOpen(true)}>
                        <HelpCircle size={13} /> How Shipyard works
                    </button>
                </div>
                <ShipyardGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
            </div>
        );
    }

    return (
        <div className="sy-shell">
            {/* ── Header ─────────────────────────────────────────────── */}
            <header className="sy-header">
                <div className="sy-header-left">
                    <Ship size={18} className="sy-logo" />
                    <select
                        className="sy-project-select"
                        value={project.id}
                        onChange={e => setActiveProject(e.target.value)}
                        aria-label="Active project"
                    >
                        {store.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button type="button" className="sy-icon-btn" title="New project" onClick={() => setCreateModalOpen(true)}><Plus size={15} /></button>
                    <button type="button" className="sy-icon-btn" title="Project settings" onClick={() => setSettingsOpen(true)}><Settings2 size={15} /></button>
                    <button type="button" className="sy-icon-btn" title="Shipyard guide" onClick={() => setGuideOpen(true)}><HelpCircle size={15} /></button>
                    {project.repoFullName && <span className="sy-repo-chip"><GitBranch size={12} /> {project.repoFullName} · {project.branch}</span>}
                </div>
                <div className="sy-header-right">
                    <div className="sy-dial" role="radiogroup" aria-label="Perci assertiveness">
                        {ASSERTIVENESS_LEVELS.map(level => (
                            <button
                                key={level.value}
                                type="button"
                                role="radio"
                                aria-checked={project.assertiveness === level.value}
                                className={`sy-dial-stop ${project.assertiveness === level.value ? 'is-on' : ''}`}
                                title={`${level.label} — ${level.desc}`}
                                onClick={() => updateProjectMeta(project.id, { assertiveness: level.value })}
                            >{level.label}</button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className={`sy-icon-btn ${store.petEnabled ? 'is-on' : ''}`}
                        title={store.petEnabled ? 'Perci pet is roaming — click to dismiss' : 'Summon the Perci pet'}
                        onClick={() => setPetEnabled(!store.petEnabled)}
                    ><Cat size={15} /></button>
                    <nav className="sy-tabs">
                        <button type="button" className={view === 'board' ? 'is-on' : ''} onClick={() => setView('board')}><ListTodo size={13} /> Board</button>
                        <button type="button" className={view === 'notes' ? 'is-on' : ''} onClick={() => setView('notes')}><StickyNote size={13} /> Notes</button>
                        <button type="button" className={view === 'activity' ? 'is-on' : ''} onClick={() => setView('activity')}><History size={13} /> Activity</button>
                    </nav>
                    <button type="button" className={`sy-icon-btn ${chatOpen ? 'is-on' : ''}`} title="Talk to Perci PM" onClick={() => setChatOpen(v => !v)}>
                        <MessageCircle size={15} />
                    </button>
                </div>
            </header>

            {toast && <div className={`sy-toast is-${toast.kind}`}>{toast.text}</div>}

            <div className="sy-body">
                <main className="sy-main">
                    {view === 'board' && (
                        <div className="sy-board">
                            {columns.map(column => (
                                <section
                                    key={column.id}
                                    className={[
                                        'sy-column',
                                        column.kind !== 'flow' ? 'sy-column-rail' : '',
                                        column.kind === 'jules' ? 'sy-column-jules' : '',
                                        hoverColumnId === column.id && dragCardId ? 'is-drop-target' : '',
                                    ].join(' ')}
                                    onDragOver={e => { e.preventDefault(); setHoverColumnId(column.id); }}
                                    onDragLeave={() => setHoverColumnId(current => (current === column.id ? null : current))}
                                    onDrop={e => { e.preventDefault(); handleDrop(e, column.id); }}
                                >
                                    <header className="sy-column-head">
                                        <span className="sy-column-title">{column.title}</span>
                                        <span className="sy-column-count">{cardsFor(column.id).length}</span>
                                        {column.hint && <span className="sy-column-hint">{column.hint}</span>}
                                    </header>
                                    <div className="sy-column-cards">
                                        {cardsFor(column.id).map(card => (
                                            <article
                                                key={card.id}
                                                className={`sy-card ${dragCardId === card.id ? 'is-dragging' : ''}`}
                                                draggable
                                                onDragStart={e => { e.dataTransfer?.setData('text/plain', card.id); setDragCardId(card.id); }}
                                                onDragEnd={() => { setDragCardId(null); setHoverColumnId(null); }}
                                                onClick={() => setEditorCard(card)}
                                            >
                                                <div className="sy-card-top">
                                                    <span className="sy-priority" style={{ background: PRIORITY_HUES[card.priority] }} title={`${card.priority} priority`} />
                                                    <span className="sy-card-title">{card.title}</span>
                                                </div>
                                                {card.description && <p className="sy-card-desc">{card.description}</p>}
                                                <div className="sy-card-chips">
                                                    {card.files.length > 0 && <span className="sy-chip">{card.files.length} file{card.files.length > 1 ? 's' : ''}</span>}
                                                    <CardChip card={card} />
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                    {column.kind === 'flow' && (
                                        <form
                                            className="sy-quick-add"
                                            onSubmit={e => {
                                                e.preventDefault();
                                                const input = e.target.elements.title;
                                                if (input.value.trim()) {
                                                    handleResult(addCard(project.id, { title: input.value, columnId: column.id }));
                                                    input.value = '';
                                                }
                                            }}
                                        >
                                            <input name="title" placeholder="+ Add card" autoComplete="off" />
                                        </form>
                                    )}
                                </section>
                            ))}
                        </div>
                    )}

                    {view === 'notes' && (
                        <div className="sy-notes">
                            <textarea
                                value={project.notes}
                                onChange={e => handleNotesChange(e.target.value)}
                                placeholder={'Project notes — decisions, constraints, open questions.\nPerci keeps these current too.'}
                            />
                        </div>
                    )}

                    {view === 'activity' && (
                        <ul className="sy-activity">
                            {project.activity.length === 0 && <li className="sy-activity-empty">Nothing yet. Move a card or ask Perci to plan something.</li>}
                            {project.activity.map(entry => (
                                <li key={entry.id} className={`is-${entry.kind}`}>
                                    <time>{new Date(entry.at).toLocaleString()}</time>
                                    <span>{entry.text}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </main>

                {/* ── PM chat panel ──────────────────────────────────────── */}
                {chatOpen && (
                    <aside className="sy-chat">
                        <header className="sy-chat-head">
                            <span>Perci PM</span>
                            <span className="sy-chat-model">{selectedProvider}/{selectedModel}</span>
                        </header>
                        <div className="sy-chat-scroll">
                            {(project.chat || []).length === 0 && !streamText && (
                                <div className="sy-chat-hello">
                                    Tell me what you&apos;re building and I&apos;ll set up the board. Try: &quot;plan a v1 for this repo&quot; or &quot;what should I do next?&quot;
                                </div>
                            )}
                            {(project.chat || []).map((msg, i) => (
                                <div key={i} className={`sy-msg is-${msg.role}`}>
                                    {msg.content}
                                    {msg.tools?.length > 0 && (
                                        <div className="sy-msg-tools">
                                            {msg.tools.map((t, j) => (
                                                <span key={j} className={`sy-chip sy-chip-tool ${t.ok ? 'is-ok' : 'is-error'}`} title={t.error || t.name}>
                                                    {t.ok ? '✓' : '✗'} {t.name}{!t.ok && t.error ? ` — ${t.error}` : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {streamText && <div className="sy-msg is-assistant is-streaming">{streamText}</div>}
                            {agentBusy && !streamText && <div className="sy-msg is-assistant is-streaming">Working the board…</div>}
                            <div ref={chatEndRef} />
                        </div>
                        <form
                            className="sy-chat-composer"
                            onSubmit={e => { e.preventDefault(); sendToAgent(chatInput); }}
                        >
                            <input
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                placeholder={`Ask your PM (${ASSERTIVENESS_LEVELS[project.assertiveness].label} mode)…`}
                                disabled={agentBusy}
                            />
                            {agentBusy ? (
                                <button type="button" className="sy-btn" onClick={() => abortRef.current?.abort()} title="Stop"><Square size={13} /></button>
                            ) : (
                                <button type="submit" className="sy-btn sy-btn-primary" title="Send"><Send size={13} /></button>
                            )}
                        </form>
                    </aside>
                )}
            </div>

            {/* ── Card editor ────────────────────────────────────────────── */}
            {editorCard && (
                <div className="sy-modal-backdrop" onClick={() => setEditorCard(null)}>
                    <div className="sy-modal" onClick={e => e.stopPropagation()}>
                        <h3>Edit card</h3>
                        <label>Title
                            <input className="sy-input" defaultValue={editorCard.title} id="sy-edit-title" />
                        </label>
                        <label>Description / acceptance criteria
                            <textarea className="sy-input" rows={4} defaultValue={editorCard.description} id="sy-edit-desc" />
                        </label>
                        <label>Files (one repo-relative path per line — rail actions stage only these)
                            <textarea className="sy-input" rows={3} defaultValue={editorCard.files.join('\n')} id="sy-edit-files" />
                        </label>
                        <label>Priority
                            <select className="sy-input" defaultValue={editorCard.priority} id="sy-edit-priority">
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </label>
                        <div className="sy-modal-rail">
                            {RAIL_COLUMNS.map(rail => (
                                <button key={rail.id} type="button" className="sy-btn" onClick={async () => {
                                    setEditorCard(null);
                                    if (rail.kind === 'jules') {
                                        showToast('Dispatching to Jules…');
                                        handleResult(await dispatchCardToJules(project.id, editorCard.id, {}), 'Sent to Jules.');
                                    } else {
                                        handleResult(await executeRailAction(project.id, editorCard.id, rail.kind, {}));
                                    }
                                }}>{rail.title}</button>
                            ))}
                        </div>
                        <div className="sy-modal-actions">
                            <button type="button" className="sy-btn sy-btn-danger" onClick={() => {
                                handleResult(deleteCard(project.id, editorCard.id));
                                setEditorCard(null);
                            }}><Trash2 size={13} /> Delete</button>
                            <span className="sy-spacer" />
                            <button type="button" className="sy-btn" onClick={() => setEditorCard(null)}>Cancel</button>
                            <button type="button" className="sy-btn sy-btn-primary" onClick={() => {
                                handleResult(updateCard(project.id, editorCard.id, {
                                    title: document.getElementById('sy-edit-title').value,
                                    description: document.getElementById('sy-edit-desc').value,
                                    files: document.getElementById('sy-edit-files').value.split('\n').map(s => s.trim()).filter(Boolean),
                                    priority: document.getElementById('sy-edit-priority').value,
                                }));
                                setEditorCard(null);
                            }}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Project settings ───────────────────────────────────────── */}
            {settingsOpen && (
                <div className="sy-modal-backdrop" onClick={() => setSettingsOpen(false)}>
                    <div className="sy-modal" onClick={e => e.stopPropagation()}>
                        <h3>Project settings</h3>
                        <label>Name
                            <input className="sy-input" defaultValue={project.name} id="sy-set-name" />
                        </label>
                        <label>Repo folder
                            <div className="sy-row">
                                <input className="sy-input" defaultValue={project.repoPath} id="sy-set-path" />
                                <button type="button" className="sy-btn" onClick={async () => {
                                    const dir = await window.electron?.selectDirectory?.();
                                    const value = typeof dir === 'string' ? dir : dir?.filePaths?.[0];
                                    if (value) document.getElementById('sy-set-path').value = value;
                                }}>Browse…</button>
                            </div>
                        </label>
                        <label>GitHub repo (owner/name — used by Jules)
                            <input className="sy-input" defaultValue={project.repoFullName} id="sy-set-repo" placeholder="owner/repo" />
                        </label>
                        <label>Branch
                            <input className="sy-input" defaultValue={project.branch} id="sy-set-branch" />
                        </label>
                        <div className="sy-modal-actions">
                            <button type="button" className="sy-btn" onClick={async () => {
                                const path = document.getElementById('sy-set-path').value.trim();
                                const detected = await detectRepo(path);
                                if (detected.repoFullName) document.getElementById('sy-set-repo').value = detected.repoFullName;
                                if (detected.branch) document.getElementById('sy-set-branch').value = detected.branch;
                                showToast(detected.repoFullName ? `Detected ${detected.repoFullName}.` : 'No GitHub remote found.', detected.repoFullName ? 'info' : 'error');
                            }}>Detect from folder</button>
                            <span className="sy-spacer" />
                            <button type="button" className="sy-btn" onClick={() => setSettingsOpen(false)}>Cancel</button>
                            <button type="button" className="sy-btn sy-btn-primary" onClick={() => {
                                handleResult(updateProjectMeta(project.id, {
                                    name: document.getElementById('sy-set-name').value.trim(),
                                    repoPath: document.getElementById('sy-set-path').value.trim(),
                                    repoFullName: document.getElementById('sy-set-repo').value.trim(),
                                    branch: document.getElementById('sy-set-branch').value.trim() || 'main',
                                }), 'Project updated.');
                                setSettingsOpen(false);
                            }}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── New project modal ──────────────────────────────────────── */}
            {createModalOpen && (
                <div className="sy-modal-backdrop" onClick={() => setCreateModalOpen(false)}>
                    <div className="sy-modal" onClick={e => e.stopPropagation()}>
                        <h3>New project</h3>
                        <label>Name
                            <input className="sy-input" placeholder="Project name" id="sy-new-name" autoFocus />
                        </label>
                        <label>Repo folder (optional)
                            <div className="sy-row">
                                <input className="sy-input" placeholder="/path/to/folder" id="sy-new-path" />
                                <button type="button" className="sy-btn" onClick={async () => {
                                    const dir = await window.electron?.selectDirectory?.();
                                    const value = typeof dir === 'string' ? dir : dir?.filePaths?.[0];
                                    if (value) document.getElementById('sy-new-path').value = value;
                                }}>Browse…</button>
                            </div>
                        </label>
                        <div className="sy-modal-actions">
                            <span className="sy-spacer" />
                            <button type="button" className="sy-btn" onClick={() => setCreateModalOpen(false)}>Cancel</button>
                            <button type="button" className="sy-btn sy-btn-primary" onClick={async () => {
                                const name = document.getElementById('sy-new-name').value.trim();
                                const path = document.getElementById('sy-new-path').value.trim();
                                if (!name) {
                                    showToast('Give the project a name.', 'error');
                                    return;
                                }
                                setCreateModalOpen(false);
                                showToast('Setting up project...');
                                const detected = path ? await detectRepo(path) : {};
                                createProject({ name, repoPath: path, ...detected });
                                showToast(detected.repoFullName ? `Linked to ${detected.repoFullName}.` : 'Project created.');
                            }}>Create</button>
                        </div>
                    </div>
                </div>
            )}

            <ShipyardGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
        </div>
    );
}
