import { useState, useCallback } from 'react';
import { executeIntegrationTool } from '../lib/integrationTools';

/**
 * Provides tool execution for the Cowork agentic loop.
 * Abstracts over local-disk (Electron) vs. WebContainer execution.
 */
export function useAgentTools(workingDirectory, webcontainerInstance, apiKeys = {}) {
    const [toolLog, setToolLog] = useState([]);

    const log = useCallback((msg) => {
        setToolLog(prev => [...prev, String(msg)]);
    }, []);

    const clearLog = useCallback(() => setToolLog([]), []);

    /**
     * Resolve a relative path against the working directory.
     * Absolute paths are returned unchanged.
     */
    const resolvePath = useCallback((p) => {
        if (!p) return workingDirectory || '.';
        if (p.startsWith('/') || /^[A-Za-z]:[/\\]/.test(p)) return p; // already absolute
        if (workingDirectory) return `${workingDirectory}/${p}`.replace(/\/+/g, '/');
        return p;
    }, [workingDirectory]);

    /**
     * Execute a named tool with the given params object.
     * Always returns a plain object — never throws.
     */
    const executeTool = useCallback(async (name, params = {}) => {
        log(`⚙ ${name}  ${JSON.stringify(params)}`);

        try {
            switch (name) {

                // ── read_file ──────────────────────────────────────────────
                case 'read_file': {
                    const abs = resolvePath(params.path);
                    let content;
                    if (window.electron?.readFile) {
                        content = await window.electron.readFile(abs);
                    } else if (webcontainerInstance) {
                        content = await webcontainerInstance.fs.readFile(params.path, 'utf-8');
                    } else {
                        return { error: 'No file system available (no Electron context and no WebContainer).' };
                    }
                    log(`✓ read ${abs}  (${content.length} chars)`);
                    return { content };
                }

                // ── write_file ─────────────────────────────────────────────
                case 'write_file': {
                    const abs = resolvePath(params.path);
                    if (window.electron?.writeFile) {
                        await window.electron.writeFile(abs, params.content ?? '');
                    } else if (webcontainerInstance) {
                        // Ensure parent directories exist in the sandbox
                        const dir = params.path.includes('/')
                            ? params.path.slice(0, params.path.lastIndexOf('/'))
                            : null;
                        if (dir) {
                            try {
                                await webcontainerInstance.fs.mkdir(dir, { recursive: true });
                            } catch (err) {
                                log(`mkdir skipped for ${dir}: ${err.message}`);
                            }
                        }
                        await webcontainerInstance.fs.writeFile(params.path, params.content ?? '');
                    } else {
                        return { error: 'No file system available.' };
                    }
                    log(`✓ wrote ${abs}`);
                    return { success: true, path: abs };
                }

                // ── list_directory ─────────────────────────────────────────
                case 'list_directory': {
                    const abs = resolvePath(params.path || '.');
                    let entries;
                    if (window.electron?.listFiles) {
                        entries = await window.electron.listFiles(abs);
                    } else if (webcontainerInstance) {
                        entries = await webcontainerInstance.fs.readdir(params.path || '.');
                    } else {
                        return { error: 'No file system available.' };
                    }
                    log(`✓ list ${abs}  (${entries.length} entries)`);
                    return { entries };
                }

                // ── run_command ────────────────────────────────────────────
                case 'run_command': {
                    if (!webcontainerInstance) {
                        return {
                            error: 'Shell commands require the WebContainer sandbox. ' +
                                   'They are intentionally disabled for local folder projects.'
                        };
                    }
                    const cmd = (params.command || '').trim();
                    const [exe, ...args] = cmd.split(/\s+/);
                    log(`$ ${cmd}`);

                    const proc = await webcontainerInstance.spawn(exe, args);
                    let output = '';
                    await proc.output.pipeTo(new WritableStream({
                        write(data) {
                            output += data;
                            log(data);
                        }
                    }));
                    const exitCode = await proc.exit;
                    log(`exit ${exitCode}`);
                    return { output, exitCode };
                }

                // ── delegate_to_openclaw ───────────────────────────────────
                case 'delegate_to_openclaw': {
                    if (!window.electron?.runOpenClawAgent) {
                        return { error: 'OpenClaw delegation requires the Perci desktop app.' };
                    }
                    const message = (params.message || '').trim();
                    if (!message) return { error: 'A message is required to delegate to OpenClaw.' };
                    log(`→ OpenClaw: ${message.slice(0, 80)}`);
                    const res = await window.electron.runOpenClawAgent({
                        message,
                        sessionKey: params.session_key || undefined,
                    });
                    if (!res?.ok) {
                        log(`❌ OpenClaw: ${res?.error || 'failed'}`);
                        return { error: res?.error || 'OpenClaw delegation failed.' };
                    }
                    log(`✓ OpenClaw replied (${res.text.length} chars)`);
                    return { reply: res.text, session_id: res.sessionId, model: res.model };
                }

                default:
                    return await executeIntegrationTool(name, params, apiKeys);
            }
        } catch (err) {
            log(`❌ ${name} error: ${err.message}`);
            return { error: err.message };
        }
    }, [webcontainerInstance, resolvePath, log, apiKeys]);

    return { executeTool, toolLog, clearLog };
}
