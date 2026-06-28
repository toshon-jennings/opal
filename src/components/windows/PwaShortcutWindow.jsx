import { useEffect, useRef, useState } from 'react';
import { Globe, AlertTriangle, Loader2 } from 'lucide-react';
import { getPwaById } from '../../lib/pwaRegistry';

// PwaShortcutWindow renders a registered PWA shortcut in a partitioned webview.
// The PWA entry is looked up from the registry by the window's modeId
// (e.g. 'pwa_twitter.com'). We use a per-origin partition so each shortcut
// gets its own cookies/cache/login session.
export default function PwaShortcutWindow({ win }) {
  const webviewRef = useRef(null);
  const pwa = getPwaById(win.id);
  const [loadState, setLoadState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const partition = pwa ? `persist:pwa-${pwa.origin}` : 'persist:pwa-fallback';

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || !pwa) return;

    const onFinish = () => setLoadState('ready');
    const onFail = (e) => {
      if (e?.errorCode === -3) return; // aborted (e.g. navigation)
      setLoadState('error');
      setErrorMsg(e?.errorDescription || 'Failed to load');
    };

    wv.addEventListener('did-finish-load', onFinish);
    wv.addEventListener('did-fail-load', onFail);
    return () => {
      wv.removeEventListener('did-finish-load', onFinish);
      wv.removeEventListener('did-fail-load', onFail);
    };
  }, [pwa]);

  // PWA missing from registry (e.g. removed while window was open)
  if (!pwa) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-primary)] text-center p-8">
        <AlertTriangle size={32} className="text-[var(--text-tertiary)]" />
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          This PWA shortcut has been removed.
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">
          Close this window.
        </p>
      </div>
    );
  }

  // Electron only — webviews don't exist in browser builds
  if (!window.electron) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-primary)] text-center p-8">
        <Globe size={32} className="text-[var(--text-tertiary)]" />
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          PWA shortcuts are only available in the desktop app.
        </p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-[var(--bg-primary)]">
      {loadState === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm">
          <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      )}
      {loadState === 'error' && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 bg-red-500/10 px-4 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle size={14} />
          <span>{errorMsg} — the site may block embedding.</span>
        </div>
      )}
      <webview
        ref={webviewRef}
        key={pwa.url}
        src={pwa.url}
        title={pwa.title}
        className="absolute inset-0 h-full w-full border-0"
        partition={partition}
        allowpopups="true"
      />
    </div>
  );
}
