import { useCallback, useEffect, useMemo, useState } from 'react';
import './SkillsMode.css';
import {
    Puzzle, Search, RefreshCw, ChevronDown, ChevronRight,
    Wrench, Edit3, Save, X,
    Cpu, BookOpen, AlertCircle,
    ShieldCheck, Network, CheckCircle2, CircleDashed,
    BrainCircuit, Clipboard, ExternalLink, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { SKILLS_WINDOW_ID } from '../context/ModeContext';

const CODING_EXPERT_METADATA_KEY = '__codingExpertStack';

const CODING_EXPERT_REPOS = [
    'https://github.com/mattpocock/skills',
    'https://github.com/addyosmani/agent-skills',
    'https://github.com/DeusData/codebase-memory-mcp',
    'https://github.com/Panniantong/agent-reach',
    'https://github.com/NVIDIA/skillspector',
];

const CODING_EXPERT_SETUP = [
    'npx skills@latest add mattpocock/skills',
    'npx skills@latest add addyosmani/agent-skills',
    'Review and install codebase-memory-mcp from https://github.com/DeusData/codebase-memory-mcp',
    'Review and install Agent Reach from https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md',
    'uv tool install git+https://github.com/NVIDIA/skillspector.git',
];

const PLAYBOOK_SKILL_IDS = [
    'ask-matt',
    'grill-with-docs',
    'grill-me',
    'triage',
    'improve-codebase-architecture',
    'setup-mattpocock-skills',
    'to-issues',
    'to-prd',
    'prototype',
    'diagnosing-bugs',
    'tdd',
    'domain-modeling',
    'codebase-design',
    'spec',
    'plan',
    'build',
    'test',
    'review',
    'ship',
    'webperf',
    'code-simplify',
];

// Known upstream counts for Engineering Playbook attribution
const PLAYBOOK_MATT_POCOCK_COUNT = 34;
const PLAYBOOK_ADDY_OSMANI_COUNT = 24;

const SOURCE_LABELS = {
    claude: 'Claude Code',
    codex: 'OpenAI Codex',
    hermes: 'Hermes',
    openclaw: 'OpenClaw',
    opencode: 'OpenCode',
    antigravity: 'Antigravity',
    aider: 'Aider',
    cursor: 'Cursor',
    system: 'System',
    'github-copilot': 'GitHub Copilot',
    cline: 'Cline',
    pi: 'Pi',
    orbit: 'Orbit',
    'agent-zero': 'Agent Zero',
};

const SOURCE_ORDER = [
    'hermes',
    'codex',
    'claude',
    'openclaw',
    'opencode',
    'cursor',
    'aider',
    'antigravity',
    'github-copilot',
    'cline',
    'pi',
    'orbit',
    'agent-zero',
    'system',
];

function sourceLabel(source) {
    return SOURCE_LABELS[source] || source;
}

function skillSources(skill) {
    return skill.sources?.length ? skill.sources : [skill.source || 'system'];
}

function agentBadgeClass(agentId) {
    const tones = {
        claude: 'badge-claude',
        codex: 'badge-codex',
        hermes: 'badge-hermes',
        openclaw: 'badge-openclaw',
        opencode: 'badge-opencode',
        antigravity: 'badge-antigravity',
        aider: 'badge-aider',
        cursor: 'badge-cursor',
        continue: 'badge-continue',
        kilocode: 'badge-kilocode',
        'github-copilot': 'badge-copilot',
        goose: 'badge-goose',
        plandex: 'badge-plandex',
        cline: 'badge-cline',
        pi: 'badge-pi',
        orbit: 'badge-orbit',
        'agent-zero': 'badge-agent-zero',
        system: 'badge-system',
    };
    return tones[agentId] || 'badge-default';
}

function searchableSkillText(skill) {
    return [
        skill.id,
        skill.name,
        skill.description,
        skill.source,
        ...(skill.sources || []),
        ...(skill.sourceDetails || []).flatMap(detail => [detail.source, detail.path, detail.root, detail.kind]),
    ].filter(Boolean).join(' ').toLowerCase();
}

function findSkills(skills, matcher) {
    return skills.filter(skill => matcher(searchableSkillText(skill), skill));
}

function readinessStatus(matchCount, readyAt = 1) {
    if (matchCount >= readyAt) return 'ready';
    if (matchCount > 0) return 'partial';
    return 'missing';
}

function statusLabel(status) {
    if (status === 'ready') return 'Ready';
    if (status === 'partial') return 'Partial';
    return 'Missing';
}

export default function SkillsMode() {
    const [agents, setAgents] = useState([]);
    const [skills, setSkills] = useState([]);
    const [metadata, setMetadata] = useState({});
    const [stackStatus, setStackStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [expandedSkill, setExpandedSkill] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ agents: [], notes: '', triggers: '', pitfalls: '' });
    const [saving, setSaving] = useState(false);
    const [stackSaving, setStackSaving] = useState(false);
    const [stackCopied, setStackCopied] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [agentList, skillList, meta, expertStatus] = await Promise.all([
                window.electron?.detectAgentCLIs?.() || [],
                window.electron?.getInstalledSkills?.() || [],
                window.electron?.getSkillMetadata?.() || {},
                window.electron?.getCodingExpertStatus?.() || null,
            ]);
            // Load playbook skills attribution in parallel (independent of expertStatus)
            let playbookSkills = null;
            try {
                playbookSkills = await window.electron?.getPlaybookSkills?.();
            } catch { /* ignore - older main process may not support it */ }
            setAgents(agentList);
            setSkills(skillList);
            setMetadata(meta || {});
            if (playbookSkills) {
                expertStatus.playbookSkills = playbookSkills;
            }
            setStackStatus(expertStatus);
        } catch (err) {
            console.error('Skills load error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadData(); }, [loadData, refreshKey]);

    const handleRefresh = () => {
        setRefreshKey(k => k + 1);
    };

    const startEdit = useCallback((skillId) => {
        const existing = metadata[skillId] || {};
        setEditForm({
            agents: existing.agents || [],
            notes: existing.notes || '',
            triggers: existing.triggers || '',
            pitfalls: existing.pitfalls || '',
        });
        setEditingId(skillId);
    }, [metadata]);

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({ agents: [], notes: '', triggers: '', pitfalls: '' });
    };

    const saveEdit = async () => {
        if (!editingId) return;
        setSaving(true);
        try {
            const next = { ...metadata, [editingId]: { ...editForm, updatedAt: new Date().toISOString() } };
            await window.electron?.setSkillMetadata?.(next);
            setMetadata(next);
            setEditingId(null);
        } catch (err) {
            console.error('Save error:', err);
        } finally {
            setSaving(false);
        }
    };

    const toggleAgentSelection = (agentId) => {
        setEditForm(prev => ({
            ...prev,
            agents: prev.agents.includes(agentId)
                ? prev.agents.filter(a => a !== agentId)
                : [...prev.agents, agentId],
        }));
    };

    const codingExpertEnabled = metadata[CODING_EXPERT_METADATA_KEY]?.enabled === true;

    const toggleCodingExpert = async () => {
        setStackSaving(true);
        try {
            const nextStack = {
                ...(metadata[CODING_EXPERT_METADATA_KEY] || {}),
                enabled: !codingExpertEnabled,
                updatedAt: new Date().toISOString(),
            };
            const next = { ...metadata, [CODING_EXPERT_METADATA_KEY]: nextStack };
            await window.electron?.setSkillMetadata?.(next);
            setMetadata(next);
        } catch (err) {
            console.error('Coding Expert Stack save error:', err);
        } finally {
            setStackSaving(false);
        }
    };

    const copyCodingExpertSetup = async () => {
        const text = [
            '# Coding Expert Stack sources',
            ...CODING_EXPERT_REPOS,
            '',
            '# Setup checklist',
            ...CODING_EXPERT_SETUP.map(step => `- ${step}`),
        ].join('\n');
        try {
            await navigator.clipboard.writeText(text);
            setStackCopied(true);
            window.setTimeout(() => setStackCopied(false), 1800);
        } catch (err) {
            console.error('Copy Coding Expert Stack setup error:', err);
        }
    };

    const openCodingExpertRepo = (url) => {
        if (window.electron?.openExternal) {
            window.electron.openExternal(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const sourceOptions = useMemo(() => {
        const sources = new Set();
        for (const skill of skills) {
            for (const source of skillSources(skill)) sources.add(source);
        }
        return [...sources].sort((a, b) => {
            const aIndex = SOURCE_ORDER.indexOf(a);
            const bIndex = SOURCE_ORDER.indexOf(b);
            if (aIndex !== -1 || bIndex !== -1) {
                return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
            }
            return sourceLabel(a).localeCompare(sourceLabel(b));
        });
    }, [skills]);

    const sourceCounts = useMemo(() => {
        const counts = {};
        for (const skill of skills) {
            for (const source of skillSources(skill)) {
                counts[source] = (counts[source] || 0) + 1;
            }
        }
        return counts;
    }, [skills]);

    const codingExpertToolsById = useMemo(() => {
        const tools = {};
        for (const tool of stackStatus?.tools || []) {
            tools[tool.id] = tool;
        }
        return tools;
    }, [stackStatus]);

    const codebaseMemoryIndexed = (stackStatus?.codebaseMemoryArtifacts || []).some(artifact => artifact.exists);

    const codingExpertLayers = useMemo(() => {
        const playbook = stackStatus?.playbookSkills || { mattpocock: { count: 0, skills: [] }, addyosmani: { count: 0, skills: [] }, total: 0, missing: [] };
        const memoryMatches = findSkills(skills, text =>
            text.includes('codebase-memory') ||
            text.includes('codebase memory') ||
            text.includes('deusdata')
        );
        const reachMatches = findSkills(skills, text =>
            text.includes('agent-reach') ||
            text.includes('panniantong') ||
            text.includes('internet capability')
        );
        const safetyMatches = findSkills(skills, text =>
            text.includes('skillspector') ||
            text.includes('skill spector') ||
            text.includes('nvidia')
        );
        const tools = {};
        for (const tool of stackStatus?.tools || []) {
            tools[tool.id] = tool;
        }
        const codingExpertToolsById = tools;
        const hasCodebaseMemoryTool = codingExpertToolsById.codebaseMemory?.installed;
        const hasAgentReachTool = codingExpertToolsById.agentReach?.installed;
        const hasSkillSpectorTool = codingExpertToolsById.skillSpector?.installed;
        const memorySignalCount = memoryMatches.length + (hasCodebaseMemoryTool ? 1 : 0) + (codebaseMemoryIndexed ? 1 : 0);
        const reachSignalCount = reachMatches.length + (hasAgentReachTool ? 1 : 0);
        const safetySignalCount = safetyMatches.length + (hasSkillSpectorTool ? 1 : 0);
        const playbookStatus = playbook.total >= (PLAYBOOK_MATT_POCOCK_COUNT + PLAYBOOK_ADDY_OSMANI_COUNT) ? 'ready'
            : playbook.total > 0 ? 'partial' : 'missing';

        return [
            {
                id: 'playbook',
                title: 'Engineering Playbook',
                icon: BookOpen,
                status: playbookStatus,
                count: `${playbook.mattpocock.count} mp · ${playbook.addyosmani.count} ao`,
                detail: `Matt Pocock (${playbook.mattpocock.count}/${PLAYBOOK_MATT_POCOCK_COUNT}) + Addy Osmani (${playbook.addyosmani.count}/${PLAYBOOK_ADDY_OSMANI_COUNT}) workflow skills for spec, plan, build, test, review, and ship.`,
                action: playbook.missing.length > 0
                    ? `${playbook.missing.length} skill(s) missing from .agents/skills — run npx skills@latest add mattpocock/skills and addyosmani/agent-skills.`
                    : 'All 58 upstream skills detected in .agents/skills.',
            },
            {
                id: 'memory',
                title: 'Codebase Memory',
                icon: BrainCircuit,
                status: readinessStatus(memorySignalCount),
                count: memorySignalCount,
                detail: 'Repo graph and MCP-backed structural lookup before agents start reading files blindly.',
                action: codebaseMemoryIndexed
                    ? 'A codebase-memory graph artifact is present for at least one known workspace.'
                    : 'Install and index codebase-memory-mcp for each coding workspace.',
            },
            {
                id: 'reach',
                title: 'Research Reach',
                icon: Network,
                status: readinessStatus(reachSignalCount),
                count: reachSignalCount,
                detail: 'Outside-world lookup for docs, GitHub context, web pages, videos, RSS, and product research.',
                action: hasAgentReachTool
                    ? 'Agent Reach CLI is available; run its doctor when enabling external channels.'
                    : 'Install Agent Reach only for workspaces that need external research.',
            },
            {
                id: 'safety',
                title: 'Skill Safety Gate',
                icon: ShieldCheck,
                status: readinessStatus(safetySignalCount),
                count: safetySignalCount,
                detail: 'Scan external skills before enabling them so prompt injection and exfiltration risks are visible.',
                action: hasSkillSpectorTool
                    ? 'SkillSpector is available; scan external skill directories before enabling them.'
                    : 'Install SkillSpector and require a clean scan before package activation.',
            },
        ];
    }, [skills, codingExpertToolsById, codebaseMemoryIndexed]);

    const codingExpertReadyCount = codingExpertLayers.filter(layer => layer.status === 'ready').length;
    const codingExpertPackageReady = codingExpertReadyCount === codingExpertLayers.length;

    const filteredSkills = useMemo(() => {
        let next = skills;
        if (sourceFilter !== 'all') {
            next = next.filter(skill => skillSources(skill).includes(sourceFilter));
        }
        if (!search.trim()) return next;
        const q = search.toLowerCase();
        return next.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q) ||
            skillSources(s).some(source => sourceLabel(source).toLowerCase().includes(q)) ||
            s.sourceDetails?.some(detail => detail.path?.toLowerCase().includes(q))
        );
    }, [skills, search, sourceFilter]);

    const groupedSkills = useMemo(() => {
        const groups = new Map();
        for (const skill of filteredSkills) {
            const groupSource = sourceFilter === 'all' ? (skill.source || skillSources(skill)[0] || 'system') : sourceFilter;
            if (!groups.has(groupSource)) groups.set(groupSource, []);
            groups.get(groupSource).push(skill);
        }
        return [...groups.entries()]
            .sort(([a], [b]) => {
                const aIndex = SOURCE_ORDER.indexOf(a);
                const bIndex = SOURCE_ORDER.indexOf(b);
                if (aIndex !== -1 || bIndex !== -1) {
                    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                }
                return sourceLabel(a).localeCompare(sourceLabel(b));
            })
            .map(([source, groupSkills]) => ({ source, skills: groupSkills }));
    }, [filteredSkills, sourceFilter]);

    if (loading) {
        return (
            <div className="skills-root">
                <div className="skills-loading">
                    <RefreshCw size={24} className="animate-spin" />
                    <p>Scanning for agents and skills…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="skills-root">
            <div className="skills-scroll">
                <div className="skills-inner">
                    <div className="skills-header">
                        <div className="skills-header-left">
                            <Puzzle size={20} />
                            <h2>System Skills</h2>
                        </div>
                        <button className="skills-refresh-btn" onClick={handleRefresh} title="Refresh">
                            <RefreshCw size={16} />
                        </button>
                    </div>

                    <section className="skills-section">
                        <h3 className="skills-section-title">
                            <Cpu size={16} />
                            Detected Agent CLIs
                            <span className="skills-count">{agents.length}</span>
                        </h3>
                        {agents.length === 0 ? (
                            <div className="skills-empty">
                                <AlertCircle size={20} />
                                <p>No agent CLIs detected in PATH. Install Claude Code, Codex, Hermes, etc. to see them here.</p>
                            </div>
                        ) : (
                            <div className="skills-agent-grid">
                                {agents.map(agent => (
                                    <div key={agent.id} className="skills-agent-card">
                                        <div className="skills-agent-head">
                                            <span className={`skills-agent-badge ${agentBadgeClass(agent.id)}`}>
                                                {agent.label}
                                            </span>
                                            {agent.version && (
                                                <span className="skills-agent-version">v{agent.version}</span>
                                            )}
                                        </div>
                                        <code className="skills-agent-path">{agent.path}</code>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="skills-section">
                        <div className="coding-expert-panel">
                            <div className="coding-expert-head">
                                <div>
                                    <div className="coding-expert-eyebrow">Curated package</div>
                                    <h3>Coding Expert Stack</h3>
                                    <p>
                                        A coding-task capability layer that combines senior-engineering workflows,
                                        repo structure memory, external research reach, and skill safety checks.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className={`coding-expert-toggle ${codingExpertEnabled ? 'is-enabled' : ''}`}
                                    onClick={toggleCodingExpert}
                                    disabled={stackSaving}
                                    title={codingExpertEnabled ? 'Disable Coding Expert Stack' : 'Enable Coding Expert Stack'}
                                >
                                    {codingExpertEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                    {codingExpertEnabled ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>

                            <div className="coding-expert-summary">
                                <div className={`coding-expert-readiness ${codingExpertPackageReady ? 'is-ready' : ''}`}>
                                    {codingExpertPackageReady ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
                                    {codingExpertReadyCount}/{codingExpertLayers.length} layers ready
                                </div>
                                <div className="coding-expert-note">
                                    {codingExpertEnabled
                                        ? 'Perci can route coding work through this stack when the backing layers are available.'
                                        : 'Keep disabled until the missing layers are installed and scanned.'}
                                </div>
                            </div>

                            <div className="coding-expert-grid">
                                {codingExpertLayers.map(layer => {
                                    const Icon = layer.icon;
                                    return (
                                        <div key={layer.id} className={`coding-expert-layer is-${layer.status}`}>
                                            <div className="coding-expert-layer-top">
                                                <span className="coding-expert-layer-icon">
                                                    <Icon size={16} />
                                                </span>
                                                <span className="coding-expert-layer-title">{layer.title}</span>
                                                <span className={`coding-expert-status is-${layer.status}`}>
                                                    {statusLabel(layer.status)}
                                                </span>
                                            </div>
                                            <p>{layer.detail}</p>
                                            <div className="coding-expert-layer-foot">
                                                <span>{layer.count} detected</span>
                                                <span>{layer.action}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="coding-expert-doctor">
                                <div className="coding-expert-doctor-head">
                                    <span>Tooling doctor</span>
                                    {stackStatus?.checkedAt && (
                                        <time>{new Date(stackStatus.checkedAt).toLocaleTimeString()}</time>
                                    )}
                                </div>
                                <div className="coding-expert-tool-list">
                                    {(stackStatus?.tools || []).map(tool => (
                                        <div key={tool.id} className="coding-expert-tool-row">
                                            <span className={`coding-expert-tool-state ${tool.installed ? 'is-installed' : ''}`}>
                                                {tool.installed ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
                                                {tool.installed ? 'Found' : 'Missing'}
                                            </span>
                                            <span className="coding-expert-tool-name">{tool.label}</span>
                                            <code title={tool.path || tool.installHint}>
                                                {tool.installed
                                                    ? `${tool.binary}${tool.version ? ` · ${tool.version}` : ''}`
                                                    : tool.installHint}
                                            </code>
                                        </div>
                                    ))}
                                    {stackStatus?.codebaseMemoryArtifacts?.length > 0 && (
                                        <div className="coding-expert-tool-row">
                                            <span className={`coding-expert-tool-state ${codebaseMemoryIndexed ? 'is-installed' : ''}`}>
                                                {codebaseMemoryIndexed ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
                                                {codebaseMemoryIndexed ? 'Indexed' : 'No graph'}
                                            </span>
                                            <span className="coding-expert-tool-name">Codebase graph</span>
                                            <code>
                                                {stackStatus.codebaseMemoryArtifacts.filter(artifact => artifact.exists).length}
                                                /{stackStatus.codebaseMemoryArtifacts.length} known workspaces
                                            </code>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="coding-expert-actions">
                                <button type="button" onClick={copyCodingExpertSetup}>
                                    <Clipboard size={14} />
                                    {stackCopied ? 'Copied setup' : 'Copy setup checklist'}
                                </button>
                                {CODING_EXPERT_REPOS.map(url => (
                                    <button key={url} type="button" onClick={() => openCodingExpertRepo(url)}>
                                        <ExternalLink size={14} />
                                        {new URL(url).pathname.split('/').filter(Boolean).join('/')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="skills-section">
                        <div className="skills-section-head">
                            <h3 className="skills-section-title">
                                <BookOpen size={16} />
                                Installed System Skills
                                <span className="skills-count">{skills.length}</span>
                            </h3>
                            <div className="skills-search">
                                <Search size={14} />
                                <input
                                    type="text"
                                    placeholder="Search skills…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="skills-source-filter" role="tablist" aria-label="Filter skills by source">
                            <button
                                type="button"
                                className={`skills-source-filter-btn ${sourceFilter === 'all' ? 'is-active' : ''}`}
                                onClick={() => setSourceFilter('all')}
                            >
                                All
                                <span>{skills.length}</span>
                            </button>
                            {sourceOptions.map(source => (
                                <button
                                    key={source}
                                    type="button"
                                    className={`skills-source-filter-btn ${sourceFilter === source ? 'is-active' : ''}`}
                                    onClick={() => setSourceFilter(source)}
                                >
                                    {sourceLabel(source)}
                                    <span>{sourceCounts[source] || 0}</span>
                                </button>
                            ))}
                        </div>

                        {skills.length === 0 ? (
                            <div className="skills-empty">
                                <AlertCircle size={20} />
                                <p>No skills, slash commands, or Cursor rules found in known agent system paths.</p>
                            </div>
                        ) : filteredSkills.length === 0 ? (
                            <div className="skills-empty">
                                <AlertCircle size={20} />
                                <p>No system skills match the current filter.</p>
                            </div>
                        ) : (
                            <div className="skills-list">
                                {groupedSkills.map(group => (
                                    <div key={group.source} className="skills-source-group">
                                        <h4 className="skills-group-title">
                                            <span className={`skills-source-badge ${agentBadgeClass(group.source)}`}>
                                                {sourceLabel(group.source)}
                                            </span>
                                            <span className="skills-group-count">{group.skills.length}</span>
                                        </h4>
                                        {group.skills.map(skill => {
                                    const isExpanded = expandedSkill === skill.id;
                                    const isEditing = editingId === skill.id;
                                    const meta = metadata[skill.id];

                                    return (
                                        <div
                                            key={skill.id}
                                            className={`skills-card ${isExpanded ? 'is-expanded' : ''}`}
                                        >
                                            <button
                                                className="skills-card-head"
                                                onClick={() => setExpandedSkill(isExpanded ? null : skill.id)}
                                            >
                                                <span className="skills-card-toggle">
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </span>
                                                <Wrench size={14} className="skills-card-icon" />
                                                <span className="skills-card-name">{skill.name}</span>
                                                <span className="skills-source-badges">
                                                    {skillSources(skill).map(source => (
                                                        <span key={source} className={`skills-source-badge ${agentBadgeClass(source)}`}>
                                                            {sourceLabel(source)}
                                                        </span>
                                                    ))}
                                                </span>
                                                <span className="skills-card-edit-btn" onClick={e => { e.stopPropagation(); startEdit(skill.id); }}>
                                                    <Edit3 size={12} />
                                                </span>
                                            </button>

                                            {isExpanded && (
                                                <div className="skills-card-body">
                                                    {skill.description && (
                                                        <p className="skills-card-desc">{skill.description}</p>
                                                    )}

                                                    {isEditing ? (
                                                        <div className="skills-edit-form">
                                                            <div className="skills-edit-field">
                                                                <label>Compatible Agents</label>
                                                                <div className="skills-agent-select">
                                                                    {agents.map(a => (
                                                                        <button
                                                                            key={a.id}
                                                                            type="button"
                                                                            className={`skills-agent-option ${editForm.agents.includes(a.id) ? 'is-selected' : ''}`}
                                                                            onClick={() => toggleAgentSelection(a.id)}
                                                                        >
                                                                            <span className={`skills-mini-badge ${agentBadgeClass(a.id)}`}>{a.label}</span>
                                                                        </button>
                                                                    ))}
                                                                    {agents.length === 0 && (
                                                                        <span className="skills-no-agents">No agents detected — install CLIs to set compatibility.</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="skills-edit-field">
                                                                <label>Triggers / How to invoke</label>
                                                                <input
                                                                    type="text"
                                                                    value={editForm.triggers}
                                                                    onChange={e => setEditForm(prev => ({ ...prev, triggers: e.target.value }))}
                                                                    placeholder="e.g. /skill name, hermes -s name"
                                                                />
                                                            </div>
                                                            <div className="skills-edit-field">
                                                                <label>Pitfalls / Notes</label>
                                                                <textarea
                                                                    value={editForm.pitfalls}
                                                                    onChange={e => setEditForm(prev => ({ ...prev, pitfalls: e.target.value }))}
                                                                    placeholder="Known issues, version constraints…"
                                                                    rows={3}
                                                                />
                                                            </div>
                                                            <div className="skills-edit-field">
                                                                <label>Usage Notes</label>
                                                                <textarea
                                                                    value={editForm.notes}
                                                                    onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                                                                    placeholder="Any notes about using this skill…"
                                                                    rows={3}
                                                                />
                                                            </div>
                                                            <div className="skills-edit-actions">
                                                                <button className="skills-save-btn" onClick={saveEdit} disabled={saving}>
                                                                    <Save size={14} />
                                                                    {saving ? 'Saving…' : 'Save'}
                                                                </button>
                                                                <button className="skills-cancel-btn" onClick={cancelEdit}>
                                                                    <X size={14} />
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="skills-card-meta">
                                                            {skill.sourceDetails?.length > 0 && (
                                                                <div className="skills-meta-row">
                                                                    <span className="skills-meta-label">Sources:</span>
                                                                    <span className="skills-meta-source-list">
                                                                        {skill.sourceDetails.map((detail, index) => (
                                                                            <code key={`${detail.source}-${detail.path}-${index}`} className="skills-meta-code" title={detail.path}>
                                                                                {sourceLabel(detail.source)}{detail.kind !== 'skill' ? ` ${detail.kind}` : ''}
                                                                            </code>
                                                                        ))}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {meta?.triggers && (
                                                                <div className="skills-meta-row">
                                                                    <span className="skills-meta-label">Triggers:</span>
                                                                    <code className="skills-meta-code">{meta.triggers}</code>
                                                                </div>
                                                            )}
                                                            {meta?.pitfalls && (
                                                                <div className="skills-meta-row">
                                                                    <span className="skills-meta-label">Pitfalls:</span>
                                                                    <span className="skills-meta-text">{meta.pitfalls}</span>
                                                                </div>
                                                            )}
                                                            {meta?.notes && (
                                                                <div className="skills-meta-row">
                                                                    <span className="skills-meta-label">Notes:</span>
                                                                    <span className="skills-meta-text">{meta.notes}</span>
                                                                </div>
                                                            )}
                                                            {meta?.updatedAt && (
                                                                <div className="skills-meta-row skills-meta-date">
                                                                    Updated: {new Date(meta.updatedAt).toLocaleDateString()}
                                                                </div>
                                                            )}
                                                            {!meta && (
                                                                <div className="skills-meta-row skills-meta-hint">
                                                                    <Edit3 size={12} />
                                                                    Click edit to add usage notes and agent compatibility.
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
