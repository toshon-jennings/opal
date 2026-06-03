
import React, { useState, useEffect, useRef } from 'react';
import { Send, FileCode, Terminal, Code, Monitor, Loader2, Plus, RefreshCw, Sparkles, Layers3, CheckCircle2, X } from 'lucide-react';
import { useBuild } from '../context/BuildContext';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import { LLMFactory } from '../lib/llm/clients';
import { generatePreviewHTML } from '../utils/preview-generator';
import MonacoEditor from '@monaco-editor/react';
import { buildBudgetPrompt, createBudgetRun } from '../lib/budgetGovernor';
import { buildMemoryPrompt } from '../lib/harnessMemory';
import { buildRoutingPrompt, chooseModelForTask } from '../lib/modelRouter';
import {
    appendMissionRunEvent,
    recordBuildGenerationFinish,
    recordBuildPreviewValidation,
    recordBuildGenerationStart,
    recordBuildReset
} from '../lib/missionControl';

const PROVIDERS_REQUIRING_API_KEYS = new Set(['openai', 'groq', 'gemini', 'openrouter', 'anthropic', 'mistral']);

function formatBuildTime(timestamp) {
    if (!timestamp) return 'just now';
    const diff = Date.now() - timestamp;
    if (diff < 60 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
}

function getBuildLanguage(filePath = '') {
    if (filePath.endsWith('.css')) return 'css';
    if (filePath.endsWith('.json')) return 'json';
    if (filePath.endsWith('.html')) return 'html';
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
    return 'typescript';
}

export default function BuildMode() {
    const {
        buildMessages,
        addBuildMessage,
        buildFiles,
        updateBuildFiles,
        activeFile,
        setActiveFile,
        isGenerating,
        setIsGenerating,
        clearBuild
    } = useBuild();

    const {
        selectedProvider,
        selectedModel,
        availableModels,
        apiKeys,
        lmStudioUrl,
        janUrl
    } = useChat();
    const { isDarkMode } = useTheme();

    const [input, setInput] = useState('');
    const [previewHTML, setPreviewHTML] = useState('');
    const messagesEndRef = useRef(null);
    const activeRequestRef = useRef(null);
    const [viewMode, setViewMode] = useState('preview'); // 'preview' or 'code'

    useEffect(() => {
        return () => activeRequestRef.current?.abort();
    }, []);

    const handleCancelGeneration = () => {
        activeRequestRef.current?.abort();
    };

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [buildMessages, isGenerating]);

    // Regenerate preview when files change
    useEffect(() => {
        const html = generatePreviewHTML(buildFiles);
        setPreviewHTML(html);
    }, [buildFiles]);

    const handleSendMessage = async () => {
        if (!input.trim() || isGenerating) return;

        const userMessage = input;
        setInput('');
        addBuildMessage({ role: 'user', content: userMessage });
        setIsGenerating(true);
        const abortController = new AbortController();
        activeRequestRef.current = abortController;
        const missionRunId = recordBuildGenerationStart(userMessage, {
            files: Object.keys(buildFiles)
        });

        try {
            // Get client
            if (!selectedProvider || !selectedModel) {
                throw new Error('Please select a provider and model in Settings.');
            }
            
            const route = chooseModelForTask({
                task: userMessage,
                selectedProvider,
                selectedModel,
                availableModels,
                apiKeys,
                requiresTools: false
            });
            const routedProvider = route.provider || selectedProvider;
            const routedModel = route.model || selectedModel;
            if (PROVIDERS_REQUIRING_API_KEYS.has(routedProvider) && !apiKeys[routedProvider]) {
                throw new Error(`Please check your ${routedProvider} configuration in Settings.`);
            }
            appendMissionRunEvent(missionRunId, {
                type: 'info',
                title: 'Model route selected',
                detail: `${routedProvider}/${routedModel}: ${route.reason}`
            });
            const client = LLMFactory.getClient(routedProvider, apiKeys[routedProvider], { lmStudioUrl, janUrl });
            const memoryContext = buildMemoryPrompt(userMessage, {
                scope: 'Build sandbox',
                files: Object.keys(buildFiles),
                sourceTypes: ['build', 'code', 'cowork']
            });
            const budgetRun = createBudgetRun('Build Mode', { maxIterations: 1, maxToolCalls: 0 });
            appendMissionRunEvent(missionRunId, {
                type: 'info',
                title: 'Durable memory loaded',
                detail: `${memoryContext.memories.length} memory notes matched this build.`
            });

            // Construct System Prompt
            const systemPrompt = `You are a code generation AI. Generate React components based on user requests.

CRITICAL RULES:
1. Return a JSON object with file paths as keys and code as values
2. Use React with TypeScript (tsx) or JavaScript (jsx)
3. Use Tailwind CSS for styling
4. Include proper imports (React, etc)
5. Make components functional and complete
6. The main entry point is typically src/App.tsx
7. DO NOT use markdown formatting (no \`\`\`). Just return raw JSON.

Format your response as valid JSON ONLY:
{
  "src/App.tsx": "import React from 'react'...",
  "src/components/Header.tsx": "export default function Header()..."
}

Existing files:
${JSON.stringify(Object.keys(buildFiles))}

${buildRoutingPrompt(route)}

${buildBudgetPrompt(budgetRun)}

${memoryContext.prompt}

User request: ${userMessage}`;

            // We use a non-streaming call for JSON generation to ensure we get valid JSON
            // For providers that don't support non-streaming easily via this client, we might need to adjust
            // But usually streamChat can be used and we just accumulate.
            // Let's accumulate.

            let fullResponse = "";

            // Create a temporary message for "Generating..."
            // We won't add it to history yet, just show loading state.

            await client.streamChat([{ role: 'user', content: systemPrompt }], (chunk) => {
                fullResponse += chunk;
            }, routedModel, { signal: abortController.signal });

            // Clean up code blocks if present (LLMs often ignore "no markdown" rules)
            let jsonStr = fullResponse;
            if (jsonStr.includes('```json')) {
                jsonStr = jsonStr.replace(/```json\n?/, '').replace(/```/, '');
            } else if (jsonStr.includes('```')) {
                jsonStr = jsonStr.replace(/```\n?/, '').replace(/```/, '');
            }

            // Parse JSON
            try {
                const generatedFiles = JSON.parse(jsonStr);
                const generatedFilePaths = Object.keys(generatedFiles);

                // Update files
                updateBuildFiles(generatedFiles);

                // Add Assistant Message
                addBuildMessage({
                    role: 'assistant',
                    content: `Generated ${generatedFilePaths.length} files.`,
                    files: generatedFiles
                });
                recordBuildGenerationFinish(missionRunId, {
                    ok: true,
                    files: generatedFilePaths,
                    detail: `Generated ${generatedFilePaths.length} files.`
                });
                const nextBuildFiles = {
                    ...buildFiles,
                    ...generatedFiles
                };
                try {
                    const validationHTML = generatePreviewHTML(nextBuildFiles);
                    const hasRoot = validationHTML.includes('id="root"');
                    const hasAppRender = validationHTML.includes('ReactDOM.createRoot') && validationHTML.includes('<App />');
                    recordBuildPreviewValidation(missionRunId, {
                        ok: hasRoot && hasAppRender,
                        detail: hasRoot && hasAppRender
                            ? 'Preview HTML was generated and includes the React root render path.'
                            : 'Preview HTML was generated but the expected React root render path was missing.'
                    });
                } catch (validationError) {
                    recordBuildPreviewValidation(missionRunId, {
                        ok: false,
                        detail: validationError?.message || 'Preview generation failed.'
                    });
                }

                // If App.tsx was modified, ensure it's active or we stay on current
                if (generatedFiles['src/App.tsx']) {
                    // Maybe don't switch active file automatically to be less jarring, 
                    // or switch to the main modified file.
                }

            } catch (e) {
                console.error("Failed to parse JSON", e);
                // Fallback: just show the text
                addBuildMessage({
                    role: 'assistant',
                    content: "I created some code but couldn't apply it automatically. Here is the response:\n\n" + fullResponse
                });
                recordBuildGenerationFinish(missionRunId, {
                    ok: true,
                    parseFallback: true,
                    files: [],
                    detail: "The model response was captured, but Build mode could not parse it as file JSON."
                });
            }

        } catch (error) {
            const wasCancelled = error?.name === 'AbortError';
            addBuildMessage({
                role: 'assistant',
                content: wasCancelled ? 'Cancelled before the provider finished generating files.' : `Error: ${error.message}`
            });
            recordBuildGenerationFinish(missionRunId, {
                ok: wasCancelled,
                status: wasCancelled ? 'cancelled' : undefined,
                files: [],
                detail: wasCancelled ? 'Provider request was aborted by the user.' : (error?.message || 'Build generation failed.')
            });
        } finally {
            if (activeRequestRef.current === abortController) activeRequestRef.current = null;
            setIsGenerating(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const filePaths = Object.keys(buildFiles);
    const generatedCount = buildMessages.filter(message => message.files).length;

    return (
        <div className="h-full min-h-0 w-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <div className="flex h-full min-h-0">
                <aside className="flex w-[380px] min-w-[320px] max-w-[440px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
                    <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
                        <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                                <Terminal size={15} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="truncate text-sm font-semibold">Build Assistant</h2>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                                    <span>{filePaths.length} files</span>
                                    <span className="h-1 w-1 rounded-full bg-[var(--text-tertiary)]/50" />
                                    <span>{generatedCount} generations</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                recordBuildReset({ files: filePaths });
                                clearBuild();
                            }}
                            className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="New Build"
                        >
                            <Plus size={17} />
                        </button>
                    </div>

                    <div className="border-b border-[var(--border)] px-4 py-3">
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                                <Sparkles size={14} className="text-[var(--accent)]" />
                                Generate React surfaces
                            </div>
                            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                                Prompt for UI, inspect the preview, then open generated files in the code view.
                            </p>
                        </div>
                    </div>

                    <div className="border-b border-[var(--border)] px-4 py-3">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Project files</div>
                            <div className="text-[11px] text-[var(--text-tertiary)]">{filePaths.length}</div>
                        </div>
                        <div className="space-y-1">
                            {filePaths.slice(0, 5).map(path => (
                                <button
                                    key={path}
                                    onClick={() => {
                                        setActiveFile(path);
                                        setViewMode('code');
                                    }}
                                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${activeFile === path && viewMode === 'code'
                                        ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    <FileCode size={13} className="shrink-0" />
                                    <span className="truncate font-mono">{path}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4">
                        {buildMessages.length === 0 ? (
                            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--accent)] shadow-sm">
                                    <Layers3 size={24} />
                                </div>
                                <h3 className="mt-4 text-sm font-semibold">Start with a product surface</h3>
                                <p className="mt-2 max-w-[260px] text-sm leading-6 text-[var(--text-secondary)]">
                                    Describe the app, screen, or component you want generated.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {buildMessages.map((msg) => {
                                    const isUser = msg.role === 'user';
                                    const changedFiles = msg.files ? Object.keys(msg.files) : [];
                                    return (
                                        <div key={msg.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold shadow-sm ${isUser ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-primary)] text-[var(--accent)] border border-[var(--border)]'}`}>
                                                {isUser ? 'U' : <Code size={15} />}
                                            </div>
                                            <div className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm leading-6 ${isUser ? 'border border-[var(--border-light)] bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                                                <div className="whitespace-pre-wrap">{msg.content}</div>
                                                {changedFiles.length > 0 && (
                                                    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2">
                                                        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                                            <CheckCircle2 size={12} className="text-[var(--accent)]" />
                                                            Modified files
                                                        </div>
                                                        <div className="space-y-1">
                                                            {changedFiles.map(path => (
                                                                <button
                                                                    key={path}
                                                                    onClick={() => {
                                                                        setActiveFile(path);
                                                                        setViewMode('code');
                                                                    }}
                                                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                                                >
                                                                    <FileCode size={13} className="shrink-0 text-[var(--accent)]" />
                                                                    <span className="truncate font-mono">{path}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="mt-2 text-[10px] text-[var(--text-tertiary)]">{formatBuildTime(msg.timestamp)}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {isGenerating && (
                                    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
                                        <Loader2 size={15} className="animate-spin text-[var(--accent)]" />
                                        Generating build files...
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]/70 p-4">
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                handleSendMessage();
                            }}
                            className="relative"
                        >
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Describe your app..."
                                className="min-h-[92px] max-h-[220px] w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] py-3.5 pl-4 pr-12 text-sm leading-6 text-[var(--text-primary)] shadow-sm outline-none transition-all placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                                disabled={isGenerating}
                            />
                            <button
                                type={isGenerating ? 'button' : 'submit'}
                                onClick={isGenerating ? handleCancelGeneration : undefined}
                                disabled={!isGenerating && !input.trim()}
                                className="absolute bottom-3 right-3 rounded-xl bg-[var(--accent)] p-2 text-white shadow-md transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                                title={isGenerating ? 'Cancel provider request' : 'Generate'}
                            >
                                {isGenerating ? <X size={17} /> : <Send size={17} />}
                            </button>
                        </form>
                    </div>
                </aside>

                <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
                    <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)]/30 px-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1">
                                <button
                                    onClick={() => setViewMode('preview')}
                                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'preview'
                                        ? 'bg-[var(--accent)] text-white shadow-sm'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    <Monitor size={14} />
                                    Preview
                                </button>
                                <button
                                    onClick={() => setViewMode('code')}
                                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'code'
                                        ? 'bg-[var(--accent)] text-white shadow-sm'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    <Code size={14} />
                                    Code
                                </button>
                            </div>
                            <div className="hidden min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)] md:flex">
                                <FileCode size={14} className="shrink-0 text-[var(--accent)]" />
                                <span className="truncate font-mono">{viewMode === 'code' ? activeFile : 'Live preview'}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {viewMode === 'code' && (
                                <select
                                    value={activeFile}
                                    onChange={(e) => setActiveFile(e.target.value)}
                                    className="max-w-[260px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                                >
                                    {filePaths.map(file => (
                                        <option key={file} value={file}>{file}</option>
                                    ))}
                                </select>
                            )}
                            <button
                                onClick={() => setPreviewHTML(generatePreviewHTML(buildFiles))}
                                className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                title="Refresh preview"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden">
                        {viewMode === 'preview' ? (
                            <div className="h-full bg-[var(--bg-tertiary)] p-4">
                                <div className="h-full overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
                                    <iframe
                                        className="h-full w-full border-none bg-white"
                                        srcDoc={previewHTML}
                                        sandbox="allow-scripts allow-same-origin allow-forms"
                                        title="Preview"
                                    />
                                </div>
                            </div>
                        ) : (
                            <MonacoEditor
                                height="100%"
                                language={getBuildLanguage(activeFile)}
                                value={buildFiles[activeFile] || ''}
                                theme={isDarkMode ? 'vs-dark' : 'light'}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                    fontLigatures: true,
                                    readOnly: true,
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    wordWrap: 'on',
                                    padding: { top: 16, bottom: 16 }
                                }}
                            />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
