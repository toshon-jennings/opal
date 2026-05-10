import { Check, ChevronDown, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react';
import { useState } from 'react';

const PERMISSIONS = [
    { id: 'full', label: 'Full access', icon: ShieldCheck },
    { id: 'ask', label: 'Ask first', icon: ShieldQuestion },
    { id: 'read', label: 'Read only', icon: ShieldX },
];

export function PermissionsDropdown({ value = 'full', onChange }) {
    const [open, setOpen] = useState(false);
    const selected = PERMISSIONS.find(item => item.id === value) || PERMISSIONS[0];
    const SelectedIcon = selected.icon;

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                title="Tool permissions"
            >
                <SelectedIcon size={14} />
                <span>{selected.label}</span>
                <ChevronDown size={13} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute bottom-full left-0 z-30 mb-2 w-44 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl">
                        {PERMISSIONS.map(item => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        onChange?.(item.id);
                                        setOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                >
                                    <Icon size={15} className="text-[var(--accent)]" />
                                    <span className="flex-1">{item.label}</span>
                                    {selected.id === item.id && <Check size={14} />}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
