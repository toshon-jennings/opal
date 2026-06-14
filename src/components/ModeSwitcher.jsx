import { useMode, MODES } from '../context/ModeContext';
import { Home, MessageSquare, Code, Users, ActivitySquare, Hammer, Bot, FlaskConical, Building2, Radar, BookOpen } from 'lucide-react';

export default function ModeSwitcher() {
    const { currentMode, setCurrentMode } = useMode();

    const modes = [
        { id: MODES.DASHBOARD, icon: Home,      label: 'Home' },
        { id: MODES.CHAT,   icon: MessageSquare, label: 'Chat' },
        { id: MODES.COWORK, icon: Users,         label: 'Cowork' },
        { id: MODES.CODE,   icon: Code,          label: 'Code' },
        { id: MODES.NOTES,  icon: BookOpen,      label: 'Notes' },
        { id: MODES.AGENTS, icon: Bot,           label: 'Agents' },
        { id: MODES.MISSION, icon: ActivitySquare, label: 'Mission' },
        { id: MODES.BUILD,  icon: Hammer,        label: 'Build' },
        { id: MODES.AUTORESEARCH, icon: FlaskConical, label: 'Research' },
        { id: MODES.OFFICE, icon: Building2,     label: 'Office' },
        { id: MODES.LIGHTHOUSE, icon: Radar,     label: 'Ports' },
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
                            size={14}
                            className="relative z-10 transition-colors duration-200"
                            style={{ color: active ? 'white' : 'var(--text-tertiary)' }}
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
