import React from 'react';
import { useMode, MODES } from '../context/ModeContext';
import {
    DashboardIcon, ChatIcon, EnsembleIcon, CoworkIcon, CodeIcon, NotesIcon, ResearchIcon,
    AgentsIcon, OfficeIcon, BuildIcon, MissionIcon, ProjectsIcon, SurfaceMapIcon, PerciNowIcon, PerciDeskIcon,
} from './ModeIcons';
import { Globe } from 'lucide-react';

// Duotone palettes for the custom mode icons (see ModeIcons.jsx).
// Secondary is a translucent tint so the primary outline/detail stays
// legible at ~15px; the solid accent does the recognising, not the fill.
const ICON_ACTIVE = { '--mi-primary': '#fff', '--mi-secondary': 'rgba(255,255,255,0.32)' };
const ICON_RESTING = {
    '--mi-primary': 'var(--accent)',
    '--mi-secondary': 'color-mix(in srgb, var(--accent-cyan) 50%, transparent)',
};

export default function ModeSwitcher() {
    const { currentMode, setCurrentMode, windows } = useMode();

    const perciNowOpen = windows.some(w => w.id === MODES.PERCI_NOW && w.state !== 'minimized');
    const perciDeskOpen = windows.some(w => w.id === MODES.PERCI_DESK && w.state !== 'minimized');

    const modes = [
        { id: MODES.DASHBOARD, icon: DashboardIcon, label: '' },
        { id: MODES.SURFACE_MAP, icon: SurfaceMapIcon, label: 'Map' },
        { id: MODES.PERCI_NOW, icon: PerciNowIcon, label: 'Now' },
        { id: MODES.PERCI_DESK, icon: PerciDeskIcon, label: 'Desk' },
        { id: MODES.CHAT,   icon: ChatIcon,         label: 'Chat' },
        { id: MODES.ENSEMBLE, icon: EnsembleIcon,   label: 'Ensemble' },
        { id: MODES.COWORK, icon: CoworkIcon,       label: 'Cowork' },
        { id: MODES.CODE,   icon: CodeIcon,         label: 'Code' },
        { id: MODES.PROJECTS, icon: ProjectsIcon,   label: 'Git Shells' },
        { id: MODES.NOTES,  icon: NotesIcon,        label: 'Notes' },
        { id: MODES.AUTORESEARCH, icon: ResearchIcon, label: 'Autoresearch' },
        { id: MODES.AGENTS, icon: AgentsIcon,       label: 'Agents' },
        { id: MODES.OFFICE, icon: OfficeIcon,       label: 'Office' },
        { id: MODES.BUILD,  icon: BuildIcon,        label: 'Build' },
        { id: MODES.MISSION, icon: MissionIcon,     label: 'Mission' },
        { id: MODES.LIGHTHOUSE, icon: Globe, label: 'Localhost', color: '#f97316' },
    ];

    return (
        <div className="flex gap-0.5 p-1 rounded-xl glass-panel layout-transition">
            {modes.map(mode => {
                const active = currentMode === mode.id
                    || (mode.id === MODES.PERCI_NOW && perciNowOpen)
                    || (mode.id === MODES.PERCI_DESK && perciDeskOpen);
                return (
                    <button
                        key={mode.id}
                        onClick={() => setCurrentMode(mode.id)}
                        aria-label={mode.label}
                        title={mode.label}
                        className="micro-interaction state-feedback relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                        style={{ fontFamily: 'DM Sans, sans-serif' }}
                    >
                        {/* Sliding active indicator */}
                        {active && (
                            <span
                                className="absolute inset-0 rounded-lg layout-transition"
                                style={mode.color ? { background: 'linear-gradient(135deg, ' + mode.color + ', color-mix(in srgb, ' + mode.color + ' 70%, white))', boxShadow: '0 0 16px color-mix(in srgb, ' + mode.color + ' 50%, transparent)' } : {
                                    background: 'linear-gradient(135deg, var(--accent), var(--accent-cyan))',
                                    boxShadow: '0 0 16px var(--accent-glow)',
                                }}
                            />
                        )}
                        <mode.icon
                            size={15}
                            className="relative z-10 transition-colors duration-200"
                            style={mode.color ? { '--mi-primary': mode.color, '--mi-secondary': 'color-mix(in srgb, ' + mode.color + ' 50%, transparent)', color: active ? 'white' : mode.color } : active ? ICON_ACTIVE : ICON_RESTING}
                        />
                        <span
                            className="relative z-10 hidden lg:inline transition-colors duration-200"
                            style={{ color: mode.color ? mode.color : active ? 'white' : 'var(--text-secondary)' }}
                        >
                            {mode.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
