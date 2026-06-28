import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity, BarChart3, CheckCircle2, Clock, ExternalLink, Globe,
    MessageSquare, RefreshCw, Send, Square, Terminal, TerminalSquare,
    Trash2, XCircle, Zap
} from 'lucide-react';
import TerminalTabs from './TerminalTabs';
import ChatTab from './ChatTab';
import NousBadge from './NousBadge';

// Hermes window surface. A deliberately lighter sibling of the OpenClaw
// window: one-shot runs through `hermes -z` (Console), the session store
// (Sessions), usage analytics (Insights), and the embedded `hermes dashboard`
// web UI. All CLI access goes through the hermes:* IPC bridge in main.cjs.

const HERMES_AMBER = '#eab308';

const TABS = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'console', label: 'Console', icon: Terminal },
    { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
    { id: 'sessions', label: 'Sessions', icon: MessageSquare },
    { id: 'insights', label: 'Insights', icon: BarChart3 },
    { id: 'memory', label: 'Memory', icon: Zap },
    { id: 'webui', label: 'Nous Web UI', icon: Globe },
];

function formatClock(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// `tools.terminal_tool` → `terminal`; `agent.conversation_loop` → `agent`.
function describeLogComponent(component = '') {
    if (component.startsWith('tools.')) {
        return { kind: 'tool', label: component.slice(6).replace(/_tool$/, '') };
    }
    return { kind: 'agent', label: component.split('.')[0] || 'agent' };
}

function StatusChip({ icon: Icon, label, tone = 'neutral' }) {
    const toneClass = tone === 'good'
        ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'
        : tone === 'bad'
            ? 'text-red-400 border-red-500/30 bg-red-500/10'
            : 'text-[var(--text-secondary)] border-[var(--border)] bg-[var(--bg-secondary)]';
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
            <Icon size={11} />
            {label}
        </span>
    );
}

function InsightsDashboard({ text, insightDays }) {
    // 1. Parse text
    const sections = {};
    const lines = text.split('\n');
    let currentSection = null;
    let sectionLines = [];
    
    for (let line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Match headers
        if (trimmed.startsWith('📋') || trimmed.startsWith('🤖') || trimmed.startsWith('📱') || 
            trimmed.startsWith('🔧') || trimmed.startsWith('🧠') || trimmed.startsWith('📅') || 
            trimmed.startsWith('🏆') || trimmed.startsWith('📊')) {
            if (currentSection) {
                sections[currentSection] = sectionLines;
            }
            currentSection = trimmed;
            sectionLines = [];
        } else if (currentSection && !trimmed.startsWith('───')) {
            sectionLines.push(trimmed);
        }
    }
    if (currentSection) {
        sections[currentSection] = sectionLines;
    }

    // Try parsing overview stats
    const overview = {};
    let hasOverview = false;
    const overviewHeaderKey = Object.keys(sections).find(k => k.includes('Overview'));
    if (overviewHeaderKey && sections[overviewHeaderKey]) {
        hasOverview = true;
        const overviewText = sections[overviewHeaderKey].join('\n');
        const regex = /([A-Za-z \t\/]+):\s*([^ \t\r\n]+(?:[ \t][^ \t\r\n]+)*)/g;
        let match;
        while ((match = regex.exec(overviewText)) !== null) {
            overview[match[1].trim()] = match[2].trim();
        }
    }


    // Fallback if we couldn't parse the overview section properly
    if (!hasOverview || Object.keys(overview).length === 0) {
        return <pre className="overflow-auto whitespace-pre rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 font-mono text-[11px] leading-5 text-[var(--text-secondary)]">{text}</pre>;
    }

    // Parse models
    const models = [];
    const modelsHeaderKey = Object.keys(sections).find(k => k.includes('Models Used'));
    if (modelsHeaderKey && sections[modelsHeaderKey]) {
        sections[modelsHeaderKey].forEach((line, idx) => {
            if (idx === 0) return;
            const parts = line.split(/\s{2,}/);
            if (parts.length >= 2) {
                models.push({
                    name: parts[0],
                    sessions: parts[1],
                    tokens: parts[2] || '0'
                });
            }
        });
    }

    // Parse tools
    const tools = [];
    const toolsHeaderKey = Object.keys(sections).find(k => k.includes('Top Tools'));
    if (toolsHeaderKey && sections[toolsHeaderKey]) {
        sections[toolsHeaderKey].forEach((line, idx) => {
            if (idx === 0) return;
            if (line.startsWith('...')) return;
            const parts = line.split(/\s{2,}/);
            if (parts.length >= 2) {
                tools.push({
                    name: parts[0],
                    calls: parts[1],
                    pct: parts[2] || '0%'
                });
            }
        });
    }

    // Parse activity patterns
    const activity = [];
    let peakHours = '';
    let activeDays = '';
    let bestStreak = '';
    const activityHeaderKey = Object.keys(sections).find(k => k.includes('Activity Patterns'));
    if (activityHeaderKey && sections[activityHeaderKey]) {
        sections[activityHeaderKey].forEach(line => {
            if (line.startsWith('Peak hours:')) {
                peakHours = line.replace('Peak hours:', '').trim();
            } else if (line.startsWith('Active days:')) {
                activeDays = line.replace('Active days:', '').trim();
            } else if (line.startsWith('Best streak:')) {
                bestStreak = line.replace('Best streak:', '').trim();
            } else {
                const parts = line.split(/\s+/);
                if (parts.length >= 2) {
                    const countStr = parts[parts.length - 1];
                    const count = parseInt(countStr, 10);
                    if (!Number.isNaN(count)) {
                        activity.push({
                            day: parts[0],
                            count: count,
                            bar: parts.slice(1, parts.length - 1).join(' ')
                        });
                    }
                }
            }
        });
    }

    // Parse notable sessions
    const notable = [];
    const notableHeaderKey = Object.keys(sections).find(k => k.includes('Notable Sessions'));
    if (notableHeaderKey && sections[notableHeaderKey]) {
        sections[notableHeaderKey].forEach(line => {
            const parts = line.split(/\s{2,}/);
            if (parts.length >= 2) {
                notable.push({
                    label: parts[0],
                    value: parts[1],
                    session: parts[2] || ''
                });
            }
        });
    }

    // Find stats values
    const statSessions = overview['Sessions'] || '0';
    const statMessages = overview['Messages'] || '0';
    const statTools = overview['Tool calls'] || '0';
    const statTokens = overview['Total tokens'] || overview['Total Tokens'] || '0';
    const statActiveTime = overview['Active time'] || '0';
    const statAvgSession = overview['Avg session'] || '0';
    
    // Find max count for activity bar scaling
    const maxActivityCount = activity.length > 0 ? Math.max(...activity.map(a => a.count)) : 1;
    // Find max tool calls for bar scaling
    const maxToolCalls = tools.length > 0 ? parseInt(tools[0].calls.replace(/,/g, ''), 10) || 1 : 1;

    return (
        <div className="space-y-6 pb-8">
            {/* Top Row Overview Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                            <MessageSquare size={18} />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Sessions</p>
                            <p className="text-lg font-bold text-[var(--text-primary)] mt-0.5">{statSessions}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex justify-between text-[11px] text-[var(--text-secondary)] border-t border-[var(--border)] pt-2.5">
                        <span>Avg Messages</span>
                        <span className="font-medium">{overview['Avg msgs/session'] || '—'}</span>
                    </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                            <Activity size={18} />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Messages</p>
                            <p className="text-lg font-bold text-[var(--text-primary)] mt-0.5">{statMessages}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex justify-between text-[11px] text-[var(--text-secondary)] border-t border-[var(--border)] pt-2.5">
                        <span>User / Assistant</span>
                        <span className="font-medium">{overview['User messages'] || '—'} / {parseInt(statMessages.replace(/,/g,''),10) - parseInt((overview['User messages'] || '0').replace(/,/g,''),10) || '—'}</span>
                    </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                            <Terminal size={18} />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Tool Calls</p>
                            <p className="text-lg font-bold text-[var(--text-primary)] mt-0.5">{statTools}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex justify-between text-[11px] text-[var(--text-secondary)] border-t border-[var(--border)] pt-2.5">
                        <span>Active Time</span>
                        <span className="font-medium">{statActiveTime}</span>
                    </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                            <Zap size={18} />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Total Tokens</p>
                            <p className="text-lg font-bold text-[var(--text-primary)] mt-0.5 truncate" title={statTokens}>{statTokens}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex justify-between text-[11px] text-[var(--text-secondary)] border-t border-[var(--border)] pt-2.5">
                        <span>Avg Session</span>
                        <span className="font-medium">{statAvgSession}</span>
                    </div>
                </div>
            </div>

            {/* Grid for details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Side: Top Tools and Activity */}
                <div className="space-y-6">
                    {/* Top Tools */}
                    {tools.length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 mb-4 flex items-center justify-between">
                                <span>Top Tools Used</span>
                                <span className="text-[10px] font-normal text-[var(--text-tertiary)] normal-case">By total calls</span>
                            </h3>
                            <div className="space-y-3.5">
                                {tools.slice(0, 6).map(tool => {
                                    const callsNum = parseInt(tool.calls.replace(/,/g, ''), 10) || 0;
                                    const pctWidth = maxToolCalls > 0 ? (callsNum / maxToolCalls) * 100 : 0;
                                    return (
                                        <div key={tool.name} className="space-y-1.5">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-mono font-medium text-[var(--text-primary)]">{tool.name}</span>
                                                <span className="text-[var(--text-secondary)]">{tool.calls} calls <span className="text-[var(--text-tertiary)]">({tool.pct})</span></span>
                                            </div>
                                            <div className="h-1.5 w-full rounded-full bg-[var(--border)]/40 overflow-hidden">
                                                <div 
                                                    className="h-full rounded-full bg-amber-500/80 transition-all duration-500" 
                                                    style={{ width: `${Math.max(3, pctWidth)}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Activity Patterns */}
                    {activity.length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 mb-4">
                                Activity Patterns
                            </h3>
                            <div className="space-y-3">
                                {activity.map(act => {
                                    const pctWidth = maxActivityCount > 0 ? (act.count / maxActivityCount) * 100 : 0;
                                    return (
                                        <div key={act.day} className="flex items-center gap-3 text-xs">
                                            <span className="w-8 font-medium text-[var(--text-secondary)]">{act.day}</span>
                                            <div className="flex-1 h-5 flex items-center">
                                                <div 
                                                    className="h-3 rounded bg-amber-500/20 border-l-2 border-amber-500 flex items-center justify-end px-2 text-[9px] font-semibold text-amber-500 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                                                    style={{ width: `${Math.max(10, pctWidth)}%`, minWidth: '32px' }}
                                                >
                                                    {act.count}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {(peakHours || activeDays || bestStreak) && (
                                <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                    {activeDays && (
                                        <div>
                                            <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-semibold">Active Days</span>
                                            <span className="text-[var(--text-primary)] font-medium">{activeDays}</span>
                                        </div>
                                    )}
                                    {bestStreak && (
                                        <div>
                                            <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-semibold">Best Streak</span>
                                            <span className="text-[var(--text-primary)] font-medium">{bestStreak}</span>
                                        </div>
                                    )}
                                    {peakHours && (
                                        <div className="sm:col-span-1">
                                            <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-semibold">Peak Hours</span>
                                            <span className="text-[var(--text-primary)] font-medium truncate block" title={peakHours}>{peakHours}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Side: Models Used and Notable Sessions */}
                <div className="space-y-6">
                    {/* Models Used */}
                    {models.length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 mb-4">
                                Models Used
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="text-[var(--text-tertiary)] font-medium border-b border-[var(--border)]/60">
                                            <th className="pb-2 font-semibold">Model</th>
                                            <th className="pb-2 text-right font-semibold">Sessions</th>
                                            <th className="pb-2 text-right font-semibold">Tokens</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]/40">
                                        {models.slice(0, 7).map(m => (
                                            <tr key={m.name} className="hover:bg-[var(--bg-hover)]/20">
                                                <td className="py-2.5 font-mono text-[11px] text-[var(--text-primary)]">{m.name}</td>
                                                <td className="py-2.5 text-right text-[var(--text-secondary)]">{m.sessions}</td>
                                                <td className="py-2.5 text-right text-[var(--text-secondary)] font-mono text-[11px]">{m.tokens}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Notable Sessions */}
                    {notable.length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 mb-4">
                                Notable Sessions
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {notable.map((item, idx) => (
                                    <div key={idx} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] block">{item.label}</span>
                                        <span className="text-sm font-bold text-amber-500 mt-1 block">{item.value}</span>
                                        {item.session && (
                                            <span className="text-[9px] font-mono text-[var(--text-tertiary)] block mt-1.5 truncate" title={item.session}>
                                                ID: {item.session.replace(/[()]/g, '')}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MemoryDashboard({ memoryData, onRefresh }) {
    const { memory, user } = memoryData;

    const memoryPct = memory.limit > 0 ? Math.min(100, Math.round((memory.chars / memory.limit) * 100)) : 0;
    const userPct = user.limit > 0 ? Math.min(100, Math.round((user.chars / user.limit) * 100)) : 0;

    const memoryColor = memoryPct >= 90 ? 'bg-red-500' : memoryPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
    const userColor = userPct >= 90 ? 'bg-red-500' : userPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

    const memoryTextColor = memoryPct >= 90 ? 'text-red-400' : memoryPct >= 70 ? 'text-amber-400' : 'text-emerald-400';
    const userTextColor = userPct >= 90 ? 'text-red-400' : userPct >= 70 ? 'text-amber-400' : 'text-emerald-400';

    return (
        <div className="space-y-6 pb-8">
            {/* Usage Overview Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Memory Store Card */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                                <Zap size={18} />
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Memory Store</p>
                                <p className="text-lg font-bold text-[var(--text-primary)] mt-0.5">{memory.entries.length} entries</p>
                            </div>
                        </div>
                        <span className={`text-2xl font-bold ${memoryTextColor}`}>{memoryPct}%</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-[var(--border)]/40 overflow-hidden">
                        <div
                            className={`h-full rounded-full ${memoryColor} transition-all duration-500`}
                            style={{ width: `${Math.max(2, memoryPct)}%` }}
                        />
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
                        {memory.chars.toLocaleString()} / {memory.limit.toLocaleString()} chars
                        {memoryPct >= 90 && <span className="ml-2 text-red-400 font-semibold">— Critical</span>}
                        {memoryPct >= 70 && memoryPct < 90 && <span className="ml-2 text-amber-400 font-semibold">— Warning</span>}
                    </p>
                </div>

                {/* User Profile Card */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                                <MessageSquare size={18} />
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">User Profile</p>
                                <p className="text-lg font-bold text-[var(--text-primary)] mt-0.5">{user.entries.length} entries</p>
                            </div>
                        </div>
                        <span className={`text-2xl font-bold ${userTextColor}`}>{userPct}%</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-[var(--border)]/40 overflow-hidden">
                        <div
                            className={`h-full rounded-full ${userColor} transition-all duration-500`}
                            style={{ width: `${Math.max(2, userPct)}%` }}
                        />
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
                        {user.chars.toLocaleString()} / {user.limit.toLocaleString()} chars
                        {userPct >= 90 && <span className="ml-2 text-red-400 font-semibold">— Critical</span>}
                        {userPct >= 70 && userPct < 90 && <span className="ml-2 text-amber-400 font-semibold">— Warning</span>}
                    </p>
                </div>
            </div>

            {/* Memory Entries */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Memory Entries <span className="text-[var(--text-tertiary)] font-normal">({memory.entries.length})</span>
                    </h3>
                    <button
                        onClick={onRefresh}
                        className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Refresh"
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>
                <div className="divide-y divide-[var(--border)]/40">
                    {memory.entries.length === 0 ? (
                        <div className="px-5 py-8 text-center text-xs text-[var(--text-tertiary)]">No memory entries.</div>
                    ) : (
                        memory.entries.map((entry, idx) => {
                            const charCount = entry.length;
                            return (
                                <div key={idx} className="px-5 py-3 hover:bg-[var(--bg-hover)]/20 transition-colors">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-[13px] leading-5 text-[var(--text-primary)] flex-1 whitespace-pre-wrap">{entry}</p>
                                        <span className="shrink-0 text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5">{charCount}c</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* User Profile Entries */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        User Profile Entries <span className="text-[var(--text-tertiary)] font-normal">({user.entries.length})</span>
                    </h3>
                </div>
                <div className="divide-y divide-[var(--border)]/40">
                    {user.entries.length === 0 ? (
                        <div className="px-5 py-8 text-center text-xs text-[var(--text-tertiary)]">No user profile entries.</div>
                    ) : (
                        user.entries.map((entry, idx) => {
                            const charCount = entry.length;
                            return (
                                <div key={idx} className="px-5 py-3 hover:bg-[var(--bg-hover)]/20 transition-colors">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-[13px] leading-5 text-[var(--text-primary)] flex-1 whitespace-pre-wrap">{entry}</p>
                                        <span className="shrink-0 text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5">{charCount}c</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Context Budget Impact */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 mb-4">
                    Context Budget Impact
                </h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                        <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-semibold">Total Overhead</span>
                        <span className="text-[var(--text-primary)] font-medium">{(memory.chars + user.chars).toLocaleString()} chars</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-semibold">Total Entries</span>
                        <span className="text-[var(--text-primary)] font-medium">{memory.entries.length + user.entries.length}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-semibold">Avg Entry Size</span>
                        <span className="text-[var(--text-primary)] font-medium">
                            {memory.entries.length + user.entries.length > 0
                                ? Math.round((memory.chars + user.chars) / (memory.entries.length + user.entries.length))
                                : 0} chars
                        </span>
                    </div>
                    <div>
                        <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-semibold">Largest Entry</span>
                        <span className="text-[var(--text-primary)] font-medium">
                            {Math.max(
                                ...memory.entries.map(e => e.length),
                                ...user.entries.map(e => e.length),
                                0
                            ).toLocaleString()} chars
                        </span>
                    </div>
                </div>
                <p className="mt-4 pt-3 border-t border-[var(--text-tertiary)]/20 text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                    These entries are injected into the system prompt on every turn. High usage reduces the available context window for conversation.
                    Keep total overhead under 2,500 chars for best results.
                </p>
            </div>
        </div>
    );
}

export default function HermesMode() {
    const isDesktop = Boolean(window.electron?.getHermesStatus);

    const [activeTab, setActiveTab] = useState('chat');
    const [status, setStatus] = useState({ state: 'loading' });
    // The multitab terminal mounts on first visit and then stays mounted
    // (hidden) so its shell sessions survive switching to other tabs.
    const [terminalOpened, setTerminalOpened] = useState(false);
    useEffect(() => { if (activeTab === 'terminal') setTerminalOpened(true); }, [activeTab]);

    // Chat tab stays mounted so session survives switching.
    const [chatMounted, setChatMounted] = useState(false);
    useEffect(() => { if (activeTab === 'chat') setChatMounted(true); }, [activeTab]);

    // Console state
    const [prompt, setPrompt] = useState('');
    const [runs, setRuns] = useState([]); // newest first: { id, prompt, startedAt, status, output, error, finishedAt }
    const [activity, setActivity] = useState([]); // live parsed agent.log tail
    const [showActivity, setShowActivity] = useState(true);
    const runningRun = runs.find(r => r.status === 'running') || null;

    // Sessions / Insights / Web UI state
    const [sessions, setSessions] = useState({ state: 'idle' });
    const [insightDays, setInsightDays] = useState(30);
    const [insights, setInsights] = useState({ state: 'idle', byDays: {} });
    const [dashboard, setDashboard] = useState({ state: 'idle' });

    // Memory state
    const [memoryData, setMemoryData] = useState({ state: 'idle' });

    const runsEndRef = useRef(null);
    const activityEndRef = useRef(null);

    const refreshStatus = useCallback(async () => {
        if (!isDesktop) {
            setStatus({ state: 'unsupported' });
            return;
        }
        setStatus(s => (s.state === 'ready' ? { ...s, refreshing: true } : { state: 'loading' }));
        const result = await window.electron.getHermesStatus();
        if (result?.ok) setStatus({ state: 'ready', ...result });
        else setStatus({ state: 'error', error: result?.error || 'Hermes CLI is unavailable.' });
    }, [isDesktop]);

    useEffect(() => { refreshStatus(); }, [refreshStatus]);

    // Live agent.log tail: runs while the window is mounted so tool calls and
    // turns are visible as they happen, even for runs started elsewhere
    // (Telegram, cron, the Agents panel).
    useEffect(() => {
        if (!isDesktop) return undefined;
        window.electron.startHermesLogs();
        const unsubscribe = window.electron.onHermesLogEvent(evt => {
            if (evt?.type !== 'log') return;
            if (evt.component?.startsWith('gateway.')) return; // heartbeat noise
            setActivity(list => [...list.slice(-199), { ...evt, key: `${evt.time}-${list.length}-${Math.random().toString(36).slice(2, 6)}` }]);
        });
        return () => {
            unsubscribe();
            window.electron.stopHermesLogs();
        };
    }, [isDesktop]);

    // Run completion events from the one-shot bridge.
    useEffect(() => {
        if (!isDesktop) return undefined;
        return window.electron.onHermesRunEvent(evt => {
            setRuns(list => list.map(run => {
                if (run.id !== evt.id || run.status !== 'running') return run;
                if (evt.type === 'done') return { ...run, status: 'done', output: evt.output, finishedAt: evt.finishedAt };
                if (evt.type === 'cancelled') return { ...run, status: 'cancelled', finishedAt: evt.finishedAt };
                return { ...run, status: 'failed', error: evt.error || 'Run failed.', finishedAt: evt.finishedAt };
            }));
        });
    }, [isDesktop]);

    useEffect(() => { runsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [runs]);
    useEffect(() => { activityEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activity]);

    const submitRun = async () => {
        const text = prompt.trim();
        if (!text || runningRun || !isDesktop) return;
        const result = await window.electron.runHermesTask({ prompt: text });
        if (!result?.ok) {
            setRuns(list => [...list, { id: `local-${Date.now()}`, prompt: text, startedAt: new Date().toISOString(), status: 'failed', error: result?.error || 'Could not start Hermes.' }]);
            return;
        }
        setPrompt('');
        setRuns(list => [...list, { id: result.id, prompt: text, startedAt: result.startedAt, status: 'running' }]);
    };

    const cancelRun = async () => {
        if (!runningRun) return;
        await window.electron.cancelHermesRun();
    };

    const loadSessions = useCallback(async () => {
        setSessions(s => ({ ...s, state: 'loading' }));
        const result = await window.electron.listHermesSessions({ limit: 30 });
        if (result?.ok) setSessions({ state: 'ready', sessions: result.sessions, stats: result.stats });
        else setSessions({ state: 'error', error: result?.error || 'Could not load sessions.' });
    }, []);

    const loadInsights = useCallback(async (days) => {
        setInsights(s => ({ ...s, state: 'loading', days }));
        const result = await window.electron.getHermesInsights({ days });
        setInsights(s => result?.ok
            ? { state: 'ready', days, byDays: { ...s.byDays, [days]: result.text } }
            : { ...s, state: 'error', days, error: result?.error || 'Could not load insights.' });
    }, []);

    const checkDashboard = useCallback(async () => {
        setDashboard(d => (d.state === 'running' ? d : { state: 'checking' }));
        const result = await window.electron.getHermesDashboardStatus();
        setDashboard(result?.running ? { state: 'running', url: result.url } : { state: 'stopped', url: result?.url });
    }, []);

    const startDashboard = async () => {
        setDashboard(d => ({ ...d, state: 'starting' }));
        const result = await window.electron.startHermesDashboard();
        setDashboard(result?.running
            ? { state: 'running', url: result.url }
            : { state: 'stopped', url: result?.url, error: result?.error || 'Could not start the dashboard.' });
    };

    const loadMemory = useCallback(async () => {
        setMemoryData({ state: 'loading' });
        try {
            const result = await window.electron.getHermesMemory();
            if (result?.ok) {
                setMemoryData({ state: 'ready', ...result });
            } else {
                setMemoryData({ state: 'error', error: result?.error || 'Failed to load memory.' });
            }
        } catch (err) {
            setMemoryData({ state: 'error', error: err.message || 'Failed to load memory.' });
        }
    }, []);

    // Lazy-load tab data on first visit.
    useEffect(() => {
        if (!isDesktop) return;
        if (activeTab === 'sessions' && sessions.state === 'idle') loadSessions();
        if (activeTab === 'insights' && !insights.byDays[insightDays] && insights.state !== 'loading') loadInsights(insightDays);
        if (activeTab === 'webui' && dashboard.state === 'idle') checkDashboard();
        if (activeTab === 'memory' && memoryData.state === 'idle') loadMemory();
    }, [activeTab, isDesktop, sessions.state, insights.byDays, insights.state, insightDays, dashboard.state, memoryData.state, loadSessions, loadInsights, checkDashboard, loadMemory]);

    const vitals = useMemo(() => {
        if (status.state !== 'ready') return [];
        return [
            ...(status.model ? [{ icon: Zap, label: status.model }] : []),
            ...(status.keysTotal ? [{ icon: Activity, label: `${status.keysConfigured}/${status.keysTotal} providers` }] : []),
            ...(status.scheduledJobs ? [{ icon: Clock, label: `Cron: ${status.scheduledJobs}` }] : []),
            ...(status.activeSessions != null ? [{ icon: MessageSquare, label: `${status.activeSessions} active session${status.activeSessions === 1 ? '' : 's'}` }] : []),
        ];
    }, [status]);

    if (!isDesktop) {
        return (
            <div className="flex h-full items-center justify-center bg-[var(--bg-primary)] p-8">
                <div className="max-w-md text-center">
                    <div className="mb-4 flex justify-center"><NousBadge size="h-12 w-12" /></div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Hermes requires the desktop app</h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        The Hermes surface drives the local <code className="font-mono">hermes</code> CLI, which is only reachable from Perci&apos;s Electron build.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-[var(--bg-primary)]">
            {/* Header */}
            <div className="hermes-header flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className={`relative rounded-full transition-shadow duration-500 ${runningRun ? 'shadow-[0_0_18px_rgba(234,179,8,0.45)]' : ''}`}>
                        <NousBadge />
                        {runningRun && (
                            <span
                                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full animate-pulse-subtle"
                                style={{ backgroundColor: HERMES_AMBER, boxShadow: `0 0 8px ${HERMES_AMBER}` }}
                            />
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {status.state === 'ready' ? status.version : 'Hermes Agent'}
                        </div>
                        <div className="truncate text-[11px] text-[var(--text-tertiary)]">
                            {runningRun
                                ? 'Working on a task…'
                                : status.state === 'ready'
                                    ? [status.model, status.provider].filter(Boolean).join(' · ') || 'Local CLI'
                                    : status.state === 'loading'
                                        ? 'Checking the local CLI…'
                                        : status.error || 'Unavailable'}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {status.state === 'ready' && (
                        <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            status.gatewayRunning
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                                : 'border-red-500/30 bg-red-500/10 text-red-400'
                        }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${status.gatewayRunning ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-red-400'}`} />
                            Gateway
                        </span>
                    )}
                    <button
                        onClick={refreshStatus}
                        className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Refresh Hermes status"
                    >
                        <RefreshCw size={15} className={status.state === 'loading' || status.refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>
            {/* Tab strip */}
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2">
                <div className="flex items-center">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`hermes-tab flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                                activeTab === tab.id
                                    ? 'active text-amber-600 dark:text-amber-300'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                            }`}
                        >
                            <tab.icon size={12} />
                            {tab.label}
                        </button>
                    ))}
                </div>

            </div>

            {/* Chat — stays mounted (hidden) so session survives tab switches */}
            {chatMounted && (
                <div className={activeTab === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                    <ChatTab isDesktop={isDesktop} />
                </div>
            )}
            {!chatMounted && activeTab === 'chat' && (
                <ChatTab isDesktop={isDesktop} />
            )}

            {/* Console */}
            {activeTab === 'console' && (
                <div className="flex min-h-0 flex-1">
                    <div className="flex min-w-0 flex-1 flex-col console-page-container">
                        {vitals.length > 0 && (
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-4 py-2">
                                {vitals.map(v => <StatusChip key={v.label} {...v} />)}
                            </div>
                        )}
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            {runs.length === 0 ? (
                                <div className="hermes-empty flex h-full items-center justify-center">
                                    <div className="max-w-sm text-center">
                                        <div className="mb-3 flex justify-center">
                                            <span className="rounded-full shadow-[0_0_36px_rgba(234,179,8,0.22)]"><NousBadge size="h-10 w-10" /></span>
                                        </div>
                                        <p className="text-sm font-medium text-[var(--text-primary)]">Send Hermes a one-shot task</p>
                                        <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                                            Runs use your default model with tools, memory, and rules loaded.
                                            Tool calls stream into the activity rail while Hermes works.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {runs.map(run => (
                                        <div
                                            key={run.id}
                                            className={`hermes-run-card overflow-hidden rounded-xl border bg-[var(--bg-secondary)] ${
                                                run.status === 'running' ? 'border-amber-500/40' : 'border-[var(--border)]'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] border-l-2 border-l-amber-500/70 bg-[var(--bg-hover)]/40 px-3.5 py-2.5">
                                                <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-5 text-[var(--text-primary)]">{run.prompt}</p>
                                                <span className="shrink-0 text-[10px] font-mono text-[var(--text-tertiary)]">{formatClock(run.startedAt)}</span>
                                            </div>
                                            <div className="px-3.5 py-3">
                                                {run.status === 'running' && (
                                                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                                        <span className="perci-whirlpool perci-whirlpool-sm" aria-hidden />
                                                        Hermes is working — watch the activity rail
                                                    </div>
                                                )}
                                                {run.status === 'done' && (
                                                    <div className="flex items-start gap-2">
                                                        <CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-500" />
                                                        <p className="min-w-0 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{run.output}</p>
                                                    </div>
                                                )}
                                                {run.status === 'failed' && (
                                                    <div className="flex items-start gap-2">
                                                        <XCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
                                                        <p className="min-w-0 whitespace-pre-wrap font-mono text-xs leading-5 text-red-400">{run.error}</p>
                                                    </div>
                                                )}
                                                {run.status === 'cancelled' && (
                                                    <p className="text-xs italic text-[var(--text-tertiary)]">Cancelled.</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={runsEndRef} />
                                </div>
                            )}
                        </div>
                        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            submitRun();
                                        }
                                    }}
                                    rows={2}
                                    placeholder="Give Hermes a task… (⌘↩ to run)"
                                    className="min-h-[44px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none transition-all focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(234,179,8,0.12)]"
                                />
                                {runningRun ? (
                                    <button
                                        onClick={cancelRun}
                                        className="flex h-[44px] items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
                                    >
                                        <Square size={14} />
                                        Cancel
                                    </button>
                                ) : (
                                    <button
                                        onClick={submitRun}
                                        disabled={!prompt.trim() || status.state === 'error'}
                                        className="flex h-[44px] items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 text-sm font-semibold text-black shadow-[0_0_16px_rgba(234,179,8,0.25)] transition-all hover:bg-amber-400 hover:shadow-[0_0_22px_rgba(234,179,8,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                                    >
                                        <Send size={14} />
                                        Run
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Live activity rail */}
                    {showActivity && (
                        <div className="flex w-72 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-secondary)]">
                            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
                                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                                    <Activity size={11} className={runningRun ? 'animate-pulse-subtle' : ''} style={runningRun ? { color: HERMES_AMBER } : undefined} />
                                    Live activity
                                </span>
                                <button
                                    onClick={() => setShowActivity(false)}
                                    className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                >
                                    Hide
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
                                {activity.length === 0 ? (
                                    <p className="px-1 py-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
                                        Tailing <code className="font-mono">agent.log</code> — tool calls and turns appear here as Hermes works.
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {activity.map(evt => {
                                            const meta = describeLogComponent(evt.component);
                                            return (
                                                <div key={evt.key} className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className={`rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider ${
                                                                meta.kind === 'tool' ? '' : 'text-[var(--text-tertiary)] bg-[var(--bg-hover)]'
                                                            }`}
                                                            style={meta.kind === 'tool' ? { color: HERMES_AMBER, backgroundColor: 'rgba(234, 179, 8, 0.12)' } : undefined}
                                                        >
                                                            {meta.label}
                                                        </span>
                                                        <span className="ml-auto text-[9px] font-mono text-[var(--text-tertiary)]">{evt.time?.slice(11)}</span>
                                                    </div>
                                                    <p className="mt-1 break-words font-mono text-[10px] leading-4 text-[var(--text-secondary)] line-clamp-3">{evt.message}</p>
                                                </div>
                                            );
                                        })}
                                        <div ref={activityEndRef} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {!showActivity && (
                        <button
                            onClick={() => setShowActivity(true)}
                            className="flex shrink-0 items-center border-l border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                            title="Show live activity"
                        >
                            <Activity size={13} className={runningRun ? 'animate-pulse-subtle' : ''} style={runningRun ? { color: HERMES_AMBER } : undefined} />
                        </button>
                    )}
                </div>
            )}

            {/* Terminal — a multitab local shell; stays mounted so sessions persist */}
            {terminalOpened && (
                <div className={activeTab === 'terminal' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                    <TerminalTabs idPrefix="hermes-shell" />
                </div>
            )}

            {/* Sessions */}
            {activeTab === 'sessions' && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
                        <span className="text-xs text-[var(--text-secondary)]">
                            {sessions.state === 'ready'
                                ? [
                                    sessions.stats?.totalSessions && `${sessions.stats.totalSessions} sessions`,
                                    sessions.stats?.totalMessages && `${sessions.stats.totalMessages} messages`,
                                    sessions.stats?.databaseSize && sessions.stats.databaseSize,
                                ].filter(Boolean).join(' · ')
                                : 'Session store'}
                        </span>
                        <button
                            onClick={loadSessions}
                            className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Refresh sessions"
                        >
                            <RefreshCw size={13} className={sessions.state === 'loading' ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {sessions.state === 'error' ? (
                            <p className="px-1 font-mono text-xs text-red-400">{sessions.error}</p>
                        ) : sessions.state !== 'ready' ? (
                            <p className="px-1 text-xs text-[var(--text-tertiary)]">Loading sessions…</p>
                        ) : sessions.sessions.length === 0 ? (
                            <p className="px-1 text-xs text-[var(--text-tertiary)]">No sessions yet.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {sessions.sessions.map(s => (
                                    <div key={s.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 transition-colors hover:border-amber-500/35">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">
                                                {s.title && s.title !== '—' ? s.title : 'Untitled session'}
                                            </span>
                                            <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{s.lastActive}</span>
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{s.preview}</p>
                                        <p className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">{s.id}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Insights */}
            {activeTab === 'insights' && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-4 py-2">
                        {[7, 30, 90].map(days => (
                            <button
                                key={days}
                                onClick={() => { setInsightDays(days); if (!insights.byDays[days]) loadInsights(days); }}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    insightDays === days
                                        ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(234,179,8,0.3)]'
                                        : 'border border-[var(--border)] text-[var(--text-secondary)] hover:border-amber-500/40 hover:text-[var(--text-primary)]'
                                }`}
                            >
                                {days} days
                            </button>
                        ))}
                        <button
                            onClick={() => loadInsights(insightDays)}
                            className="ml-auto rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Refresh insights"
                        >
                            <RefreshCw size={13} className={insights.state === 'loading' ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto p-4">
                        {insights.state === 'error' && !insights.byDays[insightDays] ? (
                            <div className="flex h-full items-center justify-center py-12">
                                <div className="max-w-sm text-center space-y-3">
                                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                                        <XCircle size={22} />
                                    </div>
                                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Failed to load insights</h4>
                                    <p className="font-mono text-xs text-red-400 max-w-xs break-words">{insights.error}</p>
                                </div>
                            </div>
                        ) : insights.byDays[insightDays] && insights.byDays[insightDays].trim() ? (
                            <InsightsDashboard text={insights.byDays[insightDays]} insightDays={insightDays} />
                        ) : insights.state === 'ready' || (insights.byDays[insightDays] != null && !insights.byDays[insightDays].trim()) ? (
                            <div className="flex h-full items-center justify-center py-12">
                                <div className="max-w-sm text-center space-y-3">
                                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--border)]/30 text-[var(--text-tertiary)]">
                                        <BarChart3 size={20} />
                                    </div>
                                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">No activity found</h4>
                                    <p className="text-xs text-[var(--text-tertiary)] max-w-xs leading-relaxed">
                                        There is no usage data recorded for the last {insightDays} days. Run some tasks in Chat or Console to generate insights.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-full items-center justify-center py-12">
                                <div className="max-w-sm text-center space-y-4">
                                    <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 shadow-[0_0_36px_rgba(234,179,8,0.15)] animate-pulse">
                                        <BarChart3 size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Analyzing usage history</h4>
                                        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                                            Summarizing tasks, tokens, and agent performance for the last {insightDays} days…
                                        </p>
                                    </div>
                                    {/* Shimmering simulated report lines */}
                                    <div className="mx-auto max-w-[280px] space-y-2.5 pt-2">
                                        <div className="h-2 w-full rounded bg-[var(--border)] opacity-30 animate-pulse" />
                                        <div className="h-2 w-[85%] rounded bg-[var(--border)] opacity-30 animate-pulse" style={{ animationDelay: '0.15s' }} />
                                        <div className="h-2 w-[90%] rounded bg-[var(--border)] opacity-30 animate-pulse" style={{ animationDelay: '0.3s' }} />
                                        <div className="h-2 w-[70%] rounded bg-[var(--border)] opacity-30 animate-pulse" style={{ animationDelay: '0.45s' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Memory */}
            {activeTab === 'memory' && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
                        <span className="text-xs text-[var(--text-secondary)]">
                            {memoryData.state === 'ready'
                                ? `${memoryData.memory.entries.length + memoryData.user.entries.length} entries · ${(memoryData.memory.chars + memoryData.user.chars).toLocaleString()} chars total`
                                : 'Hermes Memory & User Profile'}
                        </span>
                        <button
                            onClick={loadMemory}
                            className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Refresh memory"
                        >
                            <RefreshCw size={13} className={memoryData.state === 'loading' ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {memoryData.state === 'error' ? (
                            <div className="flex h-full items-center justify-center py-12">
                                <div className="max-w-sm text-center space-y-3">
                                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                                        <XCircle size={22} />
                                    </div>
                                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Failed to load memory</h4>
                                    <p className="font-mono text-xs text-red-400 max-w-xs break-words">{memoryData.error}</p>
                                </div>
                            </div>
                        ) : memoryData.state === 'ready' ? (
                            <MemoryDashboard memoryData={memoryData} onRefresh={loadMemory} />
                        ) : memoryData.state === 'loading' ? (
                            <div className="flex h-full items-center justify-center py-12">
                                <div className="max-w-sm text-center space-y-4">
                                    <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 shadow-[0_0_36px_rgba(234,179,8,0.15)] animate-pulse">
                                        <Zap size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Loading memory…</h4>
                                        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                                            Reading MEMORY.md and USER.md
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Web UI */}
            {activeTab === 'webui' && (
                dashboard.state === 'running' ? (
                    <webview
                        src={dashboard.url}
                        title="Hermes Dashboard"
                        className="min-h-0 w-full flex-1 border-0 bg-white"
                        partition="persist:perci-hermes"
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
                        <div className="max-w-md text-center">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                                <Globe size={22} className="text-[var(--text-tertiary)]" />
                            </div>
                            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                                {dashboard.state === 'starting' ? 'Starting the Hermes dashboard…' : 'Hermes dashboard is not running'}
                            </h2>
                            <p className="mt-2 text-sm text-[var(--text-secondary)]">
                                {dashboard.state === 'starting'
                                    ? 'First launch can take a minute while the web UI builds.'
                                    : 'The dashboard manages config, API keys, and sessions in a local web UI.'}
                            </p>
                            {dashboard.error && (
                                <p className="mt-3 font-mono text-xs text-red-400">{dashboard.error}</p>
                            )}
                            {dashboard.state !== 'starting' && dashboard.state !== 'checking' && (
                                <div className="mt-5 flex items-center justify-center gap-2">
                                    <button
                                        onClick={startDashboard}
                                        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-black shadow-[0_0_16px_rgba(234,179,8,0.25)] transition-all hover:bg-amber-400 hover:shadow-[0_0_22px_rgba(234,179,8,0.4)]"
                                    >
                                        <Globe size={15} />
                                        Start dashboard
                                    </button>
                                    <button
                                        onClick={checkDashboard}
                                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                    >
                                        <RefreshCw size={15} />
                                        Check again
                                    </button>
                                </div>
                            )}
                            {dashboard.state === 'starting' && (
                                <div className="mt-5 flex justify-center">
                                    <span className="perci-whirlpool" aria-hidden />
                                </div>
                            )}
                            {dashboard.url && (
                                <button
                                    onClick={() => window.electron?.openExternal?.(dashboard.url)}
                                    className="mt-4 inline-flex items-center gap-1 text-xs text-amber-600 hover:underline dark:text-amber-400"
                                >
                                    Open in browser <ExternalLink size={11} />
                                </button>
                            )}
                        </div>
                    </div>
                )
            )}
        </div>
    );
}
