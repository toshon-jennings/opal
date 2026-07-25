import { useCallback, useEffect, useRef, useState } from 'react';
import { useMode, MODES } from '../context/ModeContext';
import { useChat } from '../context/ChatContext';
import { LLMFactory } from '../lib/llm/clients';
import { readJsonStorage, writeJsonStorage } from '../lib/persistentStore';
import {
    readShipyardState, subscribeShipyard, getActiveProject,
    setProjectChat, runPmAgentTurn, sanitizeChatHistory,
} from '../lib/shipyard';
import { getWorkspaceContextSummary } from '../lib/perciContext';
import { readMissionRuns } from '../lib/missionControl';
import { Send } from 'lucide-react';
import perciMascot from '../assets/perci-mascot.svg';
import './PerciPet.css';

const POS_KEY = 'perci_pet_pos';
const SPEAK_COOLDOWN_MS = 90_000;
const PET_WIDTH_PX = 84;
const PANEL_WIDTH_PX = 240;

// What the pet says for a Shipyard event, gated by the project's
// assertiveness dial. Returning null stays quiet.
function lineForEvent(evt, project) {
    const level = project?.assertiveness ?? 1;
    switch (evt.type) {
        case 'rail-error':
            return `Hit a snag on the ${evt.kind} rail. Check the card — I logged the details.`;
        case 'rail-done':
            return level >= 1 ? `Nice — that card just ${evt.kind === 'push' ? 'shipped' : `hit ${evt.kind}`}.` : null;
        case 'jules-pr':
            return `Jules opened a PR for "${evt.title}". Want me to walk you through it?`;
        case 'jules-dispatched':
            return level >= 1 ? 'Handed that one to Jules. I\'ll flag the PR when it lands.' : null;
        case 'card-added':
            return level >= 2 && evt.actor === 'agent' ? 'I added a card to keep that from slipping.' : null;
        case 'card-moved':
            return level >= 3 && evt.actor === 'user' ? 'Logged that move. Say the word if priorities shifted.' : null;
        case 'project-created':
            return 'New board on the slipway. Tell me the goal and I\'ll lay out the columns.';
        default:
            return null;
    }
}

export default function PerciPet({ openClawStatus = {} }) {
    const { openWindow, windows, codeState } = useMode();
    const { selectedProvider, selectedModel, apiKeys, lmStudioUrl, janUrl, chats } = useChat();
    const [store, setStore] = useState(readShipyardState);
    const [pos, setPos] = useState(() => readJsonStorage(POS_KEY, { x: 0.86, y: 0.72 }));
    const [bubble, setBubble] = useState(null);
    const [open, setOpen] = useState(false);
    const [ask, setAsk] = useState('');
    const [busy, setBusy] = useState(false);
    const [mood, setMood] = useState('idle'); // idle | working | alert
    const [petChatHistory, setPetChatHistory] = useState(() => readJsonStorage('perci_pet_chat', []));
    const dragRef = useRef(null);
    const bubbleTimer = useRef(null);
    const lastSpokeRef = useRef(0);
    const windowCountRef = useRef(windows?.length ?? 0);

    const project = getActiveProject(store);

    const say = useCallback((text, { force = false, moodKind = 'idle' } = {}) => {
        if (!text) return;
        const now = Date.now();
        if (!force && now - lastSpokeRef.current < SPEAK_COOLDOWN_MS) return;
        lastSpokeRef.current = now;
        setBubble(text);
        setMood(moodKind);
        clearTimeout(bubbleTimer.current);
        bubbleTimer.current = setTimeout(() => { setBubble(null); setMood('idle'); }, 7000);
    }, []);

    // React to Shipyard events.
    useEffect(() => subscribeShipyard((evt) => {
        const nextStore = readShipyardState();
        setStore(nextStore);
        const activeProject = getActiveProject(nextStore);
        const line = lineForEvent(evt, activeProject);
        if (line) say(line, { force: evt.type === 'rail-error' || evt.type === 'jules-pr', moodKind: evt.type === 'rail-error' ? 'alert' : 'idle' });
    }), [say]);

    // Notice new windows opening around the workspace (Manager+ only).
    useEffect(() => {
        const count = windows?.length ?? 0;
        if (count > windowCountRef.current && (project?.assertiveness ?? 1) >= 2) {
            const newest = windows[windows.length - 1];
            say(`I see ${newest?.title || 'a new window'} is open. Want a card on the board for that work?`);
        }
        windowCountRef.current = count;
    }, [windows, project?.assertiveness, say]);

    useEffect(() => () => clearTimeout(bubbleTimer.current), []);

    // ── Dragging ────────────────────────────────────────────────────────────
    const onPointerDown = (e) => {
        dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pos, moved: false };
        const onMove = (ev) => {
            const drag = dragRef.current;
            if (!drag) return;
            const dx = ev.clientX - drag.startX;
            const dy = ev.clientY - drag.startY;
            if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
            setPos({
                // x is the pet's right-edge fraction. Clamp by the pet's own
                // width so its left edge can sit flush with the viewport.
                x: Math.min(0.99, Math.max(PET_WIDTH_PX / window.innerWidth, drag.origin.x + dx / window.innerWidth)),
                y: Math.min(0.94, Math.max(0.02, drag.origin.y + dy / window.innerHeight)),
            });
        };
        const onUp = () => {
            const drag = dragRef.current;
            dragRef.current = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            if (drag?.moved) {
                setPos(current => { writeJsonStorage(POS_KEY, current); return current; });
            } else {
                setOpen(v => !v);
            }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    // ── Quick ask → PM agent / Workspace assistant ──────────────────────────
    const handleAsk = async (e) => {
        e.preventDefault();
        const question = ask.trim();
        if (!question || busy) return;

        setAsk('');
        setBusy(true);
        setMood('working');

        const isProjectMode = !!project;
        const history = isProjectMode ? (project.chat || []) : petChatHistory;
        const nextChat = [...history, { role: 'user', content: question }];

        if (isProjectMode) {
            setProjectChat(project.id, nextChat);
        } else {
            setPetChatHistory(nextChat);
            writeJsonStorage('perci_pet_chat', nextChat);
        }

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
            const client = LLMFactory.getClient(selectedProvider, apiKeys[selectedProvider], { lmStudioUrl, janUrl });

            let reply = '';
            if (isProjectMode) {
                const result = await runPmAgentTurn({
                    projectId: project.id,
                    client,
                    model: selectedModel,
                    history,
                    userText: question,
                    workspaceSummary,
                });
                reply = result.error ? `⚠️ ${result.error}` : (result.content || '(done)');
                const assistantMsg = { role: 'assistant', content: reply };
                if (result.toolEvents?.length) assistantMsg.tools = result.toolEvents;
                setProjectChat(project.id, [...nextChat, assistantMsg]);
            } else {
                // Standalone workspace query
                const systemPrompt = `You are Perci, the workspace assistant. You are brief, pragmatic, and helpful.
Answer the user's question about their workspace and open files/windows/tasks.
Current Workspace State:
${workspaceSummary}`;

                const cleanedHistory = sanitizeChatHistory(history);
                const messages = [
                    { role: 'system', content: systemPrompt },
                    ...cleanedHistory.map(m => ({ role: m.role, content: m.content })),
                    { role: 'user', content: question }
                ];
                const response = await client.streamChatWithTools(messages, [], () => {}, selectedModel);
                reply = response.content || '(done)';
                const updatedChat = [...nextChat, { role: 'assistant', content: reply }];
                setPetChatHistory(updatedChat);
                writeJsonStorage('perci_pet_chat', updatedChat);
            }

            say(reply.length > 220 ? `${reply.slice(0, 220)}…` : reply, { force: true });
        } catch (err) {
            say(`⚠️ ${err.message}`, { force: true, moodKind: 'alert' });
        } finally {
            setBusy(false);
            setMood('idle');
        }
    };

    if (!store.petEnabled) return null;

    const doing = project
        ? `${project.cards.length} card${project.cards.length === 1 ? '' : 's'} on ${project.name}`
        : 'Workspace companion';
    const panelOpensRight = pos.x * window.innerWidth < PANEL_WIDTH_PX;

    return (
        <div
            className={`perci-pet${panelOpensRight ? ' opens-right' : ''}`}
            style={{
                '--perci-pet-size': `${PET_WIDTH_PX}px`,
                '--perci-pet-panel-width': `${PANEL_WIDTH_PX}px`,
                right: `${(1 - pos.x) * 100}%`,
                top: `${pos.y * 100}%`,
            }}
        >
            {bubble && <div className="perci-pet-bubble">{bubble}</div>}
            {open && (
                <div className="perci-pet-panel">
                    <div className="perci-pet-status">
                        <strong>Perci PM</strong>
                        <span>{busy ? 'Working…' : doing}</span>
                    </div>
                    <form onSubmit={handleAsk} className="perci-pet-ask">
                        <input
                            value={ask}
                            onChange={e => setAsk(e.target.value)}
                            placeholder={project ? 'Ask your PM anything…' : 'Ask about your workspace…'}
                            disabled={busy}
                        />
                        <button
                            type="submit"
                            className="perci-pet-submit-btn"
                            disabled={busy || !ask.trim()}
                            title="Submit question"
                        >
                            <Send size={14} />
                        </button>
                    </form>
                    <button
                        type="button"
                        className="perci-pet-open"
                        onClick={() => { setOpen(false); openWindow(MODES.SHIPYARD); }}
                    >Open Shipyard</button>
                </div>
            )}
            <button
                type="button"
                className={`perci-pet-avatar is-${mood}`}
                onPointerDown={onPointerDown}
                title="Perci — your project manager (drag to move, click to talk)"
            >
                <img src={perciMascot} alt="Perci the project manager" draggable={false} />
                <span className={`perci-pet-dot is-${mood}`} />
            </button>
        </div>
    );
}
