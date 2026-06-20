import { useMode, MODES } from '../context/ModeContext';
import {
    DashboardIcon, ChatIcon, CoworkIcon, CodeIcon, NotesIcon, ResearchIcon,
    AgentsIcon, OfficeIcon, BuildIcon, MissionIcon, PortsIcon,
} from './ModeIcons';

// Duotone palettes for the custom mode icons (see ModeIcons.jsx).
// Secondary is a translucent tint so the primary outline/detail stays
// legible at ~15px; the solid accent does the recognising, not the fill.
const ICON_ACTIVE = { '--mi-primary': '#fff', '--mi-secondary': 'rgba(255,255,255,0.32)' };
const ICON_RESTING = {
    '--mi-primary': 'var(--accent)',
    '--mi-secondary': 'color-mix(in srgb, var(--accent-cyan) 50%, transparent)',
};

export default function ModeSwitcher() {
    const { currentMode, setCurrentMode } = useMode();

    const modes = [
        { id: MODES.DASHBOARD, icon: DashboardIcon, label: '' },
        { id: MODES.CHAT,   icon: ChatIcon,         label: 'Chat' },
        { id: MODES.COWORK, icon: CoworkIcon,       label: 'Cowork' },
        { id: MODES.CODE,   icon: CodeIcon,         label: 'Code' },
        { id: MODES.NOTES,  icon: NotesIcon,        label: 'Notes' },
        { id: MODES.AUTORESEARCH, icon: ResearchIcon, label: 'Research' },
        { id: MODES.AGENTS, icon: AgentsIcon,       label: 'Agents' },
        { id: MODES.OFFICE, icon: OfficeIcon,       label: 'Office' },
        { id: MODES.BUILD,  icon: BuildIcon,        label: 'Build' },
        { id: MODES.MISSION, icon: MissionIcon,     label: 'Mission' },
        { id: MODES.LIGHTHOUSE, icon: PortsIcon,    label: 'Ports' },
    ];

    return (
        <div className="flex gap-0.5 p-1 rounded-xl glass-panel layout-transition">
            {modes.map(mode => {
                const active = currentMode === mode.id;
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
                                style={{
                                    background: 'linear-gradient(135deg, var(--accent), var(--accent-cyan))',
                                    boxShadow: '0 0 16px var(--accent-glow)',
                                }}
                            />
                        )}
                        <mode.icon
                            size={15}
                            className="relative z-10 transition-colors duration-200"
                            style={active ? ICON_ACTIVE : ICON_RESTING}
                        />
                        <span
                            className="relative z-10 hidden lg:inline transition-colors duration-200"
                            style={{ color: active ? 'white' : 'var(--text-secondary)' }}
                        >
                            {mode.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
