import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Check, RefreshCw, Square } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { LLMFactory } from '../lib/llm/clients';
import './KlipitAskRail.css';

// Runs inside the page's webview. Prefers the user's selection; falls back to
// the article/main body so "ask about this page" works without selecting first.
const CAPTURE_SCRIPT = `(() => {
    const squeeze = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
    const sel = squeeze(window.getSelection ? window.getSelection().toString() : '');
    if (sel.length > 20) return { kind: 'selection', text: sel.slice(0, 12000) };
    const root = document.querySelector('article, main, [role="main"]') || document.body;
    return { kind: 'page', text: squeeze(root && root.innerText).slice(0, 12000) };
})()`;

const SYSTEM = [
    'You are reading a web page alongside the user and answering questions about it.',
    'Ground every answer in the page text you are given. If the page does not answer the',
    'question, say so in one line, then answer from your own knowledge and label it as such.',
    'You are writing in a narrow margin, not an essay: lead with the answer, keep paragraphs',
    'short, and prefer lists over prose when there is more than one item.',
].join(' ');

const QUICK_ASKS = [
    { label: 'Summarize', prompt: 'Summarize this page in five bullets or fewer.' },
    { label: 'Key facts', prompt: 'List the concrete facts on this page: names, dates, numbers, versions, requirements, prices.' },
    { label: 'What do I do?', prompt: 'What action does this page require of me? If it requires none, say none.' },
];

const KEYLESS_PROVIDERS = new Set(['ollama', 'lmstudio', 'jan']);

// Runs inside the Klipit extension's side panel, where `klippitStorage` is a
// ready StorageManager on globalThis (see ~/klippit/src/storage.js). The answer
// becomes a note carrying its source page, then joins the graph edge to that
// page's clipped link if one already exists.
const KEEP_SCRIPT = (payloadJson) => `(async () => {
    if (!globalThis.klippitStorage) return 'no-storage';
    const p = ${payloadJson};
    const { item } = await klippitStorage.createNote({
        title: p.title,
        note: p.note,
        tags: ['ask'],
        source: p.url ? { url: p.url, title: p.pageTitle || p.url } : null,
    });
    if (p.url) {
        const links = await klippitStorage.listItems({ type: 'link' });
        const match = links.find((l) => l.url === p.url);
        if (match) await klippitStorage.connect(item.id, match.id, 'answered from');
    }
    return 'ok';
})()`;

// JSON is valid JS source except for these two separators, which are legal
// inside a JSON string but historically illegal in a JS string literal.
function embed(value) {
    return JSON.stringify(value)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

function slipLabel(context) {
    if (!context || !context.text) return 'No page text';
    const words = countWords(context.text).toLocaleString();
    return context.kind === 'selection' ? `Selection · ${words} words` : `Whole page · ${words} words`;
}

export default function KlipitAskRail({ webviewRef, klipitWebviewRef, pageUrl, pageTitle, turns, setTurns }) {
    const { selectedProvider, selectedModel, apiKeys, lmStudioUrl, janUrl } = useChat();
    const [input, setInput] = useState('');
    const [context, setContext] = useState(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [keepingId, setKeepingId] = useState(null);
    const abortRef = useRef(null);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    const apiKey = apiKeys?.[selectedProvider];
    const needsKey = !KEYLESS_PROVIDERS.has(selectedProvider);
    const missingKey = needsKey && !apiKey;

    const capture = useCallback(async () => {
        const webview = webviewRef?.current;
        if (!webview || !pageUrl) return null;
        try {
            const result = await webview.executeJavaScript(CAPTURE_SCRIPT);
            return result && result.text ? result : null;
        } catch {
            return null; // webview detached, cross-origin frame, or not ready yet
        }
    }, [webviewRef, pageUrl]);

    // Refresh the slip when the page changes so it always describes what would be sent.
    useEffect(() => {
        let cancelled = false;
        if (!pageUrl) {
            setContext(null);
            return undefined;
        }
        capture().then((next) => { if (!cancelled) setContext(next); });
        return () => { cancelled = true; };
    }, [capture, pageUrl]);

    useEffect(() => {
        const node = scrollRef.current;
        if (node) node.scrollTop = node.scrollHeight;
    }, [turns]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const ask = useCallback(async (question) => {
        const trimmed = question.trim();
        if (!trimmed || isStreaming) return;

        if (missingKey) {
            setTurns((prev) => [...prev, {
                id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                question: trimmed,
                answer: '',
                pageUrl,
                pageTitle,
                error: `No ${selectedProvider} API key. Add one in Settings, or switch models in Chat.`,
            }]);
            return;
        }

        const fresh = await capture();
        setContext(fresh);

        const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const history = turns.flatMap((turn) => (turn.answer
            ? [{ role: 'user', content: turn.question }, { role: 'assistant', content: turn.answer }]
            : []));

        const framed = fresh
            ? [
                SYSTEM,
                '',
                `PAGE: ${pageTitle || 'Untitled'}`,
                `URL: ${pageUrl}`,
                '',
                fresh.kind === 'selection' ? 'SELECTED TEXT:' : 'PAGE TEXT:',
                '"""',
                fresh.text,
                '"""',
                '',
                `QUESTION: ${trimmed}`,
            ].join('\n')
            : `${SYSTEM}\n\nNo page text is available.\n\nQUESTION: ${trimmed}`;

        setTurns((prev) => [...prev, {
            id: turnId,
            question: trimmed,
            answer: '',
            pageUrl,
            pageTitle,
            error: null,
        }]);
        setInput('');
        setIsStreaming(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const client = LLMFactory.getClient(selectedProvider, apiKey, { lmStudioUrl, janUrl });
            await client.streamChat(
                [...history, { role: 'user', content: framed }],
                (chunk, meta) => {
                    if (meta?.isThinking) return;
                    setTurns((prev) => prev.map((turn) => (
                        turn.id === turnId ? { ...turn, answer: turn.answer + chunk } : turn
                    )));
                },
                selectedModel,
                { signal: controller.signal },
            );
        } catch (err) {
            if (controller.signal.aborted) return;
            setTurns((prev) => prev.map((turn) => (
                turn.id === turnId ? { ...turn, error: err?.message || 'The request failed.' } : turn
            )));
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setIsStreaming(false);
        }
    }, [
        apiKey, capture, isStreaming, janUrl, lmStudioUrl, missingKey,
        pageTitle, pageUrl, selectedModel, selectedProvider, setTurns, turns,
    ]);

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            ask(input);
        }
    };

    const refreshSlip = useCallback(() => {
        capture().then(setContext);
    }, [capture]);

    // Hand one exchange off to the commonplace book. Deliberate, never automatic:
    // most questions are throwaway, and the ones that aren't are worth a click.
    const keep = useCallback(async (turn) => {
        const panel = klipitWebviewRef?.current;
        const patch = (fields) => setTurns((prev) => prev.map((t) => (
            t.id === turn.id ? { ...t, ...fields } : t
        )));

        if (!panel) {
            patch({ keepError: 'Open the Clip tab once, then keep this again.' });
            return;
        }

        setKeepingId(turn.id);
        try {
            const result = await panel.executeJavaScript(KEEP_SCRIPT(embed({
                title: turn.question,
                note: `${turn.question}\n\n${turn.answer}`,
                url: turn.pageUrl || '',
                pageTitle: turn.pageTitle || '',
            })));
            if (result === 'ok') patch({ kept: true, keepError: null });
            else patch({ keepError: 'Klipit is still loading. Try again in a moment.' });
        } catch (err) {
            patch({ keepError: err?.message || 'Could not save to Klipit.' });
        } finally {
            setKeepingId(null);
        }
    }, [klipitWebviewRef, setTurns]);

    // Only label a turn with its page when the page differs from the turn before it.
    const threadRows = useMemo(() => turns.map((turn, index) => ({
        turn,
        heading: index === 0 || turns[index - 1].pageUrl !== turn.pageUrl
            ? (turn.pageTitle || turn.pageUrl || 'Untitled')
            : null,
    })), [turns]);

    const canSend = Boolean(input.trim()) && !isStreaming;

    return (
        <div className="klipit-ask">
            <div className="ka-slip">
                <div className="ka-slip-body">
                    <div className="ka-slip-label">{slipLabel(context)}</div>
                    {context?.text && (
                        <p className="ka-slip-preview">{context.text.slice(0, 180)}</p>
                    )}
                </div>
                <button
                    type="button"
                    className="ka-slip-refresh"
                    onClick={refreshSlip}
                    title="Re-read the page (picks up a new selection)"
                >
                    <RefreshCw size={12} />
                </button>
            </div>

            <div className="ka-scroll" ref={scrollRef}>
                {turns.length === 0 ? (
                    <div className="ka-empty">
                        <p className="ka-empty-title">Ask about what you&rsquo;re reading.</p>
                        <p className="ka-empty-note">
                            Your selection is used when you have one, otherwise the whole page.
                            Nothing leaves Perci except the text you ask about.
                        </p>
                    </div>
                ) : (
                    <div className="ka-thread">
                        {threadRows.map(({ turn, heading }) => (
                            <div key={turn.id}>
                                {heading && <div className="ka-heading" title={turn.pageUrl}>{heading}</div>}
                                <div className="ka-turn">
                                    <p className="ka-q">{turn.question}</p>
                                    {turn.answer && (
                                        <div className="ka-a">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown>
                                        </div>
                                    )}
                                    {isStreaming && !turn.answer && !turn.error && <span className="ka-caret" />}
                                    {turn.error && <p className="ka-error">{turn.error}</p>}
                                    {turn.answer && !(isStreaming && turn.id === turns[turns.length - 1]?.id) && (
                                        <div className="ka-actions">
                                            {turn.kept ? (
                                                <span className="ka-kept"><Check size={10} /> Kept in Klipit</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="ka-keep"
                                                    disabled={keepingId === turn.id}
                                                    onClick={() => keep(turn)}
                                                >
                                                    {keepingId === turn.id ? 'Keeping…' : 'Keep'}
                                                </button>
                                            )}
                                            {turn.keepError && <p className="ka-error">{turn.keepError}</p>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="ka-foot">
                {turns.length === 0 && (
                    <div className="ka-quick">
                        {QUICK_ASKS.map((quick) => (
                            <button
                                key={quick.label}
                                type="button"
                                className="ka-chip"
                                disabled={isStreaming}
                                onClick={() => ask(quick.prompt)}
                            >
                                {quick.label}
                            </button>
                        ))}
                    </div>
                )}

                <div className="ka-input-wrap">
                    <textarea
                        ref={inputRef}
                        className="ka-input"
                        rows={1}
                        value={input}
                        placeholder="Ask about this page…"
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    {isStreaming ? (
                        <button
                            type="button"
                            className="ka-send"
                            onClick={() => abortRef.current?.abort()}
                            title="Stop"
                        >
                            <Square size={13} fill="currentColor" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="ka-send"
                            disabled={!canSend}
                            onClick={() => ask(input)}
                            title="Ask"
                        >
                            <ArrowUp size={15} />
                        </button>
                    )}
                </div>

                <div className="ka-meta">
                    <span>{selectedModel || 'No model selected'}</span>
                    <span className="ka-meta-sep">/</span>
                    <span>{context?.kind === 'selection' ? 'Selection' : 'Whole page'}</span>
                </div>
            </div>
        </div>
    );
}
