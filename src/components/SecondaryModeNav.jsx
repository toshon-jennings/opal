import { Code, Layers3, MessageSquare } from 'lucide-react';
import { MODES, useMode } from '../context/ModeContext';

const navItems = [
    { mode: MODES.CHAT, label: 'Chat', icon: MessageSquare },
    { mode: MODES.COWORK, label: 'Cowork', icon: Layers3 },
    { mode: MODES.CODE, label: 'Code', icon: Code },
];

export function SecondaryModeNav() {
    const { currentMode, setCurrentMode } = useMode();

    return (
        <div className="px-3 pt-3 pb-2">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--bg-tertiary)] p-1 layout-transition">
                {navItems.map(({ mode, label, icon: Icon }) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => setCurrentMode(mode)}
                        className={`micro-interaction flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                            currentMode === mode
                                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        <Icon size={14} />
                        {label}
                    </button>
                ))}
            </div>
            <div className="mt-1.5 text-center text-[10px] text-[var(--text-tertiary)] select-none">
                v{__APP_VERSION__}
            </div>
        </div>
    );
}
