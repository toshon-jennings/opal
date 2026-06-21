import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw
} from 'lucide-react';
import eidosLogo from '../assets/eidos-logo.png';

const EIDOS_PURPLE = '#8b5cf6';

const SETUP_STEPS = [
    { id: 'orbstack', label: 'Checking OrbStack / Docker' },
    { id: 'docker', label: 'Starting Docker runtime' },
    { id: 'compose', label: 'Pulling & starting containers' },
    { id: 'health', label: 'Waiting for Eidos API' },
];

export default function EidosMode() {
    const [status, setStatus] = useState('idle'); // idle | checking | starting | running | error
    const [currentStep, setCurrentStep] = useState(0);
    const [error, setError] = useState(null);
    const [dashboardReady, setDashboardReady] = useState(false);
    const pollRef = useRef(null);
    const frameKeyRef = useRef(0);
    const statusRef = useRef(status);
    const runningRef = useRef(false);

    // Keep statusRef in sync
    useEffect(() => { statusRef.current = status; }, [status]);

    const isElectron = !!window.electron;
    const hasEidosAPI = isElectron && window.electron?.eidosStatus;

    // ── Stop polling helper ──────────────────────────────────────────
    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    // ── Progress polling ─────────────────────────────────────────────
    const pollProgress = useCallback(async () => {
        if (!hasEidosAPI || !runningRef.current) return;
        try {
            const progress = await window.electron.eidosProgress();
            if (progress.error) {
                setError(progress.error);
                setStatus('error');
                runningRef.current = false;
                stopPolling();
                return;
            }
            if (progress.done || progress.step >= 4) {
                setStatus('running');
                setDashboardReady(true);
                runningRef.current = false;
                stopPolling();
                return;
            }
            setCurrentStep(Math.min(progress.step, SETUP_STEPS.length - 1));
        } catch (err) {
            console.warn('[eidos] progress poll failed:', err.message);
        }
    }, [hasEidosAPI, stopPolling]);

    // ── Full start sequence ──────────────────────────────────────────
    const startEidos = useCallback(async () => {
        if (!hasEidosAPI || runningRef.current) return;
        runningRef.current = true;

        setStatus('checking');
        setCurrentStep(0);
        setError(null);
        setDashboardReady(false);
        stopPolling();

        try {
            // Check current state
            const statusResult = await window.electron.eidosStatus();
            if (statusResult.error) {
                setError(statusResult.error);
                setStatus('error');
                runningRef.current = false;
                return;
            }

            // Already running? Done.
            if (statusResult.state === 'running') {
                setStatus('running');
                setDashboardReady(true);
                runningRef.current = false;
                return;
            }

            // Docker not available at all?
            if (statusResult.state === 'no-docker') {
                setError(statusResult.error || 'Docker/OrbStack not found. Install OrbStack from https://orbstack.dev');
                setStatus('error');
                runningRef.current = false;
                return;
            }

            // Need to start something
            setStatus('starting');
            setCurrentStep(1);

            // Kick off start in background
            window.electron.eidosStart().then((result) => {
                if (result.error) {
                    setError(result.error);
                    setStatus('error');
                    runningRef.current = false;
                    stopPolling();
                }
            });

            // Poll progress every 2s
            pollRef.current = setInterval(pollProgress, 2000);

        } catch (err) {
            setError(err.message || 'Failed to start Eidos');
            setStatus('error');
            runningRef.current = false;
        }
    }, [hasEidosAPI, pollProgress, stopPolling]);

    // Auto-start on mount
    useEffect(() => {
        if (hasEidosAPI) {
            startEidos();
        }
        return stopPolling;
    }, [hasEidosAPI, startEidos, stopPolling]);

    const handleRetry = useCallback(() => {
        frameKeyRef.current += 1;
        runningRef.current = false;
        stopPolling();
        startEidos();
    }, [startEidos, stopPolling]);

    if (!isElectron) {
        return (
            <div className="h-full w-full flex items-center justify-center p-8">
                <div className="max-w-lg text-center">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center overflow-hidden">
                        <img src={eidosLogo} alt="Eidos" className="w-8 h-8" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        Eidos requires the desktop app
                    </h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Eidos runs as a local Docker stack managed by Perci's desktop runtime.
                        Open Perci from the desktop app to use Eidos.
                    </p>
                </div>
            </div>
        );
    }

    // ── Error state ──────────────────────────────────────────────────
    if (status === 'error') {
        return (
            <div className="h-full w-full flex items-center justify-center p-8">
                <div className="max-w-lg text-center">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center justify-center">
                        <AlertCircle size={22} className="text-red-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        Eidos could not start
                    </h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {error || 'An unknown error occurred.'}
                    </p>
                    <div className="mt-4 flex flex-col items-center gap-3">
                        {error && /orbstack|docker/i.test(error) && (
                            <a
                                href="https://orbstack.dev"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                                <ExternalLink size={14} />
                                Install OrbStack
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
                        >
                            <RefreshCw size={14} />
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Loading / setup progress ─────────────────────────────────────
    if (status !== 'running' || !dashboardReady) {
        return (
            <div className="h-full w-full flex items-center justify-center p-8">
                <div className="max-w-md w-full">
                    <div className="text-center mb-8">
                        <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center overflow-hidden">
                            <img src={eidosLogo} alt="Eidos" className="w-8 h-8" />
                        </div>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                            {status === 'checking' ? 'Checking Eidos…' : 'Starting Eidos'}
                        </h2>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            Setting up your persistent memory stack…
                        </p>
                    </div>
                    <div className="space-y-3">
                        {SETUP_STEPS.map((step, i) => {
                            const done = i < currentStep;
                            const active = i === currentStep;
                            return (
                                <div
                                    key={step.id}
                                    className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors ${
                                        active
                                            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                                            : done
                                                ? 'border-emerald-500/30 bg-emerald-500/5'
                                                : 'border-[var(--border)] bg-[var(--bg-secondary)] opacity-50'
                                    }`}
                                >
                                    {done ? (
                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                    ) : active ? (
                                        <Loader2 size={16} className="text-[var(--accent)] shrink-0 animate-spin" />
                                    ) : (
                                        <div className="w-4 h-4 rounded-full border border-[var(--border)] shrink-0" />
                                    )}
                                    <span className={`text-sm ${
                                        done
                                            ? 'text-emerald-500'
                                            : active
                                                ? 'text-[var(--text-primary)]'
                                                : 'text-[var(--text-tertiary)]'
                                    }`}>
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // ── Running: embed the Eidos dashboard ───────────────────────────
    return (
        <div className="h-full w-full flex flex-col bg-[var(--bg-primary)]">
            <webview
                key={`eidos-${frameKeyRef.current}`}
                src="http://localhost:3000"
                title="Eidos Dashboard"
                className="flex-1 min-h-0 w-full border-0 bg-white"
                partition="persist:perci-eidos"
                allowpopups="true"
            />
        </div>
    );
}
