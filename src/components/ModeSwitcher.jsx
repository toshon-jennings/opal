import { useMode, MODES } from '../context/ModeContext';
import { MessageSquare, Code, Users, ActivitySquare, Hammer } from 'lucide-react';

export default function ModeSwitcher() {
    const { currentMode, setCurrentMode } = useMode();

    const modes = [
        { id: MODES.CHAT,   icon: MessageSquare, label: 'Chat' },
        { id: MODES.COWORK, icon: Users,         label: 'Cowork' },
        { id: MODES.CODE,   icon: Code,          label: 'Code' },
        { id: MODES.MISSION, icon: ActivitySquare, label: 'Mission' },
        { id: MODES.BUILD,  icon: Hammer,        label: 'Build' },
    ];

    return (
        <div className="flex gap-0.5 p-1 rounded-xl glass-panel">
            {modes.map(mode => {
                const active = currentMode === mode.id;
                return (
                    <button
                        key={mode.id}
                        onClick={() => setCurrentMode(mode.id)}
                        aria-label={mode.label}
                        title={mode.label}
                        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                        style={{ fontFamily: 'DM Sans, sans-serif' }}
                    >
                        {/* Sliding active indicator */}
                        {active && (
                            <span
                                className="absolute inset-0 rounded-lg"
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
