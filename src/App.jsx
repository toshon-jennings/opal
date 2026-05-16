import { useCallback, useEffect, useRef, useState } from 'react';
import opalLogo from './assets/opal-logo.png';
import { useMode, MODES } from './context/ModeContext';
import ModeSwitcher from './components/ModeSwitcher';
import ChatMode from './components/ChatMode';
import CodeMode from './components/CodeMode';
import CoworkMode from './components/CoworkMode';
import BuildMode from './components/BuildMode';
import { BuildModeProvider } from './context/BuildModeContext'; // Keeping original context for now, but primary logic will be in BuildContext
import { BuildProvider } from './context/BuildContext';
import { ChatProvider } from './context/ChatContext';

import { Moon, Sun, Lock, Unlock, Plus, Terminal as TerminalIcon, Server, X, RefreshCw, ExternalLink, Bot, AlertCircle } from 'lucide-react';
import { useTheme, ThemeProvider } from './context/ThemeContext';
import { useChat } from './context/ChatContext';
import TerminalPanel from './components/Terminal';

function AppContent() {
    const {
        currentMode,
        setCurrentMode,
        showGlobalTerminal,
        setShowGlobalTerminal,
        showOpenClawDashboard,
        setShowOpenClawDashboard,
        openClawConfig,
        hermesAppPath,
    } = useMode();
    const { isDarkMode, toggleTheme } = useTheme();
    const { isIncognitoMode, toggleIncognitoMode, createNewChat } = useChat();
    const [openClawStatus, setOpenClawStatus] = useState({ state: 'idle' });
    const [openClawFrameKey, setOpenClawFrameKey] = useState(0);
    const [openClawDashboardIssue, setOpenClawDashboardIssue] = useState(null);
    const [isRestartingOpenClaw, setIsRestartingOpenClaw] = useState(false);
    const [hermesError, setHermesError] = useState(null);
    const openClawWebviewRef = useRef(null);
    const activeOpenClawProfile = openClawConfig.profiles.find(profile => profile.id === openClawConfig.activeProfileId) || openClawConfig.profiles[0];
    const activeOpenClawDashboardUrl = getOpenClawDashboardUrl(activeOpenClawProfile);

    // Listen for Electron Menu Actions
    useEffect(() => {
        if (window.electron && window.electron.onMenuAction) {
            window.electron.onMenuAction((action) => {
                console.log('Menu action received:', action);
                switch (action) {
                    case 'new-chat':
                        setCurrentMode(MODES.CHAT);
                        createNewChat();
                        break;
                    case 'switch-mode-chat':
                        setCurrentMode(MODES.CHAT);
                        break;
                    case 'switch-mode-cowork':
                        setCurrentMode(MODES.COWORK);
                        break;
                    case 'switch-mode-code':
                        setCurrentMode(MODES.CODE);
                        break;
                    case 'choose-folder':
                        // This will trigger the folder selection logic
                        // We can either emit an event or handle it in some specialized context
                        document.dispatchEvent(new CustomEvent('trigger-choose-folder'));
                        break;
                    default:
                        break;
                }
            });
        }
    }, [setCurrentMode, createNewChat]);

    useEffect(() => {
        if (!activeOpenClawProfile) return;
        let cancelled = false;

        async function testOpenClaw() {
            if (!window.electron?.testOpenClawConnection) {
                setOpenClawStatus({ state: 'unsupported' });
                return;
            }

            const result = await window.electron.testOpenClawConnection(activeOpenClawProfile);
            if (!cancelled) {
                setOpenClawStatus({
                    state: result.ok ? 'online' : 'offline',
                    result
                });
            }
        }

        setOpenClawStatus({ state: 'checking' });
        testOpenClaw();
        const interval = setInterval(testOpenClaw, 30000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [activeOpenClawProfile]);

    useEffect(() => {
        setOpenClawDashboardIssue(null);
    }, [activeOpenClawProfile?.id, activeOpenClawDashboardUrl, openClawFrameKey]);

    const openOpenClawDashboard = () => {
        if (!activeOpenClawDashboardUrl) return;
        setOpenClawDashboardIssue(null);
        setShowOpenClawDashboard(true);
    };

    const launchHermesApp = async () => {
        if (!window.electron?.openHermesApp) return;
        setHermesError(null);
        const result = await window.electron.openHermesApp(hermesAppPath || undefined);
        if (!result?.ok) {
            setHermesError(result?.error || 'Could not open Mercury.');
            setTimeout(() => setHermesError(null), 6000);
        }
    };

    const openOpenClawExternally = () => {
        if (!activeOpenClawDashboardUrl) return;
        if (window.electron?.openExternal) {
            window.electron.openExternal(activeOpenClawDashboardUrl);
        } else {
            window.open(activeOpenClawDashboardUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const restartOpenClawGateway = async () => {
        if (!window.electron?.restartOpenClawGateway || isRestartingOpenClaw) return;
        setIsRestartingOpenClaw(true);
        setOpenClawDashboardIssue(null);
        setOpenClawStatus({ state: 'checking' });
        const result = await window.electron.restartOpenClawGateway();
        if (!result?.ok) {
            setOpenClawStatus({
                state: 'offline',
                result: { ok: false, error: result?.error || 'Failed to restart OpenClaw Gateway.' }
            });
            setIsRestartingOpenClaw(false);
            return;
        }

        setTimeout(async () => {
            const status = await window.electron.testOpenClawConnection(activeOpenClawProfile);
            setOpenClawStatus({ state: status.ok ? 'online' : 'offline', result: status });
            setOpenClawFrameKey(key => key + 1);
            setIsRestartingOpenClaw(false);
        }, 1500);
    };

    const inspectOpenClawDashboard = useCallback(async (webview) => {
        if (!webview?.executeJavaScript) return;
        try {
            const bodyText = await webview.executeJavaScript('document.body?.innerText || ""', true);
            if (/protocol mismatch/i.test(bodyText)) {
                setOpenClawDashboardIssue({
                    type: 'protocol-mismatch',
                    title: 'OpenClaw protocol mismatch',
                    message: 'The loaded Control UI and the running Gateway are from different OpenClaw versions. Restart the local Gateway so it serves the current dashboard protocol.'
                });
            }
        } catch {
            // Some navigations can briefly reject script execution while the webview swaps documents.
        }
    }, []);

    const attachOpenClawWebview = useCallback((webview) => {
        if (openClawWebviewRef.current === webview) return;
        openClawWebviewRef.current = webview;
        if (!webview) return;

        const handleDomReady = () => inspectOpenClawDashboard(webview);
        const handleDidFinishLoad = () => inspectOpenClawDashboard(webview);
        const handleDidFailLoad = (event) => {
            if (event?.errorCode === -3) return;
            setOpenClawDashboardIssue({
                type: 'load-failed',
                title: 'OpenClaw dashboard failed to load',
                message: event?.errorDescription || 'The local dashboard could not be loaded.'
            });
        };

        webview.addEventListener('dom-ready', handleDomReady);
        webview.addEventListener('did-finish-load', handleDidFinishLoad);
        webview.addEventListener('did-fail-load', handleDidFailLoad);
        webview.addEventListener('destroyed', () => {
            webview.removeEventListener('dom-ready', handleDomReady);
            webview.removeEventListener('did-finish-load', handleDidFinishLoad);
            webview.removeEventListener('did-fail-load', handleDidFailLoad);
        }, { once: true });
    }, [inspectOpenClawDashboard]);

    return (
        <div className={`app h-screen max-h-screen flex flex-col bg-[var(--bg-primary)] overflow-hidden ${window.electron ? 'pt-8' : ''}`}>
            {/* Top Navigation / Header */}
            <header className="app-header glass-header sticky top-0 z-50 flex-shrink-0 flex items-center justify-between px-6 py-2.5">
                <div className="flex items-center gap-2.5">
                    {/* Professional macOS-style Logo Container */}
                    <div 
                        className={`w-9 h-9 rounded-[8px] flex items-center justify-center relative shadow-sm overflow-hidden ${isDarkMode ? 'bg-gradient-to-b from-[#2a2a2e] to-[#0c0c0d]' : 'bg-gradient-to-b from-white to-[#f5f5f7] border border-[#e5e7eb]'}`}
                    >
                        <img src={opalLogo} alt="Opal" className="w-[70%] h-[70%] object-contain relative z-10" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="opal-text text-base font-semibold leading-none" style={{fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em'}}>Opal</h1>
                        <span className={`text-[9px] font-bold uppercase tracking-tighter mt-0.5 ${window.electron ? 'text-green-500' : 'text-amber-500'}`}>
                            {window.electron ? 'Desktop' : 'Web Fallback'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {currentMode === MODES.CHAT && (
                        <button onClick={createNewChat} className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors" title="New Chat">
                            <Plus size={18} />
                        </button>
                    )}

                    <ModeSwitcher />

                    <div className="h-6 w-px bg-[var(--border)] mx-2" />

                    <button
                        onClick={openOpenClawDashboard}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors text-xs ${
                            showOpenClawDashboard
                                ? 'bg-[var(--accent)] text-white'
                                : openClawStatus.state === 'online'
                                ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/15'
                                : openClawStatus.state === 'checking'
                                    ? 'text-[var(--text-secondary)] bg-[var(--bg-hover)]'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                        }`}
                        title={`OpenClaw: ${activeOpenClawProfile?.name || 'Not configured'}`}
                    >
                        <Server size={16} />
                        <span className="hidden lg:inline max-w-28 truncate">{activeOpenClawProfile?.mode === 'appliance' ? 'Appliance' : 'OpenClaw'}</span>
                    </button>

                    <div className="relative">
                        <button
                            onClick={launchHermesApp}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors text-xs ${
                                hermesError
                                    ? 'text-red-400 bg-red-500/10 hover:bg-red-500/15'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                            }`}
                            title="MERCURY for Hermes Agent"
                        >
                            {hermesError ? <AlertCircle size={16} /> : <Bot size={16} />}
                            <span className="hidden xl:inline max-w-24 truncate">Mercury</span>
                        </button>
                        {hermesError && (
                            <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-lg border border-red-500/30 bg-[var(--bg-secondary)] shadow-lg p-3">
                                <p className="text-xs text-red-400 leading-relaxed">{hermesError}</p>
                                <a
                                    href="https://github.com/fathah/hermes-desktop"
                                    onClick={e => { e.preventDefault(); window.electron?.openExternal?.('https://github.com/fathah/hermes-desktop'); }}
                                    className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                                >
                                    Get Mercury <ExternalLink size={11} />
                                </a>
                            </div>
                        )}
                    </div>

                    <button onClick={() => setShowGlobalTerminal(v => !v)} className={`p-1.5 rounded-md transition-colors ${showGlobalTerminal ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`} title="Toggle Terminal">
                        <TerminalIcon size={18} />
                    </button>

                    {window.electron && (
                        <button onClick={() => window.electron.toggleDevTools()} className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors" title="Toggle DevTools">
                            <div className="w-4 h-4 border border-current rounded-sm flex items-center justify-center text-[10px] font-bold">D</div>
                        </button>
                    )}

                    <button onClick={toggleTheme} className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors" title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
                        {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
                    </button>

                    <button onClick={toggleIncognitoMode} className={`p-1.5 rounded-md transition-colors ${isIncognitoMode ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`} title={isIncognitoMode ? "Disable Incognito Mode" : "Enable Incognito Mode"}>
                        {isIncognitoMode ? <Lock size={18} /> : <Unlock size={18} />}
                    </button>
                </div>
            </header>

            {/* Mode-Specific UI */}
            <main className="app-main relative flex-1 min-h-0 overflow-hidden flex flex-col">
                <div className="flex-1 min-h-0 overflow-hidden">
                    {currentMode === MODES.CHAT && <ChatMode />}
                    {currentMode === MODES.COWORK && <CoworkMode />}
                    {currentMode === MODES.CODE && <CodeMode />}
                    {currentMode === MODES.BUILD && <BuildMode />}
                </div>

                {showOpenClawDashboard && activeOpenClawDashboardUrl && (
                    <div className="absolute inset-0 z-40 bg-[var(--bg-primary)] flex flex-col border-t border-[var(--border)]">
                        <div className="h-11 shrink-0 flex items-center justify-between gap-3 px-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                            <div className="min-w-0 flex items-center gap-2">
                                <Server size={15} className={openClawStatus.state === 'online' ? 'text-emerald-500' : 'text-[var(--text-tertiary)]'} />
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                        {activeOpenClawProfile.name}
                                    </div>
                                    <div className="text-[11px] font-mono text-[var(--text-tertiary)] truncate">
                                        {activeOpenClawProfile.controlUrl}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`hidden sm:inline text-xs ${openClawStatus.state === 'online' ? 'text-emerald-500' : openClawStatus.state === 'checking' ? 'text-[var(--text-secondary)]' : 'text-red-400'}`}>
                                    {openClawStatus.state === 'online'
                                        ? 'Gateway reachable'
                                        : openClawStatus.state === 'checking'
                                            ? 'Checking...'
                                            : 'Gateway unreachable'}
                                </span>
                                <button
                                    onClick={() => {
                                        setOpenClawDashboardIssue(null);
                                        setOpenClawFrameKey(key => key + 1);
                                    }}
                                    className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                                    title="Reload dashboard"
                                >
                                    <RefreshCw size={16} />
                                </button>
                                {window.electron?.restartOpenClawGateway && activeOpenClawProfile?.mode === 'local' && (
                                    <button
                                        onClick={restartOpenClawGateway}
                                        disabled={isRestartingOpenClaw}
                                        className="px-2 py-1.5 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
                                        title="Restart local OpenClaw Gateway"
                                    >
                                        {isRestartingOpenClaw ? 'Restarting...' : 'Restart Gateway'}
                                    </button>
                                )}
                                <button
                                    onClick={openOpenClawExternally}
                                    className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                                    title="Open in browser"
                                >
                                    <ExternalLink size={16} />
                                </button>
                                <button
                                    onClick={() => setShowOpenClawDashboard(false)}
                                    className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                                    title="Close OpenClaw"
                                >
                                    <X size={17} />
                                </button>
                            </div>
                        </div>
                        {openClawStatus.state === 'offline' ? (
                            <div className="flex-1 min-h-0 flex items-center justify-center p-8">
                                <div className="max-w-lg text-center">
                                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center">
                                        <Server size={22} className="text-[var(--text-tertiary)]" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">OpenClaw Gateway is unreachable</h2>
                                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                                        Opal is trying to reach {activeOpenClawProfile.gatewayUrl}. Start the local Gateway or switch to an appliance profile in Settings.
                                    </p>
                                    {openClawStatus.result?.error && (
                                        <p className="mt-3 text-xs font-mono text-red-400">{openClawStatus.result.error}</p>
                                    )}
                                    {window.electron?.restartOpenClawGateway && activeOpenClawProfile?.mode === 'local' && (
                                        <button
                                            type="button"
                                            onClick={restartOpenClawGateway}
                                            disabled={isRestartingOpenClaw}
                                            className="mt-5 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                                        >
                                            <RefreshCw size={15} className={isRestartingOpenClaw ? 'animate-spin' : ''} />
                                            {isRestartingOpenClaw ? 'Restarting Gateway...' : 'Restart Gateway'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : openClawDashboardIssue ? (
                            <div className="flex-1 min-h-0 flex items-center justify-center p-8">
                                <div className="max-w-lg text-center">
                                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center justify-center">
                                        <AlertCircle size={22} className="text-red-400" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">{openClawDashboardIssue.title}</h2>
                                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                                        {openClawDashboardIssue.message}
                                    </p>
                                    <div className="mt-5 flex items-center justify-center gap-2">
                                        {window.electron?.restartOpenClawGateway && activeOpenClawProfile?.mode === 'local' && (
                                            <button
                                                type="button"
                                                onClick={restartOpenClawGateway}
                                                disabled={isRestartingOpenClaw}
                                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                                            >
                                                <RefreshCw size={15} className={isRestartingOpenClaw ? 'animate-spin' : ''} />
                                                {isRestartingOpenClaw ? 'Restarting Gateway...' : 'Restart Gateway'}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setOpenClawDashboardIssue(null);
                                                setOpenClawFrameKey(key => key + 1);
                                            }}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                                        >
                                            <RefreshCw size={15} />
                                            Reload
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : window.electron ? (
                            <webview
                                ref={attachOpenClawWebview}
                                key={`${activeOpenClawProfile.id}-${openClawFrameKey}`}
                                src={activeOpenClawDashboardUrl}
                                title="OpenClaw Dashboard"
                                className="flex-1 min-h-0 w-full border-0 bg-white"
                                partition="persist:opal-openclaw"
                                allowpopups="true"
                            />
                        ) : (
                            <div className="flex-1 min-h-0 flex items-center justify-center p-8">
                                <div className="max-w-lg text-center">
                                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center">
                                        <Server size={22} className="text-[var(--text-tertiary)]" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">OpenClaw requires the desktop app</h2>
                                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                                        OpenClaw blocks iframe embedding. Opal uses an Electron webview in desktop mode to render it safely.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Global Docked Terminal */}
                {showGlobalTerminal && (
                    <div className="h-[34vh] min-h-[200px] shrink-0 border-t border-[var(--border)] shadow-[0_-8px_32px_rgba(0,0,0,0.3)] animate-slide-up">
                        <TerminalPanel onClose={() => setShowGlobalTerminal(false)} />
                    </div>
                )}
            </main>
        </div>
    );
}

function getOpenClawDashboardUrl(profile) {
    if (!profile?.controlUrl) return '';
    if (!profile.token || profile.controlUrl.includes('#token=')) return profile.controlUrl;
    return `${profile.controlUrl.replace(/\/?$/, '/')}#token=${encodeURIComponent(profile.token)}`;
}

export default function App() {
    return (
        <ComposeProviders>
            <AppContent />
        </ComposeProviders>
    );
}

function ComposeProviders({ children }) {
    return (
        <ThemeProvider>
            <BuildModeProvider>
                <BuildProvider>
                    <ChatProvider>
                        {children}
                    </ChatProvider>
                </BuildProvider>
            </BuildModeProvider>
        </ThemeProvider>
    );
}
