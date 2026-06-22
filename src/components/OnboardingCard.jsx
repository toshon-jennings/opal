import { useCallback, useState } from 'react';
import {
    Rocket, Server, Bot, Radar, BookOpen, Sparkles, ChevronRight,
    ChevronLeft, X, CheckCircle2, ExternalLink, MessageSquare,
    Users, Code, FlaskConical, Building2, ActivitySquare, Hammer, Plug
} from 'lucide-react';
import { MODES } from '../context/ModeContext';
import { readStringStorage, writeStringStorage, removeStorageKey } from '../lib/persistentStore';
import './OnboardingCard.css';

const STEPS = [
    {
        id: 'welcome',
        icon: Rocket,
        title: 'Welcome to Perci',
        body: 'Perci is your local AI development environment — a desktop workspace where AI agents, chat, code, and system tools live side by side. This quick walkthrough covers the essentials to get you oriented.',
    },
    {
        id: 'provider',
        icon: Plug,
        title: 'Set up an AI provider',
        body: 'Before anything else, Perci needs an AI model to talk to. Open Settings (gear icon in the top bar) and add your API key or local model endpoint. You can connect Ollama, OpenRouter, Anthropic, OpenAI, or any compatible provider.',
        actionLabel: 'Open settings',
    },
    {
        id: 'openclaw',
        icon: Server,
        title: 'OpenClaw gateway',
        body: 'OpenClaw is the AI agent runtime that powers background agents, multi-step tool calls, and autonomous task execution. When the gateway is online (green dot on the OpenClaw tile), you can queue agent jobs from the Agents window or send tasks from Chat.',
    },
    {
        id: 'hermes',
        icon: Bot,
        title: 'Hermes integration',
        body: 'Hermes is the CLI agent that runs in your terminal. Perci embeds Hermes directly — use the Hermes window for interactive console sessions, session history, usage insights, and the web dashboard. It shares the same provider config as the rest of Perci.',
    },
    {
        id: 'lighthouse',
        icon: Radar,
        title: 'Lighthouse — port scanner',
        body: 'Lighthouse scans your machine for live listening ports, finds conflicts, and tracks which app owns what. Open the Ports window to scan, check individual ports, and resolve conflicts. It reads PORTMASTER.md files across your repos to understand intended allocations.',
    },
    {
        id: 'modes',
        icon: BookOpen,
        title: 'Modes overview',
        body: 'Every surface in Perci is a "mode" — a floating window on the desktop. Here\'s what each one does:',
        modes: [
            { id: MODES.CHAT, icon: MessageSquare, label: 'Chat', desc: 'Converse with any model' },
            { id: MODES.COWORK, icon: Users, label: 'Cowork', desc: 'Session-based deep work' },
            { id: MODES.CODE, icon: Code, label: 'Code', desc: 'Edit and run your repos' },
            { id: MODES.AGENTS, icon: Bot, label: 'Agents', desc: 'Queue jobs for the CLI crew' },
            { id: MODES.AUTORESEARCH, icon: FlaskConical, label: 'Research', desc: 'Prompt-optimization loops' },
            { id: MODES.OFFICE, icon: Building2, label: 'Office', desc: 'Visit the crew at Perci HQ' },
            { id: MODES.MISSION, icon: ActivitySquare, label: 'Mission', desc: 'Supervise runs and checks' },
            { id: MODES.BUILD, icon: Hammer, label: 'Build', desc: 'Generate and ship projects' },
            { id: MODES.LIGHTHOUSE, icon: Radar, label: 'Ports', desc: 'Scan ports and find conflicts' },
        ],
    },
    {
        id: 'guide',
        icon: Sparkles,
        title: 'Mode Guide',
        body: 'Each mode has its own built-in guide. Look for the "Guide" button in the top bar of any window — it opens a walkthrough specific to that surface. The Lighthouse Ports window has a detailed guide for port management, and other modes have their own too.',
    },
    {
        id: 'done',
        icon: CheckCircle2,
        title: "You're all set",
        body: 'You\'ve got the basics. Open any mode from the Launchpad to dive in. You can replay this walkthrough anytime from Settings → Show Onboarding.',
    },
];

export function hasOnboardingBeenSeen() {
    try {
        return readStringStorage('perci_onboarding_complete') === '1';
    } catch {
        return false;
    }
}

export function markOnboardingComplete() {
    try {
        writeStringStorage('perci_onboarding_complete', '1');
    } catch { /* noop */ }
}

export function resetOnboarding() {
    try {
        removeStorageKey('perci_onboarding_complete');
    } catch { /* noop */ }
}

export default function OnboardingCard({ onComplete, onOpenSettings, onOpenMode }) {
    const [stepIndex, setStepIndex] = useState(0);
    const step = STEPS[stepIndex];
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === STEPS.length - 1;
    const StepIcon = step.icon;

    const goNext = useCallback(() => {
        if (isLast) {
            markOnboardingComplete();
            onComplete?.();
        } else {
            setStepIndex(i => i + 1);
        }
    }, [isLast, onComplete]);

    const goPrev = useCallback(() => {
        if (!isFirst) setStepIndex(i => i - 1);
    }, [isFirst]);

    const dismiss = useCallback(() => {
        markOnboardingComplete();
        onComplete?.();
    }, [onComplete]);

    const handleAction = useCallback(() => {
        if (step.id === 'provider' && onOpenSettings) {
            onOpenSettings();
        }
    }, [step.id, onOpenSettings]);

    const handleModeClick = useCallback((modeId) => {
        if (onOpenMode) onOpenMode(modeId);
    }, [onOpenMode]);

    return (
        <div className="ob-card" role="dialog" aria-label="Perci onboarding">
            <button className="ob-close" onClick={dismiss} aria-label="Dismiss onboarding">
                <X size={14} />
            </button>

            <div className="ob-header">
                <span className="ob-icon-wrap">
                    <StepIcon size={18} />
                </span>
                <div className="ob-header-text">
                    <h3 className="ob-title">{step.title}</h3>
                    <span className="ob-step-count">Step {stepIndex + 1} of {STEPS.length}</span>
                </div>
            </div>

            <p className="ob-body">{step.body}</p>

            {step.modes && (
                <div className="ob-modes">
                    {step.modes.map(m => {
                        const MIcon = m.icon;
                        return (
                            <button
                                key={m.id}
                                className="ob-mode-chip"
                                onClick={() => handleModeClick(m.id)}
                                title={`Open ${m.label}`}
                            >
                                <MIcon size={13} />
                                <span className="ob-mode-label">{m.label}</span>
                                <span className="ob-mode-desc">{m.desc}</span>
                                <ExternalLink size={10} className="ob-mode-link" />
                            </button>
                        );
                    })}
                </div>
            )}

            {step.actionLabel && (
                <button className="ob-action" onClick={handleAction}>
                    {step.actionLabel}
                    <ExternalLink size={12} />
                </button>
            )}

            <div className="ob-footer">
                <div className="ob-dots">
                    {STEPS.map((_, i) => (
                        <span
                            key={i}
                            className={`ob-dot ${i === stepIndex ? 'is-active' : i < stepIndex ? 'is-done' : ''}`}
                        />
                    ))}
                </div>
                <div className="ob-nav">
                    {!isFirst && (
                        <button className="ob-btn ob-btn-prev" onClick={goPrev}>
                            <ChevronLeft size={14} />
                            Back
                        </button>
                    )}
                    <button className="ob-btn ob-btn-next" onClick={goNext}>
                        {isLast ? 'Finish' : 'Next'}
                        {isLast ? <CheckCircle2 size={14} /> : <ChevronRight size={14} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
