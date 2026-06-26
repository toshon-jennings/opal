import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Inbox, Send, Search, RefreshCw, Mail, MailOpen, Reply, Forward,
    ChevronDown, ChevronUp, Loader2, AlertCircle, X, Paperclip,
    ArrowLeft, CheckCircle2, Clock, Trash2,
} from 'lucide-react';

const INDIGO = '#6366f1';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        const now = new Date();
        const diffH = (now - d) / 36e5;
        if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
        if (diffH < 24) return `${Math.round(diffH)}h ago`;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return ''; }
}

function truncate(str, len = 80) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
}

function extractName(email) {
    if (!email) return '';
    const match = email.match(/^([^<]+)</);
    return match ? match[1].trim() : email;
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function AgentMailMode() {
    const [inboxes, setInboxes] = useState([]);
    const [activeInbox, setActiveInbox] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [showCompose, setShowCompose] = useState(false);
    const [composeData, setComposeData] = useState({ to: '', subject: '', text: '', html: '' });
    const [sending, setSending] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [forwardTo, setForwardTo] = useState(null);
    const [statusMsg, setStatusMsg] = useState('');

    // ── API calls ─────────────────────────────────────────────────────────────
    const loadInboxes = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await window.electron.agentmailListInboxes();
            if (!result.ok) throw new Error(result.error);
            setInboxes(result.inboxes || []);
            if (result.inboxes?.length > 0 && !activeInbox) {
                setActiveInbox(result.inboxes[0].inbox_id);
            }
        } catch (e) {
            setError(`Failed to load inboxes: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, [activeInbox]);

    const loadMessages = useCallback(async (inboxId) => {
        if (!inboxId) return;
        setLoading(true);
        setError('');
        try {
            const result = await windowListMessages(inboxId, 50);
            if (!result.ok) throw new Error(result.error);
            setMessages(result.messages || []);
        } catch (e) {
            setError(`Failed to load messages: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    const getMessage = useCallback(async (inboxId, messageId) => {
        setLoading(true);
        try {
            const result = await window.electron.agentmailGetMessage(inboxId, messageId);
            if (!result.ok) throw new Error(result.error);
            setSelectedMessage(result.message);
        } catch (e) {
            setError(`Failed to load message: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    const searchMessages = useCallback(async (inboxId, query) => {
        if (!query.trim()) {
            loadMessages(inboxId);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const result = await window.electron.agentmailSearch(inboxId, query, 30);
            if (!result.ok) throw new Error(result.error);
            setMessages(result.messages || []);
        } catch (e) {
            setError(`Search failed: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, [loadMessages]);

    const sendMessage = useCallback(async () => {
        if (!activeInbox || !composeData.to || !composeData.subject) {
            setError('To and subject are required');
            return;
        }
        setSending(true);
        setError('');
        setStatusMsg('Sending...');
        try {
            const result = await window.electron.agentmailSend(
                activeInbox, composeData.to, composeData.subject,
                composeData.text, composeData.html
            );
            if (!result.ok) throw new Error(result.error);
            setStatusMsg('Message sent!');
            setShowCompose(false);
            setComposeData({ to: '', subject: '', text: '', html: '' });
            setTimeout(() => {
                setStatusMsg('');
                loadMessages(activeInbox);
            }, 1500);
        } catch (e) {
            setError(`Send failed: ${e.message}`);
            setStatusMsg('');
        } finally {
            setSending(false);
        }
    }, [activeInbox, composeData, loadMessages]);

    const sendReply = useCallback(async (messageId, text, html) => {
        setSending(true);
        setStatusMsg('Replying...');
        try {
            const result = await window.electron.agentmailReply(activeInbox, messageId, text, html);
            if (!result.ok) throw new Error(result.error);
            setStatusMsg('Reply sent!');
            setReplyTo(null);
            setTimeout(() => {
                setStatusMsg('');
                setSelectedMessage(null);
                loadMessages(activeInbox);
            }, 1000);
        } catch (e) {
            setError(`Reply failed: ${e.message}`);
            setStatusMsg('');
        } finally {
            setSending(false);
        }
    }, [activeInbox, loadMessages]);

    const sendForward = useCallback(async (messageId, to, text) => {
        setSending(true);
        setStatusMsg('Forwarding...');
        try {
            const result = await window.electron.agentmailForward(activeInbox, messageId, to, text);
            if (!result.ok) throw new Error(result.error);
            setStatusMsg('Forwarded!');
            setForwardTo(null);
            setTimeout(() => { setStatusMsg(''); loadMessages(activeInbox); }, 1000);
        } catch (e) {
            setError(`Forward failed: ${e.message}`);
            setStatusMsg('');
        } finally {
            setSending(false);
        }
    }, [activeInbox, loadMessages]);

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    useEffect(() => {
        loadInboxes();
    }, []);

    useEffect(() => {
        if (activeInbox) {
            loadMessages(activeInbox);
            setSelectedMessage(null);
        }
    }, [activeInbox]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex h-full w-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* Sidebar — Inbox list */}
            <div className="w-64 flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--bg-secondary)]">
                <div className="p-3 border-b border-[var(--border)]">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-base font-semibold flex items-center gap-2">
                            <Inbox size={18} style={{ color: INDIGO }} />
                            AgentMail
                        </h1>
                        <button
                            onClick={loadInboxes}
                            className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* Search toggle */}
                    <button
                        onClick={() => setShowSearch(!showSearch)}
                        className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] w-full"
                    >
                        <Search size={13} />
                        <span>Search emails</span>
                    </button>

                    {showSearch && (
                        <div className="mt-2 flex gap-1.5">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && activeInbox) {
                                        searchMessages(activeInbox, searchQuery);
                                    }
                                }}
                                placeholder="subject:invoice OR from:client@..."
                                className="flex-1 px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                            />
                            <button
                                onClick={() => activeInbox && searchMessages(activeInbox, searchQuery)}
                                className="px-2 py-1.5 text-xs rounded-md bg-indigo-500 text-white hover:bg-indigo-600"
                            >
                                Go
                            </button>
                        </div>
                    )}
                </div>

                {/* Inbox selector */}
                <div className="flex-1 overflow-y-auto">
                    {loading && inboxes.length === 0 && (
                        <div className="p-4 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin" /> Loading...
                        </div>
                    )}
                    {inboxes.map(inbox => (
                        <button
                            key={inbox.inbox_id}
                            onClick={() => setActiveInbox(inbox.inbox_id)}
                            className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] transition-colors ${
                                activeInbox === inbox.inbox_id
                                    ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500'
                                    : 'hover:bg-[var(--bg-tertiary)]'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <Mail size={13} style={{ color: INDIGO }} />
                                <span className="text-xs font-medium truncate">{inbox.email}</span>
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                {inbox.display_name || inbox.inbox_id}
                            </div>
                        </button>
                    ))}
                    {!loading && inboxes.length === 0 && (
                        <div className="p-4 text-xs text-[var(--text-secondary)]">
                            No inboxes found. Add one at agentmail.to
                        </div>
                    )}
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                    {selectedMessage && (
                        <button
                            onClick={() => setSelectedMessage(null)}
                            className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                            title="Back to list"
                        >
                            <ArrowLeft size={15} />
                        </button>
                    )}
                    <div className="flex-1 text-xs font-medium truncate">
                        {activeInbox || 'Select an inbox'}
                    </div>
                    <button
                        onClick={() => { setShowCompose(true); setReplyTo(null); setForwardTo(null); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-indigo-500 text-white hover:bg-indigo-600 transition-colors font-medium"
                    >
                        <Send size={13} />
                        Compose
                    </button>
                </div>

                {/* Error / Status bar */}
                {(error || statusMsg) && (
                    <div className={`px-4 py-2 text-xs flex items-center gap-2 ${
                        error
                            ? 'bg-red-500/10 text-red-400 border-b border-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20'
                    }`}>
                        {error ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
                        <span>{error || statusMsg}</span>
                        <button
                            onClick={() => { setError(''); setStatusMsg(''); }}
                            className="ml-auto p-0.5 hover:opacity-70"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}

                {/* Content area */}
                <div className="flex-1 overflow-y-auto">
                    {loading && (
                        <div className="flex items-center justify-center h-32 text-[var(--text-secondary)]">
                            <Loader2 size={20} className="animate-spin" />
                        </div>
                    )}

                    {!loading && showCompose && (
                        <ComposeView
                            composeData={composeData}
                            setComposeData={setComposeData}
                            onSend={sendMessage}
                            onCancel={() => setShowCompose(false)}
                            sending={sending}
                        />
                    )}

                    {!loading && !showCompose && selectedMessage && (
                        <MessageView
                            message={selectedMessage}
                            onReply={() => setReplyTo(selectedMessage)}
                            onForward={() => setForwardTo(selectedMessage)}
                            onBack={() => setSelectedMessage(null)}
                        />
                    )}

                    {!loading && !showCompose && !selectedMessage && replyTo && (
                        <ComposeView
                            composeData={{
                                to: replyTo.from_,
                                subject: replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`,
                                text: '',
                                html: '',
                            }}
                            setComposeData={() => {}}
                            onSend={(text, html) => sendReply(replyTo.message_id, text, html)}
                            onCancel={() => setReplyTo(null)}
                            sending={sending}
                            isReply
                        />
                    )}

                    {!loading && !showCompose && !selectedMessage && forwardTo && (
                        <ComposeView
                            composeData={{
                                to: '',
                                subject: forwardTo.subject.startsWith('Fwd:') ? forwardTo.subject : `Fwd: ${forwardTo.subject}`,
                                text: `\n\n---------- Forwarded message ----------\nFrom: ${forwardTo.from_}\nDate: ${forwardTo.created_at}\nSubject: ${forwardTo.subject}\n\n${forwardTo.text || ''}`,
                                html: '',
                            }}
                            setComposeData={() => {}}
                            onSend={(text) => sendForward(forwardTo.message_id, undefined, text)}
                            onCancel={() => setForwardTo(null)}
                            sending={sending}
                            isForward
                        />
                    )}

                    {!loading && !showCompose && !selectedMessage && !replyTo && !forwardTo && (
                        <MessageList
                            messages={messages}
                            onSelect={(msg) => getMessage(activeInbox, msg.message_id)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Message List ─────────────────────────────────────────────────────────────
function MessageList({ messages, onSelect }) {
    if (messages.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--text-secondary)]">
                <MailOpen size={32} className="mb-3 opacity-40" />
                <p className="text-sm">No messages</p>
            </div>
        );
    }
    return (
        <div className="divide-y divide-[var(--border)]">
            {messages.map(msg => (
                <button
                    key={msg.message_id}
                    onClick={() => onSelect(msg)}
                    className="w-full text-left px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors border-l-2 border-l-transparent hover:border-l-indigo-500"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-indigo-500/10 flex items-center justify-center">
                            <span className="text-xs font-semibold" style={{ color: INDIGO }}>
                                {(msg.from_ || '?').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium truncate">
                                    {extractName(msg.from_) || msg.from_}
                                </span>
                                <span className="text-[10px] text-[var(--text-secondary)] flex-shrink-0">
                                    {formatDate(msg.created_at)}
                                </span>
                            </div>
                            <div className="text-xs text-[var(--text-primary)] font-medium truncate">
                                {msg.subject}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                                {truncate(msg.preview || msg.text || '', 100)}
                            </div>
                        </div>
                        {msg.attachments?.length > 0 && (
                            <Paperclip size={13} className="text-[var(--text-secondary)] flex-shrink-0" />
                        )}
                    </div>
                </button>
            ))}
        </div>
    );
}

// ── Message View ─────────────────────────────────────────────────────────────
function MessageView({ message, onReply, onForward, onBack }) {
    const { from_, to, cc, subject, text, html, created_at, attachments = [] } = message;
    const [showHeaders, setShowHeaders] = useState(false);

    return (
        <div className="p-6 max-w-3xl mx-auto">
            {/* Subject */}
            <h2 className="text-lg font-semibold mb-2">{subject}</h2>

            {/* Meta */}
            <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[var(--border)]">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                    <span className="text-sm font-semibold" style={{ color: INDIGO }}>
                        {(from_ || '?').charAt(0).toUpperCase()}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{from_}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        To: {Array.isArray(to) ? to.join(', ') : to}
                        {cc?.length > 0 && ` | Cc: ${Array.isArray(cc) ? cc.join(', ') : cc}`}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {formatDate(created_at)} ({new Date(created_at).toLocaleString()})
                    </div>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mb-4">
                <button onClick={onReply} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <Reply size={13} /> Reply
                </button>
                <button onClick={onForward} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <Forward size={13} /> Forward
                </button>
                <button
                    onClick={() => setShowHeaders(!showHeaders)}
                    className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] ml-auto"
                >
                    {showHeaders ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    Headers
                </button>
            </div>

            {/* Headers */}
            {showHeaders && (
                <div className="mb-4 p-3 rounded-md bg-[var(--bg-secondary)] text-xs font-mono space-y-1">
                    <div><span className="text-[var(--text-secondary)]">Message-ID:</span> {message.message_id}</div>
                    {message.thread_id && <div><span className="text-[var(--text-secondary)]">Thread:</span> {message.thread_id}</div>}
                    <div><span className="text-[var(--text-secondary)]">From:</span> {from_}</div>
                    <div><span className="text-[var(--text-secondary)]">To:</span> {Array.isArray(to) ? to.join(', ') : to}</div>
                    {cc?.length > 0 && <div><span className="text-[var(--text-secondary)]">Cc:</span> {Array.isArray(cc) ? cc.join(', ') : cc}</div>}
                </div>
            )}

            {/* Body */}
            <div className="prose prose-sm max-w-none text-[var(--text-primary)]">
                {html ? (
                    <div
                        dangerouslySetInnerHTML={{ __html: html }}
                        className="agentmail-html-content"
                    />
                ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-transparent p-0 m-0">
                        {text || '(no content)'}
                    </pre>
                )}
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[var(--border)]">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                        Attachments ({attachments.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {attachments.map((att, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] text-xs">
                                <Paperclip size={13} style={{ color: INDIGO }} />
                                <span>{att.filename || `attachment-${i + 1}`}</span>
                                <span className="text-[var(--text-secondary)]">
                                    {att.content_type}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Compose View ─────────────────────────────────────────────────────────────
function ComposeView({ composeData, setComposeData, onSend, onCancel, sending, isReply, isForward }) {
    const [text, setText] = useState(composeData.text || '');
    const [to, setTo] = useState(composeData.to || '');
    const [subject, setSubject] = useState(composeData.subject || '');

    const handleSend = () => {
        if (!to || !subject) return;
        if (isReply || isForward) {
            onSend(text, composeData.html);
        } else {
            onSend({ to, subject, text, html: composeData.html });
        }
    };

    const label = isReply ? 'Reply' : isForward ? 'Forward' : 'Compose';

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">{label}</h3>
                <button onClick={onCancel} className="p-1 rounded hover:bg-[var(--bg-secondary)]">
                    <X size={16} />
                </button>
            </div>

            <div className="space-y-3">
                {!isReply && !isForward && (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">To</label>
                            <input
                                type="email"
                                value={to}
                                onChange={e => setTo(e.target.value)}
                                placeholder="recipient@example.com"
                                className="w-full px-3 py-2 text-sm rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Subject</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="Subject"
                                className="w-full px-3 py-2 text-sm rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </>
                )}
                {isReply && (
                    <div className="text-xs text-[var(--text-secondary)] mb-2">
                        Replying to <span className="font-medium">{composeData.to}</span> — {composeData.subject}
                    </div>
                )}
                <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Message</label>
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={isReply || isForward ? 6 : 10}
                        placeholder="Write your message..."
                        className="w-full px-3 py-2 text-sm rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 resize-y font-mono"
                    />
                </div>
                <div className="flex items-center gap-2 pt-2">
                    <button
                        onClick={handleSend}
                        disabled={sending || !to || !subject}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {sending ? 'Sending...' : 'Send'}
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm rounded-md border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
