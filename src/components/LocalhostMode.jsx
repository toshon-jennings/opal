import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ExternalLink, Globe, Home, RefreshCw, Settings, Plus, X, PanelRight, Radar, Play, ChevronDown, ChevronUp, Bookmark, Star, Search, History, Trash2, Pin } from 'lucide-react';
import { readStringStorage, writeStringStorage, removeStorageKey } from '../lib/persistentStore';
import { useTheme } from '../context/ThemeContext';
import { useMode, MODES } from '../context/ModeContext';
import klipitLogo from '../assets/klipit-logo.png';
import localhostBg from '../assets/localhost-bg.jpeg';
import lhLogo from '../assets/lh-logo.png';
import lighthouseBg from '../assets/lighthouse-bg.jpg';

const QUICK_PORTS = [3000, 5173, 8080, 4200];
const MAX_HISTORY_ITEMS = 80;
const MAX_PINNED_TABS = 24;

const PROCESS_NAME_MAP = {
  'com.docke': 'Docker Desktop', 'Docker': 'Docker Desktop', 'docker': 'Docker',
  'ControlCe': 'AirPlay Receiver', 'rapportd': 'AirPlay / Handoff',
  'LM Studio': 'LM Studio', 'node': 'Node.js', 'node.exe': 'Node.js',
  'next-server': 'Next.js', 'next-dev': 'Next.js (dev)', 'vite': 'Vite',
  'python3.1': 'Hermes Agent', 'python3': 'Python', 'python': 'Python',
  'ollama': 'Ollama', 'Ollama': 'Ollama', 'keybase': 'Keybase',
  'kbfs': 'Keybase FS', 'Raycast': 'Raycast', 'Electron': 'Electron',
  'Antigravi': 'Antigravity', 'app_inkwe': 'Inkweasel',
  'language_': 'Language Server', 'lmlink-co': 'LM Link',
  'Mountain': 'Mountain', 'sshd': 'SSH', 'postgres': 'PostgreSQL',
  'redis-server': 'Redis', 'nginx': 'nginx',
};

function friendlyProcessName(raw) {
  if (!raw) return '';
  const name = String(raw).split('/').pop();
  if (PROCESS_NAME_MAP[name]) return PROCESS_NAME_MAP[name];
  const base = name.replace(/\d+(\.\d+)*$/, '').toLowerCase();
  if (base === 'python') return 'Python';
  if (base === 'node') return 'Node.js';
  return name;
}

// Only show ports bound to localhost — the ones useful for an embedded browser
function isLocalhostPort(p) {
  const bind = (p.bind_address || '').toLowerCase();
  return (
    bind === '127.0.0.1' ||
    bind === '::1' ||
    bind === 'localhost' ||
    bind === '0.0.0.0' ||
    bind === '::' ||
    bind === ''
  );
}

const getStorageKeys = (isKlipit) => ({
    LAST_URL: isKlipit ? 'perci_klipit_last_url' : 'perci_localhost_last_url',
    HOME: isKlipit ? 'perci_klipit_home' : 'perci_localhost_home',
    ALLOW_HTTP: isKlipit ? 'perci_klipit_allow_http' : 'perci_localhost_allow_http',
    BOOKMARKS: isKlipit ? 'perci_klipit_bookmarks' : 'perci_localhost_bookmarks',
    HISTORY: isKlipit ? 'perci_klipit_history' : 'perci_localhost_history',
    SEARCH_ENGINE: isKlipit ? 'perci_klipit_search' : 'perci_localhost_search',
    PINNED_TABS: isKlipit ? 'perci_klipit_pinned_tabs' : 'perci_localhost_pinned_tabs',
});

function createTabId() {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readPinnedTabs(key) {
    try {
        const parsed = JSON.parse(readStringStorage(key, '[]'));
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((tab) => tab && typeof tab.url === 'string' && tab.url.trim())
            .map((tab) => ({
                id: createTabId(),
                url: tab.url.trim(),
                title: typeof tab.title === 'string' && tab.title.trim()
                    ? tab.title.trim()
                    : addressLabel(tab.url.trim()) || 'Pinned Tab',
                pinned: true,
            }))
            .slice(0, MAX_PINNED_TABS);
    } catch {
        return [];
    }
}

function readHistoryEntries(key) {
    try {
        const parsed = JSON.parse(readStringStorage(key, '[]'));
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry) => entry && typeof entry.url === 'string' && entry.url.trim())
            .map((entry) => ({
                url: entry.url,
                title: typeof entry.title === 'string' ? entry.title : '',
                visitedAt: Number.isFinite(entry.visitedAt) ? entry.visitedAt : 0,
            }))
            .slice(0, MAX_HISTORY_ITEMS);
    } catch {
        return [];
    }
}

function normalizeAddress(raw, engine = 'google') {
    const value = raw.trim();
    if (!value) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
    if (/^\d+(\/.*)?$/.test(value)) return `http://localhost:${value}`;
    if (value.startsWith('localhost:') || value === 'localhost') return `http://${value}`;
    if (value.includes(' ') || !value.includes('.')) {
        if (engine === 'duckduckgo') return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
        return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
    }
    return `https://${value}`;
}

function addressLabel(url) {
    return url.replace(/^https?:\/\//, '');
}


function LocalhostTab({ id, initialUrl, hidden, onTitleChange, onUrlChange, isKlipit, isDarkMode, onNewTab }) {
    const keys = useMemo(() => getStorageKeys(isKlipit), [isKlipit]);
    const [url, setUrl] = useState(initialUrl);
    const [title, setTitle] = useState(addressLabel(initialUrl) || 'New Tab');
    const [inputValue, setInputValue] = useState(() => addressLabel(initialUrl));
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [navState, setNavState] = useState({ canGoBack: false, canGoForward: false });
    const [homeAddress, setHomeAddress] = useState(() => readStringStorage(keys.HOME, ''));
    const [homeInput, setHomeInput] = useState(() => addressLabel(readStringStorage(keys.HOME, '')));
    const [showSettings, setShowSettings] = useState(false);
    const [allowHttp, setAllowHttp] = useState(() => readStringStorage(keys.ALLOW_HTTP, 'false') === 'true');
    const [bookmarks, setBookmarks] = useState(() => {
        try {
            return JSON.parse(readStringStorage(keys.BOOKMARKS, '[]'));
        } catch {
            return [];
        }
    });
    const [showBookmarks, setShowBookmarks] = useState(false);
    const [historyEntries, setHistoryEntries] = useState(() => readHistoryEntries(keys.HISTORY));
    const [showHistory, setShowHistory] = useState(false);
    const [searchEngine, setSearchEngine] = useState(() => readStringStorage(keys.SEARCH_ENGINE, 'google'));
    const [showFindBar, setShowFindBar] = useState(false);
    const [findText, setFindText] = useState('');
    const [findResult, setFindResult] = useState({ activeMatchOrdinal: 0, matches: 0 });
    const findInputRef = useRef(null);
    const [klipitId, setKlipitId] = useState(null);
    const [klipitError, setKlipitError] = useState(null);
    const [sidebarWidth, setSidebarWidth] = useState(320); // default 320px
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const isDragging = useRef(false);
    const webviewRef = useRef(null);
    const klipitWebviewRef = useRef(null);

    useEffect(() => {
        setHistoryEntries(readHistoryEntries(keys.HISTORY));
    }, [keys.HISTORY]);

    // Sync Perci's dark mode to the Klipit extension's webview
    useEffect(() => {
        const webview = klipitWebviewRef.current;
        if (!webview || !isKlipit) return;

        const handleContextMenu = (e) => {
            e.preventDefault();
            if (window.electron?.showContextMenu) {
                window.electron.showContextMenu({ ...e.params, target: 'klipit' });
            }
        };

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
        webview.addEventListener('context-menu', handleContextMenu);
        syncTheme(); // try right away

        return () => {
            webview.removeEventListener('dom-ready', onReady);
            webview.removeEventListener('did-stop-loading', onReady);
            webview.removeEventListener('context-menu', handleContextMenu);
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

    useEffect(() => {
        if (!window.electron?.onContextMenuAction) return;
        const unlisten = window.electron.onContextMenuAction((data) => {
            const myTarget = isKlipit ? 'klipit' : id;
            if (data.target !== myTarget) return;

            const wv = isKlipit ? klipitWebviewRef.current : webviewRef.current;
            if (!wv) return;
            
            if (data.action === 'open-new-tab' && onNewTab) {
                console.log('[LocalhostTab] Open in new tab called with URL:', data.url);
                onNewTab(data.url);
                return;
            }

            if (data.action === 'back') wv.goBack();
            else if (data.action === 'forward') wv.goForward();
            else if (data.action === 'reload') wv.reload();
            else if (data.action === 'inspect') wv.inspectElement(data.x, data.y);
        });
        return unlisten;
    }, [id, isKlipit, onNewTab]);

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

    const toggleBookmark = useCallback(() => {
        if (!url) return;
        setBookmarks(prev => {
            const exists = prev.some(b => b.url === url);
            const next = exists ? prev.filter(b => b.url !== url) : [...prev, { url, title: title || url }];
            writeStringStorage(keys.BOOKMARKS, JSON.stringify(next));
            return next;
        });
    }, [url, title, keys.BOOKMARKS]);

    const addHistoryEntry = useCallback((entryUrl, entryTitle = '') => {
        const normalizedUrl = typeof entryUrl === 'string' ? entryUrl.trim() : '';
        if (!normalizedUrl) return;

        setHistoryEntries((prev) => {
            const deduped = prev.filter((entry) => entry.url !== normalizedUrl);
            const next = [
                {
                    url: normalizedUrl,
                    title: entryTitle || addressLabel(normalizedUrl),
                    visitedAt: Date.now(),
                },
                ...deduped,
            ].slice(0, MAX_HISTORY_ITEMS);
            writeStringStorage(keys.HISTORY, JSON.stringify(next));
            return next;
        });
    }, [keys.HISTORY]);

    const removeHistoryEntry = useCallback((entryUrl) => {
        setHistoryEntries((prev) => {
            const next = prev.filter((entry) => entry.url !== entryUrl);
            writeStringStorage(keys.HISTORY, JSON.stringify(next));
            return next;
        });
    }, [keys.HISTORY]);

    const clearHistory = useCallback(() => {
        setHistoryEntries([]);
        writeStringStorage(keys.HISTORY, '[]');
    }, [keys.HISTORY]);

    const isBookmarked = useMemo(() => bookmarks.some(b => b.url === url), [bookmarks, url]);

    // Handle Find in Page
    useEffect(() => {
        if (hidden) return;
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setShowFindBar(true);
                setTimeout(() => findInputRef.current?.focus(), 50);
            } else if (e.key === 'Escape' && showFindBar) {
                setShowFindBar(false);
                try {
                    webviewRef.current?.stopFindInPage('clearSelection');
                } catch (err) {
                    // Ignore
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hidden, showFindBar]);

    const handleFindNext = useCallback((forward = true) => {
        if (!findText) return;
        try {
            webviewRef.current?.findInPage(findText, { forward, findNext: true });
        } catch (e) {
            // Webview might not be ready
        }
    }, [findText]);

    useEffect(() => {
        if (showFindBar && findText) {
            try {
                webviewRef.current?.findInPage(findText);
            } catch (e) {
                // Ignore
            }
        } else if (!showFindBar) {
            try {
                webviewRef.current?.stopFindInPage('clearSelection');
            } catch (e) {
                // Ignore
            }
            setFindResult({ activeMatchOrdinal: 0, matches: 0 });
        }
    }, [findText, showFindBar]);

    const navigate = useCallback((raw) => {
        const next = normalizeAddress(raw, searchEngine);
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
        onUrlChange?.(id, next, addressLabel(next) || 'New Tab');
        if (!hidden) writeStringStorage(keys.LAST_URL, next);
    }, [hidden, allowHttp, keys.LAST_URL, searchEngine, id, onUrlChange]);

    const saveHome = useCallback((raw) => {
        const next = normalizeAddress(raw);
        setHomeAddress(next);
        setHomeInput(addressLabel(next));
        if (next) writeStringStorage(keys.HOME, next);
        else removeStorageKey(keys.HOME);
        setShowSettings(false);
    }, [keys.HOME]);

    const toggleAllowHttp = useCallback(() => {
        const next = !allowHttp;
        setAllowHttp(next);
        writeStringStorage(keys.ALLOW_HTTP, next ? 'true' : 'false');
    }, [allowHttp, keys.ALLOW_HTTP]);

    const goHome = useCallback(() => {
        if (homeAddress) navigate(homeAddress);
    }, [homeAddress, navigate]);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const handleStart = () => { setIsLoading(true); setLoadError(null); };
        const handleStop = () => setIsLoading(false);
        const handleNavigate = (e) => {
            if (e.isMainFrame === false) return; // ignore sub-frame navigations (e.g. iframe embeds)
            setUrl(e.url);
            setInputValue(addressLabel(e.url));
            setNavState({ canGoBack: webview.canGoBack(), canGoForward: webview.canGoForward() });
            if (!hidden) writeStringStorage(keys.LAST_URL, e.url);
            const fallbackTitle = addressLabel(e.url) || 'New Tab';
            setTitle(fallbackTitle);
            onUrlChange?.(id, e.url, fallbackTitle);
            onTitleChange(id, fallbackTitle);
            addHistoryEntry(e.url, fallbackTitle);
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
                const currentUrl = webview.getURL?.();
                if (currentUrl) onUrlChange?.(id, currentUrl, e.title);
                if (currentUrl) addHistoryEntry(currentUrl, e.title);
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
        const myTarget = isKlipit ? 'klipit' : id;

        const handleContextMenu = (e) => {
            e.preventDefault();
            if (window.electron?.showContextMenu) {
                window.electron.showContextMenu({ ...e.params, target: myTarget });
            }
        };
        const handleNewWindow = (e) => {
            e.preventDefault();
            if (onNewTab) onNewTab(e.url);
        };

        const handleFoundInPage = (e) => {
            setFindResult({
                activeMatchOrdinal: e.result.activeMatchOrdinal,
                matches: e.result.matches
            });
        };

        webview.addEventListener('did-start-loading', handleStart);
        webview.addEventListener('did-stop-loading', handleStop);
        webview.addEventListener('did-navigate', handleNavigate);
        webview.addEventListener('did-navigate-in-page', handleNavigate);
        webview.addEventListener('did-fail-load', handleFail);
        webview.addEventListener('page-title-updated', handleTitle);
        webview.addEventListener('will-navigate', handleWillNavigate);
        webview.addEventListener('context-menu', handleContextMenu);
        webview.addEventListener('new-window', handleNewWindow);
        webview.addEventListener('found-in-page', handleFoundInPage);

        return () => {
            webview.removeEventListener('did-start-loading', handleStart);
            webview.removeEventListener('did-stop-loading', handleStop);
            webview.removeEventListener('did-navigate', handleNavigate);
            webview.removeEventListener('did-navigate-in-page', handleNavigate);
            webview.removeEventListener('did-fail-load', handleFail);
            webview.removeEventListener('page-title-updated', handleTitle);
            webview.removeEventListener('will-navigate', handleWillNavigate);
            webview.removeEventListener('context-menu', handleContextMenu);
            webview.removeEventListener('new-window', handleNewWindow);
            webview.removeEventListener('found-in-page', handleFoundInPage);
        };
    }, [id, onTitleChange, onUrlChange, allowHttp, hidden, keys.LAST_URL, addHistoryEntry, isKlipit, onNewTab]);

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
                <button
                    type="button"
                    disabled={!homeAddress}
                    onClick={goHome}
                    className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-transparent"
                    title={homeAddress ? `Home (${addressLabel(homeAddress)})` : 'Set a home address in Settings'}
                >
                    <Home size={14} />
                </button>
                <button
                    type="button"
                    disabled={!url}
                    onClick={toggleBookmark}
                    className={`micro-interaction rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:hover:bg-transparent ${isBookmarked ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                    title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                >
                    <Star size={14} className={isBookmarked ? 'fill-current' : ''} />
                </button>
                <form onSubmit={handleSubmit} className="min-w-0 flex-1">
                    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${isKlipit ? 'border-[#dac39c] dark:border-[#494030] bg-[#fff8e9] dark:bg-[#211c14]' : 'border-[var(--border)] bg-[var(--bg-primary)]'}`}>
                        <Globe size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            placeholder={isKlipit ? "Search or enter an address..." : "Port or address, e.g. 3000 or localhost:5173"}
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
                {isKlipit && (
                    <button
                        type="button"
                        onClick={() => setIsSidebarOpen(o => !o)}
                        className={`micro-interaction rounded-md p-1.5 transition-colors ${isSidebarOpen ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}
                        title={isSidebarOpen ? "Hide Klipit" : "Show Klipit"}
                    >
                        <PanelRight size={14} />
                    </button>
                )}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setShowHistory(false);
                            setShowSettings(false);
                            setShowBookmarks((v) => !v);
                        }}
                        className={`micro-interaction rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)] ${showBookmarks ? 'text-[var(--text-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                        title="Bookmarks"
                    >
                        <Bookmark size={14} />
                    </button>
                    {showBookmarks && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setShowBookmarks(false)} />
                            <div className="absolute right-0 top-full z-30 mt-2 w-64 max-h-96 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 shadow-xl">
                                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Bookmarks</p>
                                {bookmarks.length === 0 ? (
                                    <p className="px-1 py-2 text-xs text-[var(--text-tertiary)]">No bookmarks yet. Click the star icon to save pages.</p>
                                ) : (
                                    <div className="flex flex-col gap-0.5">
                                        {bookmarks.map((bm, i) => (
                                            <div key={i} className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-[var(--bg-hover)]">
                                                <button
                                                    type="button"
                                                    className="flex-1 truncate text-left text-xs text-[var(--text-primary)]"
                                                    onClick={() => { navigate(bm.url); setShowBookmarks(false); }}
                                                    title={bm.url}
                                                >
                                                    {bm.title || bm.url}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="invisible p-1 text-[var(--text-tertiary)] hover:text-red-400 group-hover:visible"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setBookmarks(prev => {
                                                            const next = prev.filter(b => b.url !== bm.url);
                                                            writeStringStorage(keys.BOOKMARKS, JSON.stringify(next));
                                                            return next;
                                                        });
                                                    }}
                                                    title="Remove"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setShowBookmarks(false);
                            setShowSettings(false);
                            if (!showHistory) setHistoryEntries(readHistoryEntries(keys.HISTORY));
                            setShowHistory((v) => !v);
                        }}
                        className={`micro-interaction rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)] ${showHistory ? 'text-[var(--text-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                        title="History"
                    >
                        <History size={14} />
                    </button>
                    {showHistory && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setShowHistory(false)} />
                            <div className="absolute right-0 top-full z-30 mt-2 w-72 max-h-96 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 shadow-xl">
                                <div className="mb-2 flex items-center justify-between px-1">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">History</p>
                                    {historyEntries.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={clearHistory}
                                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-red-400"
                                            title="Clear history"
                                        >
                                            <Trash2 size={10} />
                                            Clear
                                        </button>
                                    )}
                                </div>
                                {historyEntries.length === 0 ? (
                                    <p className="px-1 py-2 text-xs text-[var(--text-tertiary)]">No history yet.</p>
                                ) : (
                                    <div className="flex flex-col gap-0.5">
                                        {historyEntries.map((entry, i) => (
                                            <div key={`${entry.url}-${entry.visitedAt || i}`} className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-[var(--bg-hover)]">
                                                <button
                                                    type="button"
                                                    className="min-w-0 flex-1 text-left"
                                                    onClick={() => { navigate(entry.url); setShowHistory(false); }}
                                                    title={entry.url}
                                                >
                                                    <p className="truncate text-xs text-[var(--text-primary)]">{entry.title || addressLabel(entry.url)}</p>
                                                    <p className="truncate text-[10px] text-[var(--text-tertiary)]">{entry.url}</p>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="invisible rounded p-1 text-[var(--text-tertiary)] transition-colors hover:text-red-400 group-hover:visible"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeHistoryEntry(entry.url);
                                                    }}
                                                    title="Remove"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setShowBookmarks(false);
                            setShowHistory(false);
                            setShowSettings((v) => !v);
                        }}
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
                                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Search Engine</p>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => { setSearchEngine('google'); writeStringStorage(keys.SEARCH_ENGINE, 'google'); }}
                                            className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${searchEngine === 'google' ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                                        >
                                            Google
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => { setSearchEngine('duckduckgo'); writeStringStorage(keys.SEARCH_ENGINE, 'duckduckgo'); }}
                                            className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${searchEngine === 'duckduckgo' ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                                        >
                                            DuckDuckGo
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {loadError && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
                    <span className="truncate">{loadError}</span>
                    <button type="button" onClick={() => webviewRef.current?.reload()} className="shrink-0 font-medium hover:text-red-300">
                        Retry
                    </button>
                </div>
            )}

            <div className="flex flex-1 min-h-0 relative">
                <div className="relative min-h-0 flex-1 bg-white min-w-0">
                    {showFindBar && (
                        <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-1.5 shadow-lg">
                            <Search size={12} className="ml-1 text-[var(--text-tertiary)]" />
                            <input
                                ref={findInputRef}
                                type="text"
                                value={findText}
                                onChange={(e) => setFindText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleFindNext(!e.shiftKey);
                                }}
                                placeholder="Find in page..."
                                className="w-40 bg-transparent px-1 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                            />
                            <span className="text-xs text-[var(--text-tertiary)] w-10 text-right">
                                {findResult.matches > 0 ? `${findResult.activeMatchOrdinal}/${findResult.matches}` : '0/0'}
                            </span>
                            <div className="ml-1 flex items-center gap-0.5 border-l border-[var(--border)] pl-1.5">
                                <button type="button" onClick={() => handleFindNext(false)} className="rounded-md p-1 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"><ArrowUp size={14} /></button>
                                <button type="button" onClick={() => handleFindNext(true)} className="rounded-md p-1 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"><ArrowDown size={14} /></button>
                                <button type="button" onClick={() => setShowFindBar(false)} className="ml-1 rounded-md p-1 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"><X size={14} /></button>
                            </div>
                        </div>
                    )}
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
                                 <img src={klipitLogo} alt="Klipit Logo" className="w-12 h-12 object-contain mb-4 filter drop-shadow-md brightness-90 contrast-125" />
                                 <h2 className="text-xl font-medium text-[#251d17] dark:text-[#f0e9da] mb-2 font-serif" style={{ fontFamily: '"Fraunces", ui-serif, Georgia, serif' }}>What would you like to Klip today?</h2>
                                 <p className="text-sm text-[#695442] dark:text-[#b3a994] max-w-sm text-balance">
                                     Enter an address above to preview a page. Use the sidebar to clip it securely into your commonplace book.
                                 </p>
                             </div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[var(--bg-primary)]">
                            <div 
                                className="absolute inset-0 opacity-[0.15] dark:opacity-[0.05] pointer-events-none transition-opacity"
                                style={{
                                    backgroundImage: `url(${localhostBg})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    filter: 'grayscale(100%) contrast(120%)',
                                }}
                            />
                            <div className="relative z-10 flex flex-col items-center justify-center gap-4">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-sm backdrop-blur-md bg-opacity-80">
                                    <Globe size={26} className="text-[var(--text-tertiary)]" />
                                </div>
                                <p className="text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-primary)]/50 px-3 py-1 rounded-full backdrop-blur-md">Point this at any local dev server</p>
                                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
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
                        </div>
                    )}
                </div>
                {isKlipit && isSidebarOpen && (
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
    const { openWindow } = useMode();
    const storageKeys = useMemo(() => getStorageKeys(isKlipit), [isKlipit]);
    const [tabs, setTabs] = useState(() => {
        const pinnedTabs = readPinnedTabs(storageKeys.PINNED_TABS);
        if (pinnedTabs.length > 0) return pinnedTabs;
        const savedUrl = readStringStorage(storageKeys.LAST_URL, '');
        return [{ id: createTabId(), url: savedUrl, title: addressLabel(savedUrl) || 'New Tab', pinned: false }];
    });
    const [activeTabId, setActiveTabId] = useState(tabs[0].id);
    const [draggedTabId, setDraggedTabId] = useState(null);

    // ── Lighthouse discovered servers ──────────────────────────────────
    const [discoveredServers, setDiscoveredServers] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [lastScanTime, setLastScanTime] = useState(null);
    const [serversCollapsed, setServersCollapsed] = useState(true);
    const scanSeqRef = useRef(0);

    const scanForServers = useCallback(async () => {
        if (!window.electron?.lighthouseScan) return;
        const seq = ++scanSeqRef.current;
        setScanning(true);
        try {
            const result = await window.electron.lighthouseScan();
            if (seq !== scanSeqRef.current) return;
            const servers = (result.ports || [])
                .filter(isLocalhostPort)
                .sort((a, b) => Number(a.port || 0) - Number(b.port || 0));
            setDiscoveredServers(servers);
            setLastScanTime(result.last_scan || null);
        } catch (err) {
            console.error('[LocalhostMode] Lighthouse scan failed:', err);
        } finally {
            if (seq === scanSeqRef.current) {
                setScanning(false);
            }
        }
    }, []);

    // Auto-scan on mount
    useEffect(() => {
        scanForServers();
    }, [scanForServers]);

    useEffect(() => {
        const pinnedTabs = tabs
            .filter((tab) => tab.pinned && tab.url)
            .map((tab) => ({
                url: tab.url,
                title: tab.title || addressLabel(tab.url) || 'Pinned Tab',
            }))
            .slice(0, MAX_PINNED_TABS);
        writeStringStorage(storageKeys.PINNED_TABS, JSON.stringify(pinnedTabs));
    }, [tabs, storageKeys.PINNED_TABS]);

    const handleTitleChange = useCallback((id, title) => {
        setTabs(currentTabs => currentTabs.map(t => t.id === id ? { ...t, title } : t));
    }, []);

    const handleUrlChange = useCallback((id, url, title) => {
        setTabs(currentTabs => currentTabs.map(t => (
            t.id === id
                ? { ...t, url, title: title || t.title || addressLabel(url) || 'New Tab' }
                : t
        )));
    }, []);

    const handleNewTab = useCallback((url) => {
        console.log('[LocalhostMode] Creating new tab with URL:', url);
        const newId = createTabId();
        setTabs(prev => [...prev, { id: newId, url, title: addressLabel(url || '') || 'New Tab', pinned: false }]);
        setActiveTabId(newId);
    }, []);

    const togglePinnedTab = useCallback((id) => {
        setTabs((currentTabs) => {
            const nextTabs = currentTabs.map((tab) => (
                tab.id === id ? { ...tab, pinned: !tab.pinned } : tab
            ));
            return [
                ...nextTabs.filter((tab) => tab.pinned),
                ...nextTabs.filter((tab) => !tab.pinned),
            ];
        });
    }, []);

    // Open a discovered server into a new tab
    const openDiscovered = useCallback((port) => {
        const url = `http://localhost:${port}`;
        handleNewTab(url);
    }, [handleNewTab]);

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
            {/* Lighthouse launcher — matches Dashboard tile style */}
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]/30">
                <button
                    type="button"
                    onClick={() => openWindow(MODES.LIGHTHOUSE)}
                    className="lh-localhost-tile group relative flex w-full items-center gap-3 overflow-hidden px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]/40"
                    title="Open Lighthouse — port scanner & conflict detector"
                >
                    {/* Artwork background */}
                    <span
                        className="lh-localhost-art absolute inset-0 -z-10 opacity-20 transition-opacity group-hover:opacity-30"
                        aria-hidden="true"
                        style={{ backgroundImage: `url('${lighthouseBg}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                    />
                    {/* Logo chip — styled like the Dashboard tile icon */}
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm transition-shadow group-hover:shadow-[0_0_12px_rgba(255,191,69,0.35)]">
                        <img
                            src={lhLogo}
                            alt=""
                            className="h-full w-full object-contain p-1 transition-[filter] group-hover:brightness-125 group-hover:drop-shadow-[0_0_6px_rgba(255,191,69,0.5)]"
                        />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-primary)]">
                                <Radar size={12} className="text-[#ffbf45]" />
                                Lighthouse
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)]">Port scanner &amp; conflict detector</span>
                        </div>
                    </div>
                </button>
            </div>

            {/* Discovered servers — collapsible, collapsed by default */}
            <div className={`shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]/20 ${isKlipit ? 'border-[#dac39c] dark:border-[#322c20] bg-[#f1e4cf]/30 dark:bg-[#141009]/30' : ''}`}>
                <div className="flex w-full items-center gap-2 px-3 py-1.5 transition-colors hover:bg-[var(--bg-hover)]/30">
                    <button
                        type="button"
                        onClick={() => setServersCollapsed(c => !c)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        title={serversCollapsed ? 'Show discovered servers' : 'Hide discovered servers'}
                    >
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">
                            <Radar size={11} className={scanning ? 'animate-pulse text-[var(--accent)]' : ''} />
                            <span>Running</span>
                        </div>
                        {lastScanTime && (
                            <span className="text-[10px] text-[var(--text-tertiary)]">Scanned {lastScanTime}</span>
                        )}
                        <div className="flex-1" />
                        {discoveredServers.length > 0 && serversCollapsed && (
                            <span className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                                {discoveredServers.length}
                            </span>
                        )}
                        {serversCollapsed ? <ChevronDown size={11} className="text-[var(--text-tertiary)]" /> : <ChevronUp size={11} className="text-[var(--text-tertiary)]" />}
                    </button>
                    <button
                        type="button"
                        onClick={scanForServers}
                        disabled={scanning}
                        className="micro-interaction rounded-md p-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                        title="Scan for running servers"
                    >
                        <RefreshCw size={10} className={scanning ? 'animate-spin' : ''} />
                    </button>
                </div>
                {!serversCollapsed && (
                    <div className="px-3 pb-2">
                        {discoveredServers.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {discoveredServers.map((srv) => {
                                    const label = srv.service_name || srv.project || friendlyProcessName(srv.process_name) || 'Unknown';
                                    return (
                                        <button
                                            key={`${srv.port}-${srv.bind_address || '0.0.0.0'}`}
                                            type="button"
                                            onClick={() => openDiscovered(srv.port)}
                                            className={`group flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                                                isKlipit
                                                    ? 'border-[#dac39c] dark:border-[#494030] bg-[#fff8e9] dark:bg-[#211c14] text-[#695442] dark:text-[#b3a994] hover:bg-[#f1e4cf] dark:hover:bg-[#322c20]'
                                                    : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                                            }`}
                                            title={`localhost:${srv.port} — ${label}${srv.process_name ? ` (${srv.process_name})` : ''}`}
                                        >
                                            <Play size={9} className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                                            <span className="font-semibold">:{srv.port}</span>
                                            <span className="opacity-70">{label}</span>
                                            {srv.bind_address && srv.bind_address !== '127.0.0.1' && srv.bind_address !== '0.0.0.0' && (
                                                <span className="opacity-40 text-[9px]">({srv.bind_address})</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : scanning ? (
                            <div className="text-[11px] text-[var(--text-tertiary)]">Scanning…</div>
                        ) : (
                            <div className="text-[11px] text-[var(--text-tertiary)]">
                                No local servers detected. Start a dev server and hit scan.
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)]/30 px-2 pt-2" style={{ WebkitAppRegion: 'no-drag' }}>
                {tabs.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    return (
                        <div
                            key={tab.id}
                            draggable={true}
                            className={`group relative flex h-8 min-w-[120px] max-w-[210px] cursor-pointer items-center justify-between gap-1.5 rounded-t-lg border-x border-t px-2.5 text-xs transition-colors ${
                                isActive
                                    ? 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]'
                                    : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                            }`}
                            onClick={() => setActiveTabId(tab.id)}
                            onDragStart={(e) => {
                              setDraggedTabId(tab.id);
                              e.dataTransfer.setData('text/plain', tab.id);
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedTabId === null) return;
                              const draggedIndex = tabs.findIndex(t => t.id === draggedTabId);
                              const targetIndex = tabs.findIndex(t => t.id === tab.id);
                              if (draggedIndex >= 0 && targetIndex >= 0 && draggedIndex !== targetIndex) {
                                setTabs(prev => {
                                  const cloned = [...prev];
                                  const [dragged] = cloned.splice(draggedIndex, 1);
                                  cloned.splice(targetIndex, 0, dragged);
                                  return cloned;
                                });
                                setActiveTabId(draggedTabId);
                              }
                              setDraggedTabId(null);
                            }}
                            onDragEnd={() => setDraggedTabId(null)}
                        >
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    togglePinnedTab(tab.id);
                                }}
                                className={`shrink-0 rounded-md p-0.5 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
                                    tab.pinned ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
                                }`}
                                title={tab.pinned ? 'Unpin tab' : 'Pin tab'}
                                aria-label={tab.pinned ? 'Unpin tab' : 'Pin tab'}
                                aria-pressed={tab.pinned}
                            >
                                <Pin size={12} className={tab.pinned ? 'fill-current' : ''} />
                            </button>
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                <Globe size={12} className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'} />
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
                                    className="shrink-0 rounded-md p-0.5 text-[var(--text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] group-hover:opacity-100 focus:opacity-100"
                                    title="Close tab"
                                    aria-label="Close tab"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    );
                })}
                <button
                    type="button"
                    onClick={() => {
                        const newId = createTabId();
                        setTabs([...tabs, { id: newId, url: '', title: 'New Tab', pinned: false }]);
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
                        onUrlChange={handleUrlChange}
                        isKlipit={isKlipit}
                        isDarkMode={isDarkMode}
                        onNewTab={handleNewTab}
                    />
                ))}
            </div>
        </div>
    );
}
