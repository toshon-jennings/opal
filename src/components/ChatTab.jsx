import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageSquare, Plus, RefreshCw, X } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import NousBadge from './NousBadge';
import { useTheme } from '../context/ThemeContext';
import './ChatTab.css';

const HERMES_TILE_BACKGROUND = '/artwork/design-01kv2y38zh-1781436378.png';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatSessionLabel(sessionId) {
  if (!sessionId) return 'Starting';
  if (sessionId.startsWith('pending-')) return 'Pending first turn';
  if (sessionId.length <= 18) return sessionId;
  return `${sessionId.slice(0, 8)}...${sessionId.slice(-6)}`;
}

function toChatMessage(message) {
  const timestamp = message.timestamp || (message.ts ? Date.parse(message.ts) : Date.now());
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.text || '',
    timestamp,
    metadata: message.metadata || {},
  };
}

function HermesAvatar({ title = 'Hermes' }) {
  return (
    <div className="hermes-chat-avatar" title={title}>
      <NousBadge size="h-8 w-8" />
    </div>
  );
}

function HermesEmpty({ isStarting, onRetry }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center">
      <div className="w-full px-6 py-14 text-center md:px-10">
        <div className="flex flex-col items-center justify-center">
          <h2
            className="flex items-center justify-center gap-3 text-3xl font-light text-[var(--text-primary)] md:text-4xl"
            style={{ fontFamily: "'Georgia', 'Tiempos Text', serif", letterSpacing: '0' }}
          >
            <HermesAvatar />
            {getGreeting()}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-[var(--text-secondary)]">
            Ask Hermes to work through code, plans, files, or local tasks.
          </p>
          {isStarting && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              <span className="hermes-chat-dot is-active" />
              Starting Hermes chat
            </div>
          )}
          {!isStarting && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw size={15} />
              Retry session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HermesThinkingRow() {
  return (
    <div className="flex gap-3 rounded-lg bg-[var(--bg-secondary)] px-4 py-6 transition-colors md:gap-4" role="status">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center md:h-8 md:w-8">
        <HermesAvatar title="Hermes is thinking" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 text-sm font-semibold text-[var(--accent)]">Hermes</div>
        <div className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span className="hermes-chat-thinking-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Thinking
        </div>
      </div>
    </div>
  );
}

function ChatComposer({ onSend, onCancel, isRunning, disabled, isStarting }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);
  const canSend = text.trim().length > 0 && !disabled && !isRunning;

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, []);

  const submit = useCallback(() => {
    const message = text.trim();
    if (!message || disabled || isRunning) return;
    onSend(message);
    setText('');
    resetHeight();
  }, [disabled, isRunning, onSend, resetHeight, text]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }, [submit]);

  const handleChange = useCallback((event) => {
    setText(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-3 transition-colors focus-within:border-[var(--text-tertiary)] md:p-4">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={isStarting ? 'Starting Hermes chat...' : 'Message Hermes...'}
        disabled={disabled || isRunning}
        className="min-h-[40px] max-h-[200px] w-full resize-none border-none bg-transparent text-base leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`hermes-chat-dot ${isRunning ? 'is-active' : ''}`} />
          <span className="truncate text-sm text-[var(--text-secondary)]">
            {isRunning ? 'Hermes is working' : 'Hermes CLI'}
          </span>
        </div>
        {isRunning ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Cancel Hermes turn"
            aria-label="Cancel Hermes turn"
          >
            <X size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            title="Send"
            aria-label="Send message to Hermes"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChatTab({ isDesktop }) {
  const { isDarkMode } = useTheme();
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [started, setStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const activeRunId = useRef(null);
  const autoStartedRef = useRef(false);

  const startSession = useCallback(async ({ clearMessages = false } = {}) => {
    if (!isDesktop) return;
    setIsStarting(true);
    setError(null);
    try {
      const result = await window.electron.startHermesChat();
      if (!result?.ok) {
        setStarted(false);
        setSessionId(null);
        setError(result?.error || 'Could not start Hermes chat.');
        return;
      }

      setStarted(true);
      setSessionId(result.sessionId || null);
      if (clearMessages || !result.resumed) {
        setMessages([]);
      }
    } catch (err) {
      console.error('[ChatTab] startHermesChat error:', err);
      setStarted(false);
      setSessionId(null);
      setError(err.message || 'Could not start Hermes chat.');
    } finally {
      setIsStarting(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startSession();
  }, [isDesktop, startSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRunning]);

  const startFreshChat = useCallback(async () => {
    if (!isDesktop || isStarting || isRunning) return;
    activeRunId.current = null;
    setError(null);
    setMessages([]);
    setStarted(false);
    setSessionId(null);
    try {
      await window.electron.stopHermesChat();
    } catch (err) {
      console.error('[ChatTab] stopHermesChat error:', err);
    }
    await startSession({ clearMessages: true });
  }, [isDesktop, isRunning, isStarting, startSession]);

  const sendMessage = useCallback(async (text) => {
    if (!isDesktop || !sessionId || isRunning) return;

    const now = new Date().toISOString();
    const userMessage = {
      id: `hermes-user-${Date.now()}`,
      role: 'user',
      text,
      ts: now,
      status: 'done',
    };
    const runId = `hermes-assistant-${Date.now()}`;
    activeRunId.current = runId;

    setMessages(prev => [...prev, userMessage]);
    setIsRunning(true);
    setError(null);

    try {
      const result = await window.electron.sendHermesChat({ text });
      if (activeRunId.current !== runId) return;

      const assistantText = result?.ok
        ? (result.output || 'Hermes completed the turn without output.')
        : `Error: ${result?.error || 'Hermes chat turn failed.'}`;

      setMessages(prev => [...prev, {
        id: runId,
        role: 'assistant',
        text: assistantText,
        ts: new Date().toISOString(),
        status: result?.ok ? 'done' : 'error',
      }]);

      if (result?.sessionId) {
        setSessionId(result.sessionId);
      }
    } catch (err) {
      if (activeRunId.current === runId) {
        setMessages(prev => [...prev, {
          id: runId,
          role: 'assistant',
          text: `Error: ${err.message || 'Hermes chat turn failed.'}`,
          ts: new Date().toISOString(),
          status: 'error',
        }]);
      }
    } finally {
      if (activeRunId.current === runId) {
        setIsRunning(false);
        activeRunId.current = null;
      }
    }
  }, [isDesktop, isRunning, sessionId]);

  const cancelRun = useCallback(async () => {
    if (!isDesktop || !isRunning) return;
    const runId = activeRunId.current;
    activeRunId.current = null;
    setIsRunning(false);
    try {
      await window.electron.cancelHermesChat();
    } catch (err) {
      console.error('[ChatTab] cancelHermesChat error:', err);
    }
    setMessages(prev => [...prev, {
      id: runId ? `${runId}-cancelled` : `hermes-cancelled-${Date.now()}`,
      role: 'assistant',
      text: 'Cancelled.',
      ts: new Date().toISOString(),
      status: 'cancelled',
    }]);
  }, [isDesktop, isRunning]);

  if (!isDesktop) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-primary)] p-8 text-center">
        <div className="max-w-md">
          <div className="mb-4 flex justify-center"><NousBadge size="h-12 w-12" /></div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Hermes requires the desktop app</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Hermes chat is available from the Perci desktop shell.
          </p>
        </div>
      </div>
    );
  }

  const canUseComposer = started && Boolean(sessionId) && !isStarting;
  const showRetry = Boolean(error) && !isStarting && !started;

  return (
    <div className="hermes-chat-root relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div
        className="pointer-events-none absolute inset-0 bg-center bg-no-repeat opacity-20"
        style={{
          backgroundImage: `url('${HERMES_TILE_BACKGROUND}')`,
          backgroundSize: 'auto 140%',
          filter: isDarkMode
            ? 'grayscale(1) saturate(0.6) brightness(1.15)'
            : 'saturate(0.72) brightness(1.18) contrast(0.9)'
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[var(--bg-primary)]/55" />

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6 md:py-8">
          {messages.length === 0 ? (
            <HermesEmpty isStarting={isStarting} onRetry={showRetry ? () => startSession({ clearMessages: true }) : null} />
          ) : (
            messages.map(message => (
              <ChatMessage
                key={message.id}
                message={toChatMessage(message)}
                assistantName="Hermes"
                assistantAvatar={<HermesAvatar title={message.status === 'error' ? 'Hermes hit an error' : 'Hermes'} />}
                assistantTitle="Hermes"
              />
            ))
          )}
          {isRunning && <HermesThinkingRow />}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-3xl p-4 md:p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--text-secondary)]">
            <MessageSquare size={15} className="shrink-0 text-[var(--text-tertiary)]" />
            <span className="truncate">
              {isStarting ? 'Starting Hermes' : `Session ${formatSessionLabel(sessionId)}`}
            </span>
          </div>
          <button
            type="button"
            onClick={startFreshChat}
            disabled={isStarting || isRunning}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Start a new Hermes chat"
            title="Start a new Hermes chat"
          >
            <Plus size={15} />
            New chat
          </button>
        </div>

        {error && (
          <div className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            {error}
          </div>
        )}

        <ChatComposer
          onSend={sendMessage}
          onCancel={cancelRun}
          isRunning={isRunning}
          isStarting={isStarting}
          disabled={!canUseComposer}
        />
      </div>
    </div>
  );
}
