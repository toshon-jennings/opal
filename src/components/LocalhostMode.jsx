import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Home, RefreshCw, Settings, Plus, X } from 'lucide-react';
import { readStringStorage } from '../lib/persistentStore';

const QUICK_PORTS = [3000, 5173, 8080, 4200];
const LAST_URL_KEY = 'perci_localhost_last_url';
const HOME_KEY = 'perci_localhost_home';

function normalizeAddress(raw) {
    const value = raw.trim();
    if (!value) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
    if (/^\d+(\/.*)?$/.test(value)) return `http://localhost:${value}`;
    return `http://${value}`;
}

function addressLabel(url) {
    return url.replace(/^https?:\/\//, '');
}

function LocalhostTab({ id, initialUrl, hidden, onTitleChange }) {
    const [url, setUrl] = useState(initialUrl);
    const [inputValue, setInputValue] = useState(() => addressLabel(initialUrl));
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [navState, setNavState] = useState({ canGoBack: false, canGoForward: false });
    const [homeAddress, setHomeAddress] = useState(() => readStringStorage(HOME_KEY, ''));
    const [homeInput, setHomeInput] = useState(() => addressLabel(readStringStorage(HOME_KEY, '')));
    const [showSettings, setShowSettings] = useState(false);
    const webviewRef = useRef(null);

    const navigate = useCallback((raw) => {
        const next = normalizeAddress(raw);
        if (!next) return;
        setLoadError(null);
        setUrl(next);
        setInputValue(addressLabel(next));
        if (!hidden) localStorage.setItem(LAST_URL_KEY, next);
    }, [hidden]);

    const saveHome = useCallback((raw) => {
        const next = normalizeAddress(raw);
        setHomeAddress(next);
        setHomeInput(addressLabel(next));
        if (next) localStorage.setItem(HOME_KEY, next);
        else localStorage.removeItem(HOME_KEY);
        setShowSettings(false);
    }, []);

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
            if (e.title) onTitleChange(id, e.title);
        };

        webview.addEventListener('did-start-loading', handleStart);
        webview.addEventListener('did-stop-loading', handleStop);
        webview.addEventListener('did-navigate', handleNavigate);
        webview.addEventListener('did-navigate-in-page', handleNavigate);
        webview.addEventListener('did-fail-load', handleFail);
        webview.addEventListener('page-title-updated', handleTitle);

        return () => {
            webview.removeEventListener('did-start-loading', handleStart);
            webview.removeEventListener('did-stop-loading', handleStop);
            webview.removeEventListener('did-navigate', handleNavigate);
            webview.removeEventListener('did-navigate-in-page', handleNavigate);
            webview.removeEventListener('did-fail-load', handleFail);
            webview.removeEventListener('page-title-updated', handleTitle);
        };
    }, [url, id, onTitleChange]);

    const handleSubmit = (e) => {
        e.preventDefault();
        navigate(inputValue);
    };

    return (
        <div className={`h-full w-full flex-col bg-[var(--bg-primary)] ${hidden ? 'hidden' : 'flex'}`}>
            <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]/40 px-2.5">
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
                <button
                    type="button"
                    disabled={!homeAddress}
                    onClick={goHome}
                    className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent"
                    title={homeAddress ? `Home (${addressLabel(homeAddress)})` : 'Set a home address in Settings'}
                >
                    <Home size={14} />
                </button>
                <form onSubmit={handleSubmit} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5">
                        <Globe size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            placeholder="Port or address, e.g. 3000 or localhost:5173/app"
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
                    <button
                        type="button"
                        onClick={() => setShowSettings((v) => !v)}
                        className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Localhost settings"
                    >
                        <Settings size={14} />
                    </button>
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

            <div className="relative min-h-0 flex-1 bg-white">
                {url ? (
                    <webview
                        ref={webviewRef}
                        src={url}
                        title="Localhost"
                        className="absolute inset-0 h-full w-full border-0"
                        partition="persist:perci-localhost"
                        allowpopups="true"
                    />
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
        </div>
    );
}

export default function LocalhostMode() {
    const isElectron = !!window.electron;
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
                    />
                ))}
            </div>
        </div>
    );
}
