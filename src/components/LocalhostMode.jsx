import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Home, RefreshCw, Settings, Plus, X, Paperclip, Trash2 } from 'lucide-react';
import { readStringStorage, writeStringStorage, removeStorageKey } from '../lib/persistentStore';
import { useTheme } from '../context/ThemeContext';

const QUICK_PORTS = [3000, 5173, 8080, 4200];
const LAST_URL_KEY = 'perci_localhost_last_url';
const HOME_KEY = 'perci_localhost_home';
const ALLOW_HTTP_KEY = 'perci_localhost_allow_http';

function normalizeAddress(raw, forceHttps = false) {
    const value = raw.trim();
    if (!value) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
    if (/^\d+(\/.*)?$/.test(value)) return `http://localhost:${value}`;
    if (value.startsWith('localhost:') || value === 'localhost') return `http://${value}`;
    return forceHttps ? `https://${value}` : `http://${value}`;
}

function addressLabel(url) {
    return url.replace(/^https?:\/\//, '');
}


function LocalhostTab({ id, initialUrl, hidden, onTitleChange, isKlipit, isDarkMode }) {
    const [url, setUrl] = useState(initialUrl);
    const [title, setTitle] = useState(addressLabel(initialUrl) || 'New Tab');
    const [inputValue, setInputValue] = useState(() => addressLabel(initialUrl));
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [navState, setNavState] = useState({ canGoBack: false, canGoForward: false });
    const [homeAddress, setHomeAddress] = useState(() => readStringStorage(HOME_KEY, ''));
    const [homeInput, setHomeInput] = useState(() => addressLabel(readStringStorage(HOME_KEY, '')));
    const [showSettings, setShowSettings] = useState(false);
    const [allowHttp, setAllowHttp] = useState(() => readStringStorage(ALLOW_HTTP_KEY, 'false') === 'true');
    const [klipitId, setKlipitId] = useState(null);
    const [klipitError, setKlipitError] = useState(null);
    const [sidebarWidth, setSidebarWidth] = useState(320); // default 320px
    const isDragging = useRef(false);
    const webviewRef = useRef(null);
    const klipitWebviewRef = useRef(null);

    // Sync Perci's dark mode to the Klipit extension's webview
    useEffect(() => {
        const webview = klipitWebviewRef.current;
        if (!webview || !isKlipit) return;

        const syncTheme = () => {
            try {
                webview.executeJavaScript(`
                    localStorage.setItem('klippit-theme', '${isDarkMode ? 'dark' : 'light'}');
                    if (${isDarkMode}) {
                        document.documentElement.classList.add('theme-dark');
                    } else {
                        document.documentElement.classList.remove('theme-dark');
                    }
                `).catch(err => {
                    // Ignore errors if context is destroyed or not ready
                });
            } catch (err) {
                // Ignore synchronous "WebView must be attached" errors
            }
        };

        const onReady = () => syncTheme();
        webview.addEventListener('dom-ready', onReady);
        webview.addEventListener('did-stop-loading', onReady);
        syncTheme(); // try right away

        return () => {
            webview.removeEventListener('dom-ready', onReady);
            webview.removeEventListener('did-stop-loading', onReady);
        };
    }, [isDarkMode, klipitId, isKlipit]);
    
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging.current) return;
            setSidebarWidth(prev => {
                const newWidth = prev - e.movementX;
                return Math.max(200, Math.min(800, newWidth));
            });
        };
        const handleMouseUp = () => {
            if (isDragging.current) {
                isDragging.current = false;
                document.body.style.cursor = '';
                if (webviewRef.current) webviewRef.current.style.pointerEvents = 'auto';
                const klipitWebview = document.getElementById(`klipit-webview-${id}`);
                if (klipitWebview) klipitWebview.style.pointerEvents = 'auto';
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [id]);

    const handleMouseDown = (e) => {
        e.preventDefault();
        isDragging.current = true;
        document.body.style.cursor = 'col-resize';
        if (webviewRef.current) webviewRef.current.style.pointerEvents = 'none';
        const klipitWebview = document.getElementById(`klipit-webview-${id}`);
        if (klipitWebview) klipitWebview.style.pointerEvents = 'none';
    };

    useEffect(() => {
        if (isKlipit && window.electron?.getKlipitExtensionId) {
            window.electron.getKlipitExtensionId()
                .then(id => {
                    if (id) {
                        setKlipitId(id);
                    } else {
                        setKlipitError('Extension ID returned null. Is it loaded?');
                    }
                })
                .catch(err => setKlipitError(err.message));
        } else if (isKlipit) {
            setKlipitError('window.electron.getKlipitExtensionId is not available');
        }
    }, [isKlipit]);

    const navigate = useCallback((raw) => {
        const next = normalizeAddress(raw, isKlipit);
        if (!next) return;
        
        try {
            const parsed = new URL(next);
            if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1' && !allowHttp) {
                setLoadError('Blocked: Insecure http:// connection. Enable in settings to proceed.');
                setUrl('');
                setInputValue(addressLabel(next));
                return;
            }
        } catch (e) {
            // ignore
        }

        setLoadError(null);
        setUrl(next);
        setInputValue(addressLabel(next));
        if (!hidden) writeStringStorage(LAST_URL_KEY, next);
    }, [hidden, allowHttp]);

    const saveHome = useCallback((raw) => {
        const next = normalizeAddress(raw, isKlipit);
        setHomeAddress(next);
        setHomeInput(addressLabel(next));
        if (next) writeStringStorage(HOME_KEY, next);
        else removeStorageKey(HOME_KEY);
        setShowSettings(false);
    }, []);

    const toggleAllowHttp = useCallback(() => {
        const next = !allowHttp;
        setAllowHttp(next);
        writeStringStorage(ALLOW_HTTP_KEY, next ? 'true' : 'false');
    }, [allowHttp]);

    const goHome = useCallback(() => {
        if (homeAddress) navigate(homeAddress);
    }, [homeAddress, navigate]);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const handleStart = () => { setIsLoading(true); setLoadError(null); };
        const handleStop = () => setIsLoading(false);
        const handleNavigate = (e) => {
            setInputValue(addressLabel(e.url));
            setNavState({ canGoBack: webview.canGoBack(), canGoForward: webview.canGoForward() });
            onTitleChange(id, addressLabel(e.url) || 'New Tab');
        };
        const handleFail = (e) => {
            if (!e.isMainFrame || e.errorCode === -3) return; // ignore sub-frame errors and ERR_ABORTED
            setIsLoading(false);
            setLoadError(e.errorDescription || `Failed to load (code ${e.errorCode})`);
        };
        const handleTitle = (e) => {
            if (e.title) {
                onTitleChange(id, e.title);
                setTitle(e.title);
            }
        };
        const handleWillNavigate = (e) => {
            try {
                const parsed = new URL(e.url);
                if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1' && !allowHttp) {
                    webview.stop();
                    setLoadError(`Blocked: Insecure connection to ${parsed.hostname}`);
                    setUrl('');
                }
            } catch (err) {
                // ignore
            }
        };

        webview.addEventListener('did-start-loading', handleStart);
        webview.addEventListener('did-stop-loading', handleStop);
        webview.addEventListener('did-navigate', handleNavigate);
        webview.addEventListener('did-navigate-in-page', handleNavigate);
        webview.addEventListener('did-fail-load', handleFail);
        webview.addEventListener('page-title-updated', handleTitle);
        webview.addEventListener('will-navigate', handleWillNavigate);

        return () => {
            webview.removeEventListener('did-start-loading', handleStart);
            webview.removeEventListener('did-stop-loading', handleStop);
            webview.removeEventListener('did-navigate', handleNavigate);
            webview.removeEventListener('did-navigate-in-page', handleNavigate);
            webview.removeEventListener('did-fail-load', handleFail);
            webview.removeEventListener('page-title-updated', handleTitle);
            webview.removeEventListener('will-navigate', handleWillNavigate);
        };
    }, [url, id, onTitleChange, allowHttp]);

    const handleSubmit = (e) => {
        e.preventDefault();
        navigate(inputValue);
    };

    return (
        <div className={`h-full w-full flex-col bg-[var(--bg-primary)] ${hidden ? 'hidden' : 'flex'}`}>
            <div className={`flex h-11 shrink-0 items-center gap-1.5 border-b px-2.5 ${isKlipit ? 'border-[#dac39c] dark:border-[#322c20] bg-[#f1e4cf] dark:bg-[#141009]' : 'border-[var(--border)] bg-[var(--bg-secondary)]/40'}`}>
                <button
                    type="button"
                    disabled={!navState.canGoBack}
                    onClick={() => webviewRef.current?.goBack()}
                    className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Back"
                >
                    <ArrowLeft size={15} />
                </button>
                <button
                    type="button"
                    disabled={!navState.canGoForward}
                    onClick={() => webviewRef.current?.goForward()}
                    className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Forward"
                >
                    <ArrowRight size={15} />
                </button>
                <button
                    type="button"
                    disabled={!url}
                    onClick={() => webviewRef.current?.reload()}
                    className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Refresh"
                >
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                </button>
                {!isKlipit && (
                    <button
                        type="button"
                        disabled={!homeAddress}
                        onClick={goHome}
                        className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent"
                        title={homeAddress ? `Home (${addressLabel(homeAddress)})` : 'Set a home address in Settings'}
                    >
                        <Home size={14} />
                    </button>
                )}
                <form onSubmit={handleSubmit} className="min-w-0 flex-1">
                    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${isKlipit ? 'border-[#dac39c] dark:border-[#494030] bg-[#fff8e9] dark:bg-[#211c14]' : 'border-[var(--border)] bg-[var(--bg-primary)]'}`}>
                        <Globe size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            placeholder={isKlipit ? "Enter an address to Klip..." : "Port or address, e.g. 3000 or localhost:5173/app"}
                            className="w-full min-w-0 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                            spellCheck={false}
                        />
                    </div>
                </form>
                <a
                    href={url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { if (!url) e.preventDefault(); }}
                    className={`micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${!url ? 'pointer-events-none opacity-30' : ''}`}
                    title="Open in browser"
                >
                    <ExternalLink size={14} />
                </a>
                <div className="relative">
                    {!isKlipit && (
                        <button
                            type="button"
                            onClick={() => setShowSettings((v) => !v)}
                            className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Localhost settings"
                        >
                            <Settings size={14} />
                        </button>
                    )}
                    {showSettings && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setShowSettings(false)} />
                            <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3 shadow-xl">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Home address</p>
                                <form
                                    onSubmit={(e) => { e.preventDefault(); saveHome(homeInput); }}
                                    className="flex items-center gap-2"
                                >
                                    <input
                                        type="text"
                                        value={homeInput}
                                        onChange={(e) => setHomeInput(e.target.value)}
                                        placeholder="e.g. 3000"
                                        className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                                        spellCheck={false}
                                    />
                                    <button
                                        type="submit"
                                        className="shrink-0 rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                                    >
                                        Save
                                    </button>
                                </form>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    {QUICK_PORTS.map((port) => (
                                        <button
                                            key={port}
                                            type="button"
                                            onClick={() => saveHome(String(port))}
                                            className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                        >
                                            :{port}
                                        </button>
                                    ))}
                                </div>
                                {homeAddress && (
                                    <button
                                        type="button"
                                        onClick={() => saveHome('')}
                                        className="mt-2 text-xs text-[var(--text-tertiary)] transition-colors hover:text-red-400"
                                    >
                                        Clear home
                                    </button>
                                )}
                                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                                    <label className="flex items-start gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={allowHttp} 
                                            onChange={toggleAllowHttp}
                                            className="mt-0.5"
                                        />
                                        <div>
                                            <div className="text-xs font-medium text-[var(--text-primary)]">Allow insecure http://</div>
                                            <div className="text-[10px] text-[var(--text-tertiary)] leading-tight mt-0.5 text-balance">Warning: Disabling secure-by-default may expose data on untrusted networks. Localhost and 127.0.0.1 are always allowed.</div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {loadError && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
                    <span className="truncate">{loadError} — is anything running on this address?</span>
                    <button type="button" onClick={() => webviewRef.current?.reload()} className="shrink-0 font-medium hover:text-red-300">
                        Retry
                    </button>
                </div>
            )}

            <div className="flex flex-1 min-h-0 relative">
                <div className="relative min-h-0 flex-1 bg-white min-w-0">
                    {url ? (
                        <webview
                            ref={webviewRef}
                            src={url}
                            title="Localhost"
                            className="absolute inset-0 h-full w-full border-0"
                            partition="persist:perci-localhost"
                            allowpopups="true"
                        />
                    ) : isKlipit ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
                             style={{
                                 backgroundImage: `url('file:///Users/toshonjennings/Downloads/Cream_paper_texture_teal_ochre_202606220731.jpeg')`,
                                 backgroundSize: 'cover',
                                 backgroundPosition: 'center',
                             }}>
                             <div className="absolute inset-0 bg-black/0 dark:bg-black/70 mix-blend-multiply pointer-events-none transition-colors duration-300" />
                             <div className="p-8 rounded-2xl bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-xl flex flex-col items-center relative z-10">
                                 <Paperclip size={32} className="text-[#126d62] dark:text-[#5ec4b2] mb-4" />
                                 <h2 className="text-xl font-medium text-[#251d17] dark:text-[#f0e9da] mb-2 font-serif" style={{ fontFamily: '"Fraunces", ui-serif, Georgia, serif' }}>What would you like to Klip today?</h2>
                                 <p className="text-sm text-[#695442] dark:text-[#b3a994] max-w-sm text-balance">
                                     Enter an address above to preview a page. Use the sidebar to clip it securely into your commonplace book.
                                 </p>
                             </div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] p-8">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                                <Globe size={22} className="text-[var(--text-tertiary)]" />
                            </div>
                            <p className="text-sm text-[var(--text-secondary)]">Point this at any local dev server</p>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                {QUICK_PORTS.map((port) => (
                                    <button
                                        key={port}
                                        type="button"
                                        onClick={() => navigate(String(port))}
                                        className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                    >
                                        :{port}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                {isKlipit && (
                    <>
                        <div 
                            className="absolute top-0 bottom-0 z-30 cursor-col-resize bg-transparent hover:bg-pink-500/50 active:bg-pink-500 transition-colors"
                            style={{ 
                                right: sidebarWidth - 6,
                                width: 12,
                                WebkitAppRegion: 'no-drag'
                            }}
                            onMouseDown={handleMouseDown}
                        />
                        <div 
                            style={{ width: sidebarWidth }}
                            className="flex-shrink-0 border-l border-[var(--border)] flex flex-col z-10 overflow-hidden shadow-[-4px_0_15px_rgba(0,0,0,0.1)] bg-[var(--bg-secondary)] relative"
                        >
                            {klipitError ? (
                                <div className="p-6 text-red-500 font-medium text-sm flex flex-col gap-2">
                                    <strong>Klipit Load Error:</strong>
                                    <span>{klipitError}</span>
                                </div>
                            ) : !klipitId ? (
                                <div className="p-6 text-[var(--text-tertiary)] font-medium text-sm">
                                    Loading Klipit Extension...
                                </div>
                            ) : (
                                <webview
                                    id={`klipit-webview-${id}`}
                                    ref={klipitWebviewRef}
                                    src={`chrome-extension://${klipitId}/src/sidepanel.html`}
                                    className="w-full h-full border-0 bg-white"
                                    partition="persist:perci-localhost"
                                />
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function LocalhostMode({ isKlipit }) {
    const isElectron = !!window.electron;
    const { isDarkMode } = useTheme();
    const [tabs, setTabs] = useState(() => {
        const savedUrl = readStringStorage(LAST_URL_KEY, '');
        return [{ id: Date.now().toString(), url: savedUrl, title: addressLabel(savedUrl) || 'New Tab' }];
    });
    const [activeTabId, setActiveTabId] = useState(tabs[0].id);

    const handleTitleChange = useCallback((id, title) => {
        setTabs(currentTabs => currentTabs.map(t => t.id === id ? { ...t, title } : t));
    }, []);

    if (!isElectron) {
        return (
            <div className="h-full w-full flex items-center justify-center p-8">
                <div className="max-w-lg text-center">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center">
                        <Globe size={22} className="text-[var(--text-tertiary)]" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Localhost requires the desktop app</h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Embedding local dev servers needs Electron's webview. Open Perci from the desktop app to use this.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col bg-[var(--bg-primary)]">
            <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)]/30 px-2 pt-2">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`group relative flex h-8 min-w-[120px] max-w-[200px] cursor-pointer items-center justify-between gap-2 rounded-t-lg border-x border-t px-3 text-xs transition-colors ${
                            tab.id === activeTabId
                                ? 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]'
                                : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                        }`}
                        onClick={() => setActiveTabId(tab.id)}
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <Globe size={12} className={tab.id === activeTabId ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'} />
                            <span className="truncate">{tab.title}</span>
                        </div>
                        {tabs.length > 1 && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const nextTabs = tabs.filter(t => t.id !== tab.id);
                                    if (tab.id === activeTabId) {
                                        setActiveTabId(nextTabs[nextTabs.length - 1].id);
                                    }
                                    setTabs(nextTabs);
                                }}
                                className="invisible shrink-0 rounded-md p-0.5 hover:bg-[var(--bg-hover)] group-hover:visible"
                                title="Close tab"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => {
                        const newId = Date.now().toString();
                        setTabs([...tabs, { id: newId, url: '', title: 'New Tab' }]);
                        setActiveTabId(newId);
                    }}
                    className="ml-1 mb-1 rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    title="New tab"
                >
                    <Plus size={14} />
                </button>
            </div>
            
            <div className="relative min-h-0 flex-1">
                {tabs.map((tab) => (
                    <LocalhostTab
                        key={tab.id}
                        id={tab.id}
                        initialUrl={tab.url}
                        hidden={tab.id !== activeTabId}
                        onTitleChange={handleTitleChange}
                        isKlipit={isKlipit}
                        isDarkMode={isDarkMode}
                    />
                ))}
            </div>
        </div>
    );
}
