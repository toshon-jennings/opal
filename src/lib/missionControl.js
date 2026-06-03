export const MISSION_RUNS_KEY = 'opal_mission_runs';
export const MISSION_MEMORY_KEY = 'opal_mission_memory';
export const MISSION_MEMORY_CANDIDATES_KEY = 'opal_mission_memory_candidates';
export const MISSION_VALIDATION_TARGET_KEY = 'opal_mission_validation_target';
export const MISSION_UPDATED_EVENT = 'opal:mission-runs-updated';

const MAX_RUNS = 30;
const MAX_EVENTS_PER_RUN = 24;

export function createSeedMissionRuns() {
    const now = Date.now();
    return [
        {
            id: 'mission-memory-review',
            title: 'Session memory capture',
            agent: 'Opal Memory Reviewer',
            status: 'waiting',
            startedAt: new Date(now - 42 * 60 * 1000).toISOString(),
            updatedAt: new Date(now - 18 * 60 * 1000).toISOString(),
            workingDirectory: '/Users/toshonjennings/opal',
            objective: 'Turn useful agent-session outcomes into durable project memory.',
            reason: 'The harness should remember decisions, rejected approaches, and recurring operational fixes across sessions.',
            commands: ['scan run summary', 'draft memory note'],
            files: ['localStorage:opal_mission_memory', 'localStorage:opal_projects'],
            checkpoints: [
                { label: 'Candidate notes detected', state: 'done' },
                { label: 'Waiting for user approval', state: 'active' },
                { label: 'Memory written', state: 'pending' }
            ],
            risks: ['Bad memory is worse than no memory; notes should stay short and auditable.'],
            next: 'Review pending memory candidates when they appear, or add a manual note for decisions worth keeping.',
            events: []
        },
        {
            id: 'mission-openclaw-health',
            title: 'OpenClaw integration health',
            agent: 'Opal Integration Monitor',
            status: 'waiting',
            startedAt: new Date(now - 7 * 60 * 1000).toISOString(),
            updatedAt: new Date(now - 22 * 60 * 1000).toISOString(),
            workingDirectory: '/Users/toshonjennings/opal',
            objective: 'Track OpenClaw Gateway readiness only for OpenClaw-backed work.',
            reason: 'Code and Cowork can run without OpenClaw; this check is an integration dependency, not the center of Mission.',
            commands: ['openclaw gateway status', 'GET http://127.0.0.1:18789/openclaw'],
            files: ['~/.openclaw/openclaw.json', '~/.openclaw/workspace/DIARY.md'],
            checkpoints: [
                { label: 'Gateway profile loaded', state: 'done' },
                { label: 'Connection check scheduled', state: 'active' },
                { label: 'OpenClaw handoff ready', state: 'pending' }
            ],
            risks: ['Gateway restart can interrupt active OpenClaw runs.'],
            next: 'Use the OpenClaw integration panel only when gateway-backed work is blocked.',
            events: []
        },
        {
            id: 'mission-diff-quality',
            title: 'Intent-first diff review',
            agent: 'Opal Review Gate',
            status: 'blocked',
            startedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
            workingDirectory: '/Users/toshonjennings/opal',
            objective: 'Summarize changes by intent before asking the user to read raw diffs.',
            reason: 'Generated code needs a compact explanation of behavior, risk, and validation.',
            commands: ['git diff --stat', 'npm run build'],
            files: ['src/components/*', 'src/context/*'],
            checkpoints: [
                { label: 'Diff inventory created', state: 'done' },
                { label: 'Validation missing', state: 'blocked' },
                { label: 'Ready for handoff', state: 'pending' }
            ],
            risks: ['A run should not be marked done until build/test status is explicit.'],
            next: 'Connect this gate to real file-change events and build results.',
            events: []
        }
    ];
}

export function readMissionRuns() {
    const saved = localStorage.getItem(MISSION_RUNS_KEY);
    if (!saved) return createSeedMissionRuns();
    try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) && parsed.length > 0
            ? parsed.map(normalizeRun)
            : createSeedMissionRuns();
    } catch {
        return createSeedMissionRuns();
    }
}

export function saveMissionRuns(runs) {
    const normalized = Array.isArray(runs) ? runs.map(normalizeRun).slice(0, MAX_RUNS) : createSeedMissionRuns();
    localStorage.setItem(MISSION_RUNS_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(MISSION_UPDATED_EVENT, { detail: normalized }));
    return normalized;
}

export function updateMissionRun(runId, patch) {
    const now = new Date().toISOString();
    const runs = readMissionRuns();
    const nextRuns = runs.map(run => (
        run.id === runId
            ? normalizeRun({ ...run, ...patch, updatedAt: patch.updatedAt || now })
            : run
    ));
    return saveMissionRuns(sortRuns(nextRuns));
}

export function upsertMissionRun(run) {
    const now = new Date().toISOString();
    const normalizedRun = normalizeRun({
        startedAt: now,
        updatedAt: now,
        ...run
    });
    const runs = readMissionRuns();
    const index = runs.findIndex(item => item.id === normalizedRun.id);
    const nextRuns = index >= 0
        ? runs.map(item => item.id === normalizedRun.id
            ? normalizeRun({ ...item, ...normalizedRun, startedAt: item.startedAt || normalizedRun.startedAt, updatedAt: now })
            : item)
        : [normalizedRun, ...runs];
    return saveMissionRuns(sortRuns(nextRuns).slice(0, MAX_RUNS));
}

export function appendMissionRunEvent(runId, event, patch = {}) {
    const now = new Date().toISOString();
    const runs = readMissionRuns();
    const nextRuns = runs.map(run => {
        if (run.id !== runId) return run;
        const nextEvent = {
            id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type: event.type || 'info',
            title: event.title || 'Event',
            detail: event.detail || '',
            createdAt: event.createdAt || now
        };
        return normalizeRun({
            ...run,
            ...patch,
            updatedAt: patch.updatedAt || now,
            events: [nextEvent, ...(run.events || [])].slice(0, MAX_EVENTS_PER_RUN)
        });
    });
    return saveMissionRuns(sortRuns(nextRuns));
}

export function recordGatewayCheck(profile, result, source = 'automatic check') {
    const now = new Date().toISOString();
    const isChecking = result?.state === 'checking';
    const ok = Boolean(result?.ok);
    const status = isChecking ? 'running' : ok ? 'completed' : 'blocked';
    const error = result?.error || result?.result?.error || '';
    const gatewayUrl = profile?.gatewayUrl || 'No gateway configured';
    const controlUrl = profile?.controlUrl || '';
    const runId = 'mission-openclaw-health';
    const existingRun = readMissionRuns().find(run => run.id === runId);
    const isAutomatic = source === 'automatic check' || source === 'web fallback';
    const unchanged = existingRun
        && isAutomatic
        && existingRun.status === status
        && existingRun.gateway?.ok === ok
        && (existingRun.gateway?.error || '') === error
        && existingRun.gateway?.gatewayUrl === gatewayUrl;

    if (unchanged) return existingRun;

    upsertMissionRun({
        id: runId,
        title: 'OpenClaw integration health',
        agent: 'Opal Integration Monitor',
        status,
        startedAt: now,
        updatedAt: now,
        workingDirectory: '/Users/toshonjennings/opal',
        objective: 'Track the configured OpenClaw Gateway for OpenClaw-backed work.',
        reason: 'Code and Cowork can run independently; OpenClaw health is recorded as an integration dependency when that surface is used.',
        commands: ['openclaw gateway status', `GET ${controlUrl || gatewayUrl}`],
        files: ['~/.openclaw/openclaw.json', '~/.openclaw/workspace/DIARY.md'],
        checkpoints: [
            { label: 'Profile loaded', state: profile ? 'done' : 'blocked' },
            { label: ok ? 'Gateway reachable' : isChecking ? 'Checking gateway' : 'Gateway unreachable', state: ok ? 'done' : isChecking ? 'active' : 'blocked' },
            { label: 'OpenClaw handoff', state: ok ? 'done' : 'pending' }
        ],
        risks: ['Gateway restart can interrupt active OpenClaw runs.'],
        next: ok
            ? 'OpenClaw integration is reachable. Continue with OpenClaw-backed work if needed.'
            : 'Restart the local Gateway only if OpenClaw-backed work is blocked.',
        gateway: {
            profileName: profile?.name || 'Unknown profile',
            mode: profile?.mode || 'local',
            gatewayUrl,
            controlUrl,
            checkedAt: now,
            ok,
            error
        }
    });

    appendMissionRunEvent(runId, {
        type: ok ? 'success' : isChecking ? 'info' : 'error',
        title: ok ? 'Gateway check passed' : isChecking ? 'Gateway check started' : 'Gateway check failed',
        detail: error || `${source}: ${gatewayUrl}`,
        createdAt: now
    }, { status });
}

export function recordGatewayRestart(profile, result, phase = 'completed') {
    const ok = Boolean(result?.ok);
    const status = phase === 'started' ? 'running' : ok ? 'running' : 'blocked';
    const detail = phase === 'started'
        ? 'Restart requested from Opal.'
        : ok
            ? 'Restart command completed; Opal is polling until the Gateway binds.'
            : (result?.error || 'Restart command failed.');

    upsertMissionRun({
        id: 'mission-openclaw-health',
        title: 'OpenClaw integration health',
        agent: 'Opal Integration Monitor',
        status,
        workingDirectory: '/Users/toshonjennings/opal',
        objective: 'Track the configured OpenClaw Gateway for OpenClaw-backed work.',
        reason: 'Code and Cowork can run independently; OpenClaw health is an integration dependency.',
        commands: ['openclaw gateway restart'],
        files: ['~/.openclaw/openclaw.json']
    });
    appendMissionRunEvent('mission-openclaw-health', {
        type: ok || phase === 'started' ? 'info' : 'error',
        title: phase === 'started' ? 'Gateway restart requested' : ok ? 'Gateway restart command completed' : 'Gateway restart failed',
        detail
    }, { status });
}

export function recordTerminalCommand(command, patch = {}) {
    const now = new Date().toISOString();
    const id = patch.id || `terminal-${Date.now()}`;
    const validationTarget = resolveValidationTarget(command, patch.validationTargetRunId);
    const validationLink = validationTarget
        ? {
            validatesRunId: validationTarget.id,
            validatesRunTitle: validationTarget.title,
            validationCommand: true
        }
        : null;
    upsertMissionRun({
        id,
        title: `Terminal command: ${command}`,
        agent: 'Opal Terminal',
        status: patch.status || 'running',
        startedAt: now,
        updatedAt: now,
        workingDirectory: patch.workingDirectory || '/Users/toshonjennings/opal',
        objective: validationTarget
            ? `Run terminal validation for ${validationTarget.title}.`
            : 'Send a command to the local Opal terminal server.',
        reason: 'Terminal submissions are execution events and should be inspectable from Mission Control.',
        commands: [command],
        files: [],
        terminal: validationLink,
        checkpoints: [
            { label: 'Command captured', state: 'done' },
            { label: 'Socket send pending', state: 'active' },
            { label: validationTarget ? 'Linked validation target' : 'Exit status pending', state: validationTarget ? 'done' : 'pending' },
            ...(validationTarget ? [{ label: 'Exit status pending', state: 'pending' }] : [])
        ],
        risks: ['Long-running interactive commands may not emit an exit marker until the shell returns to the prompt.'],
        next: validationTarget
            ? 'Wait for the command result; Mission will apply the validation outcome to the linked run.'
            : 'Wait for the command result, or open the terminal panel to inspect live output.',
        events: [
            {
                id: `event-${Date.now()}`,
                type: 'info',
                title: validationTarget ? 'Validation command captured' : 'Command captured',
                detail: validationTarget ? `${command} -> ${validationTarget.title}` : command,
                createdAt: now
            }
        ]
    });
    return id;
}

export function recordTerminalCommandResult(runId, result = {}) {
    const exitCode = Number(result.exitCode);
    const hasExitCode = Number.isFinite(exitCode);
    const ok = hasExitCode && exitCode === 0;
    const outputSnippet = compactTerminalOutput(result.output || result.outputSnippet || '');
    const currentRun = readMissionRuns().find(run => run.id === runId);
    const validationTargetId = currentRun?.terminal?.validatesRunId;
    const command = currentRun?.commands?.[0] || 'terminal command';
    appendMissionRunEvent(runId, {
        type: ok ? 'success' : 'error',
        title: ok ? 'Terminal command completed' : hasExitCode ? `Terminal command exited ${exitCode}` : 'Terminal command result missing',
        detail: outputSnippet || (ok ? 'Command exited with code 0.' : 'No terminal output was captured.')
    }, {
        status: ok ? 'completed' : 'blocked',
        terminal: {
            ...(currentRun?.terminal || {}),
            exitCode: hasExitCode ? exitCode : null,
            outputSnippet,
            completedAt: new Date().toISOString()
        },
        checkpoints: [
            { label: 'Command captured', state: 'done' },
            ...(validationTargetId ? [{ label: 'Linked validation target', state: 'done' }] : []),
            { label: 'Command completed', state: ok ? 'done' : 'blocked' },
            { label: hasExitCode ? `Exit code ${exitCode}` : 'Exit code missing', state: ok ? 'done' : 'blocked' }
        ],
        risks: ok
            ? ['A successful shell exit does not prove broader product behavior unless this command was the full validation step.']
            : ['The command returned a non-zero exit code or did not produce a parseable result.'],
        next: ok
            ? 'Review the output snippet and continue with the next Mission action.'
            : 'Inspect the terminal output, fix the failure, then retry the command.'
    });

    if (validationTargetId && hasExitCode) {
        recordMissionRunValidation(
            validationTargetId,
            ok ? 'passed' : 'failed',
            ok
                ? `Validated by terminal command "${command}" with exit code 0.`
                : `Validation command "${command}" failed with exit code ${exitCode}.`
        );
    }
}

export function recordTerminalCommandOutput(runId, output = '') {
    const outputSnippet = compactTerminalOutput(output);
    if (!outputSnippet) return;
    const currentRun = readMissionRuns().find(run => run.id === runId);
    updateMissionRun(runId, {
        terminal: {
            ...(currentRun?.terminal || {}),
            outputSnippet,
            updatedAt: new Date().toISOString()
        }
    });
}

export function recordCoworkSessionStart(session, prompt, patch = {}) {
    const now = new Date().toISOString();
    const id = patch.id || `cowork-${session?.id || Date.now()}`;
    const title = session?.title || prompt?.slice(0, 48) || 'Cowork session';
    upsertMissionRun({
        id,
        title: `Cowork: ${title}`,
        agent: 'Opal Cowork Agent',
        status: patch.status || 'running',
        startedAt: now,
        updatedAt: now,
        workingDirectory: patch.workingDirectory || '/Users/toshonjennings/opal',
        objective: prompt || 'Run a Cowork agent session.',
        reason: 'Cowork sessions can inspect files, write changes, and use tools, so their lifecycle should be visible in Mission Control.',
        commands: [],
        files: patch.files || [],
        checkpoints: [
            { label: 'Prompt captured', state: 'done' },
            { label: 'Agent loop running', state: 'active' },
            { label: 'Final response recorded', state: 'pending' }
        ],
        risks: ['Tool results and file writes depend on provider behavior and local workspace permissions.'],
        next: 'Watch the Cowork session for tool calls, final response, or error state.',
        events: [
            {
                id: `event-${Date.now()}`,
                type: 'info',
                title: 'Cowork session started',
                detail: prompt || title,
                createdAt: now
            }
        ]
    });
    return id;
}

export function recordCoworkToolCall(runId, toolName, args = {}) {
    const command = toolName === 'run_command' && args.command
        ? args.command
        : `${toolName}${args.path ? ` ${args.path}` : ''}`;
    const filePath = args.path || null;
    const currentRun = readMissionRuns().find(run => run.id === runId);
    const nextCommands = command
        ? Array.from(new Set([...(currentRun?.commands || []), command]))
        : currentRun?.commands || [];
    const nextFiles = filePath
        ? Array.from(new Set([...(currentRun?.files || []), filePath]))
        : currentRun?.files || [];

    appendMissionRunEvent(runId, {
        type: 'info',
        title: `Tool used: ${toolName}`,
        detail: args.command || args.path || 'Tool call recorded.'
    }, {
        status: 'running',
        commands: nextCommands,
        files: nextFiles,
        validation: toolName === 'write_file'
            ? {
                status: 'needed',
                summary: 'Cowork wrote files; run validation before treating the workspace as safe.'
            }
            : currentRun?.validation || null,
        checkpoints: [
            { label: 'Prompt captured', state: 'done' },
            { label: 'Tool work in progress', state: 'active' },
            { label: 'Final response recorded', state: 'pending' }
        ]
    });
}

export function recordCoworkSessionFinish(runId, outcome = {}) {
    const ok = outcome.ok !== false;
    const currentRun = readMissionRuns().find(run => run.id === runId);
    const validationNeeded = currentRun?.validation?.status === 'needed';
    appendMissionRunEvent(runId, {
        type: ok ? 'success' : 'error',
        title: ok ? 'Cowork session completed' : 'Cowork session blocked',
        detail: outcome.detail || (ok ? 'Final assistant response was recorded.' : 'Cowork run stopped before completion.')
    }, {
        status: ok ? 'completed' : 'blocked',
        checkpoints: [
            { label: 'Prompt captured', state: 'done' },
            { label: 'Agent loop finished', state: ok ? 'done' : 'blocked' },
            { label: 'Final response recorded', state: ok ? 'done' : 'blocked' },
            ...(ok && validationNeeded
                ? [{ label: 'Validation still needed', state: 'active' }]
                : [])
        ],
        next: ok
            ? validationNeeded
                ? 'Run the relevant validation command before saving this outcome.'
                : 'Review the Finish Report and save any useful memory note.'
            : 'Inspect the Cowork error, then retry from Mission Control or the Cowork session.'
    });
}

export function recordCodeSessionStart(session, prompt, patch = {}) {
    const now = new Date().toISOString();
    const id = patch.id || `code-${session?.id || Date.now()}`;
    const activeFile = patch.activeFile || null;
    upsertMissionRun({
        id,
        title: `Code: ${session?.title || prompt?.slice(0, 48) || 'Coding session'}`,
        agent: 'Opal Code Assistant',
        status: patch.status || 'running',
        startedAt: now,
        updatedAt: now,
        workingDirectory: patch.workingDirectory || '/Users/toshonjennings/opal',
        objective: prompt || 'Run a Code mode assistant turn.',
        reason: 'Code mode assistant turns use open workspace context and can influence file edits, so Mission Control should track the request and result.',
        commands: [],
        files: activeFile ? [activeFile] : [],
        checkpoints: [
            { label: 'Prompt captured', state: 'done' },
            { label: 'Workspace context assembled', state: 'active' },
            { label: 'Assistant response recorded', state: 'pending' }
        ],
        risks: ['Code mode suggestions are not automatically validated by build or tests.'],
        next: 'Review the assistant response, save file edits if needed, then run validation.',
        events: [
            {
                id: `event-${Date.now()}`,
                type: 'info',
                title: 'Code assistant started',
                detail: prompt || 'Code mode request captured.',
                createdAt: now
            }
        ]
    });
    return id;
}

export function recordCodeSessionFinish(runId, outcome = {}) {
    const ok = outcome.ok !== false;
    appendMissionRunEvent(runId, {
        type: ok ? 'success' : 'error',
        title: ok ? 'Code assistant completed' : 'Code assistant blocked',
        detail: outcome.detail || (ok ? 'Assistant response was recorded.' : 'Code assistant turn failed.')
    }, {
        status: ok ? 'completed' : 'blocked',
        checkpoints: [
            { label: 'Prompt captured', state: 'done' },
            { label: 'Workspace context assembled', state: ok ? 'done' : 'blocked' },
            { label: 'Assistant response recorded', state: ok ? 'done' : 'blocked' }
        ],
        next: ok ? 'Review the response and run validation for any file changes.' : 'Fix the provider or context issue, then retry from Code mode.'
    });
}

export function recordCodeFileSave(filePath, patch = {}) {
    const now = new Date().toISOString();
    const id = `code-save-${Date.now()}`;
    upsertMissionRun({
        id,
        title: `Code save: ${filePath || 'file'}`,
        agent: 'Opal Code Editor',
        status: 'completed',
        startedAt: now,
        updatedAt: now,
        workingDirectory: patch.workingDirectory || '/Users/toshonjennings/opal',
        objective: `Save ${filePath || 'the active file'} from Code mode.`,
        reason: 'Manual file saves are workspace-changing events and should be visible in Mission Control.',
        commands: [`write ${filePath || 'active file'}`],
        files: filePath ? [filePath] : [],
        checkpoints: [
            { label: 'Unsaved buffer detected', state: 'done' },
            { label: 'File write completed', state: 'done' },
            { label: 'Validation still needed', state: 'active' }
        ],
        validation: {
            status: 'needed',
            summary: 'Saved file changes have not been validated by a build, test, or manual check.'
        },
        risks: ['Saving a file does not prove the workspace still builds or runs.'],
        next: 'Run the relevant build, test, or manual validation for the saved file.',
        events: [
            {
                id: `event-${Date.now()}`,
                type: 'success',
                title: 'File saved',
                detail: filePath || 'Active file saved.',
                createdAt: now
            }
        ]
    });
    return id;
}

export function recordBuildGenerationStart(prompt, patch = {}) {
    const now = new Date().toISOString();
    const id = patch.id || `build-${Date.now()}`;
    upsertMissionRun({
        id,
        title: `Build: ${prompt?.slice(0, 48) || 'Generation'}`,
        agent: 'Opal Build Assistant',
        status: patch.status || 'running',
        startedAt: now,
        updatedAt: now,
        workingDirectory: patch.workingDirectory || 'Build sandbox',
        objective: prompt || 'Generate build-mode app files.',
        reason: 'Build mode creates runnable app files and preview output, so Mission should track generation, files touched, and validation state.',
        commands: ['generate build files'],
        files: patch.files || [],
        checkpoints: [
            { label: 'Prompt captured', state: 'done' },
            { label: 'Generation running', state: 'active' },
            { label: 'Preview validation pending', state: 'pending' }
        ],
        validation: {
            status: 'pending',
            summary: 'Waiting for Build preview generation.'
        },
        risks: ['Generated files still need preview, accessibility, and runtime validation.'],
        next: 'Wait for generated files, then inspect Preview and Code before treating the build as done.',
        events: [
            {
                id: `event-${Date.now()}`,
                type: 'info',
                title: 'Build generation started',
                detail: prompt || 'Build request captured.',
                createdAt: now
            }
        ]
    });
    return id;
}

export function recordBuildGenerationFinish(runId, outcome = {}) {
    const ok = outcome.ok !== false;
    const files = Array.isArray(outcome.files) ? outcome.files : [];
    const parseFallback = outcome.parseFallback === true;
    appendMissionRunEvent(runId, {
        type: ok ? 'success' : 'error',
        title: ok
            ? parseFallback ? 'Build response captured without applying files' : 'Build files generated'
            : 'Build generation blocked',
        detail: outcome.detail || (ok ? `${files.length} files generated.` : 'Build generation failed.')
    }, {
        status: ok && !parseFallback ? 'running' : 'blocked',
        files,
        checkpoints: [
            { label: 'Prompt captured', state: 'done' },
            { label: parseFallback ? 'File JSON parse failed' : ok ? 'Files applied' : 'Generation failed', state: ok && !parseFallback ? 'done' : 'blocked' },
            { label: 'Preview validation pending', state: ok && !parseFallback ? 'active' : 'pending' }
        ],
        risks: ok && !parseFallback
            ? ['Generated files still need preview and runtime validation.']
            : ['The response could not be applied as build files.'],
        validation: ok && !parseFallback
            ? {
                status: 'pending',
                summary: 'Files were applied; waiting for preview generation.'
            }
            : {
                status: 'failed',
                summary: 'Build files were not applied successfully.'
            },
        next: ok && !parseFallback
            ? 'Inspect Preview and Code, then run or record validation before saving memory.'
            : 'Review the assistant response, adjust the prompt if needed, then retry generation.'
    });
}

export function recordBuildPreviewValidation(runId, result = {}) {
    const ok = result.ok !== false;
    appendMissionRunEvent(runId, {
        type: ok ? 'success' : 'error',
        title: ok ? 'Build preview generated' : 'Build preview validation failed',
        detail: result.detail || (ok ? 'Preview HTML was generated from the current Build files.' : 'Preview HTML could not be generated.')
    }, {
        status: ok ? 'completed' : 'blocked',
        checkpoints: [
            { label: 'Prompt captured', state: 'done' },
            { label: 'Files applied', state: 'done' },
            { label: ok ? 'Preview HTML generated' : 'Preview validation failed', state: ok ? 'done' : 'blocked' }
        ],
        risks: ok
            ? ['Preview generation does not replace manual visual review or browser interaction testing.']
            : ['The generated files may not render in the Build preview.'],
        validation: ok
            ? {
                status: 'needed',
                summary: 'Preview HTML was generated; visual/runtime review is still needed.'
            }
            : {
                status: 'failed',
                summary: 'Build preview could not be generated.'
            },
        next: ok
            ? 'Inspect the preview visually before saving this outcome.'
            : 'Review generated files and retry with a narrower prompt.'
    });
}

export function recordBuildReset(patch = {}) {
    const now = new Date().toISOString();
    const id = `build-reset-${Date.now()}`;
    upsertMissionRun({
        id,
        title: 'Build workspace reset',
        agent: 'Opal Build Assistant',
        status: 'completed',
        startedAt: now,
        updatedAt: now,
        workingDirectory: patch.workingDirectory || 'Build sandbox',
        objective: 'Reset Build mode messages and generated files.',
        reason: 'Resetting Build mode discards generated working context and should be visible in Mission history.',
        commands: ['reset build workspace'],
        files: patch.files || [],
        checkpoints: [
            { label: 'Reset requested', state: 'done' },
            { label: 'Default files restored', state: 'done' },
            { label: 'Ready for new build', state: 'done' }
        ],
        risks: ['Previous generated files are no longer visible in Build mode after reset.'],
        validation: {
            status: 'passed',
            summary: 'Reset completed; no generated changes remain to validate.'
        },
        next: 'Start a new Build request when ready.',
        events: [
            {
                id: `event-${Date.now()}`,
                type: 'success',
                title: 'Build workspace reset',
                detail: 'Build mode returned to its default files.',
                createdAt: now
            }
        ]
    });
    return id;
}

export function recordMissionRunValidation(runId, status, summary = '') {
    const normalizedStatus = status === 'failed' ? 'failed' : 'passed';
    const now = new Date().toISOString();
    const run = readMissionRuns().find(item => item.id === runId);
    const note = summary.trim();
    const defaultSummary = normalizedStatus === 'passed'
        ? 'Marked validated from Mission Control.'
        : 'Marked failed from Mission Control.';
    const nextCheckpoints = markValidationCheckpoints(run?.checkpoints || [], normalizedStatus);

    return appendMissionRunEvent(runId, {
        type: normalizedStatus === 'passed' ? 'success' : 'error',
        title: normalizedStatus === 'passed' ? 'Validation passed' : 'Validation failed',
        detail: note || defaultSummary,
        createdAt: now
    }, {
        status: normalizedStatus === 'passed' ? 'completed' : 'blocked',
        validation: {
            status: normalizedStatus,
            summary: note || defaultSummary,
            updatedAt: now
        },
        checkpoints: nextCheckpoints,
        next: normalizedStatus === 'passed'
            ? 'Validation is recorded. Review the Finish Report and save any useful memory note.'
            : 'Validation failed. Inspect the failure, fix the issue, then retry or rerun validation.'
    });
}

export function setMissionValidationTarget(runId) {
    if (!runId) {
        localStorage.removeItem(MISSION_VALIDATION_TARGET_KEY);
        return null;
    }
    const run = readMissionRuns().find(item => item.id === runId);
    if (!isRunNeedingValidation(run)) {
        localStorage.removeItem(MISSION_VALIDATION_TARGET_KEY);
        return null;
    }
    const target = {
        runId: run.id,
        title: run.title,
        updatedAt: new Date().toISOString()
    };
    localStorage.setItem(MISSION_VALIDATION_TARGET_KEY, JSON.stringify(target));
    return target;
}

export function buildFinishReport(run) {
    const commands = Array.isArray(run?.commands) ? run.commands : [];
    const files = Array.isArray(run?.files) ? run.files : [];
    const checkpoints = Array.isArray(run?.checkpoints) ? run.checkpoints : [];
    const events = Array.isArray(run?.events) ? run.events : [];
    const blockedCheckpoint = checkpoints.find(checkpoint => checkpoint.state === 'blocked');
    const activeCheckpoint = checkpoints.find(checkpoint => checkpoint.state === 'active');
    const latestEvent = events[0];
    let validation = 'No validation result recorded yet.';
    if (run?.validation?.status === 'needed') {
        validation = run.validation.summary || 'Validation is still needed.';
    } else if (run?.validation?.status === 'pending') {
        validation = run.validation.summary || 'Validation is pending.';
    } else if (run?.validation?.status === 'failed') {
        validation = run.validation.summary || 'Validation failed.';
    } else if (run?.validation?.status === 'passed') {
        validation = run.validation.summary || 'Validation passed.';
    } else if (checkpoints.some(checkpoint => checkpoint.state === 'blocked')) {
        validation = 'Blocked before validation completed.';
    } else if (checkpoints.some(checkpoint => checkpoint.state === 'active')) {
        validation = 'In progress; validation is not final.';
    } else if (run?.status === 'completed') {
        validation = 'Completed according to the recorded run state.';
    }

    return {
        outcome: getOutcomeText(run, latestEvent),
        commandsAttempted: commands.length ? commands : ['No commands recorded.'],
        contextTouched: files.length ? files : ['No files or context entries recorded.'],
        validation,
        remainingRisk: blockedCheckpoint
            ? blockedCheckpoint.label
            : activeCheckpoint
                ? activeCheckpoint.label
                : (run?.risks?.[0] || 'No unresolved risk recorded.'),
        nextAction: run?.next || 'Review the run events before taking the next action.'
    };
}

export function readMemoryCandidates() {
    const saved = localStorage.getItem(MISSION_MEMORY_CANDIDATES_KEY);
    if (!saved) return [];
    try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveMemoryCandidates(candidates) {
    const normalized = Array.isArray(candidates) ? candidates.slice(0, 40) : [];
    localStorage.setItem(MISSION_MEMORY_CANDIDATES_KEY, JSON.stringify(normalized));
    return normalized;
}

export function buildMemoryCandidate(run) {
    if (!run || !['blocked', 'completed'].includes(run.status)) return null;
    const sourceType = getRunSourceType(run);
    if (!['gateway', 'terminal', 'build'].includes(sourceType)) return null;

    const report = buildFinishReport(run);
    const text = sourceType === 'gateway'
        ? `OpenClaw Gateway status for ${run.gateway?.profileName || 'the active profile'} was ${run.status}; ${report.remainingRisk}. Next: ${report.nextAction}`
        : sourceType === 'build'
            ? `Build run "${run.title}" was ${run.status}; touched ${(run.files || []).length} files. Next: ${report.nextAction}`
            : `Terminal dispatch for "${run.commands?.[0] || run.title}" was ${run.status}; ${report.remainingRisk}. Next: ${report.nextAction}`;

    return {
        id: `candidate-${run.id}`,
        sourceRunId: run.id,
        sourceType,
        status: 'pending',
        text,
        createdAt: new Date().toISOString()
    };
}

function normalizeRun(run) {
    const normalized = {
        id: run.id || `run-${Date.now()}`,
        title: run.title || 'Untitled run',
        agent: run.agent || 'Opal',
        status: run.status || 'waiting',
        startedAt: run.startedAt || new Date().toISOString(),
        updatedAt: run.updatedAt || run.startedAt || new Date().toISOString(),
        workingDirectory: run.workingDirectory || '/Users/toshonjennings/opal',
        objective: run.objective || '',
        reason: run.reason || '',
        commands: Array.isArray(run.commands) ? run.commands : [],
        files: Array.isArray(run.files) ? run.files : [],
        checkpoints: Array.isArray(run.checkpoints) ? run.checkpoints : [],
        risks: Array.isArray(run.risks) ? run.risks : [],
        next: run.next || '',
        gateway: run.gateway || null,
        terminal: run.terminal || null,
        validation: normalizeValidation(run.validation),
        events: Array.isArray(run.events) ? run.events.slice(0, MAX_EVENTS_PER_RUN) : []
    };
    if (normalized.id === 'mission-openclaw-health') {
        return {
            ...normalized,
            title: 'OpenClaw integration health',
            agent: 'Opal Integration Monitor',
            objective: 'Track the configured OpenClaw Gateway for OpenClaw-backed work.',
            reason: 'Code and Cowork can run independently; OpenClaw health is recorded as an integration dependency when that surface is used.',
            next: normalized.gateway?.ok
                ? 'OpenClaw integration is reachable. Continue with OpenClaw-backed work if needed.'
                : 'Restart the local Gateway only if OpenClaw-backed work is blocked.'
        };
    }
    if (normalized.id === 'mission-memory-review') {
        return {
            ...normalized,
            next: 'Review pending memory candidates when they appear, or add a manual note for decisions worth keeping.'
        };
    }
    return normalized;
}

function normalizeValidation(validation) {
    if (!validation || typeof validation !== 'object') return null;
    const allowed = new Set(['needed', 'pending', 'passed', 'failed']);
    return {
        status: allowed.has(validation.status) ? validation.status : 'pending',
        summary: validation.summary || '',
        updatedAt: validation.updatedAt || null
    };
}

function resolveValidationTarget(command, explicitRunId) {
    if (!isValidationCommand(command)) return null;
    const runs = readMissionRuns();
    const explicitRun = explicitRunId
        ? runs.find(run => run.id === explicitRunId)
        : null;
    if (isRunNeedingValidation(explicitRun)) return explicitRun;

    const savedTarget = readValidationTarget();
    const savedRun = savedTarget?.runId
        ? runs.find(run => run.id === savedTarget.runId)
        : null;
    if (isRunNeedingValidation(savedRun)) return savedRun;

    return runs
        .filter(isRunNeedingValidation)
        .filter(run => getRunSourceType(run) !== 'terminal')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null;
}

function readValidationTarget() {
    const saved = localStorage.getItem(MISSION_VALIDATION_TARGET_KEY);
    if (!saved) return null;
    try {
        const parsed = JSON.parse(saved);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function isRunNeedingValidation(run) {
    return Boolean(run?.id && run.validation?.status === 'needed');
}

function isValidationCommand(command) {
    const normalized = String(command || '').trim().toLowerCase();
    if (!normalized) return false;
    return [
        /^npm\s+(run\s+)?(build|test|lint|typecheck|check)(\s|$)/,
        /^pnpm\s+(run\s+)?(build|test|lint|typecheck|check)(\s|$)/,
        /^yarn\s+(build|test|lint|typecheck|check)(\s|$)/,
        /^bun\s+(run\s+)?(build|test|lint|typecheck|check)(\s|$)/,
        /(^|\s)(vitest|jest|pytest|rspec|go\s+test|cargo\s+test|swift\s+test)(\s|$)/,
        /^make\s+(test|check|build|lint)(\s|$)/
    ].some(pattern => pattern.test(normalized));
}

function markValidationCheckpoints(checkpoints, status) {
    const label = status === 'passed' ? 'Validation passed' : 'Validation failed';
    const state = status === 'passed' ? 'done' : 'blocked';
    const normalized = Array.isArray(checkpoints) ? checkpoints : [];
    let replaced = false;
    const next = normalized.map(checkpoint => {
        if (!/validat/i.test(checkpoint.label || '')) return checkpoint;
        replaced = true;
        return { ...checkpoint, label, state };
    });

    return replaced
        ? next
        : [...next, { label, state }];
}

function getOutcomeText(run, latestEvent) {
    if (!run) return 'No run selected.';
    if (run.status === 'completed') return latestEvent?.title ? `Completed: ${latestEvent.title}.` : 'Completed.';
    if (run.status === 'blocked') return latestEvent?.title ? `Blocked: ${latestEvent.title}.` : 'Blocked.';
    if (run.status === 'cancelled') return 'Cancelled before completion.';
    if (run.status === 'running') return 'Still running.';
    return 'Waiting for the next action.';
}

function getRunSourceType(run) {
    if (run.id === 'mission-openclaw-health' || run.gateway) return 'gateway';
    if (run.id?.startsWith('terminal-') || run.agent === 'Opal Terminal') return 'terminal';
    if (run.id?.startsWith('cowork-') || run.agent === 'Opal Cowork Agent') return 'cowork';
    if (run.id?.startsWith('code-') || run.agent === 'Opal Code Assistant' || run.agent === 'Opal Code Editor') return 'code';
    if (run.id?.startsWith('build-') || run.agent === 'Opal Build Assistant') return 'build';
    return 'general';
}

function sortRuns(runs) {
    return [...runs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function compactTerminalOutput(output) {
    return stripTerminalControl(output)
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => {
            const trimmed = line.trim();
            return trimmed
                && !trimmed.includes('__OPAL_MISSION_')
                && !trimmed.includes('__opal_mission_status')
                && !trimmed.startsWith('printf ');
        })
        .slice(-12)
        .join('\n')
        .slice(0, 2000);
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
