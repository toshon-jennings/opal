import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as TerminalIcon, X, RefreshCw } from 'lucide-react';
import { useTheme } from "../context/ThemeContext";
import { buildTerminalWsUrl, getTerminalConnectionInfo, getTerminalPortCandidates, rememberTerminalPort } from "../lib/terminalBridge";
import "@xterm/xterm/css/xterm.css";

const DEVICE_ATTRIBUTE_RESPONSE_PATTERN = /\x1b\[\??[\d;]*c/g;
const PLAIN_DEVICE_ATTRIBUTE_RESPONSE_PATTERN = /^(?:\?1;2c|1;2c)+$/;

function stripTerminalGeneratedInput(data) {
  const withoutEscapedResponse = data.replace(DEVICE_ATTRIBUTE_RESPONSE_PATTERN, "");
  return PLAIN_DEVICE_ATTRIBUTE_RESPONSE_PATTERN.test(withoutEscapedResponse)
    ? ""
    : withoutEscapedResponse;
}


// `embedded` hides the built-in chrome so a host (e.g. the Hermes multitab
// terminal) can own the tab strip; it then drives the panel through the ref
// ({ reset, reconnect, focus }) and `onStatusChange`.
const TerminalPanel = forwardRef(function TerminalPanel({ sessionId = 'default', onClose, embedded = false, onStatusChange, onOutput }, ref) {
  const { isDarkMode } = useTheme();
  const terminalRef = useRef(null);
  const termInstanceRef = useRef(null);
  const wsRef = useRef(null);
  const layoutReadyRef = useRef(false);
  const activePortIndexRef = useRef(0);
  const [status, setStatus] = useState("connecting");
  const [isFocused, setIsFocused] = useState(false);

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  useEffect(() => { onStatusChangeRef.current?.(status); }, [status]);

  const onOutputRef = useRef(onOutput);
  onOutputRef.current = onOutput;

  const retryTimerRef = useRef(null);

  // Detach handlers before closing so a stale socket's close/error can't
  // schedule a reconnect: a second client on the same PTY session makes the
  // server broadcast every output chunk twice, garbling the terminal.
  const dropSocket = useCallback(() => {
    clearTimeout(retryTimerRef.current);
    const old = wsRef.current;
    if (old) {
      old.onopen = old.onclose = old.onerror = old.onmessage = null;
      try { old.close(); } catch { /* already closed */ }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    const container = terminalRef.current;
    if (!container || !termInstanceRef.current || !layoutReadyRef.current) return;

    // Don't connect if the container has no dimensions yet — we'll
    // connect later when the ResizeObserver fires with a real size.
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    dropSocket();
    setStatus("connecting");

    const ports = getTerminalPortCandidates();
    const port = ports[activePortIndexRef.current] || ports[0];
    const { token } = await getTerminalConnectionInfo();
    if (!terminalRef.current || !termInstanceRef.current || !layoutReadyRef.current) return;
    const wsUrl = buildTerminalWsUrl(port, sessionId, false, token);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const term = termInstanceRef.current;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      rememberTerminalPort(port);
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      setStatus("connected");
      term.writeln(`\x1b[33m[Perci]\x1b[0m PTY-Bridge authorized on port ${port}. Prompting shell...`);
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setStatus("disconnected");
      term.writeln("\r\n\x1b[31m[System]\x1b[0m Terminal server connection lost.");
    };

    ws.onerror = (err) => {
      if (wsRef.current !== ws) return;
      console.error('Terminal WebSocket error:', err);
      if (activePortIndexRef.current < ports.length - 1) {
        activePortIndexRef.current += 1;
        ws.onclose = null;
        ws.close();
        retryTimerRef.current = setTimeout(connect, 100);
        return;
      }
      setStatus("error");
      term.writeln("\r\n\x1b[31m[Error]\x1b[0m Could not connect to local terminal server.");
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      if (typeof event.data === "string") {
        term.write(event.data);
        onOutputRef.current?.(event.data);
      }
    };
  }, [sessionId, dropSocket]);

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      convertEol: true,
      scrollback: 20000,
      theme: isDarkMode ? {
        background: "#0C0C0D",
        foreground: "#F5F5F7",
        cursor: "#fb923c",
        selectionBackground: "rgba(249, 115, 22, 0.3)",
      } : {
        background: "#FFFFFF",
        foreground: "#1A1A1B",
        cursor: "#fb923c",
        selectionBackground: "rgba(249, 115, 22, 0.15)",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(container);
    termInstanceRef.current = term;
    // xterm's viewport is absolutely positioned. Give its relative parent a
    // stable height so the viewport does not inherit the screen's initial 0px
    // height while character metrics are still being established.
    term.element.style.height = "100%";

    let disposed = false;
    let fontReady = !document.fonts;
    let layoutFrame = null;
    let connecting = false;

    const scheduleLayout = () => {
      if (layoutFrame !== null) return;
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = null;
        if (disposed || !fontReady || !termInstanceRef.current) return;

        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        // A same-size resize is the public xterm path that re-measures an
        // invalid CharSizeService after a hidden mount. Do it before asking
        // FitAddon for dimensions; fit() silently no-ops for a 0px cell.
        term.resize(term.cols, term.rows);
        if (!fitAddon.proposeDimensions()) return;

        fitAddon.fit();
        if (!fitAddon.proposeDimensions()) return;

        layoutReadyRef.current = true;
        // If IntersectionObserver paused rendering while this panel was
        // hidden, refresh marks the full paint for delivery on visibility.
        term.refresh(0, term.rows - 1);

        if (!wsRef.current && !connecting) {
          connecting = true;
          void connect().finally(() => { connecting = false; });
        }
      });
    };

    term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const input = stripTerminalGeneratedInput(data);
        if (input) {
          wsRef.current.send(input);
        }
      }
    });

    const handleTerminalFocus = () => setIsFocused(true);
    const handleTerminalBlur = () => setIsFocused(false);

    const textarea = container.querySelector("textarea");
    if (textarea) {
      textarea.addEventListener("focus", handleTerminalFocus);
      textarea.addEventListener("blur", handleTerminalBlur);
    }

    const handleResize = () => scheduleLayout();

    if (document.fonts) {
      // `fonts.ready` alone can already be resolved before xterm asks for its
      // font. Explicitly request this face first, then wait for the font set.
      void document.fonts.load('13px "JetBrains Mono"')
        .catch(() => [])
        .then(() => document.fonts.ready)
        .then(() => {
          fontReady = true;
          scheduleLayout();
        });
    } else {
      scheduleLayout();
    }

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);

    return () => {
      if (textarea) {
        textarea.removeEventListener("focus", handleTerminalFocus);
        textarea.removeEventListener("blur", handleTerminalBlur);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      disposed = true;
      layoutReadyRef.current = false;
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
      dropSocket();
      termInstanceRef.current = null;
      term.dispose();
    };
  }, [isDarkMode, connect, dropSocket]);

  const handleReset = () => {
    wsRef.current?.send('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l\x1b[?1l\x1b[?1049l\x1b[?25h\x1b[0m');
    termInstanceRef.current?.reset();
  };

  const handleReconnect = () => {
    wsRef.current?.close();
    activePortIndexRef.current = 0;
    connect();
  };

  useImperativeHandle(ref, () => ({
    reset: handleReset,
    reconnect: handleReconnect,
    focus: () => termInstanceRef.current?.focus(),
    sendInput: (data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    }
  }));

  return (
    <div className={`flex flex-col h-full w-full ${isDarkMode ? 'bg-[#0C0C0D]' : 'bg-white'} overflow-hidden`}>
      {!embedded && (
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              status === "connected" ? "bg-green-500" : status === "connecting" ? "bg-amber-500" : "bg-red-500"
            }`}
          />
          <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
            <TerminalIcon size={14} />
            Local Terminal
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest">
            {isFocused ? "• Active" : "• Ready"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {status !== "connected" && (
            <button
                onClick={handleReconnect}
                className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors flex items-center gap-1"
            >
                <RefreshCw size={10} className={status === "connecting" ? "animate-spin" : ""} />
                Reconnect
            </button>
          )}
          <button
            onClick={handleReset}
            className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Reset
          </button>
          {onClose && (
            <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      )}
      <div
        className={`flex-1 min-h-0 px-2 pt-2 overflow-hidden ${embedded ? 'pb-2' : 'pb-6'}`}
        onPointerDown={() => termInstanceRef.current?.focus()}
      >
        <div ref={terminalRef} className="h-full w-full overflow-hidden" />
      </div>
    </div>
  );
});

export default TerminalPanel;
