import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';

// Shared toolbar dropdown for per-surface mode toggles (Caveman, Ponytail, …).
// Stateless on value — the parent persists it. `levels` is [{id,label,short,desc}];
// the first entry is treated as the inactive/"off" state.
export function LevelDropdown({ levels, value, onChange, icon: Icon, label, title }) {
    const [open, setOpen] = useState(false);
    const selected = levels.find(item => item.id === value) || levels[0];
    const active = selected.id !== levels[0].id;

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] ${active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`}
                title={title}
            >
                <Icon size={14} />
                <span>{active ? `${label}: ${selected.short}` : label}</span>
                <ChevronDown size={13} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl">
                        {levels.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    onChange?.(item.id);
                                    setOpen(false);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            >
                                <div className="flex-1">
                                    <div className="font-medium">{item.label}</div>
                                    <div className="text-[11px] text-[var(--text-tertiary)]">{item.desc}</div>
                                </div>
                                {selected.id === item.id && <Check size={14} className="shrink-0" />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
