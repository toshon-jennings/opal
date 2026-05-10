import React, { useState, useEffect } from 'react';

export function ChangelogModal({ isOpen, onClose }) {
    const [index, setIndex] = useState(0);
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        if (isOpen) {
            fetch('/CHANGELOG.md')
                .then(res => res.text())
                .then(text => {
                    // Simple parser for [version] headers
                    const versions = text.split(/## \[([\d.]+)\]/).slice(1);
                    const parsed = [];
                    for (let i = 0; i < versions.length; i += 2) {
                        parsed.push({
                            version: versions[i],
                            content: versions[i + 1]?.split('##')[0].trim() || ''
                        });
                    }
                    setLogs(parsed);
                })
                .catch(err => console.error('Failed to load changelog:', err));
        }
    }, [isOpen]);

    if (!isOpen) return null;
    if (logs.length === 0) return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-8 text-center max-w-md">
                <p className="text-[var(--text-primary)]">Loading changelog...</p>
                <button onClick={onClose} className="mt-4 text-[var(--accent)] hover:underline">Close</button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-md">
            <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in">
                <div className="glass-header p-6 flex items-center justify-between border-b border-[var(--border)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        Changelog
                    </h2>
                    <button onClick={onClose} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        ✕
                    </button>
                </div>
                
                <div className="p-8 min-h-[300px] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <button 
                            disabled={index === 0}
                            onClick={() => setIndex(i => i - 1)}
                            className="p-2 rounded-full bg-[var(--bg-secondary)] text-[var(--text-primary)] disabled:opacity-30 transition-all hover:bg-[var(--bg-tertiary)]"
                        >
                            ←
                        </button>
                        <span className="text-sm font-mono font-medium text-[var(--accent)]">
                            Version {logs[index]?.version}
                        </span>
                        <button 
                            disabled={index === logs.length - 1}
                            onClick={() => setIndex(i => i + 1)}
                            className="p-2 rounded-full bg-[var(--bg-secondary)] text-[var(--text-primary)] disabled:opacity-30 transition-all hover:bg-[var(--bg-tertiary)]"
                        >
                            →
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto prose prose-sm max-w-none text-[var(--text-secondary)] leading-relaxed">
                        <div className="whitespace-pre-wrap">{logs[index]?.content}</div>
                    </div>
                </div>
                
                <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] text-center">
                    <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">
                        Opal OS v{logs[index]?.version}
                    </p>
                </div>
            </div>
        </div>
    );
}
