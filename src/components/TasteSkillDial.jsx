import React, { useState, useEffect } from 'react';
import { Sparkles, Copy, Check, RotateCcw, Sliders, Power } from 'lucide-react';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';

/**
 * Preset configurations mapping design brief signals to dial values.
 * Each preset: variance/motion/density + a design read template.
 */
const PRESETS = [
    {
        id: 'saas-landing',
        label: 'SaaS Landing',
        variance: 7, motion: 6, density: 4,
        read: 'B2B SaaS landing for technical buyers, with a minimalist language, leaning toward Tailwind + Geist + restrained motion.'
    },
    {
        id: 'agency-landing',
        label: 'Agency / Creative',
        variance: 9, motion: 8, density: 3,
        read: 'Creative agency landing for design-conscious clients, with an experimental language, leaning toward asymmetric layout + GSAP scroll + custom typography.'
    },
    {
        id: 'portfolio',
        label: 'Portfolio',
        variance: 8, motion: 7, density: 3,
        read: 'Solo designer portfolio for hiring managers, with an editorial/kinetic language, leaning toward native CSS + scroll-driven animation.'
    },
    {
        id: 'premium-consumer',
        label: 'Premium Consumer',
        variance: 7, motion: 6, density: 3,
        read: 'Premium consumer product page for design-aware buyers, with a refined language, leaning toward glassmorphism + spring motion + generous whitespace.'
    },
    {
        id: 'minimalist',
        label: 'Minimalist',
        variance: 5, motion: 3, density: 2,
        read: 'Editorial product UI for focused users, with a calm minimalist language, leaning toward Notion/Linear-style + restrained palette + crisp structure.'
    },
    {
        id: 'brutalist',
        label: 'Brutalist',
        variance: 10, motion: 5, density: 4,
        read: 'Experimental brand landing for an avant-garde audience, with a hard mechanical language, leaning toward Swiss type + sharp contrast + raw layout.'
    },
    {
        id: 'dashboard',
        label: 'Dashboard / Data',
        variance: 4, motion: 3, density: 8,
        read: 'Data dashboard for operations users, with a trust-first language, leaning toward compact cards + data density + restrained color.'
    },
    {
        id: 'public-sector',
        label: 'Public Sector',
        variance: 3, motion: 2, density: 5,
        read: 'Public-sector service site for broad accessibility, with a trust-first language, leaning toward GOV.UK/USWDS patterns + high contrast + accessibility-first.'
    }
];

function generateDesignRead(variance, motion, density) {
    const v = variance <= 4 ? 'centered/clean' : variance <= 7 ? 'balanced' : 'asymmetric/experimental';
    const m = motion <= 3 ? 'static' : motion <= 6 ? 'moderate' : 'cinematic';
    const d = density <= 3 ? 'spacious' : density <= 6 ? 'balanced' : 'dense';
    return `Reading this as: a layout with ${v} variance, ${m} motion, and ${d} density.`;
}

export default function TasteSkillDial({ onApply }) {
    // Initialize from persisted config if available
    const [variance, setVariance] = useState(7);
    const [motion, setMotion] = useState(6);
    const [density, setDensity] = useState(4);
    const [activePreset, setActivePreset] = useState(null);
    const [designRead, setDesignRead] = useState(null);
    const [copied, setCopied] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Load persisted config on mount
    useEffect(() => {
        try {
            const stored = readStringStorage('perci_taste_config', '');
            if (stored) {
                const config = JSON.parse(stored);
                setVariance(config.variance ?? 7);
                setMotion(config.motion ?? 6);
                setDensity(config.density ?? 4);
                if (config.designRead) setDesignRead(config.designRead);
                setLoaded(true);
            }
        } catch { /* ignore */ }
    }, []);

    const handlePreset = (preset) => {
        setVariance(preset.variance);
        setMotion(preset.motion);
        setDensity(preset.density);
        setActivePreset(preset.id);
        setDesignRead(preset.read);
    };

    const handleDialChange = (setter, value) => {
        setter(value);
        setActivePreset(null);
        setDesignRead(null);
    };

    const handleCopy = () => {
        const text = [
            `DESIGN_VARIANCE: ${variance}`,
            `MOTION_INTENSITY: ${motion}`,
            `VISUAL_DENSITY: ${density}`,
            '',
            designRead || generateDesignRead(variance, motion, density)
        ].join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleLoad = () => {
        const config = {
            variance,
            motion,
            density,
            designRead: designRead || generateDesignRead(variance, motion, density)
        };
        // Persist to storage so ChatMode/CodeMode/CoworkMode pick it up
        try {
            writeStringStorage('perci_taste_config', JSON.stringify(config));
        } catch (e) {
            console.error('Failed to save taste config:', e);
        }
        onApply?.(config);
        setLoaded(true);
    };

    const handleReset = () => {
        handlePreset(PRESETS[0]);
        try { writeStringStorage('perci_taste_config', ''); } catch { /* ignore */ }
        setLoaded(false);
    };

    const DialSlider = ({ label, value, setter, min = 1, max = 10, hint }) => (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--text-secondary)]">{label}</label>
                <span className="font-mono text-xs font-bold text-[var(--accent)]">{value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => handleDialChange(setter, parseInt(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                    background: `linear-gradient(to right, var(--accent) ${(value - min) / (max - min) * 100}%, var(--border) ${(value - min) / (max - min) * 100}%)`,
                    accentColor: 'var(--accent)'
                }}
            />
            <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                <span>{hint?.low || min}</span>
                <span>{hint?.high || max}</span>
            </div>
        </div>
    );

    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sliders size={16} className="text-[var(--accent)]" />
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Taste Skill Dials</span>
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">v2 experimental</span>
            </div>

            {/* Three dials */}
            <div className="grid grid-cols-3 gap-4">
                <DialSlider
                    label="Design Variance"
                    value={variance}
                    setter={setVariance}
                    hint={{ low: 'Symmetrical', high: 'Artsy chaos' }}
                />
                <DialSlider
                    label="Motion Intensity"
                    value={motion}
                    setter={setMotion}
                    hint={{ low: 'Static', high: 'Cinematic' }}
                />
                <DialSlider
                    label="Visual Density"
                    value={density}
                    setter={setDensity}
                    hint={{ low: 'Airy', high: 'Cockpit' }}
                />
            </div>

            {/* Presets */}
            <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Presets</p>
                <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => handlePreset(p)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                                activePreset === p.id
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Design Read output */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">Design Read</p>
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                    {designRead || generateDesignRead(variance, motion, density)}
                </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                >
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy config'}
                </button>
                <button
                    onClick={handleLoad}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity ${
                        loaded
                            ? 'bg-green-500 text-white'
                            : 'bg-[var(--accent)] text-white hover:opacity-90'
                    }`}
                >
                    {loaded ? <Power size={14} /> : <Sparkles size={14} />}
                    {loaded ? 'Loaded' : 'Load into agent'}
                </button>
                <button
                    onClick={handleReset}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                    title="Reset to default (SaaS Landing)"
                >
                    <RotateCcw size={13} />
                    Reset
                </button>
            </div>
        </div>
    );
}