import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMode, MODES } from '../context/ModeContext';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import { LLMFactory } from '../lib/llm/clients';
import FileExplorer from './FileExplorer';
import { SecondaryModeNav } from './SecondaryModeNav';
import { SettingsModal } from './SettingsModal';
import { Settings, Plus, Send, Code, Terminal, Play, Layout, Users, ChevronRight, Save, Sidebar, Globe, RefreshCw, X, FileCode, MessageSquare, History, Search, FolderOpen } from 'lucide-react';
import { PermissionsDropdown } from './PermissionsDropdown';

import MonacoEditor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { normalizeAssistantSpacing } from '../lib/textFormatting';
import { SyntaxHighlighter } from '../lib/syntaxHighlighter';
import { buildMemoryPrompt } from '../lib/harnessMemory';
import { chooseModelForTask, buildRoutingPrompt } from '../lib/modelRouter';
import { buildBudgetPrompt, createBudgetRun, estimateCharsFromMessages, recordBudgetResponse } from '../lib/budgetGovernor';
import {
    buildIntegrationToolsPrompt,
    executeIntegrationTool,
    getIntegrationTools,
    runChatWithTools
} from '../lib/integrationTools';
import {
    appendMissionRunEvent,
    recordCodeFileSave,
    recordCodeSessionFinish,
    recordCodeSessionStart
} from '../lib/missionControl';

const getDefaultSidebarWidth = () => {
    if (typeof window === 'undefined') return 360;
    return Math.min(360, Math.max(280, Math.floor(window.innerWidth * 0.45)));
};

const PROVIDERS_REQUIRING_API_KEYS = new Set(['openai', 'groq', 'gemini', 'openrouter', 'anthropic', 'mistral']);

export default function CodeMode() {
    const { codeState, setCodeState } = useMode();
    const { userName, selectedProvider, selectedModel, availableModels, apiKeys, lmStudioUrl, janUrl } = useChat();
    const { isDarkMode } = useTheme();
    
    const [input, setInput] = useState('');
    const [activeSession, setActiveSession] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState('');
    const [showSidebar, setShowSidebar] = useState(true);
    const [showHistory, setShowHistory] = useState(true);
    const [previewKey, setPreviewKey] = useState(0);
    const [permissionLevel, setPermissionLevel] = useState('full');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Resizable widths
    const [historyWidth, setHistoryWidth] = useState(getDefaultSidebarWidth);
    const [chatWidth, setChatWidth] = useState(450);
    
    const isResizingHistoryRef = useRef(false);
    const isResizingChatRef = useRef(false);
    const messagesEndRef = useRef(null);
    const activeRequestRef = useRef(null);

    useEffect(() => {
        return () => activeRequestRef.current?.abort();
    }, []);

    const handleCancelRequest = useCallback(() => {
        activeRequestRef.current?.abort();
    }, []);

    // Optimized Resize Logic
    useEffect(() => {
        const offset = showHistory ? historyWidth : 0;
        document.documentElement.style.setProperty('--opal-terminal-left', `${offset}px`);
    }, [showHistory, historyWidth]);

    useEffect(() => {
        const handleMouseMove = (e) => {
            const minWorkspaceWidth = 300;
            const minHistoryWidth = 280;
            const minChatWidth = 300;

            if (isResizingHistoryRef.current) {
                // Adjust history width, constrained by window and other column
                setHistoryWidth(prevHistory => {
                    const maxAllowed = window.innerWidth - minWorkspaceWidth - chatWidth;
                    return Math.max(minHistoryWidth, Math.min(460, e.clientX, maxAllowed));
                });
            } else if (isResizingChatRef.current) {
                // Adjust chat width, constrained by window and history column
                setChatWidth(prevChat => {
                    const startX = showHistory ? historyWidth : 0;
                    const maxAllowed = window.innerWidth - minWorkspaceWidth - startX;
                    const requestedWidth = e.clientX - startX;
                    return Math.max(minChatWidth, Math.min(800, requestedWidth, maxAllowed));
                });
            }
        };

        const handleMouseUp = () => {
            isResizingHistoryRef.current = false;
            isResizingChatRef.current = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [showHistory, historyWidth]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeSession?.messages, streamingMessage]);

    // Listen for global folder selection trigger
    useEffect(() => {
        const handleTrigger = () => handleChooseFolder();
        document.addEventListener('trigger-choose-folder', handleTrigger);
        return () => document.removeEventListener('trigger-choose-folder', handleTrigger);
    }, []);

    const handleChooseFolder = async () => {
        let folderPath = null;
        if (window.electron && window.electron.selectDirectory) {
            try {
                folderPath = await window.electron.selectDirectory();
            } catch (err) {
                console.error("Failed to open native dialog:", err);
            }
        }
        if (!folderPath && !window.electron) {
            folderPath = prompt("Enter folder path or project name:", "my-new-project");
        }
        if (folderPath) {
            setCodeState(prev => ({
                ...prev,
                workingDirectory: folderPath,
                files: {},
                activeFile: null,
                unsavedChanges: false
            }));
            localStorage.setItem('working_directory', folderPath);
        }
    };

    const syncFilesystem = useCallback(async (directory = codeState.workingDirectory) => {
        if (!directory || !window.electron) return;
        try {
            const fileList = await window.electron.listFiles(directory);
            const newFiles = {};
            for (const path of fileList) {
                newFiles[path] = ''; 
            }
            
            const preferred = ['README.md', 'index.jsx', 'index.tsx', 'App.jsx', 'App.tsx', 'main.jsx', 'main.tsx'];
            let initialFile = fileList.find(f => preferred.includes(f.split('/').pop()));
            if (!initialFile) initialFile = fileList.find(f => !f.split('/').pop().startsWith('.'));
            if (!initialFile) initialFile = fileList[0];

            let hydratedFiles = newFiles;
            if (initialFile) {
                const content = await window.electron.readFile(`${directory}/${initialFile}`);
                hydratedFiles = { ...newFiles, [initialFile]: content };
            }

            setCodeState(prev => ({
                ...prev,
                workingDirectory: directory,
                files: hydratedFiles,
                activeFile: initialFile || null,
                unsavedChanges: false
            }));
        } catch (err) { console.error("Failed to sync filesystem:", err); }
    }, [codeState.workingDirectory]);

    useEffect(() => {
        if (codeState.workingDirectory) { syncFilesystem(); }
    }, [codeState.workingDirectory, syncFilesystem]);

    const handleFileSelect = async (filePath) => {
        if (window.electron && (!codeState.files[filePath] || codeState.files[filePath] === '')) {
            try {
                const content = await window.electron.readFile(`${codeState.workingDirectory}/${filePath}`);
                setCodeState(prev => ({ ...prev, files: { ...prev.files, [filePath]: content }, activeFile: filePath }));
            } catch (err) { console.error("Error reading file:", err); }
        } else {
            setCodeState(prev => ({ ...prev, activeFile: filePath }));
        }
    };

    const handleSave = async () => {
        if (window.electron && codeState.workingDirectory && codeState.activeFile) {
            try {
                await window.electron.writeFile(`${codeState.workingDirectory}/${codeState.activeFile}`, codeState.files[codeState.activeFile]);
                recordCodeFileSave(codeState.activeFile, {
                    workingDirectory: codeState.workingDirectory
                });
            } catch (err) { console.error("Failed to save file:", err); }
        } else if (codeState.activeFile) {
            recordCodeFileSave(codeState.activeFile, {
                workingDirectory: codeState.workingDirectory
            });
        }
        setCodeState(prev => ({ ...prev, unsavedChanges: false }));
        setPreviewKey(prev => prev + 1);
    };

    const handleNewSession = () => {
        const newSession = {
            id: Date.now().toString(),
            title: 'New Coding Session',
            messages: [],
            createdAt: Date.now()
        };
        setCodeState(prev => ({
            ...prev,
            codingSessions: [newSession, ...(prev.codingSessions || [])]
        }));
        setActiveSession(newSession);
    };

    const updateSessionMessages = useCallback((sessionId, messages) => {
        setCodeState(prev => ({
            ...prev,
            codingSessions: (prev.codingSessions || []).map(session =>
                session.id === sessionId
                    ? { ...session, messages, updatedAt: Date.now() }
                    : session
            )
        }));
    }, [setCodeState]);

    const handleSendMessage = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim() || isLoading) return;
        const userMessage = input;
        setInput('');
        setIsLoading(true);
        setStreamingMessage('');
        const abortController = new AbortController();
        activeRequestRef.current = abortController;
        let currentSession = activeSession;
        if (!currentSession) {
            currentSession = { id: Date.now().toString(), title: userMessage.substring(0, 40), messages: [], createdAt: Date.now() };
            setCodeState(prev => ({ ...prev, codingSessions: [currentSession, ...(prev.codingSessions || [])] }));
            setActiveSession(currentSession);
        }
        const updatedMessages = [...(currentSession.messages || []), { role: 'user', content: userMessage }];
        const missionRunId = recordCodeSessionStart(currentSession, userMessage, {
            workingDirectory: codeState.workingDirectory,
            activeFile: codeState.activeFile
        });
        currentSession.messages = updatedMessages;
        setActiveSession({ ...currentSession });
        updateSessionMessages(currentSession.id, updatedMessages);
        try {
            if (!selectedProvider || !selectedModel) {
                throw new Error('Please select a provider and model in Settings to start chatting.');
            }

            const route = chooseModelForTask({
                task: userMessage,
                selectedProvider,
                selectedModel,
                availableModels,
                apiKeys,
                requiresTools: true
            });
            const routedProvider = route.provider || selectedProvider;
            const routedModel = route.model || selectedModel;
            if (PROVIDERS_REQUIRING_API_KEYS.has(routedProvider) && !apiKeys[routedProvider]) {
                const providerName = routedProvider.charAt(0).toUpperCase() + routedProvider.slice(1);
                throw new Error(`Please set your ${providerName} API key in Settings.`);
            }
            appendMissionRunEvent(missionRunId, {
                type: 'info',
                title: 'Model route selected',
                detail: `${routedProvider}/${routedModel}: ${route.reason}`
            });

            const client = LLMFactory.getClient(routedProvider, apiKeys[routedProvider], { lmStudioUrl, janUrl });
            const fileContext = Object.entries(codeState.files).slice(0, 20).map(([path, content]) => `File: ${path}\n\`\`\`\n${content}\n\`\`\``).join('\n\n');
            const memoryContext = buildMemoryPrompt(userMessage, {
                scope: codeState.workingDirectory,
                files: [codeState.activeFile].filter(Boolean),
                sourceTypes: ['code', 'cowork', 'build', 'terminal']
            });
            const budgetRun = createBudgetRun('Code Mode', { maxIterations: 4, maxToolCalls: 8 });
            const permissionPrompt = permissionLevel === 'ask'
                ? 'Permission level: Ask first. Ask the user before recommending or performing external writes.'
                : permissionLevel === 'read'
                ? 'Permission level: Read only. Do not create, modify, or delete external data.'
                : 'Permission level: Full access.';
            const systemPrompt = [
                'Expert software engineer.',
                buildRoutingPrompt(route),
                buildBudgetPrompt(budgetRun),
                memoryContext.prompt,
                permissionPrompt,
                buildIntegrationToolsPrompt(apiKeys),
                `Context: ${fileContext}`
            ].join('\n\n');
            const messagesForLLM = [{ role: 'system', content: systemPrompt }, ...updatedMessages];
            appendMissionRunEvent(missionRunId, {
                type: 'info',
                title: 'Durable memory loaded',
                detail: `${memoryContext.memories.length} memory notes matched this request.`
            });
            let fullResponse = "";
            const toolRun = await runChatWithTools({
                client,
                messages: messagesForLLM,
                tools: getIntegrationTools({ allowWrites: permissionLevel !== 'read' }),
                modelId: routedModel,
                signal: abortController.signal,
                executeTool: (name, params) => executeIntegrationTool(name, params, apiKeys),
                onToolCall: (toolCall) => {
                    setStreamingMessage(`Using ${toolCall.name}...`);
                },
                onChunk: (chunk, metadata) => {
                    if (!metadata?.isThinking) {
                        fullResponse += chunk;
                        setStreamingMessage(normalizeAssistantSpacing(fullResponse));
                    }
                }
            });
            fullResponse = toolRun.content || fullResponse;
            const budgetAfterResponse = recordBudgetResponse(budgetRun, estimateCharsFromMessages(messagesForLLM) + fullResponse.length);
            if (budgetAfterResponse.blocked) {
                appendMissionRunEvent(missionRunId, {
                    type: 'error',
                    title: 'Budget warning',
                    detail: budgetAfterResponse.warnings.join(' ')
                });
            }
            const finalMessages = [...updatedMessages, { role: 'assistant', content: normalizeAssistantSpacing(fullResponse) }];
            setActiveSession(prev => ({ ...prev, messages: finalMessages }));
            updateSessionMessages(currentSession.id, finalMessages);
            setStreamingMessage('');
            recordCodeSessionFinish(missionRunId, {
                ok: true,
                detail: fullResponse ? 'Assistant response was recorded.' : 'Assistant returned an empty response.'
            });
        } catch (error) {
            console.error(error);
            const wasCancelled = error?.name === 'AbortError';
            const errorMessage = error?.message || 'Code chat failed. Check Settings and try again.';
            const finalMessages = [...updatedMessages, {
                role: 'assistant',
                content: wasCancelled ? 'Cancelled before the provider finished responding.' : errorMessage
            }];
            setActiveSession(prev => ({ ...(prev || currentSession), messages: finalMessages }));
            updateSessionMessages(currentSession.id, finalMessages);
            setStreamingMessage('');
            recordCodeSessionFinish(missionRunId, {
                ok: wasCancelled,
                status: wasCancelled ? 'cancelled' : undefined,
                detail: wasCancelled ? 'Provider request was aborted by the user.' : errorMessage
            });
        } finally {
            if (activeRequestRef.current === abortController) activeRequestRef.current = null;
            setIsLoading(false);
        }
    };

    return (
        <div className="code-mode h-full min-h-0 flex bg-[var(--bg-primary)] overflow-hidden text-[var(--text-primary)]">
            {/* Left Sidebar: Session History */}
            {showHistory && (
                <aside 
                    className="border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col shrink-0"
                    style={{ width: `${historyWidth}px` }}
                >
                    <SecondaryModeNav />
                    <div className="p-4">
                        <button onClick={handleNewSession} className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors shadow-sm">
                            <Plus size={16} className="text-[var(--accent)]" />
                            New session
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 py-2">
                        {(codeState.codingSessions || []).map(session => (
                            <button
                                key={session.id}
                                onClick={() => setActiveSession(session)}
                                className={`w-full text-left px-3 py-2 rounded-lg group transition-colors flex items-center gap-2.5 ${activeSession?.id === session.id ? 'bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm' : 'hover:bg-[var(--bg-hover)]'}`}
                            >
                                <MessageSquare size={14} className={activeSession?.id === session.id ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'} />
                                <div className="min-w-0 flex-1">
                                    <div className={`text-[13px] truncate ${activeSession?.id === session.id ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
                                        {session.title}
                                    </div>
                                </div>
                            </button>
                        ))}
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
            )}
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

            {/* History Resize Handle */}
            {showHistory && (
                <div 
                    className="w-1 bg-transparent hover:bg-[var(--accent)]/30 cursor-col-resize z-50 transition-colors"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        isResizingHistoryRef.current = true;
                        document.body.style.cursor = 'col-resize';
                        document.body.style.userSelect = 'none';
                    }}
                />
            )}

            <div 
                className="border-r border-[var(--border)] flex min-h-0 flex-col bg-[var(--bg-primary)] shrink-0"
                style={{ width: `${chatWidth}px` }}
            >
                <div className="h-12 border-b border-[var(--border)] flex items-center justify-between px-4 bg-[var(--bg-secondary)]/30 shrink-0">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowHistory(!showHistory)} className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md text-[var(--text-tertiary)]">
                            <History size={18} />
                        </button>
                        <h2 className="text-sm font-semibold">Code Assistant</h2>
                    </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
                    {!activeSession ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
                            <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-3xl flex items-center justify-center text-[var(--accent)] shadow-inner"><Code size={32} /></div>
                            <div className="max-w-xs">
                                <h3 className="text-base font-semibold text-[var(--text-primary)]">Interactive Workspace</h3>
                                <button onClick={handleNewSession} className="mt-6 px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] transition-all shadow-md">Start session</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {activeSession.messages?.map((msg, i) => (
                                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)]'}`}>
                                        {msg.role === 'user' ? userName?.charAt(0) || 'U' : <Code size={16} />}
                                    </div>
                                    <div className={`flex-1 overflow-hidden p-3 rounded-xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-light)]' : 'text-[var(--text-primary)]'}`}>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeRaw]}
                                            components={{
                                                code({ node, inline, className, children, ...props }) {
                                                    const match = /language-(\w+)/.exec(className || '');
                                                    return !inline && match ? (
                                                        <div className="relative group my-2 rounded-lg overflow-hidden border border-[var(--border)]">
                                                            <SyntaxHighlighter style={isDarkMode ? vscDarkPlus : prism} language={match[1]} PreTag="div" customStyle={{ margin: 0, fontSize: '11px', background: 'var(--bg-tertiary)' }} {...props}>
                                                                {String(children).replace(/\n$/, '')}
                                                            </SyntaxHighlighter>
                                                        </div>
                                                    ) : (
                                                        <code className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded font-mono text-xs text-[var(--accent)]" {...props}>{children}</code>
                                                    );
                                                }
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                            {streamingMessage && (
                                <div className="flex gap-3 animate-fade-in">
                                    <div className="w-7 h-7 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center shrink-0 shadow-sm"><Code size={16} className="text-[var(--accent)]" /></div>
                                    <div className="flex-1 text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{streamingMessage}</div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>
                <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-secondary)]/10">
                    <form onSubmit={handleSendMessage} className="relative group">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                            placeholder={activeSession ? "What should we change?" : "Type to start a new session..."}
                            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl py-3.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] shadow-sm min-h-[90px] max-h-[250px] resize-none"
                        />
                        <div className="mt-2 flex items-center gap-1">
                            <PermissionsDropdown value={permissionLevel} onChange={setPermissionLevel} />
                        </div>
                        <button
                            type={isLoading ? 'button' : 'submit'}
                            onClick={isLoading ? handleCancelRequest : undefined}
                            disabled={!isLoading && !input.trim()}
                            className="absolute bottom-3.5 right-3.5 p-2 bg-[var(--accent)] text-white rounded-xl hover:bg-[var(--accent-hover)] transition-all shadow-md disabled:opacity-40"
                            title={isLoading ? 'Cancel provider request' : 'Send'}
                        >
                            {isLoading ? <X size={18} /> : <Send size={18} />}
                        </button>
                    </form>
                </div>
            </div>

            {/* Chat Resize Handle */}
            <div 
                className="w-1 bg-transparent hover:bg-[var(--accent)]/30 cursor-col-resize z-50 transition-colors"
                onMouseDown={(e) => {
                    e.preventDefault();
                    isResizingChatRef.current = true;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                }}
            />

            <div className="flex-1 min-h-0 flex flex-col min-w-[300px] bg-[var(--bg-primary)] overflow-hidden">
                <div className="h-12 border-b border-[var(--border)] flex items-center justify-between px-4 bg-[var(--bg-secondary)]/30 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setShowSidebar(!showSidebar)} className={`p-1.5 rounded-md transition-colors ${showSidebar ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`}><Sidebar size={18} /></button>
                        <div className="flex items-center gap-2 overflow-hidden">
                            <FileCode size={14} className="text-[var(--accent)] shrink-0" />
                            <span className="text-xs font-mono text-[var(--text-secondary)] truncate font-medium">{codeState.activeFile || 'No file selected'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleChooseFolder} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"><FolderOpen size={14} />{codeState.workingDirectory ? 'Change Folder' : 'Choose Folder'}</button>
                        <button onClick={handleSave} disabled={!codeState.unsavedChanges} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${codeState.unsavedChanges ? 'bg-[var(--accent)] text-white shadow-md hover:bg-[var(--accent-hover)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'}`}><Save size={14} />{codeState.unsavedChanges ? 'Save Changes' : 'Saved'}</button>
                    </div>
                </div>
                <div className="flex-1 min-h-0 flex overflow-hidden">
                    {showSidebar && (
                        <div className="w-64 border-r border-[var(--border)]">
                            <FileExplorer files={codeState.files} activeFile={codeState.activeFile} onFileSelect={handleFileSelect} />
                        </div>
                    )}
                    <div className={`flex-1 relative ${isDarkMode ? 'bg-[var(--bg-primary)]' : 'bg-white'} min-w-0 overflow-hidden`}>
                        {codeState.activeFile ? (
                            <MonacoEditor
                                height="100%"
                                language={getLanguage(codeState.activeFile)}
                                value={codeState.files[codeState.activeFile] || ''}
                                onChange={(val) => setCodeState(prev => ({ ...prev, files: { ...prev.files, [prev.activeFile]: val }, unsavedChanges: true }))}
                                theme={isDarkMode ? "vs-dark" : "light"}
                                options={{
                                    wordWrap: 'on',
                                    wrappingIndent: 'indent',
                                    automaticLayout: true,
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    padding: { top: 16, bottom: 16 },
                                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                    fontLigatures: true,
                                    smoothScrolling: true,
                                    cursorBlinking: 'smooth',
                                    cursorSmoothCaretAnimation: 'on'
                                }}
                            />
                        ) : ( <div className="h-full flex items-center justify-center">Select a file</div> )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function getLanguage(filePath) {
    if (!filePath) return 'javascript';
    const ext = filePath.split('.').pop();
    const langMap = { 'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript', 'css': 'css', 'html': 'html', 'json': 'json', 'md': 'markdown' };
    return langMap[ext] || 'javascript';
}
