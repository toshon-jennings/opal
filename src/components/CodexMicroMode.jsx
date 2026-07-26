import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Bot,
    Check,
    ChevronLeft,
    Expand,
    FolderOpen,
    Loader2,
    Mic,
    MicOff,
    Sparkles,
    X,
    Zap,
} from 'lucide-react';
import chatGptLogo from '../assets/chatgpt-logo.png';
import { useMode } from '../context/ModeContext';
import {
    readJsonStorage,
    readStringStorage,
    writeJsonStorage,
    writeStringStorage,
} from '../lib/persistentStore';
import {
    CODEX_AGENT_JOBS_PERSIST_KEY,
    CODEX_AGENT_MODEL_PERSIST_KEY,
    CODEX_MICRO_PERSIST_KEY,
    CODEX_REASONING_LEVELS,
    CODEX_WORKFLOWS,
    codexJobTone,
    isCodexJobActive,
    mergeCodexJobs,
    normalizeCodexMicroSettings,
    selectCodexMicroJobs,
    sortCodexJobs,
} from '../lib/codexMicro';
import './CodexMicroMode.css';

const JOB_LIMIT = 24;

const HARDWARE_KEYBOARD_ROWS = [
    [
        { key: '1', sub: '!' }, { key: '2', sub: '@' }, { key: '3', sub: '#' },
        { key: '4', sub: '$' }, { key: '5', sub: '%' }, { key: '6', sub: '^' },
        { key: '7', sub: '&' }, { key: '8', sub: '*' }, { key: '9', sub: '(' },
        { key: '0', sub: ')' },
    ],
    [
        { key: 'q', sub: '[' }, { key: 'w', sub: ']' }, { key: 'e', sub: '{' },
        { key: 'r', sub: '}' }, { key: 't', sub: '<' }, { key: 'y', sub: '>' },
        { key: 'u', sub: '/' }, { key: 'i', sub: '\\' }, { key: 'o', sub: '|' },
        { key: 'p', sub: '~' },
    ],
    [
        { key: 'a', sub: '+' }, { key: 's', sub: '-' }, { key: 'd', sub: '*' },
        { key: 'f', sub: '=' }, { key: 'g', sub: '%' }, { key: 'h', sub: '&' },
        { key: 'j', sub: ':' }, { key: 'k', sub: ';' }, { key: 'l', sub: '"' },
        { key: ';', sub: "'" },
    ],
    [
        { key: 'shift', special: true, label: '⇧ Shift' },
        { key: 'z', sub: '_' }, { key: 'x', sub: '?' }, { key: 'c', sub: '!' },
        { key: 'v', sub: ',' }, { key: 'b', sub: '.' }, { key: 'n', sub: '-' },
        { key: 'm', sub: '`' },
        { key: 'alt', special: true, label: '⌥ Sym' },
        { key: 'backspace', special: true, label: '⌫' },
    ],
];

const SHIFT_NUM_MAP = {
    '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
    '6': '^', '7': '&', '8': '*', '9': '(', '0': ')'
};

const SYMBOL_CATEGORIES = [
    { label: 'Code', items: ['{', '}', '[', ']', '(', ')', '=>', ';', ':', '=', '"', "'"] },
    { label: 'Punct', items: ['!', '?', '@', '#', '$', '&', '%', '*', '^', '~', '`'] },
    { label: 'Math', items: ['+', '-', '*', '/', '=', '%', '<', '>', '|'] },
    { label: 'Paths', items: ['/', '\\', '~', '.', '_', '-'] },
];

const SUGGESTED_DIRS = [
    { label: 'Home', path: '~/' },
    { label: 'Desktop', path: '~/Desktop' },
    { label: 'Projects', path: '~/Projects' },
    { label: 'Documents', path: '~/Documents' },
    { label: 'Downloads', path: '~/Downloads' },
];

function emptyCodexStatus({ checking = false, desktop = false } = {}) {
    return {
        checking,
        desktop,
        installed: false,
        authenticated: false,
        subscription: false,
        authMode: null,
        path: null,
        version: null,
    };
}

function readPersistedCodexJobs() {
    try {
        const jobsByAgent = JSON.parse(readStringStorage(CODEX_AGENT_JOBS_PERSIST_KEY, '{}'));
        return sortCodexJobs(jobsByAgent?.codex || [], JOB_LIMIT);
    } catch {
        return [];
    }
}

function readCodexModel() {
    try {
        const modelsByAgent = JSON.parse(readStringStorage(CODEX_AGENT_MODEL_PERSIST_KEY, '{}'));
        return typeof modelsByAgent?.codex === 'string' ? modelsByAgent.codex.trim() : '';
    } catch {
        return '';
    }
}

function persistCodexJobs(jobs) {
    try {
        const current = JSON.parse(readStringStorage(CODEX_AGENT_JOBS_PERSIST_KEY, '{}'));
        writeStringStorage(CODEX_AGENT_JOBS_PERSIST_KEY, JSON.stringify({
            ...(current && typeof current === 'object' ? current : {}),
            codex: jobs,
        }));
    } catch {
        writeStringStorage(CODEX_AGENT_JOBS_PERSIST_KEY, JSON.stringify({ codex: jobs }));
    }
}

function folderName(path) {
    if (!path) return 'Home folder';
    return path.split('/').filter(Boolean).at(-1) || path;
}

function formatJobTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatStatus(status) {
    if (status === 'retry_queued') return 'retry queued';
    if (status === 'claimed') return 'running';
    return status || 'idle';
}

function AgentKey({ index, job, selected, onSelect }) {
    const tone = job ? codexJobTone(job.status) : 'idle';
    const label = job
        ? `Codex job ${index + 1}: ${formatStatus(job.status)}. ${job.prompt_preview || job.prompt_text || 'No prompt preview'}`
        : `Empty Codex agent slot ${index + 1}`;

    return (
        <button
            type="button"
            className={`cm-key cm-agent-key cm-agent-key-${index + 1}${selected ? ' is-selected' : ''}`}
            data-tone={tone}
            aria-label={label}
            title={label}
            disabled={!job}
            onClick={() => job && onSelect(job.id)}
        >
            <span className="cm-agent-light" aria-hidden="true" />
            <Bot size={24} aria-hidden="true" />
            <span className="cm-agent-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="cm-agent-status">{job ? formatStatus(job.status) : 'idle'}</span>
        </button>
    );
}

export default function CodexMicroMode() {
    const { openAgentWindow } = useMode();
    const savedSettings = useMemo(
        () => normalizeCodexMicroSettings(readJsonStorage(CODEX_MICRO_PERSIST_KEY, {})),
        []
    );
    const [reasoning, setReasoning] = useState(savedSettings.reasoning);
    const [workflowId, setWorkflowId] = useState(savedSettings.workflowId);
    const [prompt, setPrompt] = useState(savedSettings.prompt);
    const [workingDirectory, setWorkingDirectory] = useState(() => readStringStorage('working_directory', ''));
    const [jobs, setJobs] = useState(readPersistedCodexJobs);
    const [selectedJobId, setSelectedJobId] = useState(() => readPersistedCodexJobs()[0]?.id || null);
    const [queueing, setQueueing] = useState(false);
    const [notice, setNotice] = useState('');
    const [connectionWarning, setConnectionWarning] = useState('');
    const [codexStatus, setCodexStatus] = useState(() => emptyCodexStatus({
        checking: true,
        desktop: Boolean(window.electron?.getCodexPocketStatus),
    }));
    const [signingIn, setSigningIn] = useState(false);
    const [listening, setListening] = useState(false);
    const [shifted, setShifted] = useState(false);
    const [altActive, setAltActive] = useState(false);
    const [activeSymbolCategory, setActiveSymbolCategory] = useState(0);
    const [browsingFolder, setBrowsingFolder] = useState(false);
    const [browsePath, setBrowsePath] = useState('');
    const [pressedKeys, setPressedKeys] = useState(() => new Set());
    const [clockTime, setClockTime] = useState(() => new Date());
    const promptRef = useRef(null);
    const speechRef = useRef(null);
    const dictationBaseRef = useRef('');
    const browseInputRef = useRef(null);
    const rootRef = useRef(null);
    const joystickGateRef = useRef(null);
    const joystickDragRef = useRef(null);
    const joystickSuppressClickRef = useRef(false);
    const [joystickVector, setJoystickVector] = useState({ x: 0, y: 0 });

    const reasoningIndex = Math.max(
        0,
        CODEX_REASONING_LEVELS.findIndex((level) => level.id === reasoning)
    );
    const reasoningLevel = CODEX_REASONING_LEVELS[reasoningIndex];
    const visibleJobs = useMemo(() => selectCodexMicroJobs(jobs), [jobs]);
    const selectedJob = visibleJobs.find((job) => job.id === selectedJobId) || visibleJobs[0] || null;
    const activeJob = jobs.find(isCodexJobActive) || null;
    const activeJobId = activeJob?.id || null;
    const hasActiveJob = Boolean(activeJob);
    const activeJobCount = jobs.filter(isCodexJobActive).length;
    const cancellableJob = selectedJob && isCodexJobActive(selectedJob) ? selectedJob : activeJob;
    const model = readCodexModel();
    const promptLoad = Math.min(100, Math.max(8, Math.round((prompt.length / 420) * 100)));
    const reasoningLoad = Math.min(100, Math.max(22, (reasoningIndex + 1) * 24));
    const codexConnectionLabel = codexStatus.checking
        ? 'Checking Codex'
        : !codexStatus.desktop
            ? 'Desktop app required'
            : codexStatus.subscription
                ? 'Codex plan ready'
                : codexStatus.authenticated
                    ? 'Codex API ready'
                    : codexStatus.installed
                        ? 'Sign in to Codex'
                        : 'Install Codex';


    // Build suggested dirs including the current workspace and its parent
    const allSuggestedDirs = useMemo(() => {
        const dirs = [...SUGGESTED_DIRS];
        if (workingDirectory) {
            const parts = workingDirectory.replace(/^~/, '').split('/').filter(Boolean);
            if (parts.length > 1) {
                const parent = '~/' + parts.slice(0, -1).join('/');
                if (!dirs.some((d) => d.path === parent)) {
                    dirs.splice(0, 0, { label: '.. (parent)', path: parent });
                }
            }
            if (!dirs.some((d) => d.path === workingDirectory)) {
                dirs.push({ label: folderName(workingDirectory), path: workingDirectory });
            }
        }
        return dirs;
    }, [workingDirectory]);

    useEffect(() => {
        writeJsonStorage(CODEX_MICRO_PERSIST_KEY, { reasoning, workflowId, prompt });
    }, [prompt, reasoning, workflowId]);

    useEffect(() => {
        if (!visibleJobs.length) {
            setSelectedJobId(null);
            return;
        }
        if (!selectedJobId || !visibleJobs.some((job) => job.id === selectedJobId)) {
            setSelectedJobId(activeJobId || visibleJobs[0].id);
        }
    }, [activeJobId, selectedJobId, visibleJobs]);

    const updateJobs = useCallback((incoming) => {
        setJobs((current) => {
            const next = mergeCodexJobs(current, incoming, JOB_LIMIT);
            persistCodexJobs(next);
            return next;
        });
    }, []);

    const loadJobs = useCallback(async () => {
        if (!window.electron?.listAgentJobs) {
            setConnectionWarning('Live jobs require the Perci desktop app.');
            return;
        }
        try {
            const allJobs = await window.electron.listAgentJobs({ limit: JOB_LIMIT, source: 'agents_page' });
            setConnectionWarning('');
            const incoming = (allJobs || []).filter((job) => job.agent === 'codex');
            setJobs((current) => {
                const retainedFinishedJobs = current.filter((job) => !isCodexJobActive(job));
                const next = mergeCodexJobs(retainedFinishedJobs, incoming, JOB_LIMIT);
                persistCodexJobs(next);
                return next;
            });
        } catch (error) {
            setConnectionWarning(error?.message || 'Could not refresh Codex jobs.');
        }
    }, []);

    const loadCodexStatus = useCallback(async () => {
        if (!window.electron?.getCodexPocketStatus) {
            const browserStatus = emptyCodexStatus();
            setCodexStatus(browserStatus);
            return browserStatus;
        }
        try {
            const status = await window.electron.getCodexPocketStatus();
            const next = { ...status, checking: false, desktop: true };
            setCodexStatus(next);
            return next;
        } catch {
            const unavailableStatus = emptyCodexStatus({ desktop: true });
            setCodexStatus(unavailableStatus);
            return unavailableStatus;
        }
    }, []);

    useEffect(() => {
        void loadJobs();
        const interval = window.setInterval(() => void loadJobs(), hasActiveJob ? 2500 : 7000);
        return () => window.clearInterval(interval);
    }, [hasActiveJob, loadJobs]);

    useEffect(() => {
        void loadCodexStatus();
        const interval = window.setInterval(() => void loadCodexStatus(), 30000);
        return () => window.clearInterval(interval);
    }, [loadCodexStatus]);

    useEffect(() => {
        if (!signingIn) return undefined;
        const startedAt = Date.now();
        const interval = window.setInterval(async () => {
            const status = await loadCodexStatus();
            if (status.subscription) {
                setSigningIn(false);
                setNotice('ChatGPT plan connected. Pocket is ready.');
            } else if (Date.now() - startedAt > 180000) {
                setSigningIn(false);
                setNotice('Sign-in is still incomplete. Choose Sign in to try again.');
            }
        }, 1500);
        return () => window.clearInterval(interval);
    }, [loadCodexStatus, signingIn]);

    useEffect(() => () => {
        try {
            speechRef.current?.stop();
        } catch {
            // Recognition may already be stopped.
        }
    }, []);

    useEffect(() => {
        if (browsingFolder && browseInputRef.current) {
            browseInputRef.current.focus();
        }
    }, [browsingFolder]);

    useEffect(() => {
        const interval = window.setInterval(() => setClockTime(new Date()), 1000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        const normalizeKey = (event) => {
            if (event.key === ' ') return 'space';
            if (event.key === 'Enter') return 'enter';
            if (event.key === 'Backspace') return 'backspace';
            if (event.key === 'Shift') return 'shift';
            if (event.key?.length === 1) return event.key.toLowerCase();
            return null;
        };
        const isCodexMicroInput = () => {
            const active = document.activeElement;
            return Boolean(active && rootRef.current?.contains(active));
        };
        const handleKeyDown = (event) => {
            const key = normalizeKey(event);
            if (!key || !isCodexMicroInput()) return;
            setPressedKeys((current) => {
                const next = new Set(current);
                next.add(key);
                return next;
            });
        };
        const handleKeyUp = (event) => {
            const key = normalizeKey(event);
            if (!key) return;
            setPressedKeys((current) => {
                const next = new Set(current);
                next.delete(key);
                return next;
            });
        };
        const clearPressed = () => setPressedKeys(new Set());

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', clearPressed);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', clearPressed);
        };
    }, []);

    const connectCodex = useCallback(async () => {
        if (!codexStatus.desktop) {
            setNotice('Codex connection requires the Perci desktop app.');
            return;
        }
        if (!codexStatus.installed) {
            await window.electron.openExternal?.('https://developers.openai.com/codex/cli/');
            setNotice('Install Codex, then return here to connect your ChatGPT plan.');
            return;
        }
        if (!window.electron?.loginCodexWithChatGPT || signingIn) return;

        setSigningIn(true);
        setNotice('');
        try {
            const result = await window.electron.loginCodexWithChatGPT();
            if (!result?.ok) {
                setSigningIn(false);
                setNotice(result?.error || 'Could not start Codex sign-in.');
                return;
            }
            setNotice('Finish signing in with ChatGPT in your browser.');
        } catch (error) {
            setSigningIn(false);
            setNotice(error?.message || 'Could not start Codex sign-in.');
        }
    }, [codexStatus.desktop, codexStatus.installed, signingIn]);

    const runTask = useCallback(async () => {
        const task = prompt.trim();
        if (!task || queueing) return;
        if (!window.electron?.queueAgentJob) {
            setNotice('Codex jobs require the Perci desktop app.');
            return;
        }
        if (!codexStatus.authenticated) {
            setNotice(codexStatus.installed
                ? 'Sign in to Codex before starting a task.'
                : 'Install Codex before starting a task.');
            return;
        }

        setQueueing(true);
        setNotice('');
        try {
            const result = await window.electron.queueAgentJob({
                agent: 'codex',
                prompt: task,
                working_directory: workingDirectory,
                model,
                reasoning_effort: reasoning,
                source: 'agents_page',
            });
            if (!result?.ok) {
                setNotice(result?.error || 'Could not start Codex.');
                return;
            }
            updateJobs([result.job]);
            setSelectedJobId(result.job.id);
            setPrompt('');
            setWorkflowId(null);
            setNotice(`Codex started with ${reasoningLevel.label.toLowerCase()} reasoning.`);
        } catch (error) {
            setNotice(error?.message || 'Could not start Codex.');
        } finally {
            setQueueing(false);
        }
    }, [
        codexStatus.authenticated,
        codexStatus.installed,
        model,
        prompt,
        queueing,
        reasoning,
        reasoningLevel.label,
        updateJobs,
        workingDirectory,
    ]);

    const cancelJob = useCallback(async () => {
        if (!cancellableJob || !window.electron?.cancelAgentJob) return;
        try {
            const result = await window.electron.cancelAgentJob(cancellableJob.id);
            if (!result?.ok) {
                setNotice(result?.error || 'Could not cancel the Codex job.');
                return;
            }
            setNotice('Codex job cancelled.');
            await loadJobs();
        } catch (error) {
            setNotice(error?.message || 'Could not cancel the Codex job.');
        }
    }, [cancellableJob, loadJobs]);

    const setWorkspace = useCallback((path) => {
        setWorkingDirectory(path);
        writeStringStorage('working_directory', path);
        setBrowsePath('');
        setBrowsingFolder(false);
        setNotice(`Workspace set to ${folderName(path)}.`);
    }, []);

    const openFolderBrowser = useCallback(() => {
        setBrowsePath(workingDirectory || '');
        setBrowsingFolder(true);
    }, [workingDirectory]);

    const closeFolderBrowser = useCallback(() => {
        setBrowsingFolder(false);
        setBrowsePath('');
    }, []);

    const stageWorkflow = useCallback((workflow) => {
        setWorkflowId(workflow.id);
        setPrompt(workflow.prompt);
        setNotice(`${workflow.label} workflow staged. Edit it or press Run.`);
        window.requestAnimationFrame(() => promptRef.current?.focus());
    }, []);

    const newTask = useCallback(() => {
        setPrompt('');
        setNotice('Fresh prompt ready');
        promptRef.current?.focus();
    }, []);

    const moveJoystick = useCallback((clientX, clientY) => {
        const drag = joystickDragRef.current;
        if (!drag) return;
        const dx = clientX - drag.centerX;
        const dy = clientY - drag.centerY;
        const dist = Math.hypot(dx, dy);

        if (dist > 6) drag.moved = true;

        const clampedDist = Math.min(dist, drag.limit);
        const angle = Math.atan2(dy, dx);
        const x = Math.cos(angle) * clampedDist;
        const y = Math.sin(angle) * clampedDist;

        setJoystickVector({ x, y });

        if (dist > drag.limit * 0.45) {
            const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
            let dir = 'up';
            if (deg >= -45 && deg < 45) dir = 'right';
            else if (deg >= 45 && deg < 135) dir = 'down';
            else if (deg >= 135 || deg < -135) dir = 'left';

            const targetWorkflow = CODEX_WORKFLOWS.find((w) => w.direction === dir);
            if (targetWorkflow && targetWorkflow.id !== workflowId) {
                stageWorkflow(targetWorkflow);
            }
        }
    }, [workflowId, stageWorkflow]);

    const releaseJoystick = useCallback(() => {
        if (joystickDragRef.current?.moved) {
            joystickSuppressClickRef.current = true;
        }
        joystickDragRef.current = null;
        setJoystickVector({ x: 0, y: 0 });
    }, []);

    const handleJoystickKeyDown = useCallback((event) => {
        const keyDirMap = {
            ArrowUp: 'up',
            ArrowRight: 'right',
            ArrowDown: 'down',
            ArrowLeft: 'left',
        };
        const dir = keyDirMap[event.key];
        if (!dir) return;

        event.preventDefault();
        const targetWorkflow = CODEX_WORKFLOWS.find((w) => w.direction === dir);
        if (targetWorkflow) {
            stageWorkflow(targetWorkflow);
        }
    }, [stageWorkflow]);

    const toggleDictation = useCallback(() => {
        if (listening) {
            if (speechRef.current) {
                speechRef.current.stop();
                speechRef.current = null;
            }
            setListening(false);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setNotice('Speech recognition is not supported in this browser. Use macOS Dictation.');
            return;
        }

        dictationBaseRef.current = prompt;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setListening(true);
            setNotice('Listening… Speak your prompt.');
        };
        recognition.onresult = (event) => {
            let transcript = '';
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
                transcript += event.results[index][0]?.transcript || '';
            }
            setPrompt([dictationBaseRef.current, transcript.trim()].filter(Boolean).join(' '));
        };
        recognition.onerror = (event) => {
            setNotice(event.error === 'not-allowed'
                ? 'Microphone access was denied. Use macOS Dictation.'
                : 'Dictation stopped.');
        };
        recognition.onend = () => {
            setListening(false);
            speechRef.current = null;
        };
        speechRef.current = recognition;
        recognition.start();
    }, [listening, prompt]);

    const insertSymbol = useCallback((sym) => {
        if (browsingFolder) {
            setBrowsePath((prev) => prev + sym);
            if (browseInputRef.current) browseInputRef.current.focus();
        } else {
            setPrompt((prev) => prev + sym);
            if (promptRef.current) promptRef.current.focus();
        }
    }, [browsingFolder]);

    const handlePromptKeyDown = useCallback((event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void runTask();
        }
    }, [runTask]);

    const handleHardwareKeyClick = useCallback((item) => {
        const isFolder = browsingFolder;
        const updateTarget = (updater) => {
            if (isFolder) setBrowsePath(updater);
            else setPrompt(updater);
        };

        const textarea = isFolder ? browseInputRef.current : promptRef.current;
        if (textarea) textarea.focus();

        if (item.special) {
            switch (item.key) {
                case 'shift':
                    setShifted((prev) => !prev);
                    break;
                case 'alt':
                    setAltActive((prev) => !prev);
                    break;
                case 'backspace':
                    updateTarget((prev) => prev.slice(0, -1));
                    break;
                case 'space':
                    updateTarget((prev) => prev + ' ');
                    break;
                case 'enter':
                    if (isFolder) {
                        if (browsePath.trim()) setWorkspace(browsePath.trim());
                    } else {
                        void runTask();
                    }
                    break;
                default:
                    break;
            }
            return;
        }

        if (altActive && item.sub) {
            updateTarget((prev) => prev + item.sub);
        } else if (shifted && item.sub && !isNaN(Number(item.key))) {
            updateTarget((prev) => prev + item.sub);
        } else if (shifted) {
            updateTarget((prev) => prev + item.key.toUpperCase());
        } else {
            updateTarget((prev) => prev + item.key);
        }
    }, [browsingFolder, browsePath, setWorkspace, runTask, shifted, altActive]);

    return (
        <section className="codex-micro" ref={rootRef}>
            <header className="cm-header">
                <div>
                    <p className="cm-eyebrow">Perci concept · digital control deck</p>
                    <h1>Perci Pocket</h1>
                </div>
                <button
                    type="button"
                    className="cm-live-summary cm-codex-connection"
                    aria-live="polite"
                    onClick={() => void connectCodex()}
                    disabled={codexStatus.checking || signingIn || codexStatus.subscription}
                    title={codexStatus.path || codexConnectionLabel}
                >
                    <span className={`cm-live-dot${activeJob ? ' is-active' : codexStatus.subscription ? ' is-connected' : ''}`} aria-hidden="true" />
                    {activeJob ? 'Perci is working' : signingIn ? 'Waiting for sign-in' : codexConnectionLabel}
                </button>
            </header>

            <div className="cm-device-wrap">
                <div className="cm-device">
                    <span className="cm-board-copy cm-board-copy-left">A Perci Design 2026</span>
                    <span className="cm-board-copy cm-board-copy-right">You can just build things</span>
                    <span className="cm-board-copy cm-board-copy-bottom">Let&apos;s build</span>

                    <div className="cm-screen">
                        {browsingFolder ? (
                            <>
                                <div className="cm-screen-status">
                                    <button
                                        type="button"
                                        className="cm-screen-back"
                                        onClick={closeFolderBrowser}
                                        title="Back to terminal"
                                    >
                                        <ChevronLeft size={14} />
                                        <span>Workspace</span>
                                    </button>
                                    <span className="cm-screen-model">select a directory</span>
                                </div>
                                <div className="cm-screen-dirs">
                                    {allSuggestedDirs.map((dir) => {
                                        const isActive = dir.path === workingDirectory;
                                        return (
                                            <button
                                                key={dir.path}
                                                type="button"
                                                className={`cm-screen-dir${isActive ? ' is-active' : ''}`}
                                                onClick={() => setWorkspace(dir.path)}
                                            >
                                                <FolderOpen size={12} />
                                                <span className="cm-screen-dir-label">{dir.label}</span>
                                                <span className="cm-screen-dir-path">{dir.path}</span>
                                                {isActive && <span className="cm-screen-dir-check">✓</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="cm-screen-input-row">
                                    <span className="cm-screen-prompt-char">~</span>
                                    <input
                                        ref={browseInputRef}
                                        type="text"
                                        className="cm-screen-browse-input"
                                        value={browsePath.replace(/^~/, '')}
                                        onChange={(e) => setBrowsePath('~/' + e.target.value.replace(/^\//, ''))}
                                        onKeyDown={(e) => { if (e.key === 'Enter') setWorkspace(browsePath); }}
                                        placeholder="/path/to/project"
                                    />
                                    <button
                                        type="button"
                                        className="cm-screen-run"
                                        disabled={!browsePath.trim()}
                                        onClick={() => setWorkspace(browsePath.trim())}
                                        title="Set workspace"
                                    >
                                        <Check size={14} />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="cm-screen-status">
                                    <span className={`cm-live-dot${activeJob ? ' is-active' : ''}`} aria-hidden="true" />
                                    <span className="cm-screen-model">{model || 'Codex'}</span>
                                    {codexStatus.authenticated && (
                                        <span className="cm-screen-account">
                                            {codexStatus.subscription ? 'plan' : 'api'}
                                        </span>
                                    )}
                                    <span className="cm-screen-reasoning">{reasoningLevel.label}</span>
                                    <span className="cm-screen-persist">{folderName(workingDirectory)}</span>
                                </div>
                                <div className="cm-screen-log">
                                    {activeJob && (
                                        <p className="cm-screen-line">
                                            <span className="cm-screen-time">{formatJobTime(activeJob.created_at)}</span>
                                            <span className="cm-screen-status-label">running</span>
                                            {activeJob.prompt_preview || activeJob.prompt_text}
                                        </p>
                                    )}
                                    {selectedJob && selectedJob !== activeJob && (
                                        <p className="cm-screen-line">
                                            <span className="cm-screen-time">{formatJobTime(selectedJob.created_at)}</span>
                                            <span className="cm-screen-status-label" data-tone={codexJobTone(selectedJob.status)}>
                                                {formatStatus(selectedJob.status)}
                                            </span>
                                            {selectedJob.prompt_preview || selectedJob.prompt_text}
                                        </p>
                                    )}
                                    {selectedJob?.output_preview && (
                                        <p className="cm-screen-line cm-screen-output">
                                            {selectedJob.output_preview}
                                        </p>
                                    )}
                                    {!selectedJob && !activeJob && (
                                        <p className="cm-screen-line cm-screen-idle">
                                            Stage a workflow or write a task.
                                        </p>
                                    )}
                                    {!codexStatus.checking && !codexStatus.authenticated && (
                                        <p className="cm-screen-line cm-screen-notice is-warning">
                                            {codexStatus.installed
                                                ? 'Sign in with ChatGPT to use your Codex plan.'
                                                : 'Install Codex to connect Pocket.'}
                                        </p>
                                    )}
                                    {codexStatus.authenticated && !codexStatus.subscription && (
                                        <p className="cm-screen-line cm-screen-notice is-warning">
                                            API-key auth active. Connect ChatGPT to use your plan.
                                        </p>
                                    )}
                                    {(notice || connectionWarning) && (
                                        <p className={`cm-screen-line cm-screen-notice${connectionWarning ? ' is-warning' : ''}`}>
                                            {connectionWarning || notice}
                                        </p>
                                    )}
                                </div>
                                <div className="cm-screen-symbols" role="toolbar" aria-label="Quick symbol tray">
                                    <div className="cm-screen-sym-pills">
                                        {SYMBOL_CATEGORIES[activeSymbolCategory].items.map((sym) => (
                                            <button
                                                key={sym}
                                                type="button"
                                                className="cm-screen-sym-pill"
                                                onClick={() => insertSymbol(sym)}
                                                title={`Insert ${sym}`}
                                            >
                                                {sym}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="cm-screen-sym-tabs">
                                        {SYMBOL_CATEGORIES.map((cat, idx) => (
                                            <button
                                                key={cat.label}
                                                type="button"
                                                className={`cm-screen-sym-tab${activeSymbolCategory === idx ? ' is-active' : ''}`}
                                                onClick={() => setActiveSymbolCategory(idx)}
                                            >
                                                {cat.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="cm-screen-input-row">
                                    <span className="cm-screen-prompt-char">{shifted ? '$' : '>'}</span>
                                    <textarea
                                        ref={promptRef}
                                        className="cm-screen-input"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        onKeyDown={handlePromptKeyDown}
                                        placeholder="Tell Perci what to build…"
                                        rows={1}
                                    />
                                    <button
                                        type="button"
                                        className="cm-screen-run"
                                        disabled={!prompt.trim() || queueing || !codexStatus.authenticated}
                                        onClick={() => void runTask()}
                                        title="Run task"
                                    >
                                        {queueing ? <Loader2 size={14} className="cm-spin" /> : <Zap size={14} />}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="cm-grid">
                        <div className="cm-dial-block">
                            <div className="cm-dial-top-controls">
                                <button
                                    type="button"
                                    className="cm-top-key cm-top-new"
                                    onClick={newTask}
                                    title="Start a fresh task"
                                    aria-label="Start a fresh task"
                                >
                                    <img src={chatGptLogo} alt="" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    className={`cm-top-key cm-top-dictate${listening ? ' is-listening' : ''}`}
                                    onClick={toggleDictation}
                                    title={listening ? 'Stop dictation' : 'Start dictation'}
                                    aria-label={listening ? 'Stop dictation' : 'Start dictation'}
                                >
                                    {listening ? <MicOff size={14} /> : <Mic size={14} />}
                                </button>
                            </div>

                            <label className="cm-dial" title={`Reasoning: ${reasoningLevel.label}`}>
                                <span
                                    className="cm-dial-knob"
                                    style={{ transform: `rotate(${reasoningLevel.angle}deg)` }}
                                    aria-hidden="true"
                                >
                                    <span />
                                </span>
                                <input
                                    type="range"
                                    min="0"
                                    max={CODEX_REASONING_LEVELS.length - 1}
                                    step="1"
                                    value={reasoningIndex}
                                    aria-label={`Reasoning effort: ${reasoningLevel.label}`}
                                    onChange={(event) => setReasoning(CODEX_REASONING_LEVELS[Number(event.target.value)].id)}
                                />
                                <span className="cm-control-label">{reasoningLevel.label}</span>
                            </label>
                        </div>

                        <AgentKey index={0} job={visibleJobs[0]} selected={selectedJob?.id === visibleJobs[0]?.id} onSelect={setSelectedJobId} />
                        <AgentKey index={1} job={visibleJobs[1]} selected={selectedJob?.id === visibleJobs[1]?.id} onSelect={setSelectedJobId} />

                        <div
                            className="cm-joystick"
                            data-direction={CODEX_WORKFLOWS.find((workflow) => workflow.id === workflowId)?.direction || ''}
                        >
                            <div className="cm-joystick-gate" ref={joystickGateRef}>
                                {CODEX_WORKFLOWS.map((workflow) => (
                                    <span
                                        key={workflow.id}
                                        className={`cm-joystick-legend is-${workflow.direction}${workflowId === workflow.id ? ' is-active' : ''}`}
                                        aria-hidden="true"
                                    >
                                        {workflow.label}
                                    </span>
                                ))}
                                <button
                                    type="button"
                                    className="cm-joystick-stick"
                                    style={{ '--stick-x': `${joystickVector.x}px`, '--stick-y': `${joystickVector.y}px` }}
                                    aria-label="Workflow joystick. Drag or use arrow keys."
                                    title="Drag toward a workflow or use the arrow keys"
                                    onPointerDown={(event) => {
                                        const rect = joystickGateRef.current?.getBoundingClientRect();
                                        if (!rect) return;
                                        event.currentTarget.setPointerCapture?.(event.pointerId);
                                        joystickDragRef.current = {
                                            pointerId: event.pointerId,
                                            centerX: rect.left + rect.width / 2,
                                            centerY: rect.top + rect.height / 2,
                                            limit: rect.width * 0.16,
                                            moved: false,
                                        };
                                        moveJoystick(event.clientX, event.clientY);
                                    }}
                                    onPointerMove={(event) => {
                                        if (joystickDragRef.current?.pointerId === event.pointerId) {
                                            moveJoystick(event.clientX, event.clientY);
                                        }
                                    }}
                                    onPointerUp={releaseJoystick}
                                    onPointerCancel={releaseJoystick}
                                    onKeyDown={handleJoystickKeyDown}
                                    onClick={() => {
                                        if (joystickSuppressClickRef.current) {
                                            joystickSuppressClickRef.current = false;
                                            return;
                                        }
                                        stageWorkflow(CODEX_WORKFLOWS.find((workflow) => workflow.id === workflowId) || CODEX_WORKFLOWS[0]);
                                    }}
                                >
                                    <span className="cm-joystick-cap" aria-hidden="true">
                                        <Sparkles size={14} />
                                    </span>
                                </button>
                            </div>
                            <span className="cm-control-label">
                                {CODEX_WORKFLOWS.find((workflow) => workflow.id === workflowId)?.label || 'Skills'}
                            </span>
                        </div>

                        {[2, 3, 4, 5].map((index) => (
                            <AgentKey
                                key={index}
                                index={index}
                                job={visibleJobs[index]}
                                selected={selectedJob?.id === visibleJobs[index]?.id}
                                onSelect={setSelectedJobId}
                            />
                        ))}

                        <button
                            type="button"
                            className="cm-key cm-command-key cm-command-run"
                            disabled={!prompt.trim() || queueing || !codexStatus.authenticated}
                            onClick={() => void runTask()}
                            title="Run task"
                        >
                            {queueing ? <Loader2 size={24} className="cm-spin" /> : <Zap size={24} />}
                            <span>Run</span>
                        </button>
                        <button
                            type="button"
                            className="cm-key cm-command-key cm-command-inspect"
                            disabled={!selectedJob}
                            onClick={() => openAgentWindow('codex')}
                            title="Inspect in Agents"
                        >
                            <Check size={24} />
                            <span>Inspect</span>
                        </button>
                        <button
                            type="button"
                            className="cm-key cm-command-key cm-command-cancel"
                            disabled={!cancellableJob}
                            onClick={() => void cancelJob()}
                            title="Cancel active job"
                        >
                            <X size={24} />
                            <span>Cancel</span>
                        </button>
                        <button
                            type="button"
                            className="cm-key cm-command-key cm-command-agents"
                            onClick={() => openAgentWindow('codex')}
                            title="Open full Agents window"
                        >
                            <Expand size={24} />
                            <span>Agents</span>
                        </button>
                    </div>

                    <div className="cm-input-deck">
                        <div className="cm-keyboard" role="group" aria-label="Physical Hardware Keyboard">
                            {HARDWARE_KEYBOARD_ROWS.map((row, rowIndex) => (
                                <div key={rowIndex} className="cm-keyboard-row">
                                    {row.map((item) => {
                                        const isSpecial = item.special;
                                        const specialClass = (item.key === 'shift' && shifted) || (item.key === 'alt' && altActive) ? 'is-active' : '';

                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                className={`cm-kb-key${isSpecial ? ` cm-kb-${item.key}` : ''} ${specialClass}${pressedKeys.has(item.key) ? ' is-pressed' : ''}`}
                                                onClick={() => handleHardwareKeyClick(item)}
                                                aria-label={item.label || `${item.key} key (sub-legend: ${item.sub || 'none'})`}
                                            >
                                                {isSpecial ? (
                                                    <span className="cm-kb-main-label">{item.label}</span>
                                                ) : (
                                                    <div className="cm-kb-dual-legend">
                                                        {item.sub && (
                                                            <span className={`cm-kb-sub-legend${altActive || (shifted && !isNaN(Number(item.key))) ? ' is-lit' : ''}`}>
                                                                {item.sub}
                                                            </span>
                                                        )}
                                                        <span className="cm-kb-main-legend">
                                                            {shifted && !item.sub ? item.key.toUpperCase() : item.key}
                                                        </span>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                            <div className="cm-keyboard-row cm-keyboard-bottom-row">
                                <div
                                    className="cm-kb-folder"
                                    role="group"
                                    aria-label={`Perci Pocket device status. Current workspace: ${workingDirectory || 'home folder'}`}
                                    title={'Workspace: ' + (workingDirectory || 'home folder')}
                                >
                                    <div className="cm-status-screen">
                                        <div className="cm-status-topline">
                                            <span>perci-pocket</span>
                                            <span>{clockTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="cm-status-bars" aria-hidden="true">
                                            <span className="cm-status-label">cpu</span>
                                            <span className="cm-status-meter"><i style={{ width: `${reasoningLoad}%` }} /></span>
                                            <span className="cm-status-value">{reasoningLevel.id}</span>
                                            <span className="cm-status-label">mem</span>
                                            <span className="cm-status-meter"><i style={{ width: `${promptLoad}%` }} /></span>
                                            <span className="cm-status-value">{prompt.length}</span>
                                        </div>
                                        <div className="cm-status-bottom">
                                            <span className="cm-status-path">{folderName(workingDirectory)}</span>
                                            <span className="cm-status-jobs">{activeJobCount}/{visibleJobs.length} jobs</span>
                                            <button
                                                type="button"
                                                className="cm-status-browse"
                                                onClick={() => browsingFolder ? closeFolderBrowser() : openFolderBrowser()}
                                                aria-label={`Browse workspace. Current workspace: ${workingDirectory || 'home folder'}`}
                                            >
                                                <FolderOpen size={10} />
                                                <span>Browse</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className={`cm-kb-key cm-kb-space${pressedKeys.has('space') ? ' is-pressed' : ''}`}
                                    onClick={() => handleHardwareKeyClick({ key: 'space', special: true })}
                                    aria-label="Space"
                                >
                                    Space
                                </button>
                                <button
                                    type="button"
                                    className={`cm-kb-key cm-kb-enter${pressedKeys.has('enter') ? ' is-pressed' : ''}`}
                                    onClick={() => handleHardwareKeyClick({ key: 'enter', special: true })}
                                    aria-label="Enter (run)"
                                >
                                    ⏎
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
