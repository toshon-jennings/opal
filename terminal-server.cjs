const { WebSocketServer, WebSocket } = require('ws');
const os = require('os');
const pty = require('node-pty');
const fs = require('fs');

const PORT = 3001;
const sessions = new Map();
const MAX_BUFFER_LENGTH = 200000;
const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const DEVICE_ATTRIBUTE_RESPONSE_PATTERN = /\x1b\[\??[\d;]*c/g;
const PLAIN_DEVICE_ATTRIBUTE_RESPONSE_PATTERN = /^(?:\?1;2c|1;2c)+$/;

function stripTerminalGeneratedInput(input) {
  const withoutEscapedResponse = input.replace(DEVICE_ATTRIBUTE_RESPONSE_PATTERN, '');
  return PLAIN_DEVICE_ATTRIBUTE_RESPONSE_PATTERN.test(withoutEscapedResponse)
    ? ''
    : withoutEscapedResponse;
}

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

let wss;
try {
  wss = new WebSocketServer({ port: PORT });
  console.log(`Opal Terminal Server (node-pty) running on ws://localhost:${PORT}`);
} catch (err) {
  console.error(`[ERROR] Failed to start WebSocket server on port ${PORT}:`, err);
  process.exit(1);
}

function createSession(sessionId) {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/zsh');
  
  // Robust shell check
  let finalShell = shell;
  if (!fs.existsSync(finalShell)) {
    if (fs.existsSync('/bin/zsh')) finalShell = '/bin/zsh';
    else if (fs.existsSync('/bin/bash')) finalShell = '/bin/bash';
    else finalShell = '/bin/sh';
  }

  console.log(`[PTY] Spawning ${finalShell} for session: ${sessionId}`);
  const ptyEnv = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG || 'en_US.UTF-8',
    LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
  };
  delete ptyEnv.NO_COLOR;

  const ptyProcess = pty.spawn(finalShell, ['-l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: ptyEnv,
  });

  const session = {
    id: sessionId,
    ptyProcess,
    clients: new Set(),
    buffer: '',
    idleTimer: null,
  };

  ptyProcess.onData((str) => {
    session.buffer += str;
    if (session.buffer.length > MAX_BUFFER_LENGTH) {
      session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER_LENGTH);
    }
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(str);
      }
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] Session ${sessionId} exited with code ${exitCode}`);
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send('\r\n\x1b[31m[Opal]\x1b[0m Shell process terminated.\r\n');
        client.close();
      }
    }
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  return session;
}

function getOrCreateSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (existing) {
    if (existing.idleTimer) {
      clearTimeout(existing.idleTimer);
      existing.idleTimer = null;
    }
    return existing;
  }
  return createSession(sessionId);
}

function scheduleSessionCleanup(session) {
  if (session.idleTimer || session.clients.size > 0) return;
  session.idleTimer = setTimeout(() => {
    if (session.clients.size === 0) {
      console.log(`[PTY] Cleaning up idle session: ${session.id}`);
      session.ptyProcess.kill();
      sessions.delete(session.id);
    }
  }, SESSION_IDLE_TIMEOUT_MS);
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', 'ws://localhost:3001');
  const sessionId = url.searchParams.get('sessionId') || 'default';
  
  try {
    const session = getOrCreateSession(sessionId);
    session.clients.add(ws);
    
    console.log(`[WS] Client connected to session: ${sessionId}`);

    // Send history buffer
    if (session.buffer) {
      ws.send(session.buffer);
    }

    ws.on('message', (message) => {
      const str = message.toString();
      try {
        const parsed = JSON.parse(str);
        if (parsed.type === 'resize') {
            const cols = Number(parsed.cols);
            const rows = Number(parsed.rows);
            if (Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0) {
              session.ptyProcess.resize(Math.floor(cols), Math.floor(rows));
            }
            return;
        }
        if (parsed.type === 'clearLine') {
            session.ptyProcess.write('\x15');
            return;
        }
      } catch { }
      
      const input = stripTerminalGeneratedInput(str);

      // Pass raw input to the Python PTY stdin
      if (input) {
        session.ptyProcess.write(input);
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected from session: ${sessionId}`);
      session.clients.delete(ws);
      scheduleSessionCleanup(session);
    });
  } catch (err) {
    console.error('[WS] Session error:', err);
    ws.send(`\r\n\x1b[31m[Critical Error]\x1b[0m ${err.message}\r\n`);
    ws.close();
  }
});

wss.on('error', (err) => {
    console.error('[WS] Server error:', err);
});
