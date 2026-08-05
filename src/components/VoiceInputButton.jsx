import { Loader2, Mic, Square } from 'lucide-react';
import { useVoiceInput } from '../hooks/useVoiceInput';

export function VoiceInputButton({
    className = '',
    disabled = false,
    iconSize = 18,
    onChange,
    value,
}) {
    const { error, status, supported, toggle } = useVoiceInput(value, onChange);
    if (!supported) return null;

    const recording = status === 'recording';
    const transcribing = status === 'transcribing';
    const requesting = status === 'requesting';
    const label = recording
        ? 'Stop dictation'
        : transcribing
            ? 'Transcribing voice'
            : requesting
                ? 'Requesting microphone access'
            : error || 'Start dictation';

    return (
        <>
            <span className="relative inline-flex">
            <button
                type="button"
                onClick={() => void toggle()}
                disabled={disabled || transcribing || requesting}
                aria-label={label}
                aria-pressed={recording}
                title={label}
                className={`inline-flex items-center justify-center rounded-lg p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${recording
                    ? 'bg-[var(--accent)] text-white'
                    : error
                        ? 'text-[var(--accent)] bg-[var(--accent-subtle)]'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                    } ${className}`}
            >
                {transcribing || requesting
                    ? <Loader2 size={iconSize} className="animate-spin" />
                    : recording
                        ? <Square size={iconSize} fill="currentColor" />
                        : <Mic size={iconSize} />}
            </button>
                {error && (
                    <span
                        role="alert"
                        className="absolute bottom-full left-0 z-30 mb-2 w-max max-w-64 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-left text-xs leading-5 text-[var(--text-secondary)] shadow-lg"
                    >
                        {error}
                    </span>
                )}
            </span>
            <span className="sr-only" aria-live="polite">
                {recording ? 'Listening' : transcribing ? 'Transcribing' : requesting ? 'Requesting microphone access' : error}
            </span>
        </>
    );
}
