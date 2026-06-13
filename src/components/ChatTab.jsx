import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Square, Trash2, User } from 'lucide-react';
import NousBadge from './NousBadge';
import './ChatTab.css';

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

// { id, role: 'user'|'assistant', text, ts, status: 'pending'|'streaming'|'done'|'error' }

// ---------------------------------------------------------------------------
// Single message bubble
// ---------------------------------------------------------------------------
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-assistant'}`}>
      <div className="chat-msg-avatar">
        {isUser ? (
          <div className="chat-avatar chat-avatar-user">
            <User size={13} />
          </div>
        ) : (
          <div className="chat-avatar chat-avatar-hermes">
            <NousBadge size="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="chat-msg-body">
        <div className="chat-msg-header">
          <span className="chat-msg-name">{isUser ? 'You' : 'Hermes'}</span>
          {msg.ts && (
            <span className="chat-msg-time">
              {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className={`chat-msg-text ${msg.status === 'streaming' ? 'chat-streaming' : ''}`}>
          {msg.text || (
            <span className="chat-thinking">
              <span className="chat-thinking-dots">
                <span /><span /><span />
              </span>
            </span>
          )}
          {msg.status === 'error' && (
            <span className="chat-error-icon" title="Failed">⚠</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function ChatEmpty() {
  return (
    <div className="chat-empty">
      <div className="chat-empty-icon">
        <NousBadge size="h-12 w-12" />
      </div>
      <h3 className="chat-empty-title">Chat with Hermes</h3>
      <p className="chat-empty-desc">
        A persistent conversation with tools, memory, and full context.
        Each message carries the full history forward.
      </p>
      <div className="chat-empty-hints">
        <span className="chat-hint">⌘↩ send</span>
        <span className="chat-hint">Shift+↩ new line</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat input area
// ---------------------------------------------------------------------------
function ChatInput({ onSend, onCancel, isRunning, disabled }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const submit = useCallback(() => {
    const msg = text.trim();
    if (!msg || isRunning || disabled) return;
    onSend(msg);
    setText('');
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isRunning, disabled, onSend]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      // Allow Shift+Enter for newline; plain Enter submits
      e.preventDefault();
      submit();
    }
  }, [submit]);

  const handleInput = useCallback((e) => {
    setText(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  return (
    <div className="chat-input-area">
      <div className="chat-input-wrap">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={disabled ? 'Start a chat session first…' : 'Message Hermes…'}
          disabled={disabled}
          className="chat-textarea"
        />
      </div>
      <div className="chat-input-actions">
        {isRunning ? (
          <button
            onClick={onCancel}
            className="chat-btn chat-btn-cancel"
            title="Cancel"
          >
            <Square size={14} />
            Cancel
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim() || disabled}
            className="chat-btn chat-btn-send"
            title="Send (⌘↩)"
          >
            <Send size={14} />
            Send
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatTab
// ---------------------------------------------------------------------------
export default function ChatTab({ isDesktop }) {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);
  const activeRunId = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start a chat session
  const startSession = useCallback(async () => {
    if (!isDesktop) return;
    setError(null);
    try {
      const result = await window.electron.startHermesChat();
      if (result?.ok) {
        setSessionId(result.sessionId);
        setStarted(true);
        if (result.resumed) {
          // Session was already active in the main process — we're picking it up.
          setMessages([{
            id: `sys-${Date.now()}`,
            role: 'system',
            text: 'Conversation resumed. Hermes remembers the previous context.',
            ts: new Date().toISOString(),
            status: 'done',
          }]);
        } else {
          setMessages([]);
        }
      } else {
        setError(result?.error || 'Could not start chat session.');
      }
    } catch (err) {
      console.error('[ChatTab] startHermesChat error:', err);
      setError(err.message || 'Could not start chat session.');
    }
  }, [isDesktop]);

  // Stop / clear the session
  const stopSession = useCallback(async () => {
    if (!isDesktop) return;
    await window.electron.stopHermesChat();
    setSessionId(null);
    setStarted(false);
    setMessages([]);
    setIsRunning(false);
    activeRunId.current = null;
  }, [isDesktop]);

  // Send a message
  const sendMessage = useCallback(async (text) => {
    if (!sessionId || isRunning) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      ts: new Date().toISOString(),
      status: 'done',
    };
    const runId = `a-${Date.now()}`;
    activeRunId.current = runId;
    const assistantMsg = {
      id: runId,
      role: 'assistant',
      text: '',
      ts: new Date().toISOString(),
      status: 'streaming',
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsRunning(true);
    setError(null);

    const result = await window.electron.sendHermesChat({ text });

    // If cancel was pressed while waiting, discard the result
    if (activeRunId.current !== runId) return;

    if (!result?.ok) {
      setMessages(prev =>
        prev.map(m =>
          m.id === runId
            ? { ...m, text: result?.error || 'Something went wrong.', status: 'error' }
            : m
        )
      );
      setIsRunning(false);
      activeRunId.current = null;
      return;
    }

    // Replace the streaming bubble with the final output
    setMessages(prev =>
      prev.map(m =>
        m.id === runId
          ? { ...m, text: result.output, status: 'done' }
          : m
      )
    );
    setIsRunning(false);
    activeRunId.current = null;
  }, [sessionId, isDesktop, isRunning]);

  // Cancel a running turn
  const cancelRun = useCallback(async () => {
    // We can't truly cancel a running hermes -q subprocess from here,
    // but we can mark the UI state. The subprocess will finish and its
    // output will be discarded since activeRunId won't match.
    setIsRunning(false);
    activeRunId.current = null;
    setMessages(prev =>
      prev.map(m =>
        m.status === 'streaming' ? { ...m, text: 'Cancelled.', status: 'cancelled' } : m
      )
    );
  }, []);

  // If desktop but session not started, show a start prompt
  if (isDesktop && !started) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="chat-start-prompt">
          <div className="chat-start-icon">
            <NousBadge size="h-14 w-14" />
          </div>
          <h2 className="chat-start-title">Hermes Chat</h2>
          <p className="chat-start-desc">
            Start a persistent conversation. Hermes remembers everything you say
            and can use tools, read files, run commands, and more.
          </p>
          {error && <p className="chat-start-error">{error}</p>}
          <button onClick={startSession} className="chat-start-btn">
            Start chat session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Session header */}
      <div className="chat-session-bar">
        <div className="chat-session-info">
          <span className={`chat-session-dot ${isRunning ? 'chat-session-dot-active' : ''}`} />
          <span className="chat-session-label">
            {isRunning ? 'Thinking…' : 'Session active'}
          </span>
          {sessionId && (
            <span className="chat-session-id">{sessionId}</span>
          )}
        </div>
        <div className="chat-session-actions">
          <button
            onClick={stopSession}
            className="chat-session-clear"
            title="End session & clear"
          >
            <Trash2 size={13} />
            End
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <ChatEmpty />
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Error banner */}
      {error && !isRunning && (
        <div className="chat-error-banner">
          {error}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        onCancel={cancelRun}
        isRunning={isRunning}
        disabled={!sessionId}
      />
    </div>
  );
}
