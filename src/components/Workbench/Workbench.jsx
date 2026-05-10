import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Layout, Globe, Loader2, RefreshCw, Sidebar, Code, Download, Share2, PanelBottomClose, PanelBottomOpen, X, FolderOpen } from 'lucide-react';
import { useBuildMode } from '../../context/BuildModeContext';
import { useTheme } from '../../context/ThemeContext';
import { BoltArtifactParser } from '../../lib/BoltArtifactParser';
import { FileExplorer } from './FileExplorer';
import TerminalPanel from '../Terminal';

export function Workbench({ streamingMessage, workingDirectory, onChooseFolder }) {
    const { webcontainerInstance } = useBuildMode();
    const { isDarkMode } = useTheme();
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isServerRunning, setIsServerRunning] = useState(false);

    // Panel Visibility States
    const [showSidebar, setShowSidebar] = useState(true);
    const [showPreview, setShowPreview] = useState(true);
    const [showTerminal, setShowTerminal] = useState(true);

    const [selectedFileContent, setSelectedFileContent] = useState('');
    const [selectedFilePath, setSelectedFilePath] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    const parserRef = useRef(null);
    const processedLengthRef = useRef(0);
    const editorRef = useRef(null);
    const hasLocalProject = Boolean(workingDirectory && window.electron?.readFile);
    const localPreviewUrl = typeof window !== 'undefined' && window.location?.origin?.startsWith('http')
        ? window.location.origin
        : null;

    const resolveLocalPath = (relativePath) => {
        if (!relativePath) return workingDirectory;
        if (relativePath.startsWith('/')) return relativePath;
        return `${workingDirectory}/${relativePath}`;
    };

    // Initialize parser
    useEffect(() => {
        parserRef.current = new BoltArtifactParser({
            onActionStart: (action) => {
                if (action.type === 'shell') {
                    if (!showTerminal) setShowTerminal(true);
                } else if (action.type === 'file') {
                    setSelectedFilePath(action.filePath);
                    setSelectedFileContent('');
                }
            },
            onActionContent: (action, content) => {
                if (action.type === 'file') {
                    setSelectedFileContent(prev => prev + content);
                    if (editorRef.current) {
                        editorRef.current.scrollTop = editorRef.current.scrollHeight;
                    }
                }
            },
            onActionEnd: async (action) => {
                try {
                    if (action.type === 'file') {
                        if (hasLocalProject) {
                            await window.electron.writeFile(resolveLocalPath(action.filePath), action.content);
                        } else if (webcontainerInstance) {
                            await webcontainerInstance.fs.writeFile(action.filePath, action.content);
                        }
                    } else if (action.type === 'shell') {
                        const command = action.content.trim();
                        // Note: In Cowork mode, we now have a real interactive terminal.
                        // For autonomous shell actions, we might still want to use webcontainers
                        // or provide a bridge to the real PTY if allowed.
                        if (webcontainerInstance) {
                            const [cmd, ...args] = command.split(' ');
                            const process = await webcontainerInstance.spawn(cmd, args);
                            await process.exit;
                        }
                    }
                } catch (err) {
                    console.error('Action failed:', err);
                }
            }
        });
    }, [hasLocalProject, webcontainerInstance, showTerminal, workingDirectory]);

    useEffect(() => {
        if (hasLocalProject) {
            if (localPreviewUrl) {
                setPreviewUrl(localPreviewUrl);
                setIsServerRunning(true);
            }
        } else {
            setPreviewUrl(null);
            setIsServerRunning(false);
        }
    }, [hasLocalProject, localPreviewUrl, workingDirectory]);

    // Process streaming message
    useEffect(() => {
        if (streamingMessage && parserRef.current) {
            const newContent = streamingMessage.slice(processedLengthRef.current);
            if (newContent) {
                parserRef.current.parse(newContent);
                processedLengthRef.current = streamingMessage.length;
            }
        } else if (!streamingMessage) {
            processedLengthRef.current = 0;
        }
    }, [streamingMessage]);

    // Listen for server ready
    useEffect(() => {
        if (webcontainerInstance) {
            webcontainerInstance.on('server-ready', (port, url) => {
                setPreviewUrl(url);
                setIsServerRunning(true);
                setShowPreview(true);
            });
        }
    }, [webcontainerInstance]);

    const handleFileSelect = async (file) => {
        try {
            const content = file.source === 'local' && window.electron?.readFile
                ? await window.electron.readFile(file.absolutePath)
                : await webcontainerInstance.fs.readFile(file.path, 'utf-8');
            setSelectedFileContent(content);
            setSelectedFilePath(file.path);
        } catch (e) {
            console.error('Error reading file:', e);
        }
    };

    const handleDownload = async () => {
        setIsExporting(true);
        setTimeout(() => {
            setIsExporting(false);
        }, 1000);
    };

    const handlePublish = () => {
        setTimeout(() => {
            alert('Deployment feature coming soon!');
        }, 1000);
    };

    return (
        <div className={`relative h-full min-w-0 overflow-hidden flex flex-col ${isDarkMode ? 'bg-[#0C0C0D]' : 'bg-white'} text-[var(--text-primary)] border-l border-[var(--border)]`}>
            {/* Workbench Header */}
            <div className="h-12 border-b border-[var(--border)] flex items-center px-4 gap-4 bg-[var(--bg-secondary)] justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowSidebar(!showSidebar)}
                        className={`p-1.5 rounded-md transition-colors ${showSidebar ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                        title="Toggle File Explorer"
                    >
                        <Sidebar size={16} />
                    </button>
                    <div className="w-px h-4 bg-[var(--border)] mx-1"></div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Workbench</span>
                </div>

                <div className="flex items-center gap-2">
                    {onChooseFolder && (
                        <button
                            onClick={onChooseFolder}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-primary)] rounded-md text-[10px] font-bold uppercase tracking-widest transition-all"
                            title="Choose project folder"
                        >
                            <FolderOpen size={12} />
                            Folder
                        </button>
                    )}

                    {isServerRunning && (
                        <div className="flex items-center gap-2 text-xs text-green-500 font-bold uppercase tracking-widest px-3 py-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full mr-2">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                            Live
                        </div>
                    )}

                    <button
                        onClick={handleDownload}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-primary)] rounded-md text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                        {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        Export
                    </button>

                    <button
                        onClick={handlePublish}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-md text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg"
                    >
                        <Share2 size={12} />
                        Publish
                    </button>
                </div>
            </div>

            {/* Main Content Area with Split Layout */}
            <div className="flex-1 flex min-w-0 overflow-hidden">
                {/* File Explorer Sidebar */}
                {showSidebar && (
                    <FileExplorer
                        webcontainerInstance={webcontainerInstance}
                        workingDirectory={workingDirectory}
                        onFileSelect={handleFileSelect}
                    />
                )}

                {/* Editor & Preview Split Area */}
                <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isDarkMode ? 'bg-[#0C0C0D]' : 'bg-white'}`}>

                    {/* Upper Area: Editor + Preview */}
                    <div className={`flex-1 flex min-w-0 overflow-hidden ${showTerminal ? 'h-[60%]' : 'h-full'}`}>

                        {/* Code Editor */}
                        <div className={`flex-[1_1_0] flex flex-col min-w-0 overflow-hidden ${showPreview ? 'border-r border-[var(--border)]' : ''}`}>
                            {selectedFilePath ? (
                                <>
                                    {/* Editor Tab Header */}
                                    <div className="h-9 border-b border-[var(--border)] flex items-center px-3 bg-[var(--bg-secondary)] text-[10px] uppercase font-bold tracking-widest text-[var(--text-tertiary)] shrink-0">
                                        <span className="text-[var(--accent)] mr-2 font-black">JS</span>
                                        {selectedFilePath}
                                    </div>
                                    <textarea
                                        ref={editorRef}
                                        className={`flex-1 w-full h-full p-6 font-mono text-sm resize-none outline-none ${isDarkMode ? 'bg-[#0C0C0D] text-[#F5F5F7]' : 'bg-white text-[#1A1A1B]'} leading-relaxed selection:bg-[var(--accent-glow)]`}
                                        value={selectedFileContent}
                                        readOnly
                                        spellCheck={false}
                                    />
                                </>
                            ) : (
                                <div className={`flex-1 flex flex-col items-center justify-center text-[var(--text-tertiary)] ${isDarkMode ? 'bg-[#0C0C0D]' : 'bg-white'}`}>
                                    <Code size={48} className="mb-4 opacity-10" />
                                    <div className="text-[10px] font-bold uppercase tracking-widest">Select a file to begin</div>
                                </div>
                            )}
                        </div>

                        {/* Live Preview Pane */}
                        {showPreview && (
                            <div
                                className="flex flex-col min-w-0 overflow-hidden bg-white border-l border-[var(--border)]"
                                style={{ flex: '0 1 420px', width: '38%', minWidth: 'min(280px, 45%)', maxWidth: '45%' }}
                            >
                                {/* Preview Header */}
                                <div className="h-9 border-b flex items-center justify-between px-3 bg-gray-50 shrink-0">
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 overflow-hidden">
                                        <Globe size={12} />
                                        <span className="truncate max-w-[200px]">{previewUrl || 'No connection'}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => {
                                            const iframe = document.getElementById('preview-iframe');
                                            if (iframe && previewUrl) iframe.src = previewUrl;
                                        }} className="p-1 hover:bg-gray-200 rounded text-gray-600">
                                            <RefreshCw size={12} />
                                        </button>
                                        <button onClick={() => setShowPreview(false)} className="p-1 hover:bg-gray-200 rounded text-gray-600" title="Close Preview">
                                            <X size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Iframe Content */}
                                {previewUrl ? (
                                    <iframe
                                        id="preview-iframe"
                                        src={previewUrl}
                                        className="w-full h-full border-0 bg-white"
                                        title="App Preview"
                                    />
                                ) : (
                                    <div className="flex-1 min-w-0 overflow-hidden flex flex-col items-center justify-center text-gray-400 gap-3 bg-gray-50">
                                        <Loader2 size={24} className="animate-spin opacity-20" />
                                        <div className="text-[10px] font-bold uppercase tracking-widest">Awaiting local server...</div>
                                        {onChooseFolder && !workingDirectory && (
                                            <button
                                                onClick={onChooseFolder}
                                                className="mt-2 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:border-orange-400 hover:text-orange-500"
                                            >
                                                <FolderOpen size={12} />
                                                Choose folder
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Terminal Pane (Bottom) */}
                    {showTerminal ? (
                        <div className={`h-[40%] min-h-[200px] border-t border-[var(--border)] flex flex-col ${isDarkMode ? 'bg-[#0C0C0D]' : 'bg-white'}`}>
                            <div className="h-8 border-b border-[var(--border)] flex items-center justify-between px-3 bg-[var(--bg-secondary)] shrink-0">
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                                    <TerminalIcon size={12} />
                                    <span>Interactive Terminal</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setShowTerminal(false)} className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)]" title="Close Terminal">
                                        <PanelBottomClose size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1">
                                <TerminalPanel sessionId="workbench" />
                            </div>
                        </div>
                    ) : (
                        // Collapsed Terminal Bar
                        <div className="h-8 border-t border-[var(--border)] flex items-center justify-between px-3 bg-[var(--bg-secondary)] shrink-0 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => setShowTerminal(true)}>
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                                <TerminalIcon size={12} />
                                <span>Terminal</span>
                            </div>
                            <PanelBottomOpen size={14} className="text-[var(--text-tertiary)]" />
                        </div>
                    )}
                </div>
            </div>

            {/* View Controls */}
            {!showPreview && selectedFilePath && (
                <div className="absolute top-14 right-4 z-10">
                    <button
                        onClick={() => setShowPreview(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-[var(--accent)] text-white rounded-md shadow-2xl hover:bg-[var(--accent-hover)] transition-all text-[10px] font-bold uppercase tracking-widest"
                    >
                        <Layout size={14} />
                        Open Preview
                    </button>
                </div>
            )}
        </div>
    );
}
