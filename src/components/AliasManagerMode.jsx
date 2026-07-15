import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TerminalSquare, Search, Plus, Trash2, Power, PowerOff, Save, Info } from 'lucide-react';

function DotMatrixSpinner({ size = 24, className = '' }) {
  return (
    <svg aria-label="Loading" role="img" viewBox="0 0 56 56" width={size} height={size} className={className} style={{ color: 'currentColor' }}>
      <title>Loading</title>
      <desc>A trailing spinner sweeps the outer ring.</desc>
      <style>{`
        .dm-loader-bg { fill: currentColor; opacity: 0.07; }
        .dm-loader-lit { fill: currentColor; opacity: 0; animation: dm-loader-kf 2000ms linear infinite both; }
        @keyframes dm-loader-kf {0%{opacity:0;}4%{opacity:1;}26%{opacity:0.08;}100%{opacity:0;}}
        @media (prefers-reduced-motion: reduce) {
          .dm-loader-lit { animation: none; opacity: 0.45; }
        }
        .dm-loader-d00 { animation-delay: 0ms; }
        .dm-loader-d01 { animation-delay: 125ms; }
        .dm-loader-d02 { animation-delay: 250ms; }
        .dm-loader-d03 { animation-delay: 375ms; }
        .dm-loader-d04 { animation-delay: 500ms; }
        .dm-loader-d10 { animation-delay: 1875ms; }
        .dm-loader-d14 { animation-delay: 625ms; }
        .dm-loader-d20 { animation-delay: 1750ms; }
        .dm-loader-d24 { animation-delay: 750ms; }
        .dm-loader-d30 { animation-delay: 1625ms; }
        .dm-loader-d34 { animation-delay: 875ms; }
        .dm-loader-d40 { animation-delay: 1500ms; }
        .dm-loader-d41 { animation-delay: 1375ms; }
        .dm-loader-d42 { animation-delay: 1250ms; }
        .dm-loader-d43 { animation-delay: 1125ms; }
        .dm-loader-d44 { animation-delay: 1000ms; }
      `}</style>
      <circle className="dm-loader-bg" cx="6" cy="6" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="17" cy="6" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="28" cy="6" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="39" cy="6" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="50" cy="6" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="6" cy="17" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="17" cy="17" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="28" cy="17" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="39" cy="17" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="50" cy="17" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="6" cy="28" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="17" cy="28" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="28" cy="28" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="39" cy="28" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="50" cy="28" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="6" cy="39" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="17" cy="39" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="28" cy="39" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="39" cy="39" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="50" cy="39" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="6" cy="50" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="17" cy="50" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="28" cy="50" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="39" cy="50" r="2.4"></circle>
      <circle className="dm-loader-bg" cx="50" cy="50" r="2.4"></circle>
      <circle className="dm-loader-lit dm-loader-d00" cx="6" cy="6" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d01" cx="17" cy="6" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d02" cx="28" cy="6" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d03" cx="39" cy="6" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d04" cx="50" cy="6" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d10" cx="6" cy="17" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d14" cx="50" cy="17" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d20" cx="6" cy="28" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d24" cx="50" cy="28" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d30" cx="6" cy="39" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d34" cx="50" cy="39" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d40" cx="6" cy="50" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d41" cx="17" cy="50" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d42" cx="28" cy="50" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d43" cx="39" cy="50" r="3.1"></circle>
      <circle className="dm-loader-lit dm-loader-d44" cx="50" cy="50" r="3.1"></circle>
    </svg>
  );
}

export default function AliasManagerMode() {
    const [aliases, setAliases] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    
    // New Alias State
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newValue, setNewValue] = useState('');

    const loadAliases = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            if (window.electron?.aliasRead) {
                const result = await window.electron.aliasRead();
                if (result.ok) {
                    parseAliases(result.content);
                } else {
                    setErrorMsg("Error from main process: " + result.error);
                }
            } else {
                setErrorMsg("IPC handler window.electron.aliasRead is missing. Please restart the app.");
            }
        } catch (err) {
            console.error("Failed to read aliases (Main process might need a restart):", err);
            setErrorMsg("Failed to communicate with the main process. You likely need to completely restart the Perci app (Quit and reopen). Error: " + err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAliases();
    }, [loadAliases]);

    // Parse raw text into structured aliases
    const parseAliases = (content) => {
        if (!content) {
            setAliases([]);
            return;
        }
        const lines = content.split('\n');
        const parsed = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const isCommented = line.startsWith('#');
            const targetLine = isCommented ? line.substring(1).trim() : line;
            
            if (targetLine.startsWith('alias ')) {
                const rest = targetLine.substring(6).trim();
                const eqIndex = rest.indexOf('=');
                if (eqIndex > 0) {
                    const name = rest.substring(0, eqIndex).trim();
                    let value = rest.substring(eqIndex + 1).trim();
                    // Remove quotes if present
                    if ((value.startsWith("'") && value.endsWith("'")) || 
                        (value.startsWith('"') && value.endsWith('"'))) {
                        value = value.substring(1, value.length - 1);
                    }
                    
                    parsed.push({
                        id: `alias_${i}_${name}`,
                        name,
                        value,
                        enabled: !isCommented,
                        lineIndex: i
                    });
                }
            }
        }
        setAliases(parsed);
    };

    // Serialize aliases back to text
    const saveAliases = async (newAliases) => {
        setSaving(true);
        let content = '';
        newAliases.forEach(alias => {
            const prefix = alias.enabled ? '' : '# ';
            content += `${prefix}alias ${alias.name}="${alias.value}"\n`;
        });
        
        try {
            if (window.electron?.aliasWrite) {
                await window.electron.aliasWrite(content);
            }
            setAliases(newAliases);
        } catch (err) {
            console.error("Failed to write aliases:", err);
        } finally {
            setSaving(false);
        }
    };

    const toggleAlias = (id) => {
        const updated = aliases.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a);
        saveAliases(updated);
    };

    const deleteAlias = (id) => {
        const updated = aliases.filter(a => a.id !== id);
        saveAliases(updated);
    };

    const addAlias = (e) => {
        e.preventDefault();
        if (!newName || !newValue) return;
        
        const newAlias = {
            id: `alias_new_${Date.now()}`,
            name: newName.trim(),
            value: newValue.trim(),
            enabled: true,
            lineIndex: aliases.length
        };
        
        saveAliases([...aliases, newAlias]);
        setNewName('');
        setNewValue('');
        setIsCreating(false);
    };

    const filteredAliases = useMemo(() => {
        let result = aliases;
        if (search) {
            const s = search.toLowerCase();
            result = result.filter(a => a.name.toLowerCase().includes(s) || a.value.toLowerCase().includes(s));
        }
        // Sort alphabetically by name
        return [...result].sort((a, b) => a.name.localeCompare(b.name));
    }, [aliases, search]);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-teal-500/25 bg-teal-500/10 text-teal-400">
                        <TerminalSquare size={19} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="m-0 truncate text-base font-semibold leading-5">Alias Manager</h1>
                        <p className="m-0 truncate font-mono text-[11px] text-[var(--text-tertiary)]">~/.aliases</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3 flex-1 justify-end">
                    <div className="relative w-full max-w-[150px] sm:max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
                        <input 
                            type="text" 
                            placeholder="Search aliases..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-md pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] transition-colors"
                        />
                    </div>
                    <button
                        onClick={() => setIsCreating(!isCreating)}
                        className="inline-flex h-8 items-center gap-2 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                    >
                        <Plus size={14} />
                        New Alias
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                <div className="max-w-[1400px] mx-auto space-y-6">
                    
                    {/* INFO BANNER */}
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 flex gap-3">
                        <Info className="text-blue-400 shrink-0 mt-0.5" size={18} />
                        <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            <p className="font-semibold text-[var(--text-primary)] mb-1">Make sure your shell loads these!</p>
                            To use these aliases, ensure you have <code className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded font-mono text-xs">source ~/.aliases</code> inside your <code className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded font-mono text-xs">~/.zshrc</code> or <code className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded font-mono text-xs">~/.bashrc</code> file. Changes you make here will be available in any new terminal tab you open.
                        </div>
                    </div>

                    {/* NEW ALIAS FORM */}
                    {isCreating && (
                        <form onSubmit={addAlias} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm transition-all">
                            <h3 className="text-sm font-semibold mb-3">Create New Alias</h3>
                            <div className="flex gap-3 items-start">
                                <div className="flex-1">
                                    <label className="block text-[11px] font-medium text-[var(--text-tertiary)] mb-1 uppercase tracking-wide">Command Name</label>
                                    <input 
                                        type="text" 
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value.replace(/\s/g, ''))}
                                        placeholder="e.g. gs" 
                                        className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                                        autoFocus
                                    />
                                </div>
                                <div className="flex-[2]">
                                    <label className="block text-[11px] font-medium text-[var(--text-tertiary)] mb-1 uppercase tracking-wide">Maps To</label>
                                    <input 
                                        type="text" 
                                        value={newValue}
                                        onChange={(e) => setNewValue(e.target.value)}
                                        placeholder="e.g. git status" 
                                        className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                                    />
                                </div>
                            </div>
                            <div className="mt-4 flex justify-end gap-2">
                                <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
                                <button type="submit" disabled={!newName || !newValue} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                                    <Save size={14} /> Save
                                </button>
                            </div>
                        </form>
                    )}

                    {/* LIST */}
                    {loading ? (
                        <div className="flex items-center justify-center p-12 text-[var(--text-tertiary)]">
                            <DotMatrixSpinner size={24} />
                        </div>
                    ) : errorMsg ? (
                        <div className="text-center p-12 border border-red-500/20 bg-red-500/5 text-red-500 rounded-xl">
                            <p>{errorMsg}</p>
                            <button onClick={loadAliases} className="mt-4 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-colors text-sm">
                                Retry
                            </button>
                        </div>
                    ) : filteredAliases.length === 0 ? (
                        <div className="text-center p-12 border border-dashed border-[var(--border)] rounded-xl">
                            <TerminalSquare size={32} className="mx-auto text-[var(--border)] mb-3" />
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">No aliases found</h3>
                            <p className="text-xs text-[var(--text-tertiary)]">
                                {search ? "Try adjusting your search term." : "You don't have any aliases in ~/.aliases yet."}
                            </p>
                            {!search && !isCreating && (
                                <button onClick={() => setIsCreating(true)} className="mt-4 text-xs font-medium text-[var(--accent)] hover:underline">
                                    Create your first alias
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden shadow-sm">
                            <div className="divide-y divide-[var(--border)]">
                                {filteredAliases.map(alias => (
                                    <div key={alias.id} className={`flex flex-col sm:flex-row sm:items-start gap-4 p-4 transition-colors hover:bg-[var(--bg-tertiary)] ${!alias.enabled ? 'opacity-60 grayscale' : ''}`}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <code className={`text-sm font-bold font-mono px-2 py-0.5 rounded inline-block ${alias.enabled ? 'bg-teal-500/10 text-teal-400' : 'bg-[var(--border)] text-[var(--text-tertiary)]'}`}>
                                                        {alias.name}
                                                    </code>
                                                </div>
                                                <code className="text-xs font-mono text-[var(--text-secondary)] break-all whitespace-pre-wrap bg-[var(--bg-primary)] border border-[var(--border)] rounded p-2.5 block leading-relaxed">
                                                    {alias.value}
                                                </code>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 shrink-0 sm:pt-1">
                                            <button 
                                                onClick={() => toggleAlias(alias.id)}
                                                className={`p-1.5 rounded-md transition-colors ${alias.enabled ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                                                title={alias.enabled ? "Disable Alias" : "Enable Alias"}
                                            >
                                                {alias.enabled ? <PowerOff size={16} /> : <Power size={16} />}
                                            </button>
                                            <button 
                                                onClick={() => deleteAlias(alias.id)}
                                                className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                                title="Delete Alias"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {saving && (
                <div className="absolute bottom-4 right-4 bg-[var(--bg-secondary)] border border-[var(--border)] shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                    <DotMatrixSpinner size={12} className="text-[var(--accent)]" /> Saving...
                </div>
            )}
        </div>
    );
}
