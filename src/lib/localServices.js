// Single source of truth for the local services Perci can detect and launch.
//
// Both the Localhost Manager and the individual surfaces (GitHub Overview,
// KeySafe, ...) read this catalog, so a service's launch command is defined in
// exactly one place. Before this existed, KeysafeMode hardcoded its own
// `~/keysafe` + `npm run dev` while the Manager separately hardcoded
// `cd ~/keysafe && npm run dev`, and GitHub Overview appeared in neither — so
// its offline screen could only tell the user to open a terminal.
//
// `startCommand` is intentionally left empty when there is no launch command we
// can run unattended. An empty command surfaces as "Set a start command" in the
// Manager rather than a Start button that fails.

export const LOCAL_SERVICES = [
    { id: 'perci', name: 'Perci (Opal)', port: 5173, url: 'http://localhost:5173', startCommand: 'npm run dev', cwd: '~/opal', autoStart: false },
    { id: 'eidos', name: 'Eidos', port: 3000, url: 'http://localhost:3000', startCommand: 'docker compose up -d && npm run dev', cwd: '~/eidos', autoStart: false },
    { id: 'github-overview', name: 'GitHub Overview', port: 6282, url: 'http://127.0.0.1:6282', startCommand: './github-overview serve', cwd: '~/github-overview', autoStart: false },
    // Started via compose, NOT `make start-all`: that target runs a bare
    // `next dev`, which binds Next's default :3000 — the port PORTMASTER
    // assigns to the Eidos Dashboard. docker-compose.yml maps 8502 (Web UI)
    // and 5055 (API), matching PORTMASTER, so compose is the collision-free path.
    { id: 'open-notebook', name: 'Open Notebook', port: 8502, url: 'http://localhost:8502', startCommand: 'docker compose up -d', cwd: '~/open-notebook', autoStart: false },
    { id: 'openclaw', name: 'OpenClaw', port: 18789, url: 'http://localhost:18789', startCommand: 'openclaw gateway start', cwd: '', autoStart: false },
    { id: 'markitdown', name: 'MarkItDownUI', port: 8920, url: 'http://localhost:8920', startCommand: '', cwd: '', autoStart: false },
    { id: 'hermes-dash', name: 'Hermes Dashboard', port: 8642, url: 'http://localhost:8642', startCommand: 'hermes dashboard --port 8642 --no-open', cwd: '', autoStart: false },
    { id: 'keysafe', name: 'KeySafe', port: 4100, url: 'http://127.0.0.1:4100', startCommand: 'npm run dev', cwd: '~/keysafe', autoStart: false },
    { id: 'super-memory', name: 'Supermemory', port: 6768, url: 'http://localhost:6768', startCommand: '', cwd: '', autoStart: false },
    { id: 'lfm-harness', name: 'LFM Harness', port: 6270, url: 'http://localhost:6270', startCommand: 'node ~/lfm-harness/server.js', cwd: '~/lfm-harness', autoStart: false },
    { id: 'apfel-harness', name: 'Apfel Harness', port: 6271, url: 'http://localhost:6271', startCommand: 'node ~/apfel-harness/server.js', cwd: '~/apfel-harness', autoStart: false },
    { id: 'opencode', name: 'OpenCode', port: 4096, url: 'http://127.0.0.1:4096', startCommand: 'opencode serve --port 4096', cwd: '', autoStart: false },
    { id: 'ollama', name: 'Ollama', port: 11434, url: 'http://localhost:11434', startCommand: 'ollama serve', cwd: '', autoStart: false },
    { id: 'tcs-it-dashboard', name: 'TCS IT Dashboard', port: 8788, url: 'http://localhost:8788', startCommand: 'source venv/bin/activate && python server.py', cwd: '~/it-milestone-agent', autoStart: false },
];

/** Look up a service definition by id. Returns null when it isn't in the catalog. */
export function findLocalService(id) {
    return LOCAL_SERVICES.find((s) => s.id === id) || null;
}

/**
 * Launch args for a service, or null when it has no runnable command.
 * Surfaces pass the result straight to `window.electron.localhostStartNow`.
 */
export function launchArgsFor(id) {
    const service = findLocalService(id);
    if (!service || !service.startCommand) return null;
    return { command: service.startCommand, cwd: service.cwd || null };
}
