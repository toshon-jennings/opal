import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Settings as SettingsIcon } from 'lucide-react';

// G-Dash window surface. Hosts the reused google-connect static bundle
// (public/gdash) in an iframe and bridges its postMessage protocol to the
// gdash:* IPC methods in main.cjs. OAuth and every Google API call happen in the
// Electron main process — neither this renderer nor the iframe ever sees an
// access token; the iframe only receives the assembled dashboard object.

const GDASH_SRC = `${import.meta.env.BASE_URL}gdash/index.html`;

// The iframe is same-origin (served from our own bundle), so pin postMessage to
// our origin when served over http(s) (dev server). Packaged builds load via
// file://, where Chromium reports location.origin as "file://" but delivers
// message events with origin "null" — pinning there silently drops every
// message, so '*' is the only option. The event.source identity check below is
// the real boundary; no tokens cross this bridge either way.
const FRAME_ORIGIN = /^https?:$/.test(window.location.protocol)
    ? window.location.origin
    : '*';

export default function GDashMode({ onOpenSettings }) {
    const iframeRef = useRef(null);
    const connectingRef = useRef(false);
    const [needsClientId, setNeedsClientId] = useState(false);
    const hasBridge = Boolean(window.electron?.gdashDashboard);

    const postToFrame = useCallback((type, payload) => {
        const win = iframeRef.current?.contentWindow;
        if (win) win.postMessage({ source: 'gdash-host', type, ...(payload || {}) }, FRAME_ORIGIN);
    }, []);

    // Stale-while-revalidate: paint whatever main has cached immediately, then
    // fetch fresh (respecting the TTL, or bypassing it when the user hits refresh).
    const pushDashboard = useCallback(async ({ force = false } = {}) => {
        if (!window.electron?.gdashDashboard) {
            postToFrame('dashboard:result', { data: { connected: false } });
            return;
        }
        try {
            const cached = await window.electron.gdashDashboard({ cacheOnly: true });
            if (cached?.connected) postToFrame('dashboard:result', { data: cached });
            const fresh = await window.electron.gdashDashboard({ forceRefresh: force });
            setNeedsClientId(fresh?.hasClientId === false);
            const alreadyPushed = cached?.connected && fresh?.fromCache && fresh?.fetchedAt === cached?.fetchedAt;
            if (!alreadyPushed) postToFrame('dashboard:result', { data: fresh || { connected: false } });
        } catch {
            postToFrame('dashboard:result', { data: { connected: false } });
        }
    }, [postToFrame]);

    const handleConnect = useCallback(async () => {
        if (connectingRef.current) return;
        if (!window.electron?.gdashConnect) {
            postToFrame('connect:error', { error: 'desktop-only' });
            return;
        }
        connectingRef.current = true;
        postToFrame('connecting', { message: 'Complete Google sign-in in your default browser.' });
        try {
            const result = await window.electron.gdashConnect();
            if (result?.ok) {
                setNeedsClientId(false);
                await pushDashboard({ force: true });
            } else {
                if (result?.error === 'no-client-id') setNeedsClientId(true);
                postToFrame('connect:error', { error: result?.error || 'connect-failed' });
            }
        } catch (err) {
            postToFrame('connect:error', { error: err?.message || 'connect-failed' });
        } finally {
            connectingRef.current = false;
        }
    }, [postToFrame, pushDashboard]);

    const handleCancelConnect = useCallback(async () => {
        try {
            const result = await window.electron?.gdashCancelConnect?.();
            if (!result?.ok) throw new Error(result?.error || 'Unable to cancel Google sign-in.');
            postToFrame('connect:error', { error: 'Sign-in cancelled.' });
        } catch (err) {
            postToFrame('connect:error', { error: err?.message || 'Unable to cancel Google sign-in.' });
        } finally {
            connectingRef.current = false;
        }
    }, [postToFrame]);

    const handleDisconnect = useCallback(async () => {
        try { await window.electron?.gdashDisconnect?.(); } catch { /* best-effort */ }
        postToFrame('dashboard:result', { data: { connected: false } });
    }, [postToFrame]);

    // Relay iframe → main IPC.
    useEffect(() => {
        function onMessage(event) {
            if (event.source !== iframeRef.current?.contentWindow) return;
            if (FRAME_ORIGIN !== '*' && event.origin !== FRAME_ORIGIN) return;
            const msg = event.data;
            if (!msg || msg.source !== 'gdash') return;
            switch (msg.type) {
                case 'dashboard:request': void pushDashboard({ force: Boolean(msg.force) }); break;
                case 'connect': void handleConnect(); break;
                case 'connect:cancel': void handleCancelConnect(); break;
                case 'disconnect': void handleDisconnect(); break;
                default: break;
            }
        }
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [pushDashboard, handleConnect, handleCancelConnect, handleDisconnect]);

    // Surface the "set your client ID" banner up front, before the user clicks.
    useEffect(() => {
        let cancelled = false;
        if (window.electron?.gdashStatus) {
            window.electron.gdashStatus()
                .then((s) => { if (!cancelled) setNeedsClientId(s?.hasClientId === false); })
                .catch(() => { /* leave banner hidden */ });
        }
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="relative w-full h-full bg-[#f8fafd]">
            {hasBridge && needsClientId && (
                <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border)] text-[12px] text-[var(--text-secondary)]">
                    <KeyRound size={14} className="text-amber-500 shrink-0" />
                    <span className="flex-1">
                        Add your Google <strong>Desktop OAuth client ID</strong> in Settings to connect a Google account.
                    </span>
                    {onOpenSettings && (
                        <button
                            type="button"
                            onClick={onOpenSettings}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] uppercase tracking-wider border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <SettingsIcon size={12} />
                            Settings
                        </button>
                    )}
                </div>
            )}
            <iframe
                ref={iframeRef}
                src={GDASH_SRC}
                title="G-Dash"
                className="w-full h-full border-0 block"
                onLoad={() => void pushDashboard()}
            />
        </div>
    );
}
