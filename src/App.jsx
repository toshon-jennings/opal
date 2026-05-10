import { useEffect, useState } from 'react';
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

import { Moon, Sun, Lock, Unlock, Plus, Terminal as TerminalIcon } from 'lucide-react';
import { useTheme } from './context/ThemeContext';
import { useChat } from './context/ChatContext';
import TerminalPanel from './components/Terminal';

function AppContent() {
    const { currentMode, setCurrentMode } = useMode();
    const { isDarkMode, toggleTheme } = useTheme();
    const { isIncognitoMode, toggleIncognitoMode, createNewChat } = useChat();
    const [showGlobalTerminal, setShowGlobalTerminal] = useState(false);

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
                <div className="flex-1 min-h-0 overflow-hidden relative">
                    <div className="absolute inset-0 overflow-hidden">
                        {currentMode === MODES.CHAT && <ChatMode />}
                        {currentMode === MODES.COWORK && <CoworkMode />}
                        {currentMode === MODES.CODE && <CodeMode />}
                        {currentMode === MODES.BUILD && <BuildMode />}
                    </div>
                </div>
                
                {/* Global Docked Terminal */}
                {showGlobalTerminal && (
                    <div
                        className="absolute bottom-0 right-0 h-[34vh] min-h-[200px] z-[100] animate-slide-up border-t border-l border-[var(--border)] shadow-[0_-8px_32px_rgba(0,0,0,0.3)]"
                        style={{
                            left: 'var(--opal-terminal-left, 0px)',
                        }}
                    >
                        <TerminalPanel onClose={() => setShowGlobalTerminal(false)} />
                    </div>
                )}
            </main>
        </div>
    );
}

import { ThemeProvider } from './context/ThemeContext';

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
