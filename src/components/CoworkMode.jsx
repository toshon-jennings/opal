import React, { useState, useEffect, useRef } from 'react';
import { Plus, Send, Code, Layout, Users, ChevronRight, Clock, FolderOpen, Settings, Play, Globe, X, ChevronDown, Check, Calendar, Zap, Monitor, Cloud, AlertTriangle, GitBranch, Terminal as TerminalIcon, Copy, Edit2, Youtube } from 'lucide-react';
import { useMode, MODES } from '../context/ModeContext';
import { useChat } from '../context/ChatContext';
import { useBuildMode } from '../context/BuildModeContext';
import { LLMFactory } from '../lib/llm/clients';
import { Workbench } from './Workbench/Workbench';
import { AttachmentMenu, AttachmentPreview } from './AttachmentSystem';
import { SecondaryModeNav } from './SecondaryModeNav';
import { EditableTitle } from './EditableTitle';
import { SettingsModal } from './SettingsModal';
import { PermissionsDropdown } from './PermissionsDropdown';
import { useAgentTools } from '../hooks/useAgentTools';
import opalLogo from '../assets/opal-logo.png';
import { hasElectronStore, loadElectronPersistence, saveElectronPersistence } from '../lib/persistentStore';
import { normalizeAssistantSpacing } from '../lib/textFormatting';
import { ProviderModelPicker } from './ProviderModelPicker';
import { buildBudgetPrompt, createBudgetRun, estimateCharsFromMessages, recordBudgetIteration, recordBudgetResponse, recordBudgetToolCalls } from '../lib/budgetGovernor';
import { buildMemoryPrompt } from '../lib/harnessMemory';
import { buildRoutingPrompt, chooseModelForTask } from '../lib/modelRouter';
import { buildIntegrationToolsPrompt, INTEGRATION_TOOLS } from '../lib/integrationTools';
import {
    appendMissionRunEvent,
    recordCoworkSessionFinish,
    recordCoworkSessionStart,
    recordCoworkToolCall
} from '../lib/missionControl';

const getDefaultSidebarWidth = () => {
    if (typeof window === 'undefined') return 360;
    return Math.min(360, Math.max(280, Math.floor(window.innerWidth * 0.45)));
};

// ── YouTube Helpers ─────────────────────────────────────────────────────────

function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    let videoId = null;
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'youtu.be') {
            videoId = urlObj.pathname.slice(1);
        } else if (urlObj.hostname.includes('youtube.com')) {
            videoId = urlObj.searchParams.get('v');
            if (!videoId && urlObj.pathname.startsWith('/embed/')) {
                videoId = urlObj.pathname.split('/')[2];
            } else if (!videoId && urlObj.pathname.startsWith('/shorts/')) {
                videoId = urlObj.pathname.split('/')[2];
            }
        }
    } catch (e) { }
    
    if (!videoId) {
        const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^?&%#\s]+)/);
        if (match) videoId = match[1];
    }
    
    if (!videoId) return null;
    const origin = encodeURIComponent(window.location.origin);
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&controls=1&origin=${origin}`;
}
// ── Agent tool definitions ──────────────────────────────────────────────────
const LOCAL_AGENT_TOOLS = [
    {
        name: 'read_file',
        description: 'Read the full contents of a file at the given path.',
        parameters: { path: 'Absolute or project-relative path to the file to read.' }
    },
    {
        name: 'write_file',
        description: 'Write content to a file, creating it and any missing parent directories if needed.',
        parameters: {
            path: 'Absolute or project-relative path of the file to write.',
            content: 'Full content to write to the file.'
        }
    },
    {
        name: 'list_directory',
        description: 'List the files and subdirectories at the given path.',
        parameters: { path: 'Absolute or project-relative directory path. Defaults to the project root.' }
    },
    {
        name: 'run_command',
        description: 'Run a shell command in the WebContainer sandbox. NOT available for local-folder projects — only for sandboxed environments.',
        parameters: { command: 'Shell command to execute, e.g. "npm install" or "node src/index.js".' }
    }
];
const AGENT_TOOLS = [...LOCAL_AGENT_TOOLS, ...INTEGRATION_TOOLS];

// ── Path bar ────────────────────────────────────────────────────────────────

function PathBar({ path, previewUrl, onUpdatePreviewUrl }) {
    const [copied, setCopied] = useState(false);
    const [isEditingPreview, setIsEditingPreview] = useState(false);
    const [tempPreviewUrl, setTempPreviewUrl] = useState(previewUrl || '');

    const handleCopy = () => {
        navigator.clipboard.writeText(path).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const handlePreviewSubmit = (e) => {
        if (e.key === 'Enter') {
            onUpdatePreviewUrl(tempPreviewUrl);
            setIsEditingPreview(false);
        } else if (e.key === 'Escape') {
            setTempPreviewUrl(previewUrl || '');
            setIsEditingPreview(false);
        }
    };

    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);

    return (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0 min-w-0">
            <FolderOpen size={12} className="text-[var(--text-tertiary)] shrink-0" />
            <div className="flex items-center gap-0.5 flex-1 overflow-x-auto min-w-0" style={{ scrollbarWidth: 'none' }}>
                {parts.map((part, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && <span className="text-[var(--text-tertiary)] mx-0.5 text-xs select-none">/</span>}
                        <span
                            className={`font-mono text-xs whitespace-nowrap ${
                                i === parts.length - 1
                                    ? 'text-[var(--text-primary)] font-medium'
                                    : 'text-[var(--text-tertiary)]'
                            }`}
                        >
                            {part}
                        </span>
                    </React.Fragment>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md">
                    <Globe size={11} className="text-[var(--text-tertiary)]" />
                    {isEditingPreview ? (
                        <input
                            autoFocus
                            value={tempPreviewUrl}
                            onChange={(e) => setTempPreviewUrl(e.target.value)}
                            onKeyDown={handlePreviewSubmit}
                            onBlur={() => setIsEditingPreview(false)}
                            className="bg-transparent border-none outline-none font-mono text-[11px] w-48 text-[var(--text-primary)]"
                        />
                    ) : (
                        <div 
                            className="flex items-center gap-1.5 cursor-pointer group"
                            onClick={() => setIsEditingPreview(true)}
                        >
                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                                {previewUrl || 'localhost:5173'}
                            </span>
                            <Edit2 size={10} className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    )}
                </div>

                <button
                    onClick={handleCopy}
                    title="Copy full path"
                    className="shrink-0 p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                    {copied
                        ? <Check size={11} className="text-green-500" />
                        : <Copy size={11} />
                    }
                </button>
            </div>
        </div>
    );
}

function CoworkModelSelector({ selectedProvider, selectedModel, availableModels, updateProvider, updateModel }) {
    return (
        <ProviderModelPicker
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            availableModels={availableModels}
            updateProvider={updateProvider}
            updateModel={updateModel}
            showIcon={true}
            buttonClassName="flex items-center gap-1.5 px-2.5 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-xs max-w-[160px] overflow-hidden"
            labelClassName="truncate text-xs"
            iconSize={13}
            title="Select model"
            dropdownWidthClassName="w-72"
            overlayClassName="fixed inset-0 z-[60]"
            panelClassName="fixed max-h-80 overflow-y-auto z-[61]"
            positionMode="fixed"
        />
    );
}

// ── Routines helpers ────────────────────────────────────────────────────────

function loadRoutines() {
    try {
        return JSON.parse(localStorage.getItem('cowork_routines') || '[]');
    } catch {
        return [];
    }
}

function saveRoutines(routines) {
    const serializedRoutines = JSON.stringify(routines);
    localStorage.setItem('cowork_routines', serializedRoutines);
    if (hasElectronStore()) {
        saveElectronPersistence({ cowork_routines: serializedRoutines })
            .catch(err => console.error('Failed to persist routines:', err));
    }
}

const SCHEDULE_PILLS = ['Manual', 'Hourly', 'Daily', 'Weekdays', 'Weekly'];
const TRIGGERS = [
    { id: 'schedule', icon: Clock, label: 'Schedule', desc: 'Run on a recurring cron schedule or once at a future time' },
    { id: 'github',   icon: GitBranch, label: 'GitHub event', desc: 'Run when a GitHub webhook event fires' },
    { id: 'api',      icon: TerminalIcon, label: 'API', desc: 'Trigger from your own code by sending a POST request' },
];
const CONNECTOR_TABS = ['Connectors', 'Behavior', 'Permissions'];
const DEFAULT_CONNECTORS = ['Gmail', 'Google Calendar', 'Google Drive'];

// ── Shared form field styles ────────────────────────────────────────────────
const fieldClass = "w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

// ── New Local Routine (full-page form) ──────────────────────────────────────
function NewLocalRoutineForm({ onSave, onCancel, workingDirectory, onChooseFolder }) {
    const [name, setName]               = useState('');
    const [description, setDescription] = useState('');
    const [instructions, setInstructions] = useState('');
    const [askPerms, setAskPerms]       = useState(true);
    const [schedule, setSchedule]       = useState('Manual');
    const [time, setTime]               = useState('09:00');

    const canCreate = name.trim() && instructions.trim();

    const handleCreate = () => {
        if (!canCreate) return;
        onSave({
            kind: 'local',
            name: name.trim(),
            description: description.trim(),
            prompt: instructions.trim(),
            schedule: schedule === 'Manual' ? null : schedule.toLowerCase(),
            scheduledTime: schedule !== 'Manual' ? time : null,
            askPerms,
            folder: workingDirectory || null,
        });
    };

    return (
        <div className="flex-1 overflow-y-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 px-8 pt-6 pb-4 text-sm text-[var(--text-secondary)]">
                <button onClick={onCancel} className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors">
                    <Zap size={14} className="text-[var(--accent)]" />
                    Routines
                </button>
                <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
                <span className="text-[var(--text-primary)] font-medium">New local routine</span>
            </div>

            <div className="px-8 pb-8 max-w-2xl space-y-5">
                {/* Info banner */}
                <div className="flex items-center gap-2.5 px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-secondary)]">
                    <Monitor size={15} className="shrink-0 text-[var(--text-tertiary)]" />
                    Local routines only run while your computer is awake.
                </div>

                {/* Name */}
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                        Name <span className="text-[var(--accent)]">*</span>
                    </label>
                    <input autoFocus value={name} onChange={e => setName(e.target.value)}
                        placeholder="e.g. Daily code review"
                        className={fieldClass} />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                        Description <span className="text-[var(--accent)]">*</span>
                    </label>
                    <input value={description} onChange={e => setDescription(e.target.value)}
                        placeholder="Review yesterday's commits and flag anything concerning"
                        className={fieldClass} />
                </div>

                {/* Instructions */}
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Instructions</label>
                    <div className="border border-[var(--border)] rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-[var(--accent)]">
                        <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
                            placeholder="Describe what the agent should do each session…"
                            rows={6}
                            className="w-full bg-[var(--bg-secondary)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none resize-none" />
                        {/* Footer row */}
                        <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
                            <button onClick={onChooseFolder}
                                className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                <FolderOpen size={13} />
                                {workingDirectory ? workingDirectory.split('/').pop() : 'Select folder'}
                            </button>
                            {workingDirectory && (
                                <span className="text-[10px] font-medium px-2 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-[var(--text-tertiary)]">
                                    Worktree
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Ask permissions */}
                <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-[var(--text-primary)]">Ask permissions</span>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setAskPerms(v => !v)}
                            className={`w-9 h-5 rounded-full transition-colors relative ${askPerms ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
                        >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${askPerms ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                        <span className="text-sm text-[var(--text-secondary)] w-16">Default</span>
                    </div>
                </div>

                {/* Schedule */}
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Schedule</label>
                    <div className="flex gap-2 flex-wrap mb-3">
                        {SCHEDULE_PILLS.map(s => (
                            <button key={s} onClick={() => setSchedule(s)}
                                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                                    schedule === s
                                        ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                                        : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                }`}>
                                {s}
                            </button>
                        ))}
                    </div>
                    {schedule !== 'Manual' && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--text-secondary)]">At</span>
                            <input type="time" value={time} onChange={e => setTime(e.target.value)}
                                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        </div>
                    )}
                    {schedule !== 'Manual' && (
                        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                            Scheduled tasks use a randomized delay of several minutes for performance.
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2">
                    <button onClick={onCancel} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleCreate} disabled={!canCreate}
                        className="px-4 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── New Remote Routine (full-page form) ─────────────────────────────────────
function NewRemoteRoutineForm({ onSave, onCancel }) {
    const [name, setName]               = useState('');
    const [instructions, setInstructions] = useState('');
    const [trigger, setTrigger]         = useState('schedule');
    const [connectorTab, setConnectorTab] = useState('Connectors');
    const [connectors, setConnectors]   = useState([...DEFAULT_CONNECTORS]);
    const [repo, setRepo]               = useState('');

    const canCreate = name.trim() && instructions.trim();

    const removeConnector = (c) => setConnectors(prev => prev.filter(x => x !== c));

    const handleCreate = () => {
        if (!canCreate) return;
        onSave({
            kind: 'remote',
            name: name.trim(),
            description: '',
            prompt: instructions.trim(),
            schedule: null,
            trigger,
            connectors,
            repo: repo.trim() || null,
        });
    };

    return (
        <div className="flex-1 overflow-y-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 px-8 pt-6 pb-4 text-sm text-[var(--text-secondary)]">
                <button onClick={onCancel} className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors">
                    <Zap size={14} className="text-[var(--accent)]" />
                    Routines
                </button>
                <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
                <span className="text-[var(--text-primary)] font-medium">New routine</span>
            </div>

            <div className="px-8 pb-8 max-w-2xl space-y-5">
                {/* Name */}
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                        Name <span className="text-[var(--accent)]">*</span>
                    </label>
                    <input autoFocus value={name} onChange={e => setName(e.target.value)}
                        placeholder="e.g. Daily code review"
                        className={fieldClass} />
                </div>

                {/* Instructions */}
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Instructions</label>
                    <div className="border border-[var(--border)] rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-[var(--accent)]">
                        <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
                            placeholder="Describe what Claude should do in each session"
                            rows={7}
                            className="w-full bg-[var(--bg-secondary)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none resize-none" />
                        <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
                            <button
                                onClick={() => setRepo(r => r || prompt('GitHub repo (owner/repo):', '') || '')}
                                className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                <GitBranch size={13} />
                                {repo || 'Select a repository'}
                            </button>
                            <span className="text-xs text-[var(--text-tertiary)]">Sonnet 4.6 · Default</span>
                        </div>
                    </div>
                </div>

                {/* Trigger */}
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Select a trigger</label>
                    <div className="space-y-2">
                        {TRIGGERS.map(t => {
                            const Icon = t.icon;
                            const disabled = t.id === 'github' && !repo;
                            const active = trigger === t.id;
                            return (
                                <button key={t.id} onClick={() => !disabled && setTrigger(t.id)}
                                    disabled={disabled}
                                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                                        active
                                            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                                            : disabled
                                                ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
                                                : 'border-[var(--border)] hover:border-[var(--text-tertiary)]/50'
                                    }`}>
                                    <div className={`mt-0.5 p-1.5 rounded-lg ${active ? 'bg-[var(--accent)]/10' : 'bg-[var(--bg-tertiary)]'}`}>
                                        <Icon size={14} className={active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-[var(--text-primary)]">{t.label}</div>
                                        <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                                            {disabled ? 'Select a repository first' : t.desc}
                                        </div>
                                    </div>
                                    {active && <Check size={14} className="text-[var(--accent)] mt-1 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Connectors tabs */}
                <div>
                    <div className="flex items-center gap-0 border-b border-[var(--border)] mb-3">
                        {CONNECTOR_TABS.map((t, i) => (
                            <button key={t} onClick={() => setConnectorTab(t)}
                                className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                                    connectorTab === t
                                        ? 'border-[var(--accent)] text-[var(--text-primary)] font-medium'
                                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                }`}>
                                {t}
                                {t === 'Connectors' && connectors.length > 0 && (
                                    <span className="ml-1.5 text-[10px] font-bold bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded-full">
                                        {connectors.length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {connectorTab === 'Connectors' && (
                        <div className="space-y-3">
                            <p className="text-xs text-[var(--text-secondary)]">Integrations available to the agent during each run.</p>
                            <div className="flex flex-wrap gap-2">
                                {connectors.map(c => (
                                    <span key={c} className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full text-xs text-[var(--text-primary)]">
                                        {c}
                                        <button onClick={() => removeConnector(c)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                                            <X size={11} />
                                        </button>
                                    </span>
                                ))}
                                <button className="flex items-center gap-1 px-2.5 py-1 border border-dashed border-[var(--border)] rounded-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors">
                                    <Plus size={11} /> Add connector
                                </button>
                            </div>
                            {connectors.length > 0 && (
                                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600 dark:text-amber-400">
                                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                    The agent can use all tools from these connectors — including writes — without asking for permission during runs. Remove any you don't want the agent to access.
                                </div>
                            )}
                        </div>
                    )}
                    {connectorTab === 'Behavior' && (
                        <p className="text-sm text-[var(--text-tertiary)]">Behavior settings coming soon.</p>
                    )}
                    {connectorTab === 'Permissions' && (
                        <p className="text-sm text-[var(--text-tertiary)]">Permission settings coming soon.</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2">
                    <button onClick={onCancel} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleCreate} disabled={!canCreate}
                        className="px-4 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Routines View ───────────────────────────────────────────────────────────
function RoutinesView({ onRunRoutine, workingDirectory, onChooseFolder }) {
    const [routines, setRoutines]           = useState(loadRoutines);
    const [tab, setTab]                     = useState('all');
    const [includeCompleted, setIncludeCompleted] = useState(true);
    const [formView, setFormView]           = useState(null); // null | 'local' | 'remote'
    const [showNewMenu, setShowNewMenu]     = useState(false);

    useEffect(() => {
        if (!hasElectronStore()) return;
        let isMounted = true;
        loadElectronPersistence()
            .then((data) => {
                if (!isMounted || typeof data?.cowork_routines !== 'string') return;
                localStorage.setItem('cowork_routines', data.cowork_routines);
                setRoutines(loadRoutines());
            })
            .catch(err => console.error('Failed to hydrate routines:', err));
        return () => {
            isMounted = false;
        };
    }, []);

    const handleSave = (data) => {
        const newRoutine = { id: Date.now().toString(), ...data, createdAt: Date.now(), runs: [] };
        const updated = [newRoutine, ...routines];
        setRoutines(updated);
        saveRoutines(updated);
        setFormView(null);
    };

    const handleDelete = (id) => {
        const updated = routines.filter(r => r.id !== id);
        setRoutines(updated);
        saveRoutines(updated);
    };

    const handleRun = (routine) => {
        const run = { id: Date.now().toString(), timestamp: Date.now(), status: 'ran' };
        const updated = routines.map(r =>
            r.id === routine.id ? { ...r, runs: [run, ...(r.runs || [])] } : r
        );
        setRoutines(updated);
        saveRoutines(updated);
        onRunRoutine(routine);
    };

    // Show form pages
    if (formView === 'local') {
        return <NewLocalRoutineForm onSave={handleSave} onCancel={() => setFormView(null)}
            workingDirectory={workingDirectory} onChooseFolder={onChooseFolder} />;
    }
    if (formView === 'remote') {
        return <NewRemoteRoutineForm onSave={handleSave} onCancel={() => setFormView(null)} />;
    }

    const completedCount = routines.filter(r => r.runs?.length > 0).length;
    const visible = routines.filter(r => {
        if (tab === 'calendar' && !r.schedule) return false;
        if (!includeCompleted && r.runs?.length > 0) return false;
        return true;
    });

    return (
        <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Zap size={20} className="text-[var(--accent)]" />
                        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Routines</h1>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">Create templated routines that can be kicked off on schedule, by API, or webhook.</p>
                </div>

                {/* New routine dropdown */}
                <div className="relative">
                    <button onClick={() => setShowNewMenu(v => !v)}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shadow-sm">
                        New routine <ChevronDown size={14} className="text-[var(--text-tertiary)]" />
                    </button>
                    {showNewMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowNewMenu(false)} />
                            <div className="absolute right-0 top-full mt-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-xl z-20 w-44 overflow-hidden py-1">
                                <button onClick={() => { setFormView('local'); setShowNewMenu(false); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                                    <Monitor size={14} className="text-[var(--text-tertiary)]" /> Local
                                </button>
                                <button onClick={() => { setFormView('remote'); setShowNewMenu(false); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                                    <Cloud size={14} className="text-[var(--text-tertiary)]" /> Remote
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Tabs + Include completed */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-1">
                    {['all', 'calendar'].map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${tab === t ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                            {t === 'calendar'
                                ? <span className="flex items-center gap-1.5"><Calendar size={13} />Calendar</span>
                                : 'All'}
                        </button>
                    ))}
                </div>
                {completedCount > 0 && (
                    <button onClick={() => setIncludeCompleted(v => !v)}
                        className={`flex items-center gap-2 text-sm transition-colors ${includeCompleted ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${includeCompleted ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${includeCompleted ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                        Include completed ({completedCount})
                    </button>
                )}
                {!includeCompleted && completedCount > 0 && (
                    <span className="text-xs text-[var(--text-tertiary)]">{completedCount} completed routine{completedCount !== 1 ? 's' : ''} hidden</span>
                )}
            </div>

            {/* Routine list */}
            {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center mb-4">
                        <Zap size={20} className="text-[var(--text-tertiary)]" />
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No routines yet</p>
                    <p className="text-xs text-[var(--text-tertiary)] mb-5">Create your first routine to get started</p>
                    <div className="flex gap-2">
                        <button onClick={() => setFormView('local')}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors">
                            <Monitor size={14} /> Local
                        </button>
                        <button onClick={() => setFormView('remote')}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors">
                            <Cloud size={14} /> Remote
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    {visible.map(routine => {
                        const lastRun = routine.runs?.[0];
                        return (
                            <div key={routine.id} className="group flex items-center justify-between p-4 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl hover:border-[var(--text-tertiary)]/30 transition-colors">
                                <div className="flex-1 min-w-0 mr-4">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        {routine.kind === 'local'
                                            ? <Monitor size={13} className="text-[var(--text-tertiary)] shrink-0" />
                                            : <Cloud size={13} className="text-[var(--text-tertiary)] shrink-0" />}
                                        <span className="text-sm font-medium text-[var(--text-primary)]">{routine.name}</span>
                                        {routine.schedule && (
                                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-[var(--text-tertiary)] capitalize">
                                                {routine.schedule}
                                            </span>
                                        )}
                                    </div>
                                    {routine.description && (
                                        <p className="text-xs text-[var(--text-tertiary)] truncate ml-5">{routine.description}</p>
                                    )}
                                    {lastRun && (
                                        <p className="text-[10px] text-[var(--text-tertiary)] mt-1 ml-5">
                                            Last ran {new Date(lastRun.timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button onClick={() => handleRun(routine)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors">
                                        <Play size={11} /> Run once
                                    </button>
                                    <button title="Copy API endpoint"
                                        onClick={() => navigator.clipboard.writeText(`opal://routines/${routine.id}/run`)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors">
                                        <Globe size={11} /> Remote
                                    </button>
                                    {lastRun && (
                                        <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/20 rounded-lg">
                                            <Check size={11} /> Ran
                                        </span>
                                    )}
                                    <button onClick={() => handleDelete(routine.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                                        title="Delete routine">
                                        <X size={13} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── YouTube Components ──────────────────────────────────────────────────────

function YouTubeLinkModal({ onPlay, onCancel }) {
    const [url, setUrl] = useState('');
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
            <div className="w-[400px] bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Youtube size={20} className="text-red-500" />
                        <h2 className="text-base font-semibold">YouTube PiP</h2>
                    </div>
                    <button onClick={onCancel} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={18} /></button>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">Enter a YouTube URL to open the miniature player.</p>
                <input 
                    autoFocus
                    placeholder="https://youtube.com/watch?v=..."
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && onPlay(url)}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-red-500 transition-all"
                />
                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
                    <button onClick={() => onPlay(url)} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold shadow-lg transition-colors">Play</button>
                </div>
            </div>
        </div>
    );
}

function YouTubePiPStatus({ onClose }) {
    return (
        <div 
            className="fixed z-[2000] right-5 bottom-5 bg-black/90 text-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] border border-white/10 flex items-center gap-3 px-3 py-2 animate-slide-up"
        >
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold">YouTube PiP open</span>
            <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10" title="Close YouTube PiP">
                <X size={15} />
            </button>
        </div>
    );
}

function YouTubeFallbackPlayer({ url, onClose }) {
    return (
        <div className="fixed z-[2000] w-[400px] aspect-video right-5 bottom-5 bg-black rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col group animate-slide-up">
            <div className="h-9 bg-black/90 backdrop-blur-md flex items-center justify-between px-3 border-b border-white/5 z-10">
                <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest">YouTube PiP</span>
                <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"><X size={16} /></button>
            </div>
            <div className="flex-1 w-full h-full relative bg-black">
                <iframe 
                    src={url}
                    className="absolute inset-0 w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    title="YouTube Video"
                />
            </div>
        </div>
    );
}

// ── Main CoworkMode ─────────────────────────────────────────────────────────

export default function CoworkMode() {
    const { codeState, setCodeState, showGlobalTerminal, setShowGlobalTerminal } = useMode();
    const {
        userName,
        selectedProvider,
        selectedModel,
        availableModels,
        apiKeys,
        updateProvider,
        updateModel,
        supportsImages,
        lmStudioUrl,
        janUrl
    } = useChat();
    const { webcontainerInstance } = useBuildMode();
    const { executeTool, toolLog, clearLog } = useAgentTools(codeState.workingDirectory, webcontainerInstance, apiKeys);
    const [taskInput, setTaskInput] = useState('');
    const [activeSession, setActiveSession] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState('');
    const [agentStatus, setAgentStatus] = useState(''); // shown between iterations
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [sidebarView, setSidebarView] = useState('sessions'); // 'sessions' | 'routines'
    const [attachments, setAttachments] = useState([]);
    const [permissionLevel, setPermissionLevel] = useState('full');
    const [youtubeUrl, setYoutubeUrl] = useState(null);
    const [showYouTubeModal, setShowYouTubeModal] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(getDefaultSidebarWidth);
    const [conversationWidth, setConversationWidth] = useState(400);
    const [previewUrl, setPreviewUrl] = useState(() => {
        return localStorage.getItem('opal_preview_url') || 'http://localhost:5173';
    });
    const isResizingSidebarRef = useRef(false);
    const isResizingConversationRef = useRef(false);
    const imageInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const activeRequestRef = useRef(null);

    useEffect(() => {
        return () => activeRequestRef.current?.abort();
    }, []);

    const handleCancelRequest = () => {
        activeRequestRef.current?.abort();
    };

    useEffect(() => {
        document.documentElement.style.setProperty('--opal-terminal-left', `${sidebarWidth}px`);
    }, [sidebarWidth]);

    useEffect(() => {
        if (!window.electron?.onYouTubePlayerClosed) return undefined;
        return window.electron.onYouTubePlayerClosed(() => setYoutubeUrl(null));
    }, []);

    const handleOpenYouTube = async (url) => {
        const embedUrl = getYouTubeEmbedUrl(url);
        if (!embedUrl) return;
        setShowYouTubeModal(false);

        if (window.electron?.openYouTubePlayer) {
            try {
                await window.electron.openYouTubePlayer(url);
                setYoutubeUrl(embedUrl);
            } catch (err) {
                console.error('Failed to open YouTube PiP:', err);
            }
            return;
        }

        setYoutubeUrl(embedUrl);
    };

    const handleCloseYouTube = async () => {
        setYoutubeUrl(null);
        if (window.electron?.closeYouTubePlayer) {
            try {
                await window.electron.closeYouTubePlayer();
            } catch (err) {
                console.error('Failed to close YouTube PiP:', err);
            }
        }
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isResizingSidebarRef.current) {
                setSidebarWidth(Math.max(280, Math.min(460, e.clientX)));
            } else if (isResizingConversationRef.current) {
                setConversationWidth(Math.max(320, Math.min(560, e.clientX - sidebarWidth)));
            }
        };

        const handleMouseUp = () => {
            isResizingSidebarRef.current = false;
            isResizingConversationRef.current = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [sidebarWidth]);

    const updatePreviewUrl = (url) => {
        let formattedUrl = url;
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            formattedUrl = `http://${url}`;
        }
        setPreviewUrl(formattedUrl);
        localStorage.setItem('opal_preview_url', formattedUrl);
    };

    useEffect(() => {
        const handleTrigger = () => handleChooseFolder();
        document.addEventListener('trigger-choose-folder', handleTrigger);
        return () => document.removeEventListener('trigger-choose-folder', handleTrigger);
    }, []);

    useEffect(() => {
        const maybeApplyPathFromSession = async () => {
            if (!activeSession?.messages?.length || !window.electron?.listFiles) return;

            const lastPathMessage = [...activeSession.messages]
                .reverse()
                .find(msg => msg.role === 'user' && isBareAbsolutePath(msg.content));
            const folderPath = lastPathMessage?.content?.trim();

            if (!folderPath || folderPath === codeState.workingDirectory) return;

            try {
                const files = await window.electron.listFiles(folderPath);
                if (files.length > 0) {
                    setCodeState(prev => ({ ...prev, workingDirectory: folderPath }));
                    localStorage.setItem('working_directory', folderPath);
                }
            } catch (err) {
                console.error('Could not apply folder path from session:', err);
            }
        };

        maybeApplyPathFromSession();
    }, [activeSession, codeState.workingDirectory, setCodeState]);

    const handleChooseFolder = async () => {
        let folderPath = null;
        if (window.electron && window.electron.selectDirectory) {
            try { folderPath = await window.electron.selectDirectory(); } catch (err) { console.error(err); }
        }
        if (!folderPath && !window.electron) {
            folderPath = prompt('Enter folder path or project name:', 'my-new-project');
        }
        if (folderPath) {
            setCodeState(prev => ({ ...prev, workingDirectory: folderPath }));
            localStorage.setItem('working_directory', folderPath);
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAttachments(prev => [...prev, {
                    id: Date.now().toString(),
                    type: 'image',
                    name: file.name,
                    content: reader.result,
                    previewUrl: reader.result
                }]);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const { FileProcessor } = await import('../lib/llm/FileProcessor');
            const result = await FileProcessor.process(file);
            setAttachments(prev => [...prev, {
                id: Date.now().toString(),
                type: result.type,
                name: file.name,
                content: result.content,
                previewUrl: null
            }]);
        } catch (error) {
            console.error('File processing failed:', error);
            alert(`Failed to process file: ${error.message}`);
        }
    };

    const removeAttachment = (id) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    const handleNewSession = () => {
        const newSession = {
            id: Date.now().toString(),
            title: 'New Session',
            status: 'Started',
            project: 'opal',
            lastActivity: 'just now',
            messages: [],
        };
        setCodeState(prev => ({ ...prev, sessions: [newSession, ...prev.sessions] }));
        setActiveSession(newSession);
        setSidebarView('sessions');
    };

    const handleRenameSession = (sessionId, newTitle) => {
        setCodeState(prev => {
            const updatedSessions = prev.sessions.map(s =>
                s.id === sessionId ? { ...s, title: newTitle } : s
            );
            return { ...prev, sessions: updatedSessions };
        });
        if (activeSession?.id === sessionId) {
            setActiveSession(prev => ({ ...prev, title: newTitle }));
        }
    };

    const handleTaskSubmit = async (e, prefillPrompt) => {
        if (e) e.preventDefault();
        const message = prefillPrompt || taskInput;
        if ((!message.trim() && attachments.length === 0) || isLoading) return;
        const currentAttachments = [...attachments];

        // Detect bare folder-path drops and update working directory
        if (isBareAbsolutePath(message) && window.electron?.listFiles) {
            try {
                const folderPath = message.trim();
                const files = await window.electron.listFiles(folderPath);
                if (files.length > 0) {
                    setCodeState(prev => ({ ...prev, workingDirectory: folderPath }));
                    localStorage.setItem('working_directory', folderPath);
                }
            } catch (err) {
                console.error('Could not set working directory from message:', err);
            }
        }

        setTaskInput('');
        setAttachments([]);
        setIsLoading(true);
        setStreamingMessage('');
        setAgentStatus('');
        clearLog();
        const abortController = new AbortController();
        activeRequestRef.current = abortController;

        let currentSession = activeSession;
        if (!currentSession) {
            currentSession = {
                id: Date.now().toString(),
                title: message.substring(0, 40) + (message.length > 40 ? '...' : ''),
                status: 'In progress',
                project: 'opal',
                lastActivity: 'just now',
                messages: [],
            };
            setCodeState(prev => ({ ...prev, sessions: [currentSession, ...prev.sessions] }));
            setActiveSession(currentSession);
        }

        const attachmentSummary = currentAttachments.length > 0
            ? currentAttachments.map(a => `[${a.type === 'image' ? 'Image' : 'File'}: ${a.name}]`).join('\n')
            : '';
        const displayMessage = message || attachmentSummary;
        const userHistoryMessages = [...(currentSession.messages || []), { role: 'user', content: displayMessage }];
        const missionRunId = recordCoworkSessionStart(currentSession, displayMessage, {
            workingDirectory: codeState.workingDirectory,
            files: currentAttachments.map(attachment => attachment.name).filter(Boolean)
        });
        
        // Update both active session and the global sessions list immediately
        setActiveSession({ ...currentSession, messages: userHistoryMessages });
        setCodeState(prev => ({
            ...prev,
            sessions: prev.sessions.map(s =>
                s.id === currentSession.id ? { ...s, messages: userHistoryMessages, lastActivity: 'just now' } : s
            ),
        }));

        try {
            const imageAttachments = currentAttachments.filter(a => a.type === 'image');
            const route = chooseModelForTask({
                task: displayMessage,
                selectedProvider,
                selectedModel,
                availableModels,
                apiKeys,
                requiresTools: true,
                requiresImages: imageAttachments.length > 0 && supportsImages
            });
            const routedProvider = route.provider || selectedProvider;
            const routedModel = route.model || selectedModel;
            appendMissionRunEvent(missionRunId, {
                type: 'info',
                title: 'Model route selected',
                detail: `${routedProvider}/${routedModel}: ${route.reason}`
            });
            const client = LLMFactory.getClient(routedProvider, apiKeys[routedProvider], { lmStudioUrl, janUrl });
            const memoryContext = buildMemoryPrompt(displayMessage, {
                scope: codeState.workingDirectory,
                files: currentAttachments.map(attachment => attachment.name).filter(Boolean),
                sourceTypes: ['cowork', 'code', 'build', 'terminal']
            });
            const budgetRun = createBudgetRun('Cowork Mode');
            const systemPrompt = [
                `You are an expert software engineer assistant operating in Cowork Mode.`,
                buildRoutingPrompt(route),
                buildBudgetPrompt(budgetRun),
                memoryContext.prompt,
                `The user's local project folder is: ${codeState.workingDirectory || '(not set — ask the user to choose a folder)'}`,
                `You have access to local tools: read_file, write_file, list_directory, run_command.`,
                buildIntegrationToolsPrompt(apiKeys),
                `Use tools proactively to inspect the codebase, read files before editing them, and verify your changes.`,
                `run_command is only available in WebContainer sandboxes, not local projects.`,
                `Current session task: ${currentSession.title}`
            ].join('\n');
            appendMissionRunEvent(missionRunId, {
                type: 'info',
                title: 'Durable memory loaded',
                detail: `${memoryContext.memories.length} memory notes matched this task.`
            });

            // Build attachments into the initial user message
            let fullTextContent = message;
            const fileAttachments = currentAttachments.filter(a => a.type !== 'image');
            if (fileAttachments.length > 0) {
                fullTextContent += '\n\n' + fileAttachments.map(a =>
                    `[File: ${a.name}]\n---\n${a.content}\n---`
                ).join('\n\n');
            }
            if (imageAttachments.length > 0 && !supportsImages) {
                fullTextContent += '\n\n' + imageAttachments.map(a =>
                    `[Image: ${a.name}]\nThis model does not support image input.`
                ).join('\n\n');
            }
            const llmUserContent = imageAttachments.length > 0 && supportsImages
                ? [
                    { type: 'text', text: fullTextContent || attachmentSummary },
                    ...imageAttachments.map(img => ({ type: 'image_url', image_url: { url: img.content } }))
                  ]
                : (fullTextContent || attachmentSummary);

            // ── Agent loop ─────────────────────────────────────────────────
            const MAX_ITERATIONS = budgetRun.limits.maxIterations;
            // Running LLM message list (includes tool results fed back in)
            let llmMessages = [
                { role: 'system', content: systemPrompt },
                ...userHistoryMessages.slice(0, -1), // prior conversation (no system duplication)
                { role: 'user', content: llmUserContent }
            ];
            // Human-readable messages we'll save to the session at the end
            let sessionMessages = [...userHistoryMessages];
            let activeBudget = budgetRun;
            let budgetStopped = false;

            for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
                activeBudget = recordBudgetIteration(activeBudget, estimateCharsFromMessages(llmMessages));
                if (activeBudget.blocked) {
                    setAgentStatus('Budget limit reached');
                    appendMissionRunEvent(missionRunId, {
                        type: 'error',
                        title: 'Budget limit reached',
                        detail: activeBudget.warnings.join(' ')
                    }, {
                        status: 'blocked',
                        next: 'Narrow the task, raise the budget, or continue in a new run.'
                    });
                    budgetStopped = true;
                    break;
                }
                setStreamingMessage('');
                let iterContent = '';
                let iterThinking = '';

                const { content, toolCalls } = await client.streamChatWithTools(
                    llmMessages,
                    AGENT_TOOLS,
                    (chunk, meta) => {
                        if (!meta?.isThinking) {
                            iterContent += chunk;
                            setStreamingMessage(normalizeAssistantSpacing(iterContent));
                        } else {
                            iterThinking += chunk;
                        }
                    },
                    routedModel,
                    { signal: abortController.signal }
                );

                if (!toolCalls || toolCalls.length === 0) {
                    // No tool calls — final response, we're done
                    const finalContent = content || iterContent || iterThinking;
                    sessionMessages = [...sessionMessages, { role: 'assistant', content: normalizeAssistantSpacing(finalContent) }];
                    llmMessages = [...llmMessages, { role: 'assistant', content: finalContent }];
                    break;
                }

                // Append assistant turn (with tool calls) to LLM history
                llmMessages = [
                    ...llmMessages,
                    {
                        role: 'assistant',
                        content: content || null,
                        tool_calls: toolCalls.map(tc => ({
                            id: tc.id,
                            type: 'function',
                            function: { name: tc.name, arguments: JSON.stringify(tc.args) }
                        }))
                    }
                ];

                // Execute each tool and collect results
                const toolResults = [];
                activeBudget = recordBudgetToolCalls(activeBudget, toolCalls.length);
                if (activeBudget.blocked) {
                    appendMissionRunEvent(missionRunId, {
                        type: 'error',
                        title: 'Tool-call budget reached',
                        detail: activeBudget.warnings.join(' ')
                    }, {
                        status: 'blocked',
                        next: 'Review completed tool calls before continuing.'
                    });
                    budgetStopped = true;
                    break;
                }
                for (const tc of toolCalls) {
                    setAgentStatus(`Using tool: ${tc.name}${tc.args.path ? ` → ${tc.args.path}` : tc.args.command ? ` → ${tc.args.command}` : ''}`);
                    recordCoworkToolCall(missionRunId, tc.name, tc.args);
                    const result = await executeTool(tc.name, tc.args);
                    toolResults.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        name: tc.name,
                        content: JSON.stringify(result)
                    });
                }

                llmMessages = [...llmMessages, ...toolResults];
                activeBudget = recordBudgetResponse(activeBudget, iterContent.length);

                // If this was the last allowed iteration, force a final response
                if (iteration === MAX_ITERATIONS - 1) {
                    setAgentStatus('Finalising…');
                    llmMessages = [
                        ...llmMessages,
                        { role: 'user', content: 'You have reached the tool-use limit. Summarise what you have done and what remains.' }
                    ];
                }
            }

            setAgentStatus('');
            setStreamingMessage('');

            // Persist final session messages
            const lastAssistant = sessionMessages[sessionMessages.length - 1];
            const finalMessages = lastAssistant?.role === 'assistant'
                ? sessionMessages
                : [...sessionMessages, { role: 'assistant', content: '(Agent completed without a final text response.)' }];

            setCodeState(prev => ({
                ...prev,
                sessions: prev.sessions.map(s =>
                    s.id === currentSession.id ? { ...s, messages: finalMessages, lastActivity: 'just now' } : s
                ),
            }));
            setActiveSession(prev => ({ ...prev, messages: finalMessages }));
            recordCoworkSessionFinish(missionRunId, {
                ok: !budgetStopped,
                detail: budgetStopped
                    ? 'Cowork stopped because the budget governor reached a limit.'
                    : lastAssistant?.content ? 'Final assistant response was recorded.' : 'Agent completed without a final text response.'
            });

        } catch (error) {
            console.error('Agent failed:', error);
            const wasCancelled = error?.name === 'AbortError';
            setAgentStatus('');
            setStreamingMessage('');
            setActiveSession(prev => ({
                ...prev,
                messages: [...(prev.messages || []), {
                    role: 'assistant',
                    content: wasCancelled ? 'Cancelled before the provider finished responding.' : `Error: ${error.message}`
                }]
            }));
            recordCoworkSessionFinish(missionRunId, {
                ok: wasCancelled,
                status: wasCancelled ? 'cancelled' : undefined,
                detail: wasCancelled ? 'Provider request was aborted by the user.' : (error?.message || 'Cowork agent failed.')
            });
        } finally {
            if (activeRequestRef.current === abortController) activeRequestRef.current = null;
            setIsLoading(false);
        }
    };

    // When a routine is run, create a session with its prompt and submit
    const handleRunRoutine = (routine) => {
        setSidebarView('sessions');
        const session = {
            id: Date.now().toString(),
            title: routine.name,
            status: 'In progress',
            project: 'opal',
            lastActivity: 'just now',
            messages: [],
        };
        setCodeState(prev => ({ ...prev, sessions: [session, ...prev.sessions] }));
        setActiveSession(session);
        // Submit after state settles
        setTimeout(() => handleTaskSubmit(null, routine.prompt), 50);
    };

    // ── Active session view ────────────────────────────────────────────────

    if (activeSession) {
        return (
            <div className="flex h-full w-full bg-[var(--bg-primary)] overflow-hidden">
                {showYouTubeModal && (
                    <YouTubeLinkModal 
                        onPlay={handleOpenYouTube}
                        onCancel={() => setShowYouTubeModal(false)}
                    />
                )}
                {youtubeUrl && (
                    window.electron?.openYouTubePlayer ? (
                        <YouTubePiPStatus onClose={handleCloseYouTube} />
                    ) : (
                    <YouTubeFallbackPlayer 
                        url={youtubeUrl} 
                        onClose={handleCloseYouTube} 
                    />
                    )
                )}
                {/* Session sidebar */}
                <div
                    className="border-r border-[var(--border)] flex flex-col bg-[var(--bg-secondary)] shrink-0"
                    style={{ width: `${sidebarWidth}px`, minWidth: '280px', maxWidth: '460px' }}
                >
                    <SecondaryModeNav />
                    <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
                        <button
                            onClick={() => setActiveSession(null)}
                            className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                        >
                            <ChevronRight className="rotate-180" size={16} />
                            Dashboard
                        </button>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => setShowYouTubeModal(true)} 
                                className={`p-1.5 rounded-md transition-colors text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-red-500`}
                                title="Open YouTube"
                            >
                                <Youtube size={16} />
                            </button>
                            <button 
                                onClick={() => setShowGlobalTerminal(v => !v)}
                                className={`p-1.5 rounded-md transition-colors ${showGlobalTerminal ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]'}`}
                                title="Toggle Terminal"
                            >
                                <TerminalIcon size={16} />
                            </button>
                            <button onClick={handleNewSession} className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md text-[var(--text-tertiary)]">
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="px-4 pb-4 border-b border-[var(--border)]">
                        <button
                            onClick={handleChooseFolder}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors shadow-sm text-[var(--text-primary)]"
                            title="Choose project folder"
                        >
                            <FolderOpen size={16} className="text-[var(--accent)] shrink-0" />
                            <span className="truncate">{codeState.workingDirectory ? `Folder: ${codeState.workingDirectory}` : 'Choose folder'}</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Session History</div>
                        {codeState.sessions.map(session => (
                            <div
                                key={session.id}
                                onClick={() => setActiveSession(session)}
                                className={`p-3 rounded-lg cursor-pointer transition-all ${activeSession.id === session.id ? 'bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm' : 'hover:bg-[var(--bg-hover)]'}`}
                            >
                                <EditableTitle 
                                    initialTitle={session.title} 
                                    onSave={(newTitle) => handleRenameSession(session.id, newTitle)}
                                    textClassName="text-sm font-medium text-[var(--text-primary)]"
                                />
                                <div className="text-[10px] text-[var(--text-tertiary)] mt-1 flex justify-between items-center">
                                    <span>{session.project}</span>
                                    <span>{session.lastActivity} ago</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div
                    className="w-1 bg-transparent hover:bg-[var(--accent)]/30 cursor-col-resize z-50 transition-colors"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        isResizingSidebarRef.current = true;
                        document.body.style.cursor = 'col-resize';
                        document.body.style.userSelect = 'none';
                    }}
                />

                {/* Main session workspace */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {codeState.workingDirectory && (
                        <PathBar 
                            path={codeState.workingDirectory} 
                            previewUrl={previewUrl}
                            onUpdatePreviewUrl={updatePreviewUrl}
                        />
                    )}
                    <div className="flex-1 flex overflow-hidden">
                        <div
                            className="border-r border-[var(--border)] flex flex-col bg-[var(--bg-primary)] shrink-0"
                            style={{ width: `${conversationWidth}px`, minWidth: '320px', maxWidth: '560px' }}
                        >
                            <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
                                <h2 className="text-sm font-semibold truncate">{activeSession.title}</h2>
                                <div className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${activeSession.status === 'Completed' ? 'bg-green-500' : 'bg-blue-500'}`} />
                                    {activeSession.status}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                {activeSession.messages?.map((msg, i) => (
                                    <div key={i} className="flex gap-3">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${msg.role === 'user' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                                            {msg.role === 'user' ? (userName?.charAt(0) || 'U') : 'A'}
                                        </div>
                                        <div className="flex-1 text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                                    </div>
                                ))}
                                {streamingMessage && (
                                    <div className="flex gap-3">
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">A</div>
                                        <div className="flex-1 text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{streamingMessage}</div>
                                    </div>
                                )}
                                {isLoading && !streamingMessage && (
                                    <div className="flex gap-3 items-center text-xs text-[var(--text-tertiary)]">
                                        <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
                                            <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                                        </div>
                                        <span className="text-[var(--text-secondary)]">
                                            {agentStatus || 'Thinking…'}
                                        </span>
                                    </div>
                                )}
                            </div>

                                <div className="p-4 border-t border-[var(--border)]">
                                    <input
                                        ref={imageInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            handleImageUpload(e);
                                            e.target.value = '';
                                        }}
                                    />
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".txt,.md,.markdown,.json,.csv,.js,.jsx,.ts,.tsx,.html,.css,.py,.java,.c,.cpp,.go,.rs,.xml,.yaml,.yml,.pdf,.doc,.docx,.xls,.xlsx,.ods,text/*,application/json,text/csv"
                                        className="hidden"
                                        onChange={(e) => {
                                            handleFileUpload(e);
                                            e.target.value = '';
                                        }}
                                    />
                                    {attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {attachments.map(attachment => (
                                                <AttachmentPreview
                                                    key={attachment.id}
                                                    attachment={attachment}
                                                    onRemove={() => removeAttachment(attachment.id)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    <form onSubmit={handleTaskSubmit} className="relative">
                                        <textarea
                                            value={taskInput}
                                            onChange={e => setTaskInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTaskSubmit(e); } }}
                                            placeholder="Describe a task or ask a question"
                                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] min-h-[80px] resize-none"
                                        />
                                        <div className="flex items-center gap-1 mt-2">
                                        <AttachmentMenu
                                            onUploadImage={() => imageInputRef.current?.click()}
                                            onUploadFile={() => fileInputRef.current?.click()}
                                            disabled={isLoading}
                                        />
                                        <PermissionsDropdown value={permissionLevel} onChange={setPermissionLevel} />
                                        <CoworkModelSelector
                                            selectedProvider={selectedProvider}
                                            selectedModel={selectedModel}
                                                availableModels={availableModels}
                                                updateProvider={updateProvider}
                                                updateModel={updateModel}
                                            />
                                        </div>
                                        <button
                                            type={isLoading ? 'button' : 'submit'}
                                            onClick={isLoading ? handleCancelRequest : undefined}
                                            disabled={!isLoading && (!taskInput.trim() && attachments.length === 0)}
                                            className="absolute bottom-3 right-3 p-1.5 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                                            title={isLoading ? 'Cancel provider request' : 'Send'}
                                        >
                                        {isLoading ? <X size={16} /> : <Send size={16} />}
                                    </button>
                                </form>
                            </div>
                        </div>
                        <div
                            className="w-1 bg-transparent hover:bg-[var(--accent)]/30 cursor-col-resize z-50 transition-colors"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                isResizingConversationRef.current = true;
                                document.body.style.cursor = 'col-resize';
                                document.body.style.userSelect = 'none';
                            }}
                        />

                        <div className="flex-1">
                            <Workbench
                                streamingMessage={streamingMessage}
                                workingDirectory={codeState.workingDirectory}
                                onChooseFolder={handleChooseFolder}
                                previewUrl={previewUrl}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Dashboard view ─────────────────────────────────────────────────────

    return (
        <div className="flex h-full w-full bg-[var(--bg-primary)] overflow-hidden">
            {showYouTubeModal && (
                <YouTubeLinkModal 
                    onPlay={handleOpenYouTube}
                    onCancel={() => setShowYouTubeModal(false)}
                />
            )}
            {youtubeUrl && (
                window.electron?.openYouTubePlayer ? (
                    <YouTubePiPStatus onClose={handleCloseYouTube} />
                ) : (
                <YouTubeFallbackPlayer 
                    url={youtubeUrl} 
                    onClose={handleCloseYouTube} 
                />
                )
            )}
            {/* Sidebar */}
            <aside
                className="border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col shrink-0"
                style={{ width: `${sidebarWidth}px`, minWidth: '280px', maxWidth: '460px' }}
            >
                <SecondaryModeNav />
                <div className="p-4 space-y-1">
                    <button
                        onClick={handleNewSession}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors shadow-sm"
                    >
                        <Plus size={16} className="text-[var(--accent)]" />
                        New session
                    </button>

                    <button
                        onClick={handleChooseFolder}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg text-sm transition-colors"
                    >
                        <FolderOpen size={16} />
                        <span className="truncate">{codeState.workingDirectory ? `Folder: ${codeState.workingDirectory}` : 'Choose folder'}</span>
                    </button>

                    <button
                        onClick={() => setSidebarView(v => v === 'routines' ? 'sessions' : 'routines')}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${sidebarView === 'routines' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                    >
                        <Zap size={16} />
                        Routines
                    </button>

                    <button
                        onClick={() => setShowGlobalTerminal(v => !v)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${showGlobalTerminal ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                    >
                        <TerminalIcon size={16} />
                        Terminal
                    </button>

                    <button
                        onClick={() => setShowYouTubeModal(true)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-[var(--text-secondary)] hover:text-red-500 hover:bg-[var(--bg-hover)]`}
                    >
                        <Youtube size={16} />
                        Youtube
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 py-2">
                    <div className="px-3 py-2 text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Pinned</div>
                    <div className="space-y-0.5 mb-4">
                        {codeState.sessions.filter(s => s.pinned).map(session => (
                            <div
                                key={session.id}
                                onClick={() => { setActiveSession(session); setSidebarView('sessions'); }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] group transition-colors cursor-pointer"
                            >
                                <EditableTitle 
                                    initialTitle={session.title} 
                                    onSave={(newTitle) => handleRenameSession(session.id, newTitle)}
                                    textClassName="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="px-3 py-2 text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Recents</div>
                    <div className="space-y-0.5">
                        {codeState.sessions.map(session => (
                            <div
                                key={session.id}
                                onClick={() => { setActiveSession(session); setSidebarView('sessions'); }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] group transition-colors flex items-start gap-2.5 cursor-pointer"
                            >
                                <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${session.status === 'Needs input' ? 'bg-amber-400' : 'bg-blue-400 opacity-40'}`} />
                                <div className="min-w-0 flex-1">
                                    <EditableTitle 
                                        initialTitle={session.title} 
                                        onSave={(newTitle) => handleRenameSession(session.id, newTitle)}
                                        textClassName="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="p-3 border-t border-[var(--border)]">
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center gap-2.5 p-2 hover:bg-[var(--bg-hover)] rounded-md cursor-pointer w-full transition-colors group"
                    >
                        <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {userName ? userName.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="flex-1 text-sm text-left">
                            <div className="text-[var(--text-primary)] font-medium">{userName || 'User'}</div>
                        </div>
                        <Settings size={16} className="text-[var(--text-tertiary)]" />
                    </button>
                </div>
            </aside>
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <div
                className="w-1 bg-transparent hover:bg-[var(--accent)]/30 cursor-col-resize z-50 transition-colors"
                onMouseDown={(e) => {
                    e.preventDefault();
                    isResizingSidebarRef.current = true;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                }}
            />

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
                {codeState.workingDirectory && (
                    <PathBar 
                        path={codeState.workingDirectory} 
                        previewUrl={previewUrl}
                        onUpdatePreviewUrl={updatePreviewUrl}
                    />
                )}
                {sidebarView === 'routines' ? (
                    <RoutinesView onRunRoutine={handleRunRoutine}
                        workingDirectory={codeState.workingDirectory}
                        onChooseFolder={handleChooseFolder} />
                ) : (
                <main className="flex-1 overflow-y-auto p-12 max-w-5xl mx-auto w-full">
                    <div className="flex items-center gap-3 mb-12">
                        <img src={opalLogo} alt="Opal" className="h-8 w-auto" />
                        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
                            {userName ? `Welcome back, ${userName}` : 'Welcome back'}
                        </h1>
                    </div>

                    <div className="space-y-6">
                        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Sessions</h2>
                        <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--bg-primary)]">
                            {codeState.sessions.length === 0 ? (
                                <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">No sessions yet. Start one below.</div>
                            ) : codeState.sessions.map((session, i) => (
                                <div
                                    key={session.id}
                                    onClick={() => setActiveSession(session)}
                                    className={`flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors ${i !== codeState.sessions.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
                                >
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className={`w-2 h-2 rounded-full ${session.status === 'Needs input' ? 'bg-amber-400' : 'bg-gray-300'}`} />
                                        <EditableTitle 
                                            initialTitle={session.title} 
                                            onSave={(newTitle) => handleRenameSession(session.id, newTitle)}
                                            textClassName="text-sm font-medium text-[var(--text-primary)]"
                                            className="flex-1"
                                        />
                                    </div>
                                    <div className="flex items-center gap-8 shrink-0">
                                        <div className="text-xs text-[var(--text-tertiary)] font-mono">{session.project}</div>
                                        <div className="text-xs text-[var(--text-tertiary)] w-12 text-right">{session.lastActivity}</div>
                                        <ChevronRight size={16} className="text-[var(--text-tertiary)]" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                        <div className="mt-20 max-w-2xl mx-auto">
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    handleImageUpload(e);
                                    e.target.value = '';
                                }}
                            />
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".txt,.md,.markdown,.json,.csv,.js,.jsx,.ts,.tsx,.html,.css,.py,.java,.c,.cpp,.go,.rs,.xml,.yaml,.yml,.pdf,.doc,.docx,.xls,.xlsx,.ods,text/*,application/json,text/csv"
                                className="hidden"
                                onChange={(e) => {
                                    handleFileUpload(e);
                                    e.target.value = '';
                                }}
                            />
                            {attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {attachments.map(attachment => (
                                        <AttachmentPreview
                                            key={attachment.id}
                                            attachment={attachment}
                                            onRemove={() => removeAttachment(attachment.id)}
                                        />
                                    ))}
                                </div>
                            )}
                            <form onSubmit={handleTaskSubmit} className="relative">
                                <textarea
                                    value={taskInput}
                                    onChange={e => setTaskInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTaskSubmit(e); } }}
                                    placeholder="Describe a task or ask a question"
                                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl py-4 pl-5 pr-14 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)] min-h-[120px] shadow-sm resize-none"
                                />
                                <div className="flex items-center gap-1 mt-2">
                                    <AttachmentMenu
                                        onUploadImage={() => imageInputRef.current?.click()}
                                        onUploadFile={() => fileInputRef.current?.click()}
                                        disabled={isLoading}
                                    />
                                    <PermissionsDropdown value={permissionLevel} onChange={setPermissionLevel} />
                                    <CoworkModelSelector
                                        selectedProvider={selectedProvider}
                                        selectedModel={selectedModel}
                                        availableModels={availableModels}
                                        updateProvider={updateProvider}
                                        updateModel={updateModel}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isLoading || (!taskInput.trim() && attachments.length === 0)}
                                    className="absolute bottom-4 right-4 p-2 bg-[var(--accent)] text-white rounded-xl hover:bg-[var(--accent-hover)] transition-colors shadow-md disabled:opacity-50"
                                >
                                <Send size={20} />
                            </button>
                        </form>
                        <div className="mt-4 flex items-center justify-center gap-6 text-xs text-[var(--text-tertiary)] font-medium">
                            <span className="flex items-center gap-1.5 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-full border border-[var(--border)]"><Code size={14} /> Local</span>
                            <span className="flex items-center gap-1.5 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-full border border-[var(--border)]"><Layout size={14} /> worktree</span>
                        </div>
                    </div>
                </main>
                )}
            </div>
        </div>
    );
}

function isBareAbsolutePath(value) {
    const text = value?.trim();
    return Boolean(text && /^\/[^\n\r]*$/.test(text) && !/\s/.test(text));
}
