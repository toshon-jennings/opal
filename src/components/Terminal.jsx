import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as TerminalIcon, X, Copy, RefreshCw } from 'lucide-react';
import { useTheme } from "../context/ThemeContext";
import { buildTerminalWsUrl, getTerminalPortCandidates, rememberTerminalPort } from "../lib/terminalBridge";
import "@xterm/xterm/css/xterm.css";

const DEVICE_ATTRIBUTE_RESPONSE_PATTERN = /\x1b\[\??[\d;]*c/g;
const PLAIN_DEVICE_ATTRIBUTE_RESPONSE_PATTERN = /^(?:\?1;2c|1;2c)+$/;

function stripTerminalGeneratedInput(data) {
  const withoutEscapedResponse = data.replace(DEVICE_ATTRIBUTE_RESPONSE_PATTERN, "");
  return PLAIN_DEVICE_ATTRIBUTE_RESPONSE_PATTERN.test(withoutEscapedResponse)
    ? ""
    : withoutEscapedResponse;
}

export default function TerminalPanel({ sessionId = 'default', onClose }) {
  const { isDarkMode } = useTheme();
  const terminalRef = useRef(null);
  const termInstanceRef = useRef(null);
  const wsRef = useRef(null);
  const outputBufferRef = useRef("");
  const activePortIndexRef = useRef(0);
  const [status, setStatus] = useState("connecting");
  const [isFocused, setIsFocused] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const connect = useCallback(() => {
    const container = terminalRef.current;
    if (!container || !termInstanceRef.current) return;

    setStatus("connecting");
    
    const ports = getTerminalPortCandidates();
    const port = ports[activePortIndexRef.current] || ports[0];
    const wsUrl = buildTerminalWsUrl(port, sessionId);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const term = termInstanceRef.current;

    ws.onopen = () => {
      rememberTerminalPort(port);
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      setStatus("connected");
      setRetryCount(0);
      term.writeln(`\x1b[33m[Perci]\x1b[0m PTY-Bridge authorized on port ${port}. Prompting shell...`);
    };

    ws.onclose = () => {
      setStatus("disconnected");
      term.writeln("\r\n\x1b[31m[System]\x1b[0m Terminal server connection lost.");
    };

    ws.onerror = (err) => {
      console.error('Terminal WebSocket error:', err);
      if (activePortIndexRef.current < ports.length - 1) {
        activePortIndexRef.current += 1;
        setRetryCount(count => count + 1);
        ws.close();
        setTimeout(connect, 100);
        return;
      }
      setStatus("error");
      term.writeln("\r\n\x1b[31m[Error]\x1b[0m Could not connect to local terminal server.");
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        term.write(event.data);
      }
    };
  }, [sessionId]);

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
    
    setTimeout(() => {
        try { fitAddon.fit(); } catch (e) {}
    }, 100);

    connect();

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

    const handleResize = () => {
      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch (e) {}
      });
    };

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
      wsRef.current?.close();
      term.dispose();
    };
  }, [isDarkMode, connect]);

  const handleReset = () => {
    wsRef.current?.send('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l\x1b[?1l\x1b[?1049l\x1b[?25h\x1b[0m');
    termInstanceRef.current?.reset();
  };

  const handleReconnect = () => {
    wsRef.current?.close();
    activePortIndexRef.current = 0;
    connect();
  };

  return (
    <div className={`flex flex-col h-full w-full ${isDarkMode ? 'bg-[#0C0C0D]' : 'bg-white'} overflow-hidden`}>
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
      <div className="flex-1 min-h-0 px-2 pt-2 pb-6 overflow-hidden">
        <div ref={terminalRef} className="h-full w-full overflow-hidden" />
      </div>
    </div>
  );
}
