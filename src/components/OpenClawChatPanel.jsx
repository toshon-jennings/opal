import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowUp, Plus, RefreshCw } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { VoiceInputButton } from './VoiceInputButton';
import { readJsonStorage, writeJsonStorage } from '../lib/persistentStore';
import openClawLogo from '../assets/openclaw-color.png';
import ocChatBg from '../assets/openclaw-chat-bg.jpeg';
import './OpenClawChatPanel.css';

// One continuous conversation, deliberately free of session UI: the transcript
// and gateway session key persist across window closes and app restarts, the
// composer is usable immediately (no start handshake), and "New chat" is the
// only session control. Each turn passes the stable --session-key to
// `openclaw agent`, so the gateway resumes context server-side.

const STORE_KEY = 'perci_openclaw_chat:v1';
const MAX_MESSAGES = 200;
const SUGGESTIONS = [
  'What can you do?',
  'Anything need my attention?',
  'What tasks are running right now?'
];

// The in-flight turn is tracked on window so a remount (window closed and
// reopened mid-turn) or even a dev hot-reload that re-evaluates this module
// can re-adopt it instead of leaving a new instance stuck on — or blind to —
// a run it never started. A real page reload clears it together with the
// promise it tracks.
function getActiveRun() {
  return window.__perciOpenClawChatRun || null;
}
function setActiveRun(run) {
  window.__perciOpenClawChatRun = run;
}

function readChatState() {
  const stored = readJsonStorage(STORE_KEY, null);
  const messages = Array.isArray(stored?.messages)
    ? stored.messages.filter(m => m && m.id && typeof m.text === 'string')
    : [];
  return {
    sessionKey: typeof stored?.sessionKey === 'string' ? stored.sessionKey : null,
    messages
  };
}

// The store is the single source of truth for the transcript; every write goes
// through here and instance state only mirrors it.
function persistChatState(sessionKey, messages) {
  writeJsonStorage(STORE_KEY, {
    sessionKey,
    messages: messages.slice(-MAX_MESSAGES),
    updatedAt: new Date().toISOString()
  });
}

function appendPersistedMessage(message) {
  const { sessionKey, messages } = readChatState();
  persistChatState(sessionKey, [...messages, message]);
}

function newSessionKey(agentId) {
  return `agent:${agentId}:perci-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function toChatMessage(message) {
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.text || '',
    timestamp: message.ts ? Date.parse(message.ts) : Date.now(),
    metadata: {}
  };
}

function channelNames(channels) {
  if (!Array.isArray(channels)) return [];
  return channels
    .map(ch => (typeof ch === 'string' ? ch : ch?.channel || ch?.name || ch?.id || null))
    .filter(Boolean)
    .slice(0, 4);
}

function describeStatus(status, isRunning) {
  if (isRunning) return { tone: 'busy', text: 'OpenClaw is working…' };
  const health = status?.result?.health;
  if (status?.state === 'online') {
    const bits = [];
    const version = health?.runtimeVersion;
    bits.push(version ? `Running ${/^v/i.test(version) ? version : `v${version}`}` : 'Running');
    const active = Number(health?.tasks?.active);
    if (active > 0) bits.push(`${active} active task${active === 1 ? '' : 's'}`);
    const channels = channelNames(health?.channels);
    if (channels.length) bits.push(channels.join(', '));
    return { tone: 'ok', text: bits.join(' · ') };
  }
  if (status?.state === 'checking' || status?.state === 'idle') {
    return { tone: 'neutral', text: 'Checking OpenClaw…' };
  }
  return { tone: 'down', text: 'Gateway not reachable' };
}

function OpenClawAvatar({ title = 'OpenClaw' }) {
  return (
    <div className="oc-chat-avatar" title={title}>
      <img src={openClawLogo} alt="" />
    </div>
  );
}

function OpenClawThinkingRow() {
  return (
    <div className="flex gap-3 rounded-lg bg-[var(--bg-secondary)] px-4 py-6 transition-colors md:gap-4" role="status">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center md:h-8 md:w-8">
        <OpenClawAvatar title="OpenClaw is thinking" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 text-sm font-semibold text-[var(--accent)]">OpenClaw</div>
        <div className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span className="oc-chat-thinking-dots" aria-hidden="true">
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

function OpenClawEmpty({ onSuggest, canSend }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center">
      <div className="w-full px-6 py-14 text-center md:px-10">
        <div className="mb-5 flex justify-center">
          <div className="oc-chat-avatar oc-chat-avatar-lg">
            <img src={openClawLogo} alt="" />
          </div>
        </div>
        <h2
          className="text-3xl font-light text-[var(--text-primary)] md:text-4xl"
          style={{ fontFamily: "'Georgia', 'Tiempos Text', serif", letterSpacing: '0' }}
        >
          {getGreeting()}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-[var(--text-secondary)]">
          Talk to OpenClaw like a normal chat. It keeps this conversation going until you start a new one.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {SUGGESTIONS.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggest(suggestion)}
              disabled={!canSend}
              className="rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OpenClawComposer({ onSend, isRunning, disabled }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);
  const canSend = text.trim().length > 0 && !disabled && !isRunning;

  // Refocus after a turn completes so you can keep typing without clicking back in.
  useEffect(() => {
    if (!isRunning && !disabled) {
      textareaRef.current?.focus();
    }
  }, [isRunning, disabled]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [text]);

  const submit = useCallback(() => {
    const message = text.trim();
    if (!message || disabled || isRunning) return;
    onSend(message);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [disabled, isRunning, onSend, text]);

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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 transition-colors focus-within:border-[var(--text-tertiary)] md:p-4">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Message OpenClaw..."
        disabled={disabled}
        className="min-h-[40px] max-h-[200px] w-full resize-none border-none bg-transparent text-base leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="truncate text-xs text-[var(--text-tertiary)]">
          Enter to send · Shift+Enter for a new line
        </span>
        <div className="flex items-center gap-2">
          <VoiceInputButton value={text} onChange={setText} disabled={disabled || isRunning} />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            title="Send"
            aria-label="Send message to OpenClaw"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function OpenClawChatPanel({ profile, status, isRestarting, onRestart }) {
  const isDesktop = Boolean(window.electron?.runOpenClawAgent);
  const [initial] = useState(readChatState);
  const [messages, setMessages] = useState(initial.messages);
  const [sessionKey, setSessionKey] = useState(initial.sessionKey);
  const [isRunning, setIsRunning] = useState(false);
  const bottomRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => () => { isMountedRef.current = false; }, []);

  const applyStoreToState = useCallback(() => {
    const fresh = readChatState();
    setMessages(fresh.messages);
    setSessionKey(fresh.sessionKey);
  }, []);

  // Self-heal on mount: adopt a turn that is still in flight from a previous
  // instance (window reopened or hot-reloaded mid-turn) so the transcript and
  // the "working" indicator stay truthful, or make sure the flag is off.
  useEffect(() => {
    const run = getActiveRun();
    if (!run) return undefined;
    setIsRunning(true);
    let alive = true;
    run.finally(() => {
      if (!alive) return;
      applyStoreToState();
      setIsRunning(false);
    });
    return () => { alive = false; };
  }, [applyStoreToState]);

  useEffect(() => {
    if (messages.length === 0 && !isRunning) return; // keep the greeting in view
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isRunning]);

  const sendMessage = useCallback(async (text) => {
    if (!isDesktop || isRunning || getActiveRun()) return;
    const agentId = status?.result?.health?.defaultAgentId || 'main';
    const key = sessionKey || newSessionKey(agentId);
    const userMessage = {
      id: `oc-user-${Date.now()}`,
      role: 'user',
      text,
      ts: new Date().toISOString()
    };
    persistChatState(key, [...readChatState().messages, userMessage]);
    setSessionKey(key);
    setMessages(prev => [...prev, userMessage]);
    setIsRunning(true);

    const run = (async () => {
      try {
        const result = await window.electron.runOpenClawAgent({ message: text, agent: agentId, sessionKey: key });
        return {
          id: `oc-assistant-${Date.now()}`,
          role: 'assistant',
          text: result?.ok
            ? (result.text || 'OpenClaw finished the turn without a reply.')
            : `Error: ${result?.error || 'OpenClaw did not reply.'}`,
          ts: new Date().toISOString(),
          status: result?.ok ? 'done' : 'error'
        };
      } catch (err) {
        return {
          id: `oc-assistant-${Date.now()}`,
          role: 'assistant',
          text: `Error: ${err?.message || 'OpenClaw did not reply.'}`,
          ts: new Date().toISOString(),
          status: 'error'
        };
      }
    })();
    setActiveRun(run);

    const reply = await run;
    setActiveRun(null);
    appendPersistedMessage(reply);
    if (isMountedRef.current) {
      applyStoreToState();
      setIsRunning(false);
    }
  }, [applyStoreToState, isDesktop, isRunning, sessionKey, status]);

  const startNewChat = useCallback(() => {
    if (isRunning) return;
    persistChatState(null, []); // the next send mints a fresh gateway session
    setMessages([]);
    setSessionKey(null);
  }, [isRunning]);

  if (!isDesktop) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg-primary)] p-8 text-center">
        <div className="max-w-md">
          <div className="mb-4 flex justify-center">
            <div className="oc-chat-avatar oc-chat-avatar-lg">
              <img src={openClawLogo} alt="" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">OpenClaw chat requires the desktop app</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Perci talks to OpenClaw through its local CLI, which is only available from the desktop shell.
          </p>
        </div>
      </div>
    );
  }

  const statusInfo = describeStatus(status, isRunning);
  const isDown = status?.state === 'offline';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden text-[var(--text-primary)]">
      <div aria-hidden="true" className="absolute inset-0 z-0 opacity-20" style={{ backgroundImage: `url(${ocChatBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
      <div className="min-h-0 flex-1 overflow-y-auto relative z-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6 md:py-8">
          {messages.length === 0 ? (
            <OpenClawEmpty onSuggest={sendMessage} canSend={!isRunning} />
          ) : (
            messages.map(message => (
              <ChatMessage
                key={message.id}
                message={toChatMessage(message)}
                assistantName="OpenClaw"
                assistantAvatar={<OpenClawAvatar title={message.status === 'error' ? 'OpenClaw hit an error' : 'OpenClaw'} />}
                assistantTitle="OpenClaw"
              />
            ))
          )}
          {isRunning && <OpenClawThinkingRow />}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl p-4 md:p-6 relative z-10">
        {isDown && (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle size={15} className="shrink-0 text-amber-500" />
            <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
              The OpenClaw gateway is not responding{profile?.gatewayUrl ? ` at ${profile.gatewayUrl}` : ''}. Messages may fail until it is back.
            </span>
            {onRestart && (
              <button
                type="button"
                onClick={onRestart}
                disabled={isRestarting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={13} className={isRestarting ? 'animate-spin' : ''} />
                {isRestarting ? 'Restarting…' : 'Restart gateway'}
              </button>
            )}
          </div>
        )}

        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span className={`oc-chat-dot tone-${statusInfo.tone}`} />
            <span className="truncate">{statusInfo.text}</span>
          </div>
          <button
            type="button"
            onClick={startNewChat}
            disabled={isRunning || messages.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Start a new conversation"
          >
            <Plus size={15} />
            New chat
          </button>
        </div>

        <OpenClawComposer onSend={sendMessage} isRunning={isRunning} disabled={false} />
      </div>
    </div>
  );
}
