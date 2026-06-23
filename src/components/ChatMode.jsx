import React, { useState, useRef, useEffect } from 'react';
import { Settings, Plus, MessageSquare, Code, Globe, ChevronDown, Trash2, ArrowUp, ArrowDown, Clock, Sparkles, Folder, SlidersHorizontal, FileText, Layers3, Search, ListFilter, MoreVertical, Pin, Lock, Upload, ArrowLeft, ExternalLink, X } from 'lucide-react';
import { ChatProvider, useChat } from '../context/ChatContext';
import { SettingsModal } from './SettingsModal';
import { ChangelogModal } from './ChangelogModal';
import { ChatMessage } from './ChatMessage';
import { ArtifactPanel } from './ArtifactPanel';
import { ThinkingDisplay } from './ThinkingDisplay';
import { AttachmentMenu, AttachmentPreview } from './AttachmentSystem';
import { LLMFactory } from '../lib/llm/clients';
import { IntelligentSearchTool } from '../lib/IntelligentSearchTool';
import { SearchProgress } from './SearchProgress';
import { useMode, MODES, ARTIFACT_WINDOW_ID } from '../context/ModeContext';
import { useTheme } from '../context/ThemeContext';
import { normalizeAssistantSpacing } from '../lib/textFormatting';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { SyntaxHighlighter } from '../lib/syntaxHighlighter';
import { Copy, Check } from 'lucide-react';
import PerciMascot from './PerciMascot';
import { PermissionsDropdown } from './PermissionsDropdown';
import { CavemanDropdown } from './CavemanDropdown';
import { cavemanDirective } from '../lib/caveman';
import LivePreviewPanel from './LivePreviewPanel';
import { ProviderModelPicker } from './ProviderModelPicker';
import chatHeroBackground from '../assets/chat-hero-background.jpeg';
import {
    buildIntegrationToolsPrompt,
    executeIntegrationTool,
    getIntegrationTools,
    runChatWithTools
} from '../lib/integrationTools';
import { POWER_WORKSPACE_CHAT_HANDOFF_KEY } from '../lib/powerWorkspace';
import { readStringStorage, writeStringStorage, removeStorageKey } from '../lib/persistentStore';

const PROVIDERS_REQUIRING_API_KEYS = new Set(['openai', 'groq', 'gemini', 'openrouter', 'anthropic', 'mistral']);

const getDefaultSidebarWidth = () => {
    if (typeof window === 'undefined') return 360;
    return Math.min(360, Math.max(280, Math.floor(window.innerWidth * 0.45)));
};

// Helper function for time-based greeting
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

function formatArtifactDate(timestamp) {
    if (!timestamp) return 'Last edited just now';

    const diff = Date.now() - timestamp;
    const day = 24 * 60 * 60 * 1000;
    if (diff < day) return 'Last edited today';
    if (diff < day * 2) return 'Last edited yesterday';
    if (diff < day * 30) return `Last edited ${Math.floor(diff / day)} days ago`;
    if (diff < day * 365) return `Last edited ${Math.floor(diff / (day * 30))} months ago`;
    return `Last edited ${Math.floor(diff / (day * 365))} years ago`;
}

function formatRelativeDate(timestamp) {
    if (!timestamp) return 'Just now';

    const diff = Date.now() - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const month = 30 * day;
    const year = 365 * day;

    if (diff < minute) return 'Just now';
    if (diff < hour) return `${Math.floor(diff / minute)} minutes ago`;
    if (diff < day) return `${Math.floor(diff / hour)} hours ago`;
    if (diff < day * 2) return 'Yesterday';
    if (diff < month) return `${Math.floor(diff / day)} days ago`;
    if (diff < year) return `${Math.floor(diff / month)} months ago`;
    return `${Math.floor(diff / year)} years ago`;
}

function splitMisclassifiedThinking(value) {
    const text = String(value || '').trim();
    const markerPattern = /(?:^|\n)\s*(?:final answer|answer|response)\s*:\s*/i;
    const markerMatch = markerPattern.exec(text);
    if (!markerMatch) {
        return { thinking: '', response: text };
    }

    const responseStart = markerMatch.index + markerMatch[0].length;
    const thinking = text.slice(0, markerMatch.index).trim();
    const response = text.slice(responseStart).trim();
    return response
        ? { thinking, response }
        : { thinking: '', response: text };
}

function getArtifactExcerpt(artifact) {
    const content = artifact?.content || '';
    const stripped = content
        .replace(/<[^>]*>/g, ' ')
        .replace(/[#*_`>{}()[\];]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return stripped || `${artifact?.language || 'Document'} artifact`;
}

function ArtifactCard({ artifact, onOpen }) {
    const excerpt = getArtifactExcerpt(artifact);
    const title = artifact.title || 'Untitled artifact';

    return (
        <button
            type="button"
            onClick={onOpen}
            className="group text-left min-w-0"
            aria-label={`Open ${title}`}
        >
            <div className="h-[182px] rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] group-hover:border-[var(--accent)] transition-colors overflow-hidden flex items-end justify-center">
                <div className="w-[70%] h-[76%] rounded-t-xl border border-[var(--border)] border-b-0 bg-[var(--bg-tertiary)] px-5 py-4 shadow-[0_-18px_40px_var(--accent-glow)] overflow-hidden">
                    <div
                        className="font-mono text-[10px] leading-[1.35] text-[var(--text-primary)] whitespace-pre-wrap break-words"
                        style={{ display: '-webkit-box', WebkitLineClamp: 9, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                        {excerpt}
                    </div>
                </div>
            </div>
            <div className="mt-3 min-w-0">
                <div className="truncate text-[15px] leading-5 font-medium text-[var(--text-primary)]">{title}</div>
                <div className="mt-1 text-[13px] leading-4 text-[var(--text-tertiary)]">{formatArtifactDate(artifact.createdAt)}</div>
            </div>
        </button>
    );
}

function ArtifactsPage({ artifacts, onOpenArtifact, onNewArtifact }) {
    return (
        <div className="perci-artifacts-page h-full overflow-y-auto bg-[var(--bg-primary)] px-6 py-10 md:px-12 lg:px-20">
            <div className="mx-auto w-full max-w-[1120px]">
                <div className="flex items-start justify-between gap-6">
                    <h1 className="text-[32px] font-semibold leading-none text-[var(--text-primary)]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", letterSpacing: '0' }}>
                        Artifacts
                    </h1>
                    <button
                        type="button"
                        onClick={onNewArtifact}
                        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-[0_0_18px_var(--accent-glow)] transition-colors hover:bg-[var(--accent-hover)]"
                    >
                        New artifact
                    </button>
                </div>

                <div className="mt-16 border-b border-[var(--border)]">
                    <div className="inline-flex border-b-2 border-[var(--accent)] pb-4 text-[15px] font-medium text-[var(--text-primary)]">
                        Your artifacts
                    </div>
                </div>

                {artifacts.length > 0 ? (
                    <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                        {artifacts.map(artifact => (
                            <ArtifactCard
                                key={`${artifact.chatId || 'current'}-${artifact.id}`}
                                artifact={artifact}
                                onOpen={() => onOpenArtifact(artifact)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="mt-24 flex flex-col items-center justify-center text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--accent)]">
                            <FileText size={24} />
                        </div>
                        <h2 className="mt-5 text-lg font-medium text-[var(--text-primary)]">No artifacts yet</h2>
                        <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--text-tertiary)]">
                            Create one from chat or start a blank artifact.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ProjectsPage({ projects, projectChats, onOpenProject, onNewProject }) {
    const sortedProjects = [...projects].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return (
        <div className="h-full overflow-y-auto bg-[var(--bg-primary)] px-6 py-10 md:px-12 lg:px-20">
            <div className="mx-auto w-full max-w-[1120px]">
                <div className="flex items-center justify-between gap-6">
                    <h1 className="text-[32px] font-semibold leading-none text-[var(--text-primary)]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", letterSpacing: '0' }}>
                        Projects
                    </h1>
                    <div className="flex items-center gap-2">
                        <button type="button" className="p-2 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]" title="Sort projects">
                            <ListFilter size={18} />
                        </button>
                        <button type="button" className="p-2 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]" title="Search projects">
                            <Search size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={onNewProject}
                            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-[0_0_18px_var(--accent-glow)] transition-colors hover:bg-[var(--accent-hover)]"
                        >
                            New project
                        </button>
                    </div>
                </div>

                {sortedProjects.length > 0 ? (
                    <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {sortedProjects.map(project => {
                            const count = projectChats.filter(chat => chat.projectId === project.id).length;
                            return (
                                <button
                                    key={project.id}
                                    type="button"
                                    onClick={() => onOpenProject(project.id)}
                                    className="group flex min-h-[136px] flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 text-left transition-colors hover:border-[var(--accent)]"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate text-base font-semibold text-[var(--text-primary)]">{project.name}</div>
                                        {project.description && (
                                            <p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{project.description}</p>
                                        )}
                                    </div>
                                    <div className="mt-5 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                                        <span>{formatRelativeDate(project.updatedAt || project.createdAt)}</span>
                                        {count > 0 && (
                                            <>
                                                <span aria-hidden="true">·</span>
                                                <span>{count} chat{count === 1 ? '' : 's'}</span>
                                            </>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="mt-24 flex flex-col items-center justify-center text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--accent)]">
                            <Folder size={24} />
                        </div>
                        <h2 className="mt-5 text-lg font-medium text-[var(--text-primary)]">No projects yet</h2>
                        <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--text-tertiary)]">Create a project to group related chats, context, and files.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function NewProjectPage({ onCancel, onCreate }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const canCreate = name.trim().length > 0;

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!canCreate) return;
        onCreate({ name, description });
    };

    return (
        <div className="flex h-full items-center justify-center bg-[var(--bg-primary)] px-6">
            <form onSubmit={handleSubmit} className="w-full max-w-[560px]">
                <h1 className="text-[34px] font-semibold leading-tight text-[var(--text-primary)]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", letterSpacing: '0' }}>
                    Create a personal project
                </h1>

                <label className="mt-7 block text-sm font-medium text-[var(--text-secondary)]" htmlFor="project-name">
                    What are you working on?
                </label>
                <input
                    id="project-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                    placeholder="Name your project"
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]"
                />

                <label className="mt-5 block text-sm font-medium text-[var(--text-secondary)]" htmlFor="project-description">
                    What are you trying to achieve?
                </label>
                <textarea
                    id="project-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Describe your project, goals, subject, etc..."
                    className="mt-2 min-h-[96px] w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]"
                />

                <div className="mt-7 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!canCreate}
                        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-[0_0_18px_var(--accent-glow)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Create project
                    </button>
                </div>
            </form>
        </div>
    );
}

function ProjectDetailPage({
    project,
    chats,
    onBack,
    onSelectChat,
    onStartCowork,
    onUpdateProject,
    composer
}) {
    const projectFileInputRef = React.useRef(null);

    const handleProjectFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length || !project) return;
        e.target.value = '';

        const newFiles = await Promise.all(files.map(file => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: file.name,
                size: file.size,
                type: file.type,
                addedAt: Date.now(),
                content: reader.result
            });
            // Read as text if possible, otherwise as data URL
            if (file.type.startsWith('text/') || /\.(md|json|csv|js|ts|jsx|tsx|html|css|py|txt|yaml|yml)$/i.test(file.name)) {
                reader.readAsText(file);
            } else {
                reader.readAsDataURL(file);
            }
        })));

        const existing = project.files || [];
        onUpdateProject(project.id, { files: [...existing, ...newFiles] });
    };

    const handleRemoveFile = (fileId) => {
        const updated = (project.files || []).filter(f => f.id !== fileId);
        onUpdateProject(project.id, { files: updated });
    };

    const formatBytes = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };
    if (!project) {
        return (
            <div className="flex h-full items-center justify-center bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                Project not found.
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto bg-[var(--bg-primary)] px-6 py-8 md:px-10 lg:px-12">
            <div className="mx-auto grid w-full max-w-[1220px] gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="min-w-0">
                    <button
                        type="button"
                        onClick={onBack}
                        className="mb-7 flex items-center gap-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                    >
                        <ArrowLeft size={16} />
                        All projects
                    </button>

                    <div className="flex items-center justify-between gap-4">
                        <h1 className="min-w-0 truncate text-[30px] font-semibold leading-tight text-[var(--text-primary)]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", letterSpacing: '0' }}>
                            {project.name}
                        </h1>
                        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                            <button type="button" className="p-2 transition-colors hover:text-[var(--text-primary)]" title="Project actions">
                                <MoreVertical size={18} />
                            </button>
                            <button type="button" className="p-2 transition-colors hover:text-[var(--text-primary)]" title="Pin project">
                                <Pin size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="mt-8">{composer}</div>

                    <button
                        type="button"
                        onClick={onStartCowork}
                        className="mx-auto mt-6 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                        <ExternalLink size={15} />
                        Start a task in Cowork
                    </button>

                    <div className="mt-6 divide-y divide-[var(--border)] border-t border-[var(--border)]">
                        {chats.length > 0 ? chats.map(chat => (
                            <button
                                key={chat.id}
                                type="button"
                                onClick={() => onSelectChat(chat.id)}
                                className="block w-full px-4 py-4 text-left transition-colors hover:bg-[var(--bg-hover)]"
                            >
                                <div className="truncate text-base font-medium text-[var(--text-primary)]">{chat.title}</div>
                                <div className="mt-1 text-sm text-[var(--text-tertiary)]">Last message {formatRelativeDate(chat.updatedAt || chat.createdAt).toLowerCase()}</div>
                            </button>
                        )) : (
                            <div className="py-16 text-center text-sm text-[var(--text-tertiary)]">No chats in this project yet.</div>
                        )}
                    </div>
                </section>

                <aside className="h-max overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                    <div className="border-b border-[var(--border)] p-5">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-base font-medium text-[var(--text-primary)]">Memory</h2>
                            <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs">
                                    <Lock size={12} />
                                    Only you
                                </span>
                                <button type="button" className="p-1 transition-colors hover:text-[var(--text-primary)]" title="Edit memory">
                                    <FileText size={15} />
                                </button>
                            </div>
                        </div>
                        <p className="mt-3 line-clamp-3 text-sm leading-5 text-[var(--text-secondary)]">{project.memory || project.description || 'Add project memory to keep context available across chats.'}</p>
                        <div className="mt-2 text-xs text-[var(--text-tertiary)]">Last updated {formatRelativeDate(project.updatedAt || project.createdAt).toLowerCase()}</div>
                    </div>

                    <div className="border-b border-[var(--border)] p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-medium text-[var(--text-primary)]">Instructions</h2>
                            <button type="button" className="p-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]" title="Add instructions">
                                <Plus size={18} />
                            </button>
                        </div>
                        <p className="mt-2 text-sm text-[var(--text-tertiary)]">{project.instructions || 'Add instructions to tailor Perci responses'}</p>
                    </div>

                    <div className="p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-medium text-[var(--text-primary)]">Files</h2>
                            <button
                                type="button"
                                onClick={() => projectFileInputRef.current?.click()}
                                className="p-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]" title="Add files">
                                <Plus size={18} />
                            </button>
                        </div>
                        <input
                            ref={projectFileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            accept=".txt,.md,.markdown,.json,.csv,.js,.jsx,.ts,.tsx,.html,.css,.py,.java,.c,.cpp,.go,.rs,.xml,.yaml,.yml,.pdf,text/*,application/json"
                            onChange={handleProjectFileUpload}
                        />
                        {project.files && project.files.length > 0 ? (
                            <ul className="mt-3 space-y-1">
                                {project.files.map(file => (
                                    <li key={file.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] transition-colors group">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FileText size={14} className="flex-shrink-0 text-[var(--accent)]" />
                                            <span className="truncate text-sm text-[var(--text-primary)]">{file.name}</span>
                                            <span className="flex-shrink-0 text-xs text-[var(--text-tertiary)]">{formatBytes(file.size)}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveFile(file.id)}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-tertiary)] hover:text-red-400 transition-all"
                                            title="Remove file">
                                            <Trash2 size={13} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div
                                className="mt-5 rounded-xl border-2 border-dashed border-[var(--border)] p-8 text-center cursor-pointer hover:border-[var(--accent)]/50 transition-colors"
                                onClick={() => projectFileInputRef.current?.click()}
                            >
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                                    <Upload size={20} />
                                </div>
                                <p className="mt-4 text-sm leading-5 text-[var(--text-secondary)]">Add PDFs, documents, or other text to reference in this project.</p>
                                <p className="mt-1 text-xs text-[var(--text-tertiary)]">Click to browse</p>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function ChatMode() {
    const { setCurrentMode, openArtifactWindow } = useMode();
    const { isDarkMode } = useTheme();
    const {
        messages,
        addMessage,
        isLoading,
        setIsLoading,
        apiKeys,
        selectedProvider,
        selectedModel,
        updateProvider,
        updateModel,
        availableModels,
        clearChat,
        artifacts,
        addArtifact,
        currentArtifactId,
        setCurrentArtifactId,
        getArtifact,
        updateArtifactContent,
        // Chat history
        chats,
        currentChatId,
        createNewChat,
        switchToChat,
        deleteChat,
        projects,
        createProject,
        updateProject,
        // Artifact panel state
        isArtifactOpen,
        setIsArtifactOpen,
        // Model capabilities
        supportsImages,
        // User settings
        userName,
        customInstructions,
        lmStudioUrl,
        janUrl,
        searchEngine,
        searxngUrl,
        activeRequestRef,
        abortGeneration
    } = useChat();
    const [input, setInput] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = readStringStorage('perci_draft_input');
            return saved || '';
        }
        return '';
    });
    useEffect(() => {
        writeStringStorage('perci_draft_input', input);
    }, [input]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'artifacts'
    useEffect(() => {
        const applyHandoff = (payload) => {
            if (!payload || typeof payload !== 'object') return;
            const chatId = String(payload.chatId || '').trim();
            const prompt = String(payload.prompt || '').trim();
            if (chatId && chats.some(chat => chat.id === chatId)) switchToChat(chatId);
            if (prompt) {
                setInput(prompt);
                setActiveTab('chat');
            }
            removeStorageKey(POWER_WORKSPACE_CHAT_HANDOFF_KEY);
        };
        const readPendingHandoff = () => {
            try {
                return JSON.parse(readStringStorage(POWER_WORKSPACE_CHAT_HANDOFF_KEY, 'null'));
            } catch {
                return null;
            }
        };
        applyHandoff(readPendingHandoff());
        const handleHandoff = event => applyHandoff(event.detail);
        window.addEventListener('perci-power-workspace-chat-handoff', handleHandoff);
        return () => window.removeEventListener('perci-power-workspace-chat-handoff', handleHandoff);
    }, [chats, switchToChat]);
    const [isSearchEnabled, setIsSearchEnabled] = useState(false);
    const [searchFocus, setSearchFocus] = useState(() => {
        if (typeof window !== 'undefined') {
            return readStringStorage('searchFocus', 'web');
        }
        return 'web';
    });
    useEffect(() => {
        writeStringStorage('searchFocus', searchFocus);
    }, [searchFocus]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchMode, setSearchMode] = useState('web');
    const [searchSteps, setSearchSteps] = useState([]);
    const [currentSearchQuery, setCurrentSearchQuery] = useState('');
    const [searchSources, setSearchSources] = useState([]);
    const [showRecentPrompts, setShowRecentPrompts] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState('');
    const [streamingThinking, setStreamingThinking] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const imageInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const sidebarRef = useRef(null);
    const thinkingStartTime = useRef(null);
    const [sidebarWidth, setSidebarWidth] = useState(getDefaultSidebarWidth);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isResizing, setIsResizing] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState(null);
    const [permissionLevel, setPermissionLevel] = useState('full');
    const [cavemanLevel, setCavemanLevel] = useState(() => readStringStorage('caveman_level_chat', 'off'));
    const handleCavemanChange = (level) => {
        setCavemanLevel(level);
        writeStringStorage('caveman_level_chat', level);
    };
    const [previewKey, setPreviewKey] = useState(0);
    const [artifactPreviewUrl, setArtifactPreviewUrl] = useState('');
    // Width (px) of the artifact preview panel, resizable via the splitter. Persisted.
    const [artifactWidth, setArtifactWidth] = useState(() => {
        const stored = parseInt(readStringStorage('artifact_panel_width') || '', 10);
        return Number.isFinite(stored) ? Math.min(Math.max(stored, 360), 1280) : 560;
    });
    useEffect(() => {
        try { writeStringStorage('artifact_panel_width', String(artifactWidth)); } catch { /* ignore */ }
    }, [artifactWidth]);
    // Drag the splitter between the chat and the artifact panel. The panel sits on
    // the right, so dragging left widens it (and shrinks the chat), and vice versa.
    const startArtifactResize = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = artifactWidth;
        const onMove = (ev) => {
            const next = Math.min(Math.max(startW + (startX - ev.clientX), 360), Math.round(window.innerWidth * 0.85));
            setArtifactWidth(next);
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    useEffect(() => {
        const offset = isSidebarOpen ? sidebarWidth : 0;
        document.documentElement.style.setProperty('--perci-terminal-left', `${offset}px`);
    }, [isSidebarOpen, sidebarWidth]);

    useEffect(() => {
        document.body.classList.toggle('artifacts-page-active', ['artifacts', 'projects', 'project-create', 'project-detail'].includes(activeTab));
        return () => document.body.classList.remove('artifacts-page-active');
    }, [activeTab]);

    const handleCancelRequest = () => {
        abortGeneration();
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
                    size: file.size,
                    mimeType: file.type,
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
                size: file.size,
                mimeType: file.type,
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

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingMessage]);

    const handleSendMessage = async () => {
        const trimmedInput = input.trim().toLowerCase();
        if (trimmedInput === '/changelog') {
            setIsChangelogOpen(true);
            setInput('');
            removeStorageKey('perci_draft_input');
            return;
        }
        if (!input.trim() && attachments.length === 0 || isLoading) return;

        const selectedProject = projects.find(project => project.id === selectedProjectId);
        const isProjectComposer = activeTab === 'project-detail' && selectedProject;
        const userMessage = input;
        const currentAttachments = [...attachments];
        const fileAttachments = currentAttachments.filter(a => a.type !== 'image');
        const imageAttachments = currentAttachments.filter(a => a.type === 'image');
        let fullTextContent = buildUserMessageWithAttachments(userMessage, fileAttachments, imageAttachments, supportsImages);
        const attachmentMetadata = currentAttachments.map(a => ({
            name: a.name,
            type: a.type,
            mimeType: a.mimeType,
            size: a.size,
            sizeLabel: formatBytes(a.size)
        }));
        const displayImages = currentAttachments
            .filter(a => a.type === 'image' && a.previewUrl)
            .map(a => ({ name: a.name, dataUrl: a.previewUrl }));
        setInput('');
        removeStorageKey('perci_draft_input');
        setAttachments([]); // Clear attachments after sending
        const attachmentSummary = currentAttachments.length > 0
            ? currentAttachments.map(a => `[${a.type === 'image' ? 'Image' : 'File'}: ${a.name}]`).join('\n')
            : '';
        addMessage('user', userMessage || attachmentSummary, { attachments: attachmentMetadata, llmContent: fullTextContent }, null, displayImages);
        setIsLoading(true);
        thinkingStartTime.current = Date.now();
        const abortController = new AbortController();
        activeRequestRef.current = abortController;

        try {
            let context = "";
            let searchResults = null;

            // Check for Deep Research intent at a higher scope
            const isDeepResearch = userMessage.toLowerCase().startsWith('deep research:') ||
                userMessage.toLowerCase().includes('write a research paper');

            if (isDeepResearch) {
                if (!selectedProvider || !selectedModel) {
                    addMessage('assistant', "Please select a provider and model in Settings to use Deep Research.");
                    setIsLoading(false);
                    return;
                }
                if (PROVIDERS_REQUIRING_API_KEYS.has(selectedProvider) && !apiKeys[selectedProvider]) {
                    addMessage('assistant', `Please set your ${selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} API Key in Settings to use Deep Research.`);
                    setIsLoading(false);
                    return;
                }
            }

            // Perform intelligent search. The desktop app uses Perci's local search bridge; supported hosted providers can use native web search.
            const providerHasNativeWebSearch = ['openai', 'anthropic'].includes(selectedProvider) && Boolean(apiKeys[selectedProvider]);
            const hasDesktopWebSearch = typeof window !== 'undefined' && typeof window.electron?.webSearch === 'function';
            const canUseLiveWebSearch = Boolean(hasDesktopWebSearch || providerHasNativeWebSearch);

            const searchTool = new IntelligentSearchTool(
                selectedProvider,
                apiKeys[selectedProvider],
                lmStudioUrl,
                janUrl,
                selectedModel,
                searchEngine,
                searxngUrl
            );

            // Build a semantic search plan. A small deterministic layer catches obvious
            // local facts (today's date/time); otherwise the selected model classifies
            // intent and plans queries, with keyword heuristics as the offline fallback.
            let searchPlan = null;
            if (!isDeepResearch) {
                const cheapWantsSearch = searchTool.shouldPerformWebSearch(userMessage).shouldSearch;
                if (isSearchEnabled || cheapWantsSearch) {
                    try {
                        searchPlan = await searchTool.planSearch(userMessage);
                        console.log('🧭 Search plan:', searchPlan);
                    } catch (planError) {
                        console.error('Search planning failed:', planError);
                    }
                }
            }

            // Local runtime facts (today's date/time/day): answer directly, no web search.
            const isLocalRuntimeFact = searchPlan?.intent === 'local_runtime_fact' && Boolean(searchPlan.directAnswer);
            if (isLocalRuntimeFact) {
                fullTextContent += `\n\n[Local runtime fact — no web search needed]\n${searchPlan.directAnswer}\nAnswer the user's question directly using this fact, and briefly mention that no web search was necessary because it comes from the device's clock/calendar.`;
            }

            const planWantsSearch = Boolean(searchPlan && !['local_runtime_fact', 'no_search'].includes(searchPlan.intent));
            const shouldUseSearch = !isLocalRuntimeFact && (isSearchEnabled || planWantsSearch);

            // User explicitly enabled web search but the planner saw no need: honor the
            // toggle with a general web search (local runtime facts are still answered directly).
            if (shouldUseSearch && !isLocalRuntimeFact && (!searchPlan || searchPlan.intent === 'no_search')) {
                searchPlan = {
                    intent: 'web_search',
                    reason: 'User enabled web search',
                    searchQueries: [],
                    freshness: 'any',
                    expectedSourceTypes: [],
                    directAnswer: null
                };
            }

            if (shouldUseSearch && !canUseLiveWebSearch && !isDeepResearch) {
                addMessage('assistant', 'This question needs web search, but no live web provider is available. Fully restart the Perci desktop dev app for local no-key search, or use OpenAI/Anthropic with an API key for native web search.');
                setIsLoading(false);
                return;
            }
            if ((shouldUseSearch && canUseLiveWebSearch) || isDeepResearch) {
                try {
                    setIsSearching(true);
                    setSearchMode(isDeepResearch ? 'research' : 'web');
                    setSearchSteps([]);
                    setSearchSources([]);

                    // We only reach here when search is warranted (plan or Deep Research).
                    const decision = isDeepResearch
                        ? { shouldSearch: true, reason: 'Deep Research requested' }
                        : { shouldSearch: true, reason: searchPlan?.reason || 'Web lookup required' };

                    console.log('🤔 Search decision:', decision);

                    if (decision.shouldSearch) {
                        if (isDeepResearch) {
                            const query = userMessage.replace(/^deep research:/i, '').trim();
                            setCurrentSearchQuery(query || 'Deep research');
                            setSearchSteps([{ query: query || userMessage, status: 'decomposing', reason: 'Planning investigation' }]);
                            searchResults = await searchTool.deepResearch(query, (p) => {
                                if (p.status === 'decomposing') {
                                    setCurrentSearchQuery(p.query || query || 'Decomposing query...');
                                    setSearchSteps(prev => {
                                        const next = prev.length ? [...prev] : [];
                                        const last = next[next.length - 1];
                                        if (last?.status === 'decomposing') {
                                            next[next.length - 1] = { ...last, query: p.query || query || last.query, reason: p.message || 'Planning investigation' };
                                            return next;
                                        }
                                        return [...next, { query: p.query || query || userMessage, status: 'decomposing', reason: p.message || 'Planning investigation' }];
                                    });
                                }
                                else if (p.status === 'searching') {
                                    setCurrentSearchQuery(`Researching: ${p.query}`);
                                    setSearchSteps(prev => [...prev, {
                                        query: p.query,
                                        status: 'searching',
                                        phase: 'searching',
                                        reason: p.message || `Step ${p.currentStep}/${p.totalSteps}`,
                                        stepLabel: `Step ${p.currentStep || prev.length + 1}`
                                    }]);
                                }
                                else if (p.status === 'synthesizing') {
                                    setCurrentSearchQuery('Synthesizing paper...');
                                    setSearchSteps(prev => [...prev, { query: 'Synthesis', status: 'synthesizing', phase: 'synthesizing', reason: 'Drafting paper' }]);
                                }
                            });
                            context = searchResults.content;
                            if (searchResults.sources) setSearchSources(searchResults.sources);

                            // AUTO-ARTIFACT for Deep Research: Skip the secondary LLM call if we have a full paper
                            if (context && context.includes('## Abstract')) {
                                const artifactData = {
                                    type: 'research_paper',
                                    language: 'markdown',
                                    content: context,
                                    title: 'Research: ' + userMessage.replace(/^deep research:/i, '').trim().substring(0, 40)
                                };

                                const newId = addArtifact(artifactData);
                                setIsArtifactOpen(true);
                                // Also open the artifact in a floating window
                                if (openArtifactWindow) openArtifactWindow(newId);

                                const messageMetadata = {
                                    searchSources: searchResults.sources,
                                    searchQuery: userMessage
                                };

                                const finalResponse = `I have completed the deep research. You can view and download the formal research paper in the artifact panel.\n\n:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}`;
                                addMessage('assistant', finalResponse, messageMetadata);
                                setIsLoading(false);
                                return;
                            }
                        } else {
                            // Perform intelligent multi-search with progress callback
                            searchResults = await searchTool.intelligentMultiSearch(
                                userMessage,
                                3, // max searches
                                (progress) => {
                                    // Update search progress UI
                                    console.log('📍 Search progress:', progress);
                                    setCurrentSearchQuery(progress.query || '');

                                    if (progress.status === 'complete') {
                                        setSearchSteps(prev => [...prev, {
                                            query: progress.query,
                                            sourcesFound: progress.sourcesFound || 0,
                                            reason: progress.reason
                                        }]);
                                    }
                                },
                                searchPlan,
                                { focusMode: searchFocus }
                            );

                            const hasSources = searchResults?.sources?.length > 0;

                            if (hasSources) {
                                // Enhance sources with logos asynchronously - verify result used in metadata
                                const logoPromise = searchTool.enhanceSourcesWithLogos(searchResults.sources)
                                    .then(enhanced => {
                                        setSearchSources(enhanced);
                                        return enhanced;
                                    });
                                searchResults.logoPromise = logoPromise;

                                // Build context for LLM from the actual retrieved sources
                                context = searchTool.buildSearchContext(searchResults);
                                context += '\n\nIMPORTANT: When using information from the search results above, cite sources using [1], [2], etc. inline with your response. Only summarize what the listed sources actually say — do not invent source titles or describe sources generically (e.g. "various websites").';

                                if (searchResults.weakResults) {
                                    context += '\n\nNOTE: These results may be weak or only loosely related to the question. If they do not genuinely answer it, tell the user you searched but did not find clearly relevant, reliable sources rather than presenting a confident answer from these pages.';
                                }
                            } else {
                                // Searched but came back empty: be honest instead of guessing.
                                setSearchSources([]);
                                context = '\n\n[Web search ran but returned no usable results]\nTell the user you searched the web but did not find relevant results for this query, and offer to try a more specific search. Do not fabricate sources or answer as if results were found.';
                            }
                        }
                    }
                } catch (e) {
                    console.error("Search failed:", e);
                    addMessage('assistant', `Web search failed before the model answered: ${e.message || 'Unknown search error'}`);
                    setIsLoading(false);
                    return;
                } finally {
                    setIsSearching(false);
                    setCurrentSearchQuery('');
                    setSearchMode('web');
                }
            }

            // Check if provider and model are selected
            if (!selectedProvider || !selectedModel) {
                addMessage('assistant', "Please select a provider and model in Settings to start chatting.");
                setIsLoading(false);
                return;
            }

            // Check if API key is required and provided
            if (PROVIDERS_REQUIRING_API_KEYS.has(selectedProvider) && !apiKeys[selectedProvider]) {
                addMessage('assistant', `Please set your ${selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} API Key in Settings.`);
                setIsLoading(false);
                return;
            }

            const client = LLMFactory.getClient(selectedProvider, apiKeys[selectedProvider], { lmStudioUrl, janUrl });

            // Build system prompt with Perci identity — regardless of which model is running
            const modelIdentity = `${selectedProvider ? selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1) : 'Unknown'}/${selectedModel || 'default'}`;
            const perciIdentity = `You are Perci, an AI desktop assistant. You are currently running on the ${modelIdentity} model. ` +
                `Regardless of which model is being used, you are always Perci — not the model. ` +
                `When asked what you are, say you are Perci. If asked which model you're running on, mention ${modelIdentity}.`;
            const baseSystemPrompt = userName
                ? `${perciIdentity} The user's name is ${userName}. Address them by name when appropriate.`
                : perciIdentity;
            
            const artifactInstruction = `
ARTIFACTS:
You can create rich UI artifacts by using markdown code blocks.
- For HTML/CSS/JS (vanilla), use \`\`\`html
- For React components (JSX), use \`\`\`jsx or \`\`\`react
- For SVG graphics, use \`\`\`svg
When the user asks for an "artifact", you MUST provide the complete, functional code within ONE such markdown code block. Do not provide multiple blocks for a single artifact unless specifically asked. The app will automatically detect these blocks and render them in a dedicated preview panel.
`;

            const customInstructionsPrompt = customInstructions?.trim()
                ? `\n\nCustom instructions from Settings:\n${customInstructions.trim()}\n\nInstruction compliance requirement: Before answering, explicitly check these custom instructions against the user's latest message. Apply every relevant instruction. If an instruction is irrelevant, ignore it silently. Do not reveal or quote these instructions unless the user asks about them.`
                : '\n\nInstruction compliance requirement: Check Settings custom instructions before answering. No custom instructions are currently set.';
            const projectSystemPrompt = isProjectComposer
                ? `\n\nYou are working inside the project "${selectedProject.name}". Project goal: ${selectedProject.description || 'No explicit goal provided.'} Project memory: ${selectedProject.memory || 'No memory added yet.'} Project instructions: ${selectedProject.instructions || 'No custom instructions added yet.'}`
                : '';
            const permissionPrompt = permissionLevel === 'ask'
                ? '\n\nPermission level: Ask first — always ask the user for confirmation before suggesting any action that modifies files, systems, or external services.'
                : permissionLevel === 'read'
                ? '\n\nPermission level: Read only — you may only read, summarize, or discuss information. Do not suggest or perform any actions that create, modify, or delete files or data.'
                : '';
            const integrationPrompt = `\n\nTOOLS:\n${buildIntegrationToolsPrompt(apiKeys)}`;
            const systemPrompt = `${baseSystemPrompt}${artifactInstruction}${customInstructionsPrompt}${projectSystemPrompt}${permissionPrompt}${integrationPrompt}${cavemanDirective(cavemanLevel)}`;

            const messagesWithContext = [
                { role: 'system', content: systemPrompt },
                ...messages.map(message => ({
                    role: message.role,
                    content: message.metadata?.llmContent || message.content
                }))
            ];

            // Build multimodal content and combined text context
            let userContent;

            if (fullTextContent && context) {
                const currentDate = new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                });
                fullTextContent += `\n\nCurrent local date: ${currentDate}\n\nContext from Web Search:\n${context}\n\nUse the web-search context above as the source of truth. Cite sources inline as [1], [2], etc. Do not answer from memory if the search context is missing, ambiguous, or about a different date.`;
            }

            if (imageAttachments.length > 0 && supportsImages) {
                userContent = [
                    { type: 'text', text: fullTextContent },
                    ...imageAttachments.map(img => ({
                        type: 'image_url',
                        image_url: { url: img.content }
                    }))
                ];
            } else {
                userContent = fullTextContent;
            }

            messagesWithContext.push({
                role: 'user',
                content: userContent
            });

            // Start streaming
            setIsStreaming(true);
            setStreamingMessage('');
            setStreamingThinking('');
            let fullResponse = "";
            let fullThinking = "";
            let thinkingTokens = null;
            let stoppedByContextLimit = false;

            const toolRun = await runChatWithTools({
                client,
                messages: messagesWithContext,
                tools: getIntegrationTools({ allowWrites: permissionLevel !== 'read', apiKeys }),
                modelId: selectedModel,
                signal: abortController.signal,
                executeTool: (name, params) => executeIntegrationTool(name, params, apiKeys),
                onToolCall: (toolCall) => {
                    setStreamingMessage(`Using ${toolCall.name}...`);
                },
                onChunk: (chunk, metadata) => {
                if (metadata?.isThinking) {
                    // This is thinking content
                    fullThinking += chunk;
                    setStreamingThinking(fullThinking);
                } else {
                    // This is regular response content
                    fullResponse += chunk;
                    setStreamingMessage(normalizeAssistantSpacing(fullResponse));
                }

                // Capture thinking tokens if provided
                if (metadata?.thinkingTokens) {
                    thinkingTokens = metadata.thinkingTokens;
                }

                // Detect context-limit truncation from any provider
                if (metadata?.finishReason === 'length') {
                    stoppedByContextLimit = true;
                }
                }
            });
            fullResponse = toolRun.content || fullResponse;

            // Calculate duration
            const duration = thinkingStartTime.current ? Date.now() - thinkingStartTime.current : null;

            // Finish streaming
            setIsStreaming(false);
            setStreamingMessage('');
            setStreamingThinking('');

            // Extract thinking content from <think> or <thinking> tags in the response
            let extractedThinking = '';
            const thinkTagMatch = fullResponse.match(/<think>([\s\S]*?)<\/think>/i);
            const thinkingTagMatch = fullResponse.match(/<thinking>([\s\S]*?)<\/thinking>/i);

            if (thinkTagMatch) {
                extractedThinking = thinkTagMatch[1].trim();
            } else if (thinkingTagMatch) {
                extractedThinking = thinkingTagMatch[1].trim();
            }

            // Combine stream-based thinking with tag-based thinking
            let combinedThinking = fullThinking || extractedThinking;

            // Clean the response - remove thinking tags (we'll show them in ThinkingDisplay)
            let cleanedResponse = fullResponse
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                .trim();

            if (!cleanedResponse && combinedThinking) {
                const recovered = splitMisclassifiedThinking(combinedThinking);
                cleanedResponse = recovered.response;
                combinedThinking = recovered.thinking;
            }

            const messageMetadata = {};
            if (combinedThinking) {
                messageMetadata.thinking = combinedThinking;
                messageMetadata.thinkingTokens = thinkingTokens || combinedThinking.length;
                messageMetadata.duration = duration;
            }

            // ── finish_reason: "length" notice ───────────────────────────────
            // The model generated some content but was cut off at the context limit.
            if (stoppedByContextLimit && cleanedResponse) {
                cleanedResponse += '\n\n---\n⚠️ *Response truncated — the model reached its context limit. Start a **New Chat** to continue with a fresh context window.*';
            }

            // ── Context-overflow guard ────────────────────────────────────────
            // LM Studio (and some local servers) stream a status line like
            // "100% Context Used 22.8k / 16.4k" instead of a real reply when
            // the conversation exceeds the model's context window.
            const contextOverflowMatch = cleanedResponse.match(
                /^\s*\d+%\s+Context\s+Used\s+[\d.,]+\s*[kKmM]?\s*\/\s*[\d.,]+\s*[kKmM]?\s*$/i
            );
            if (contextOverflowMatch) {
                addMessage(
                    'assistant',
                    '⚠️ **Context limit exceeded.** The conversation history is too long for this model\'s context window. ' +
                    'To continue, start a **New Chat** (top-left) or reduce the amount of attached file content.',
                    messageMetadata
                );
                setIsLoading(false);
                return;
            }

            // ── Empty response guard ──────────────────────────────────────────
            // Some providers complete the stream without emitting any content
            // (e.g. silent rate-limit, content filter, or context overflow that
            // produces no output). Show a useful message instead of a blank bubble.
            if (!cleanedResponse && !combinedThinking) {
                addMessage(
                    'assistant',
                    '⚠️ **No response received.** The model returned an empty reply. ' +
                    'This can happen when the conversation is too long for the model\'s context window, ' +
                    'a rate limit was hit, or the request was filtered. ' +
                    'Try sending a shorter message, starting a new chat, or switching models.',
                    messageMetadata
                );
                setIsLoading(false);
                return;
            }

            // Check for artifacts (HTML, React, SVG)
            const htmlMatch = cleanedResponse.match(/```html\s*([\s\S]*?)```/i);
            const jsxMatch = cleanedResponse.match(/```(jsx|react)\s*([\s\S]*?)```/i);
            const svgMatch = cleanedResponse.match(/```svg\s*([\s\S]*?)```/i);

            let artifactData = null;

            if (htmlMatch) {
                artifactData = {
                    type: 'html',
                    language: 'html',
                    content: htmlMatch[1].trim(),
                    title: 'HTML Preview'
                };
            } else if (jsxMatch) {
                artifactData = {
                    type: 'react',
                    language: 'jsx',
                    content: jsxMatch[2] || jsxMatch[1], // Depending on match group
                    title: 'React Component'
                };
            } else if (svgMatch) {
                artifactData = {
                    type: 'svg',
                    language: 'svg',
                    content: svgMatch[1].trim(),
                    title: 'SVG Graphics'
                };
            } else if (isDeepResearch) {
                // Deep Research - treat the entire output as a research paper artifact
                artifactData = {
                    type: 'research_paper',
                    language: 'markdown',
                    content: cleanedResponse,
                    title: 'Research: ' + userMessage.replace(/^deep research:/i, '').trim().substring(0, 40)
                };
            }

            // Add search sources to metadata - WAIT for logo enhancement if needed
            if (searchResults && searchResults.sources && searchResults.sources.length > 0) {
                let finalSources = searchResults.sources;

                // If we have a pending logo promise, wait for it
                if (searchResults.logoPromise) {
                    try {
                        finalSources = await searchResults.logoPromise;
                    } catch (e) {
                        console.warn("Logo enhancement failed, using raw sources", e);
                    }
                }

                messageMetadata.searchSources = finalSources;
                messageMetadata.searchQuery = searchResults.optimizedQuery || userMessage;
                messageMetadata.searchIntent = searchResults.plan?.intent || null;
            }

            if (artifactData) {
                const newId = addArtifact(artifactData);
                setIsArtifactOpen(true);

                // Replace the code block with a placeholder, OR for research paper, use a custom message
                let finalResponse;

                if (artifactData.type === 'research_paper') {
                    finalResponse = `I have completed the deep research. You can view and download the formal research paper in the artifact panel.\n\n:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}`;
                } else {
                    const placeholder = `\n\n:::artifact{id="${newId}" title="${artifactData.title}" type="${artifactData.type}"}\n\n`;
                    // Use a more lenient replacement regex that matches what we found
                    finalResponse = cleanedResponse.replace(/```(?:html|jsx|react|svg)\s*[\s\S]*?```/i, placeholder);
                }

                addMessage('assistant', finalResponse, messageMetadata);
            } else {
                addMessage('assistant', normalizeAssistantSpacing(cleanedResponse), messageMetadata);
            }

        } catch (error) {
            console.error(error);
            const wasCancelled = error?.name === 'AbortError';
            setIsStreaming(false);
            setStreamingMessage('');
            setStreamingThinking('');
            addMessage('assistant', wasCancelled ? 'Cancelled before the provider finished responding.' : `Error: ${error.message}`);
        } finally {
            if (activeRequestRef.current === abortController) activeRequestRef.current = null;
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleNewChat = () => {
        setActiveTab('chat');
        setSelectedProjectId(null);
        createNewChat();
    };

    const handleNewArtifact = () => {
        const newId = addArtifact({
            type: 'markdown',
            language: 'markdown',
            title: 'Untitled artifact',
            content: '# Untitled artifact\n\nStart writing here.'
        });
        setCurrentArtifactId(newId);
        setIsArtifactOpen(true);
        setActiveTab('artifacts');
        if (openArtifactWindow) openArtifactWindow(newId);
    };

    const handleNavigateMessages = () => {
        const container = messagesEndRef.current?.parentElement;
        if (!container) return;

        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom > 80) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const recentPrompts = chats
        .flatMap(chat => (chat.messages || []).filter(msg => msg.role === 'user').map(msg => msg.content))
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .slice(0, 6);

    const projectChats = chats
        .filter(chat => chat.projectId)
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    const selectedProject = projects.find(project => project.id === selectedProjectId);
    const selectedProjectChats = selectedProject
        ? chats
            .filter(chat => chat.projectId === selectedProject.id)
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        : [];

    const allArtifacts = chats.flatMap(chat =>
        (chat.artifacts || []).map(artifact => ({
            ...artifact,
            chatTitle: chat.title,
            chatId: chat.id
        }))
    ).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const visibleArtifacts = activeTab === 'artifacts' ? allArtifacts : artifacts;
    const currentPreviewArtifact = getArtifact(currentArtifactId);

    useEffect(() => {
        if (!currentPreviewArtifact || !['html', 'svg'].includes(currentPreviewArtifact.type)) {
            setArtifactPreviewUrl('');
            return undefined;
        }

        const mimeType = currentPreviewArtifact.type === 'svg' ? 'image/svg+xml' : 'text/html';
        const blob = new Blob([currentPreviewArtifact.content || ''], { type: mimeType });
        const url = URL.createObjectURL(blob);
        setArtifactPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [currentPreviewArtifact?.id, currentPreviewArtifact?.type, currentPreviewArtifact?.content]);

    const openProject = (projectId) => {
        const chatsForProject = chats
            .filter(chat => chat.projectId === projectId)
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

        if (chatsForProject[0]) {
            switchToChat(chatsForProject[0].id);
        } else {
            createNewChat({ projectId, title: 'New project chat' });
        }

        setSelectedProjectId(projectId);
        setActiveTab('project-detail');
    };

    const projectComposer = (
        <>
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
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-3 md:p-4 focus-within:border-[var(--text-tertiary)] transition-colors">
            <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type / for skills"
                className="w-full bg-transparent border-none outline-none resize-none min-h-[52px] max-h-[180px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] leading-relaxed text-base"
            />
            <div className="flex justify-between items-center mt-3">
                <div className="flex gap-0.5 items-center">
                    <AttachmentMenu
                        onUploadImage={() => imageInputRef.current?.click()}
                        onUploadFile={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <ProviderModelPicker
                        selectedProvider={selectedProvider}
                        selectedModel={selectedModel}
                        availableModels={availableModels}
                        updateProvider={updateProvider}
                        updateModel={updateModel}
                        buttonClassName="flex items-center gap-1.5 px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-sm"
                        labelClassName="text-sm"
                        iconSize={14}
                        title="Select model"
                        dropdownWidthClassName="w-72"
                        panelClassName="absolute bottom-full right-0 mb-2 max-h-80 overflow-y-auto z-20"
                        overlayClassName="fixed inset-0 z-10"
                    />
                    <button
                        onClick={isLoading ? handleCancelRequest : handleSendMessage}
                        disabled={!isLoading && (!input.trim() && attachments.length === 0)}
                        className="w-8 h-8 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        type="button"
                        title={isLoading ? 'Cancel provider request' : 'Send'}
                    >
                        {isLoading ? <X size={18} /> : <ArrowUp size={18} />}
                    </button>
                </div>
            </div>
        </div>
        </>
    );

    // Sidebar resize handlers
    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newWidth = Math.min(Math.max(280, e.clientX), 460);
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    return (
        <div className="flex h-full min-h-0 w-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* Sidebar */}
            <aside
                ref={sidebarRef}
                className={`select-none bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col hidden md:flex relative transition-all duration-300 ease-in-out ${isSidebarOpen ? '' : '-ml-[100%] w-0 border-none overflow-hidden'}`}
                style={{
                    width: isSidebarOpen ? `${sidebarWidth}px` : '0px',
                    minWidth: isSidebarOpen ? '280px' : '0px',
                    maxWidth: '460px'
                }}
            >
                <div className="px-3 pt-3 pb-2">
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--bg-tertiary)] p-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('chat')}
                            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors ${activeTab === 'chat'
                                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            <MessageSquare size={14} />
                            Chat
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentMode(MODES.COWORK)}
                            className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            <Layers3 size={14} />
                            Cowork
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentMode(MODES.CODE)}
                            className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            <Code size={14} />
                            Code
                        </button>
                    </div>
                    <div className="mt-1.5 text-center text-[10px] text-[var(--text-tertiary)] select-none">
                        v{__APP_VERSION__}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                    <div className="space-y-1">
                        <button
                            onClick={handleNewChat}
                            className="flex w-full items-center gap-2.5 rounded-md p-2.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        >
                            <Plus size={16} />
                            <span className="truncate">New chat</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('projects')}
                            className={`flex w-full items-center gap-2.5 rounded-md p-2.5 text-left text-sm transition-colors ${['projects', 'project-create', 'project-detail'].includes(activeTab)
                                ? 'bg-[rgba(0,0,0,0.32)] text-[var(--text-primary)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            <Folder size={16} />
                            <span className="truncate">Projects</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('artifacts')}
                            className={`flex w-full items-center gap-2.5 rounded-md p-2.5 text-left text-sm transition-colors ${activeTab === 'artifacts'
                                ? 'bg-[rgba(0,0,0,0.32)] text-[var(--text-primary)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            <Code size={16} />
                            <span className="truncate">Artifacts</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsSettingsOpen(true)}
                            className="flex w-full items-center gap-2.5 rounded-md p-2.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        >
                            <SlidersHorizontal size={16} />
                            <span className="truncate">Customize</span>
                        </button>
                    </div>

                    {projects.some(project => project.isPinned) && (
                        <>
                            <div className="mt-8 text-xs font-medium text-[var(--text-tertiary)] px-2 mb-2">Pinned</div>
                            <div className="space-y-1">
                                {projects.filter(project => project.isPinned).map(project => (
                                    <button
                                        key={project.id}
                                        type="button"
                                        onClick={() => openProject(project.id)}
                                        className={`flex w-full items-center gap-2.5 rounded-md p-2.5 text-left text-sm transition-colors ${selectedProjectId === project.id && activeTab === 'project-detail'
                                            ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                                            }`}
                                    >
                                        <Folder size={16} className="shrink-0" />
                                        <span className="truncate">{project.name}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    <div className="mt-8 text-xs font-medium text-[var(--text-tertiary)] px-2 mb-2">Recents</div>

                    {/* Chat History */}
                    <div className="space-y-1">
                        {chats.map(chat => (
                            <div
                                key={chat.id}
                                className={`group flex items-center gap-2 p-2.5 rounded-md cursor-pointer text-sm transition-colors ${chat.id === currentChatId
                                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                    }`}
                            >
                                <div
                                    className="flex-1 flex items-center gap-2.5 min-w-0"
                                    onClick={() => {
                                        switchToChat(chat.id);
                                        setActiveTab('chat');
                                    }}
                                >
                                    <MessageSquare size={16} className="shrink-0" />
                                    <span className="truncate">{chat.title}</span>
                                </div>
                                {chats.length > 1 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteChat(chat.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--bg-tertiary)] rounded transition-opacity"
                                        title="Delete chat"
                                    >
                                        <Trash2 size={14} className="text-[var(--text-tertiary)]" />
                                    </button>
                                )}
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

                {/* Resize handle */}
                {isSidebarOpen && (
                    <div
                        className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-[var(--accent)] transition-colors z-20"
                        onMouseDown={handleMouseDown}
                    />
                )}
            </aside>

            <div className="flex-1 min-h-0 flex min-w-0 overflow-hidden">
            {/* Main Chat Area */}
            <main className="flex-1 min-h-0 flex flex-col relative min-w-0 transition-all duration-300">
                {/* Mobile/Toggle Header */}
                <div className="md:hidden p-3 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-primary)] text-[var(--text-primary)]">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-[var(--bg-hover)] rounded-md">
                        <MessageSquare size={20} />
                    </button>
                    <span className="font-medium">{activeTab === 'artifacts' ? 'Artifacts' : 'Open Claude'}</span>
                    <button onClick={activeTab === 'artifacts' ? handleNewArtifact : handleNewChat} className="p-2 hover:bg-[var(--bg-hover)] rounded-md">
                        <Plus size={20} />
                    </button>
                </div>

                {/* Desktop Toggle Button (when sidebar closed or overlapping) */}
                <div className="absolute top-4 left-4 z-20 hidden md:block">
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={`p-2 rounded-lg transition-colors ${!isSidebarOpen ? 'bg-[var(--bg-secondary)] border border-[var(--border)] shadow-sm' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] opacity-0 hover:opacity-100'}`}
                        title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
                    >
                        {/* Use a simple menu icon or sidebar icon */}
                        <div className="flex flex-col gap-1 w-4">
                            <div className="w-full h-0.5 bg-current rounded-full"></div>
                            <div className="w-full h-0.5 bg-current rounded-full"></div>
                            <div className="w-full h-0.5 bg-current rounded-full"></div>
                        </div>
                    </button>
                </div>

                {activeTab === 'artifacts' ? (
                    <ArtifactsPage
                        artifacts={visibleArtifacts}
                        onNewArtifact={handleNewArtifact}
                        onOpenArtifact={(artifact) => {
                            if (artifact.chatId && artifact.chatId !== currentChatId) {
                                switchToChat(artifact.chatId);
                            }
                            setCurrentArtifactId(artifact.id);
                            setIsArtifactOpen(true);
                            // Also open in floating window
                            if (openArtifactWindow) openArtifactWindow(artifact.id);
                        }}
                    />
                ) : activeTab === 'projects' ? (
                    <ProjectsPage
                        projects={projects}
                        projectChats={projectChats}
                        onOpenProject={openProject}
                        onNewProject={() => setActiveTab('project-create')}
                    />
                ) : activeTab === 'project-create' ? (
                    <NewProjectPage
                        onCancel={() => setActiveTab('projects')}
                        onCreate={(projectData) => {
                            const project = createProject(projectData);
                            openProject(project.id);
                        }}
                    />
                ) : activeTab === 'project-detail' ? (
                    <ProjectDetailPage
                        project={selectedProject}
                        chats={selectedProjectChats}
                        onBack={() => setActiveTab('projects')}
                        onSelectChat={(chatId) => {
                            switchToChat(chatId);
                            setActiveTab('chat');
                        }}
                        onStartCowork={() => setCurrentMode(MODES.COWORK)}
                        onUpdateProject={updateProject}
                        composer={projectComposer}
                    />
                ) : (
                    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div
                            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20"
                            style={{
                                backgroundImage: `url(${chatHeroBackground})`,
                                filter: isDarkMode
                                    ? 'grayscale(1) saturate(0.6) brightness(1.15)'
                                    : 'saturate(0.72) brightness(1.18) contrast(0.9)'
                            }}
                        />
                        <div className="pointer-events-none absolute inset-0 bg-[var(--bg-primary)]/55" />
                        <div className="relative flex-1 min-h-0 overflow-y-auto">
                            <div className="px-4 md:px-6 py-6 md:py-8 flex flex-col gap-4 max-w-3xl mx-auto w-full">
                            {messages.length === 0 ? (
                                <div className="flex h-full items-center justify-center">
                                    <div className="w-full px-6 py-14 md:px-10">
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <h2 className="flex items-center justify-center gap-3 text-3xl md:text-4xl font-light text-[var(--text-primary)]" style={{ fontFamily: "'Georgia', 'Tiempos Text', serif" }}>
                                                <PerciMascot state="idle" size={40} aria-hidden="true" />
                                                {getGreeting()}{userName ? `, ${userName}` : ''}
                                            </h2>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                messages.map((msg, idx) => (
                                    <ChatMessage key={idx} message={msg} />
                                ))
                            )}
                            {isStreaming && (streamingMessage || streamingThinking) && (
                                <div className="flex gap-3 md:gap-4 py-6 px-4 bg-[var(--bg-secondary)] rounded-lg">
                                    <div className="w-6 h-6 md:w-7 md:h-7 flex items-center justify-center shrink-0">
                                        <PerciMascot state="working" size={28} title="Perci is working" />
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <div className="font-medium text-sm mb-1.5 text-[var(--text-primary)]">Perci</div>

                                        {streamingThinking && streamingThinking.trim() !== '' && (
                                            <ThinkingDisplay
                                                thinking={streamingThinking}
                                                isStreaming={true}
                                            />
                                        )}

                                        {streamingMessage && (
                                            <div className="prose prose-sm max-w-none text-[var(--text-primary)] leading-relaxed">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    rehypePlugins={[rehypeRaw]}
                                                    components={{
                                                        code({ node, inline, className, children, ...props }) {
                                                            const match = /language-(\w+)/.exec(className || '');
                                                            const codeString = String(children).replace(/\n$/, '');

                                                            return !inline && match ? (
                                                                <div className="relative group my-3">
                                                                    <div className="flex items-center justify-between bg-[var(--bg-tertiary)] px-3 py-2 rounded-t-md border-b border-[var(--border)]">
                                                                        <span className="text-xs font-mono text-[var(--text-secondary)]">
                                                                            {match[1]}
                                                                        </span>
                                                                    </div>
                                                                    <SyntaxHighlighter
                                                                        style={vscDarkPlus}
                                                                        language={match[1]}
                                                                        PreTag="div"
                                                                        customStyle={{
                                                                            margin: 0,
                                                                            borderRadius: '0 0 0.375rem 0.375rem',
                                                                            fontSize: '0.875rem',
                                                                            background: 'var(--bg-tertiary)'
                                                                        }}
                                                                        {...props}
                                                                    >
                                                                        {codeString}
                                                                    </SyntaxHighlighter>
                                                                </div>
                                                            ) : (
                                                                <code className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-sm font-mono border border-[var(--border-light)]" {...props}>
                                                                    {children}
                                                                </code>
                                                            );
                                                        },
                                                        p({ children }) {
                                                            return <p className="mb-3 last:mb-0 leading-7">{children}</p>;
                                                        },
                                                        ul({ children }) {
                                                            return <ul className="list-disc pl-6 mb-3 space-y-1.5">{children}</ul>;
                                                        },
                                                        ol({ children }) {
                                                            return <ol className="list-decimal pl-6 mb-3 space-y-1.5">{children}</ol>;
                                                        },
                                                        li({ children }) {
                                                            return <li className="leading-7">{children}</li>;
                                                        },
                                                        h1({ children }) {
                                                            return <h1 className="text-2xl font-semibold mb-3 mt-4">{children}</h1>;
                                                        },
                                                        h2({ children }) {
                                                            return <h2 className="text-xl font-semibold mb-2.5 mt-4">{children}</h2>;
                                                        },
                                                        h3({ children }) {
                                                            return <h3 className="text-lg font-semibold mb-2 mt-3">{children}</h3>;
                                                        },
                                                        blockquote({ children }) {
                                                            return (
                                                                <blockquote className="border-l-3 border-[var(--accent)] pl-4 my-3 text-[var(--text-secondary)]">
                                                                    {children}
                                                                </blockquote>
                                                            );
                                                        },
                                                        a({ children, href }) {
                                                            return (
                                                                <a
                                                                    href={href}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-[var(--accent)] hover:underline"
                                                                >
                                                                    {children}
                                                                </a>
                                                            );
                                                        },
                                                        table({ children }) {
                                                            return (
                                                                <div className="overflow-x-auto my-4">
                                                                    <table className="min-w-full border border-[var(--border)] rounded-lg">
                                                                        {children}
                                                                    </table>
                                                                </div>
                                                            );
                                                        },
                                                        th({ children }) {
                                                            return (
                                                                <th className="border border-[var(--border)] px-4 py-2 bg-[var(--bg-tertiary)] text-left font-semibold">
                                                                    {children}
                                                                </th>
                                                            );
                                                        },
                                                        td({ children }) {
                                                            return (
                                                                <td className="border border-[var(--border)] px-4 py-2">
                                                                    {children}
                                                                </td>
                                                            );
                                                        }
                                                    }}
                                                >
                                                    {streamingMessage}
                                                </ReactMarkdown>
                                                <span className="inline-block w-1.5 h-4 bg-[var(--accent)] ml-1 animate-pulse-subtle"></span>
                                            </div>
                                        )}
                                    </div>
                                    </div>
                            )}
                            {isLoading && (!isStreaming || (!streamingMessage && !streamingThinking)) && (
                                <div className="flex gap-3 md:gap-4 py-6 px-4 bg-[var(--bg-secondary)] rounded-lg animate-fade-in">
                                    <div className="w-6 h-6 md:w-7 md:h-7 flex items-center justify-center shrink-0">
                                        <PerciMascot state="thinking" size={28} title="Perci is thinking" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm mb-2 text-[var(--text-primary)]">Perci</div>

                                        {isSearching && (
                                            <SearchProgress
                                                isSearching={isSearching}
                                                mode={searchMode}
                                                searchSteps={searchSteps}
                                                totalSources={searchSources.length}
                                                currentQuery={currentSearchQuery}
                                            />
                                        )}

                                        {!isSearching && (
                                            streamingThinking && streamingThinking.trim() !== ''
                                                ? (
                                                    <ThinkingDisplay
                                                        thinking={streamingThinking}
                                                        isStreaming={true}
                                                    />
                                                )
                                                : <PerciThinkingIndicator startTime={thinkingStartTime.current} />
                                        )}
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                            </div>
                        </div>

                        {/* Input Area - Claude style */}
                        <div className="relative p-4 md:p-6 max-w-3xl mx-auto w-full">
                    <div className="mb-2 flex justify-end">
                        <button
                            type="button"
                            onClick={handleNewChat}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            aria-label="Start a new chat"
                            title="Start a new chat"
                        >
                            <Plus size={15} />
                            New chat
                        </button>
                    </div>
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
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-3 md:p-4 focus-within:border-[var(--text-tertiary)] transition-colors">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="How can I help you today?"
                            className="w-full bg-transparent border-none outline-none resize-none min-h-[40px] max-h-[200px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] leading-relaxed text-base"
                        />
                        <div className="flex justify-between items-center mt-3">
	                            {/* Left side toolbar */}
	                            <div className="flex gap-0.5 items-center">
                                    <AttachmentMenu
                                        onUploadImage={() => imageInputRef.current?.click()}
                                        onUploadFile={() => fileInputRef.current?.click()}
                                        disabled={isLoading}
                                    />
                                <PermissionsDropdown value={permissionLevel} onChange={setPermissionLevel} />
                                <CavemanDropdown value={cavemanLevel} onChange={handleCavemanChange} />
                                <button
                                    onClick={handleNavigateMessages}
                                    className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                                    title="Navigate messages"
                                    type="button"
                                >
                                    <div className="flex flex-col -space-y-1">
                                        <ArrowUp size={12} />
                                        <ArrowDown size={12} />
                                    </div>
                                </button>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowRecentPrompts(!showRecentPrompts)}
                                        className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                                        title="Recent prompts"
                                        type="button"
                                    >
                                        <Clock size={18} />
                                    </button>
                                    {showRecentPrompts && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowRecentPrompts(false)} />
                                            <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-lg z-20 py-1">
                                                {recentPrompts.length > 0 ? recentPrompts.map((prompt, index) => (
                                                    <button
                                                        key={`${prompt}-${index}`}
                                                        type="button"
                                                        onClick={() => {
                                                            setInput(prompt);
                                                            setShowRecentPrompts(false);
                                                        }}
                                                        className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                                                    >
                                                        <span className="line-clamp-2">{prompt}</span>
                                                    </button>
                                                )) : (
                                                    <div className="px-3 py-3 text-sm text-[var(--text-tertiary)]">No recent prompts yet</div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Right side - Model selector and Send */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                                    className={`p-2 rounded-lg transition-colors ${isSearchEnabled
                                        ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                                        }`}
                                    title="Toggle Web Search"
                                >
                                    <Globe size={18} />
                                </button>
                                {isSearchEnabled && (
                                     <select
                                         value={searchFocus}
                                         onChange={(e) => setSearchFocus(e.target.value)}
                                         className="text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-secondary)] focus:text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
                                         title="Search Focus Mode"
                                     >
                                         <option value="web">General Web</option>
                                         <option value="academic">Academic</option>
                                         <option value="discussion">Discussions</option>
                                     </select>
                                 )}
                                <button
                                    onClick={() => {
                                        if (!input.toLowerCase().startsWith('deep research:')) {
                                            setInput(prev => `Deep Research: ${prev}`);
                                        }
                                        if (!isSearchEnabled) setIsSearchEnabled(true);
                                    }}
                                    className="p-2 rounded-lg transition-colors"
                                    style={input.toLowerCase().startsWith('deep research:')
                                        ? { background: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)' }
                                        : {}}
                                    title="Deep Research Mode"
                                >
                                    <Sparkles size={18} />
                                </button>
                                <ProviderModelPicker
                                    selectedProvider={selectedProvider}
                                    selectedModel={selectedModel}
                                    availableModels={availableModels}
                                    updateProvider={updateProvider}
                                    updateModel={updateModel}
                                    buttonClassName="flex items-center gap-1.5 px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-sm max-w-[160px]"
                                    labelClassName="text-sm truncate"
                                    iconSize={14}
                                    title="Select model"
                                    dropdownWidthClassName="w-72"
                                    panelClassName="absolute bottom-full right-0 mb-2 max-h-80 overflow-y-auto z-20"
                                    overlayClassName="fixed inset-0 z-10"
                                />
	                                <button
	                                    onClick={isLoading ? handleCancelRequest : handleSendMessage}
	                                    disabled={!isLoading && (!input.trim() && attachments.length === 0)}
                                    className="w-8 h-8 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={isLoading ? 'Cancel provider request' : 'Send'}
                                >
                                    {isLoading ? <X size={18} /> : <ArrowUp size={18} />}
                                </button>
                            </div>
                        </div>
                    </div>
                    </div>
                    </div>
                )}
            </main>
            {!isArtifactOpen && (
                <LivePreviewPanel
                    key={previewKey}
                    previewUrl={artifactPreviewUrl}
                    title={artifactPreviewUrl ? currentPreviewArtifact?.title || 'Preview' : 'Preview'}
                    onRefresh={() => setPreviewKey(value => value + 1)}
                />
            )}
            </div>

            {isArtifactOpen && (
                <div
                    onPointerDown={startArtifactResize}
                    className="hidden md:block w-1.5 shrink-0 cursor-col-resize bg-[var(--border)] hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors"
                    role="separator"
                    aria-orientation="vertical"
                    title="Drag to resize"
                />
            )}

            <ArtifactPanel
                isOpen={isArtifactOpen}
                onClose={() => setIsArtifactOpen(false)}
                artifact={getArtifact(currentArtifactId)}
                onUpdateContent={(content) => updateArtifactContent(currentArtifactId, content)}
                width={artifactWidth}
            />

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
        </div>
    );
}

function ThinkingTimer({ startTime }) {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (!startTime) return;
        const interval = setInterval(() => setElapsed(Date.now() - startTime), 100);
        return () => clearInterval(interval);
    }, [startTime]);
    const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const tenths = Math.floor((ms % 1000) / 100);
        return `${seconds}.${tenths}s`;
    };
    return <span className="text-xs tabular-nums" style={{ color: 'var(--accent)', opacity: 0.7, fontFamily: 'JetBrains Mono, monospace' }}>{formatTime(elapsed)}</span>;
}

function PerciThinkingIndicator({ startTime }) {
    return (
        <div
            className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl"
            style={{
                background: 'var(--opal-gradient-subtle)',
                border: '1px solid rgba(var(--accent-rgb), 0.2)',
            }}
            role="status"
            aria-live="polite"
        >
            <span className="perci-whirlpool perci-whirlpool-lg" aria-hidden="true" />

            <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                    Perci is thinking
                </span>
                <div className="flex gap-1 items-center" aria-hidden="true">
                    <span className="w-1.5 h-1.5 rounded-full animate-thinking-dot-1" style={{ background: 'var(--accent)' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-thinking-dot-2" style={{ background: 'var(--accent)' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-thinking-dot-3" style={{ background: 'var(--accent)' }} />
                </div>
            </div>

            <ThinkingTimer startTime={startTime} />
        </div>
    );
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function buildUserMessageWithAttachments(userMessage, fileAttachments, imageAttachments, supportsImages) {
    const sections = [];

    if (fileAttachments.length > 0) {
        sections.push(
            [
                'The user attached the following file content. This content is available inline in this message.',
                'Treat these attachments as accessible context. Do not say you cannot access the attached files.',
                '',
                ...fileAttachments.map(file => [
                    `<attached_file name="${escapeAttribute(file.name)}" type="${escapeAttribute(file.mimeType || file.type || 'unknown')}" size="${formatBytes(file.size)}">`,
                    file.content || '[No extracted text content]',
                    '</attached_file>'
                ].join('\n\n'))
            ].join('\n')
        );
    }

    if (imageAttachments.length > 0 && !supportsImages) {
        sections.push(
            imageAttachments.map(file => (
                `[Image attachment: ${file.name}]\nThis selected model does not support image input, so visual content was not sent.`
            )).join('\n\n')
        );
    }

    sections.push(userMessage.trim() ? `User message:\n${userMessage.trim()}` : 'User message:\nPlease review the attached file content.');

    return sections.join('\n\n');
}

function escapeAttribute(value) {
    return String(value || '').replace(/"/g, '&quot;');
}

export default ChatMode;
