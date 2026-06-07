const { WebSocketServer, WebSocket } = require('ws');
const os = require('os');
const pty = require('node-pty');
const fs = require('fs');

const PORT = Number(process.env.OPAL_TERMINAL_PORT) || 3001;
const sessions = new Map();
const MAX_BUFFER_LENGTH = 200000;
const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const DEVICE_ATTRIBUTE_RESPONSE_PATTERN = /\x1b\[\??[\d;]*c/g;
const PLAIN_DEVICE_ATTRIBUTE_RESPONSE_PATTERN = /^(?:\?1;2c|1;2c)+$/;
const MISSION_START_PREFIX = '__OPAL_MISSION_START__';
const MISSION_END_PREFIX = '__OPAL_MISSION_END__';

function stripTerminalGeneratedInput(input) {
  const withoutEscapedResponse = input.replace(DEVICE_ATTRIBUTE_RESPONSE_PATTERN, '');
  return PLAIN_DEVICE_ATTRIBUTE_RESPONSE_PATTERN.test(withoutEscapedResponse)
    ? ''
    : withoutEscapedResponse;
}

function sanitizeTerminalDisplay(output) {
  return output
    .replace(new RegExp(`\\r?\\n?${MISSION_START_PREFIX}:[^\\r\\n]*\\r?\\n?`, 'g'), '')
    .replace(new RegExp(`\\r?\\n?${MISSION_END_PREFIX}:[^\\r\\n]*\\r?\\n?`, 'g'), '');
}

function buildMissionCommandScript(runId, command) {
  return [
    `printf '\\n${MISSION_START_PREFIX}:${runId}\\n'`,
    command,
    '__perci_mission_status=$?',
    `printf '\\n${MISSION_END_PREFIX}:${runId}:%s\\n' "$__perci_mission_status"`
  ].join('\n') + '\n';
}

function cleanMissionOutput(rawOutput, runId, command = '') {
    const startPattern = new RegExp(`${MISSION_START_PREFIX}:${escapeRegExp(runId)}\\r?\\n?`);
    const endPattern = new RegExp(`${MISSION_END_PREFIX}:${escapeRegExp(runId)}:\\d+\\r?\\n?`);
    const runIdTail = String(runId).slice(Math.max(0, String(runId).indexOf('-') + 1));
  return stripTerminalControl(rawOutput
    .replace(startPattern, '')
    .replace(endPattern, '')
  )
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => {
      const trimmed = line.trim();
      return trimmed
        && !trimmed.includes(MISSION_START_PREFIX)
        && !trimmed.includes(MISSION_END_PREFIX)
        && !trimmed.includes(runId)
        && !(runIdTail && trimmed.includes(runIdTail))
        && !trimmed.includes('__perci_mission_status')
        && !trimmed.startsWith('printf ')
        && trimmed !== '%'
        && trimmed !== '-'
        && !/^[a-z]$/.test(trimmed)
        && !trimmed.endsWith(' %')
        && !(command && trimmed.includes(command));
    })
    .join('\n')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTerminalControl(output) {
  let cleaned = String(output || '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '\n');
  while (/.\x08/.test(cleaned)) {
    cleaned = cleaned.replace(/.\x08/g, '');
  }
  return cleaned;
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
  console.log(`Perci Terminal Server (node-pty) running on ws://localhost:${PORT}`);
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
    missionWatchers: new Map(),
    buffer: '',
    idleTimer: null,
  };

  ptyProcess.onData((str) => {
    session.buffer += str;
    if (session.buffer.length > MAX_BUFFER_LENGTH) {
      session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER_LENGTH);
    }
    for (const [runId, watcher] of session.missionWatchers.entries()) {
      watcher.output += str;
      const endMatch = watcher.output.match(new RegExp(`${MISSION_END_PREFIX}:${escapeRegExp(runId)}:(\\d+)`));
      if (endMatch) {
        const exitCode = Number(endMatch[1]);
        if (watcher.client.readyState === WebSocket.OPEN) {
          watcher.client.send(JSON.stringify({
            type: 'commandResult',
            runId,
            exitCode,
            output: cleanMissionOutput(watcher.output, runId, watcher.command)
          }));
        }
        session.missionWatchers.delete(runId);
      } else if (watcher.client.readyState === WebSocket.OPEN) {
        watcher.client.send(JSON.stringify({
          type: 'commandOutput',
          runId,
          chunk: str
        }));
      }
    }
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(sanitizeTerminalDisplay(str));
      }
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] Session ${sessionId} exited with code ${exitCode}`);
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send('\r\n\x1b[31m[Perci]\x1b[0m Shell process terminated.\r\n');
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
  const url = new URL(req.url || '/', `ws://localhost:${PORT}`);
  const sessionId = url.searchParams.get('sessionId') || 'default';
  const telemetryOnly = url.searchParams.get('telemetry') === '1';
  
  try {
    const session = getOrCreateSession(sessionId);
    if (!telemetryOnly) {
      session.clients.add(ws);
    }
    
    console.log(`[WS] Client connected to session: ${sessionId}`);
    if (telemetryOnly && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'terminalProtocol', missionCommands: true }));
    }

    // Send history buffer
    if (!telemetryOnly && session.buffer) {
      ws.send(sanitizeTerminalDisplay(session.buffer));
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
        if (parsed.type === 'runCommand') {
            const runId = String(parsed.runId || Date.now());
            const command = String(parsed.command || '').trim();
            if (!command) {
              ws.send(JSON.stringify({ type: 'commandError', runId, error: 'No command provided.' }));
              return;
            }
            session.missionWatchers.set(runId, { client: ws, command, output: '' });
            session.ptyProcess.write('\x15');
            session.ptyProcess.write(buildMissionCommandScript(runId, command));
            return;
        }
        if (parsed.type === 'cancelCommand') {
            const runId = String(parsed.runId || '');
            const watcher = session.missionWatchers.get(runId);
            session.ptyProcess.write('\x03');
            if (watcher?.client?.readyState === WebSocket.OPEN) {
              watcher.client.send(JSON.stringify({
                type: 'commandResult',
                runId,
                exitCode: 130,
                output: cleanMissionOutput(watcher.output, runId, watcher.command)
              }));
            }
            if (runId) session.missionWatchers.delete(runId);
            ws.send(JSON.stringify({ type: 'commandCancelled', runId }));
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
      if (!telemetryOnly) {
        session.clients.delete(ws);
      }
      for (const [runId, watcher] of session.missionWatchers.entries()) {
        if (watcher.client === ws) {
          session.missionWatchers.delete(runId);
        }
      }
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
