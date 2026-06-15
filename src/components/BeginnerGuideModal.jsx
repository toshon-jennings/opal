import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    BookOpen,
    Cloud,
    Cpu,
    Download,
    ExternalLink,
    Gauge,
    KeyRound,
    Lock,
    Rocket,
    ShieldCheck,
    Sparkles,
    X,
} from 'lucide-react';

// Beginner-facing setup guide. Two modules matching the user's mental model:
//   1. Local AI  — what it is, how to download one, which model to pick.
//   2. OpenRouter — one key for hundreds of cloud models, with a CTA that
//      drops the user straight into Settings → OpenRouter.
// Styling deliberately mirrors ModeGuideModal so it feels native to Perci.

// Optional friendly 16:9 illustrations. Drop PNGs in public/guide/ and fill in
// the matching path to switch each one on; leave '' to keep the clean
// icon-only header. Generate the art from the Flow prompts in the guide notes.
const GUIDE_IMAGES = {
    hero: '/guide/hero.jpg',
    whatIs: '/guide/what-is-local-ai.jpg',
    download: '/guide/download-ollama.jpg',
    models: '/guide/which-model.jpg',
    alternatives: '/guide/local-alternatives.jpg',
    openrouter: '/guide/openrouter-cloud.jpg',
    safety: '/guide/keep-key-safe.jpg',
};

// 16:9 illustration card. Renders nothing when no image is set, so the guide
// stays clean (icon-only) until artwork is added.
function Figure({ src, alt, maxW = 'max-w-md', className = '' }) {
    if (!src) return null;
    return (
        <div className={`mx-auto w-full ${maxW} overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] ${className}`}>
            <img
                src={src}
                alt={alt}
                loading="lazy"
                className="block h-full w-full object-cover"
                style={{ aspectRatio: '16 / 9' }}
            />
        </div>
    );
}

function GuideSection({ title, icon: Icon, image, children }) {
    return (
        <section className="focus-card rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
            <div className="flex items-center gap-2">
                <Icon size={16} className="text-[var(--accent)]" />
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
            </div>
            <Figure src={image} alt={title} className="mt-4" />
            <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
                {children}
            </div>
        </section>
    );
}

function BulletList({ items }) {
    return (
        <ul className="space-y-2">
            {items.map((item, i) => (
                <li key={i} className="flex gap-2">
                    <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}

function Step({ n, children }) {
    return (
        <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent)] text-xs font-bold text-white">
                {n}
            </span>
            <span className="pt-0.5">{children}</span>
        </li>
    );
}

function Cmd({ children }) {
    return (
        <code className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--text-primary)]">
            {children}
        </code>
    );
}

function TabButton({ active, label, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                active
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
        >
            {label}
        </button>
    );
}

const RAM_TIERS = [
    {
        ram: '8 GB / not sure',
        pick: 'llama3.2 (3B)',
        note: 'Small and quick. Runs on almost any modern laptop. Also try gemma2:2b or qwen2.5:3b.',
    },
    {
        ram: '16 GB',
        pick: 'llama3.1:8b',
        note: 'A capable all-rounder for everyday questions, writing, and code. Or qwen2.5:7b / gemma2:9b.',
    },
    {
        ram: '32 GB+ (or Apple Silicon Pro/Max)',
        pick: 'qwen2.5:14b',
        note: 'Noticeably smarter answers. You can also reach for gemma2:27b or larger models.',
    },
];

function LocalTab() {
    return (
        <div className="focus-field space-y-5">
            <Figure src={GUIDE_IMAGES.hero} alt="Get your first AI running" maxW="max-w-xl" />
            <GuideSection title="What is a local AI model?" icon={Cpu} image={GUIDE_IMAGES.whatIs}>
                <p>
                    An AI model is a program that understands and writes text (and sometimes images). “Local”
                    means it runs <strong>on your own computer</strong> instead of on a company’s servers in the cloud.
                </p>
                <BulletList
                    items={[
                        'Private — your words never leave your machine.',
                        'Free to run and works offline, even with no internet.',
                        'Limited by your computer: bigger, “smarter” models need more memory and a faster machine.',
                    ]}
                />
                <p>
                    Cloud models (the next module — OpenRouter) run on powerful remote servers. They’re usually
                    smarter and faster, but you pay a little per use and your text travels over the internet. Perci
                    works with both, so a common setup is a small local model for everyday, private tasks and a cloud
                    model when you want more horsepower.
                </p>
            </GuideSection>

            <GuideSection title="Download your first local AI — Ollama" icon={Download} image={GUIDE_IMAGES.download}>
                <p>
                    <strong>Ollama</strong> is the easiest way to start. It’s free, works on Mac, Windows, and Linux,
                    and runs quietly in the background.
                </p>
                <ol className="space-y-2.5">
                    <Step n={1}>
                        Go to <Cmd>ollama.com</Cmd> → <strong>Download</strong> → install the app for your operating system.
                    </Step>
                    <Step n={2}>
                        Open it once. Ollama tucks itself into your menu bar (Mac) or system tray (Windows) and stays running.
                    </Step>
                    <Step n={3}>
                        Get a model. Easiest path: open <strong>Perci → Settings → Providers → Ollama</strong> and it
                        auto-detects what you’ve installed. Prefer a terminal? Run <Cmd>ollama pull llama3.2</Cmd>.
                    </Step>
                    <Step n={4}>
                        Back in Settings, pick the model from the Ollama list. You’re now chatting with an AI running entirely on your machine.
                    </Step>
                </ol>
            </GuideSection>

            <GuideSection title="Which model should I download?" icon={Gauge} image={GUIDE_IMAGES.models}>
                <p>
                    It depends on your computer’s memory (RAM). Rule of thumb: a model needs roughly its size in
                    “billions” as gigabytes of memory (a 7B model ≈ 4–5 GB). <strong>Start small — you can always pull a bigger one later.</strong>
                </p>
                <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--bg-primary)] text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                            <tr>
                                <th className="px-3 py-2 font-semibold">Your computer</th>
                                <th className="px-3 py-2 font-semibold">Good first pick</th>
                            </tr>
                        </thead>
                        <tbody>
                            {RAM_TIERS.map((tier) => (
                                <tr key={tier.ram} className="border-t border-[var(--border)] align-top">
                                    <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">{tier.ram}</td>
                                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                                        <Cmd>{tier.pick}</Cmd>
                                        <div className="mt-1 text-[13px] leading-5 text-[var(--text-tertiary)]">{tier.note}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-[var(--text-primary)]">
                    <Sparkles size={13} className="mr-1.5 inline align-[-2px] text-[var(--accent)]" />
                    <strong>One simple recommendation:</strong> install Ollama and run <Cmd>ollama pull llama3.2</Cmd>. It’s the
                    smoothest path and runs on nearly any recent laptop.
                </p>
            </GuideSection>

            <GuideSection title="Prefer clicking over typing? Two alternatives" icon={Rocket} image={GUIDE_IMAGES.alternatives}>
                <BulletList
                    items={[
                        'LM Studio — a friendly point-and-click app with a built-in model browser and local server. Great if you’d rather avoid the terminal. Perci connects to it under Settings → Providers → LM Studio.',
                        'Jan — an open-source, privacy-first desktop app. Perci can even start its local server for you. Find it under Settings → Providers → Jan.',
                    ]}
                />
            </GuideSection>
        </div>
    );
}

function OpenRouterTab({ onGetOpenRouterKey }) {
    return (
        <div className="focus-field space-y-5">
            <GuideSection title="What is OpenRouter?" icon={Cloud} image={GUIDE_IMAGES.openrouter}>
                <p>
                    <strong>OpenRouter</strong> is a single account and key that unlocks <strong>hundreds of cloud AI
                    models</strong> — Claude, GPT, Gemini, Llama, and more — through one connection. Instead of signing
                    up with every provider separately, you get one key and pay only for what you use.
                </p>
                <BulletList
                    items={[
                        'One signup, then try many different models in Perci.',
                        'Pay-as-you-go — add a few dollars of credit, no monthly subscription.',
                        'Some models are even free to use.',
                    ]}
                />
            </GuideSection>

            <GuideSection title="Get your API key" icon={KeyRound}>
                <ol className="space-y-2.5">
                    <Step n={1}>
                        Go to <Cmd>openrouter.ai</Cmd> and sign up (Google, GitHub, or email).
                    </Step>
                    <Step n={2}>
                        Add a little credit under <strong>Settings → Credits</strong>. Even $5 goes a long way for chatting.
                    </Step>
                    <Step n={3}>
                        Open <Cmd>openrouter.ai/keys</Cmd> → <strong>Create Key</strong> → copy it. It starts with{' '}
                        <Cmd>sk-or-…</Cmd>. Keep it secret.
                    </Step>
                    <Step n={4}>
                        Paste it into Perci using the button below, then choose a model and start chatting.
                    </Step>
                </ol>
                <button
                    type="button"
                    onClick={onGetOpenRouterKey}
                    className="mt-1 inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
                >
                    <KeyRound size={15} />
                    Open Settings → OpenRouter
                    <ExternalLink size={13} />
                </button>
            </GuideSection>

            <GuideSection title="Keep your key safe" icon={ShieldCheck} image={GUIDE_IMAGES.safety}>
                <BulletList
                    items={[
                        'Treat the key like a password — never share it or paste it into untrusted sites.',
                        'You can revoke or rotate it anytime on the openrouter.ai/keys page.',
                        'Set a credit limit so there are never any surprises on your bill.',
                    ]}
                />
                <p className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
                    <Lock size={13} />
                    Perci stores your key locally on this machine — it isn’t uploaded anywhere.
                </p>
            </GuideSection>
        </div>
    );
}

export function BeginnerGuideModal({ isOpen, onClose, onGetOpenRouterKey }) {
    const [activeTab, setActiveTab] = useState('local');
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;

        setActiveTab('local');
        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onCloseRef.current?.();
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="beginner-guide-title"
                className="flex h-[min(92vh,920px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
            >
                <div className="flex items-start gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-5">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
                        <BookOpen size={18} className="text-[var(--accent)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id="beginner-guide-title" className="text-xl font-semibold text-[var(--text-primary)]">
                            Beginner’s guide — get your first AI running
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                            Brand new to AI models? Start here. First set up a free AI that runs on your own computer,
                            then add an OpenRouter key to reach hundreds of cloud models.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        aria-label="Close beginner guide"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="border-b border-[var(--border)] px-6 py-3">
                    <div className="flex flex-wrap gap-2">
                        <TabButton active={activeTab === 'local'} label="1 · Local AI" onClick={() => setActiveTab('local')} />
                        <TabButton active={activeTab === 'openrouter'} label="2 · OpenRouter key" onClick={() => setActiveTab('openrouter')} />
                    </div>
                </div>

                <div className="focus-field flex-1 overflow-y-auto px-6 py-6">
                    {activeTab === 'local'
                        ? <LocalTab />
                        : <OpenRouterTab onGetOpenRouterKey={onGetOpenRouterKey} />}
                </div>
            </div>
        </div>,
        document.body
    );
}

export default BeginnerGuideModal;
