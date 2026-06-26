import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, RefreshCw, Send, FolderOpen, Clock, CheckCircle2, AlertTriangle, XCircle, Hourglass, Copy, Check, ChevronRight, TerminalSquare, Search } from 'lucide-react';
import { useMode, HERMES_WINDOW_ID } from '../context/ModeContext';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';

// ─── Agent definitions ─────────────────────────────────────────────────────

export const AGENT_DEFINITIONS = [
  {
    id: 'aider',
    requestType: 'aider',
    label: 'Aider',
    shortLabel: 'Aider',
    detail: 'Terminal-first AI pair programmer for repo-wide edits, refactors, and git-aware coding tasks.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Aider to inspect, edit, or refactor code in the selected folder.',
  },
  {
    id: 'antigravity_cli',
    requestType: 'antigravity_cli',
    label: 'Antigravity CLI',
    shortLabel: 'Antigravity',
    detail: "Google's replacement path for Gemini CLI and the preferred Google local coding agent.",
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Antigravity to inspect, edit, or plan work in the selected folder.',
  },
  {
    id: 'claude_code',
    requestType: 'claude_code',
    label: 'Claude Code',
    shortLabel: 'Claude',
    detail: 'Broad repo edits, refactors, and implementation tasks.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Claude Code to work in the selected folder.',
  },
  {
    id: 'codex',
    requestType: 'codex',
    label: 'Codex',
    shortLabel: 'Codex',
    detail: 'Precise code changes and focused debugging through the local Codex CLI.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Codex to inspect, edit, or test this codebase.',
  },
  {
    id: 'command_code',
    requestType: 'command_code',
    label: 'Command Code',
    shortLabel: 'Cmd',
    detail: 'Coding agent that learns your taste — full-stack projects, features, refactors, and debugging.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Command Code to build, edit, or debug code in the selected folder.',
  },
  {
    id: 'copilot',
    requestType: 'copilot',
    label: 'Copilot',
    shortLabel: 'Copilot',
    detail: 'GitHub-oriented coding tasks and repo-aware assistance.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Copilot to work from the selected folder.',
  },
  {
    id: 'cursor_cli',
    requestType: 'cursor_cli',
    label: 'Cursor CLI',
    shortLabel: 'Cursor',
    detail: 'Cursor\'s terminal agent for repo-aware coding, multi-file edits, and codebase search from the command line.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Cursor CLI to inspect, edit, or search code in the selected folder.',
  },
  {
    id: 'hermes',
    requestType: 'hermes',
    label: 'Hermes',
    shortLabel: 'Hermes',
    detail: 'Nous Research\'s tool-calling agent — headless one-shot tasks through the local Hermes CLI.',
    status: 'ready',
    capabilities: ['prompt', 'project_directory', 'advanced'],
    defaultPrompt: 'Describe the project or feature spec Hermes should create or revise.',
  },
  {
    id: 'jan',
    requestType: 'jan',
    label: 'Jan',
    shortLabel: 'Jan',
    detail: 'Runs AI coding tasks through a locally-hosted model via Jan — fully on-device, no cloud required.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Jan CLI to load a local model and run an agentic coding session on your machine.',
  },
  {
    id: 'jules',
    requestType: 'jules',
    label: 'Jules',
    shortLabel: 'Jules',
    detail: 'Google\'s cloud coding agent powered by Gemini 3 Pro. Runs autonomously in a GitHub cloud VM and creates PRs.',
    status: 'specialized',
    capabilities: ['prompt', 'github_repo'],
    defaultPrompt: 'Describe the task for Jules to perform in your GitHub repo.',
  },
  {
    id: 'openclaw',
    requestType: 'openclaw',
    label: 'OpenClaw',
    shortLabel: 'OpenClaw',
    detail: 'Autonomous agent platform for long-running tasks, scheduled jobs, and multi-step workflow orchestration.',
    status: 'ready',
    capabilities: ['prompt', 'advanced'],
    defaultPrompt: 'Describe the task or workflow OpenClaw should execute.',
  },
  {
    id: 'openhands',
    requestType: 'openhands',
    label: 'OpenHands',
    shortLabel: 'OpenHands',
    detail: 'Autonomous AI software engineer that reads repos, runs tests, and iterates on fixes from issue descriptions.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask OpenHands to fix an issue or implement a feature in the selected folder.',
  },
  {
    id: 'opencode',
    requestType: 'opencode',
    label: 'OpenCode',
    shortLabel: 'OpenCode',
    detail: 'Model-agnostic terminal coding agent with repo-wide context, multi-file edits, and interactive task management.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask OpenCode to inspect, edit, or plan work in the selected folder.',
  },
  {
    id: 'perci_code',
    requestType: 'perci_code',
    label: 'Percival',
    shortLabel: 'Percival',
    detail: 'Custom terminal-first coding assistant built for fast, focused edits in the active workspace.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Percival to inspect, edit, or plan work in the selected folder.',
  },
  {
    id: 'qwen_code',
    requestType: 'qwen_code',
    label: 'Qwen Code',
    shortLabel: 'Qwen',
    detail: 'Alibaba\'s CLI coding agent for repo navigation, code generation, and debugging with Qwen model backends.',
    status: 'ready',
    capabilities: ['prompt', 'working_directory'],
    defaultPrompt: 'Ask Qwen Code to inspect, edit, or debug code in the selected folder.',
  },
];

// Agents whose CLI accepts a `--model` flag (verified against each CLI's
// --help in the desktop bridge). Presence here gates the model field and
// supplies an example placeholder. Agents without a --model flag (Jan picks
// its model via `jan launch`, OpenClaw, the custom perci_code) are omitted.
const AGENT_MODEL_HINTS = {
  aider: 'e.g. anthropic/claude-opus-4-8',
  antigravity_cli: 'e.g. gemini-3-pro',
  claude_code: 'e.g. opus, sonnet, or claude-opus-4-8',
  codex: 'e.g. o4-mini or gpt-5',
  command_code: 'e.g. claude-sonnet-4-6 or deepseek/deepseek-v4-pro',
  copilot: 'e.g. claude-sonnet-4.6',
  cursor_cli: 'e.g. claude-4-opus',
  openhands: 'e.g. anthropic/claude-opus-4-8',
  opencode: 'e.g. anthropic/claude-opus-4-8',
  qwen_code: 'e.g. qwen-max',
};

// Common model codes per agent, shown as a pick-or-type dropdown so you don't
// have to memorize them. These are starting suggestions sourced from each CLI's
// own --help/examples — the field still accepts any code you type, since none of
// these CLIs exposes a reliable "list models" command and new models ship often.
const AGENT_MODEL_SUGGESTIONS = {
  aider: ['sonnet', 'opus', 'anthropic/claude-opus-4-8', 'gpt-5', 'gemini/gemini-2.5-pro'],
  antigravity_cli: ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  claude_code: ['opus', 'sonnet', 'haiku', 'claude-opus-4-8', 'claude-sonnet-4-6'],
  codex: ['gpt-5-codex', 'gpt-5', 'o3', 'o4-mini'],
  command_code: ['claude-sonnet-4-6', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 'MiniMaxAI/MiniMax-M3-Free', 'Qwen/Qwen3.7-Max', 'nvidia/nemotron-3-ultra-550b-a55b'],
  copilot: ['gpt-5.2', 'gpt-5', 'claude-sonnet-4.6'],
  cursor_cli: ['claude-4-opus', 'claude-4-sonnet', 'gpt-5'],
  openhands: ['anthropic/claude-opus-4-8', 'anthropic/claude-sonnet-4-6', 'gpt-5'],
  opencode: ['anthropic/claude-opus-4-8', 'anthropic/claude-sonnet-4-6', 'openai/gpt-5'],
  qwen_code: ['qwen3-coder-plus', 'qwen-max', 'qwen-plus'],
};

const AGENT_MODEL_PERSIST_KEY = 'perci-agents-model-by-agent';

// Resolve loosely-typed model input (e.g. "sonnet", "gpt 5", "flash") to the
// closest code from the agent's suggestion list, using lightweight token
// matching (no AI). Returns { value, matched, source } where `value` is what
// gets sent. Anything without a confident, unambiguous match is passed verbatim
// so real/custom codes the list doesn't know about still go straight through.
function resolveModelInput(agentId, raw) {
  const text = (raw || '').trim();
  if (!text) return { value: '', matched: false, source: 'empty' };

  const suggestions = AGENT_MODEL_SUGGESTIONS[agentId] || [];
  const exact = suggestions.find((s) => s.toLowerCase() === text.toLowerCase());
  if (exact) return { value: exact, matched: true, source: 'exact' };

  const tokenize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const rawTokens = tokenize(text);
  if (rawTokens.length === 0) return { value: text, matched: false, source: 'verbatim' };

  let best = null;
  let bestScore = 0;
  let tied = false;
  for (const suggestion of suggestions) {
    const sTokens = tokenize(suggestion);
    if (sTokens.length === 0) continue;
    let hits = 0;
    for (const rt of rawTokens) {
      if (sTokens.some((st) => st === rt || st.includes(rt) || rt.includes(st))) hits += 1;
    }
    const score = hits / rawTokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = suggestion;
      tied = false;
    } else if (score === bestScore && score > 0 && best && suggestion !== best) {
      tied = true;
    }
  }

  if (best && bestScore >= 0.5 && !tied) {
    return { value: best, matched: true, source: 'fuzzy' };
  }
  return { value: text, matched: false, source: 'verbatim' };
}

export const ACTIVE_JOB_STATUSES = new Set(['pending', 'claimed', 'running', 'retry_queued']);
const COMPLETED_JOB_STATUSES = new Set(['completed']);
export const ATTENTION_JOB_STATUSES = new Set(['failed', 'cancelled', 'blocked', 'denied']);

const JOB_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Done' },
  { id: 'attention', label: 'Attention' },
];

const AGENTS_PERSIST_KEY = 'perci-agents-recent-jobs';
const AGENTS_JOBS_LIMIT = 24;
const PENDING_STALE_MS = 90 * 1000;
const RUNNING_STALE_MS = 30 * 60 * 1000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDetailTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatElapsed(start, end) {
  if (!start) return '—';
  const startMs = new Date(start).getTime();
  const endMs = new Date(end ?? Date.now()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return '—';
  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function folderName(path) {
  if (!path) return '';
  return path.split('/').filter(Boolean).at(-1) || path;
}

function isActiveStatus(status) {
  return ACTIVE_JOB_STATUSES.has(status);
}

function isStaleJob(job) {
  if (!isActiveStatus(job.status)) return false;
  const reference = job.status === 'pending' ? job.created_at : job.started_at || job.created_at;
  const referenceMs = new Date(reference).getTime();
  if (!Number.isFinite(referenceMs)) return false;
  const timeoutMs = job.status === 'pending' ? PENDING_STALE_MS : RUNNING_STALE_MS;
  return Date.now() - referenceMs > timeoutMs;
}

function matchesJobFilter(job, filter) {
  if (filter === 'active') return ACTIVE_JOB_STATUSES.has(job.status) && !isStaleJob(job);
  if (filter === 'completed') return COMPLETED_JOB_STATUSES.has(job.status);
  if (filter === 'attention') return ATTENTION_JOB_STATUSES.has(job.status) || isStaleJob(job);
  return true;
}

function statusLabel(agent, jobs) {
  const active = jobs.some((job) => isActiveStatus(job.status) && !isStaleJob(job));
  const stale = jobs.some((job) => isStaleJob(job));
  if (active) return 'Active';
  if (stale) return 'Stale';
  if (agent.status === 'setup') return 'Setup';
  if (agent.status === 'deprecated') return 'Legacy';
  if (agent.status === 'specialized') return 'Specialized';
  return 'Ready';
}

function jobStatusLabel(job) {
  if (isStaleJob(job)) return job.status === 'pending' ? 'waiting' : 'stale';
  if (job.status === 'pending') return 'queued';
  if ((job.status === 'running' || job.status === 'claimed') && job.started_at && !job.output_preview) return 'picked up';
  return job.status;
}

function mergeJobsById(current, incoming) {
  const merged = new Map();
  for (const job of [...incoming, ...current]) {
    merged.set(job.id, job);
  }
  return Array.from(merged.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, AGENTS_JOBS_LIMIT);
}

function restorePersistedJobs() {
  try {
    const raw = readStringStorage(AGENTS_PERSIST_KEY, "{}");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const restored = {};
    for (const agent of AGENT_DEFINITIONS) {
      const value = parsed[agent.id];
      if (!Array.isArray(value)) continue;
      restored[agent.id] = value.filter((job) =>
        job && typeof job === 'object' &&
        typeof job.id === 'string' &&
        typeof job.agent === 'string' &&
        typeof job.status === 'string' &&
        typeof job.created_at === 'string'
      );
    }
    return restored;
  } catch {
    return {};
  }
}

function formatAgentBridgeError(error, fallback) {
  const message = error?.message || String(error || '');
  if (message.includes('No handler registered') || message.includes('No handler')) {
    return 'Restart Perci to load the updated agent job bridge.';
  }
  return message || fallback;
}

// ─── Status icon map ────────────────────────────────────────────────────────

function StatusIcon({ status, stale }) {
  if (stale) return <Hourglass size={14} />;
  if (status === 'completed') return <CheckCircle2 size={14} />;
  if (status === 'failed' || status === 'denied') return <XCircle size={14} />;
  if (status === 'cancelled' || status === 'blocked') return <AlertTriangle size={14} />;
  return <RefreshCw size={14} className="animate-spin-slow" />;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status, stale = false }) {
  const color = stale ? 'text-amber-400' :
    status === 'completed' ? 'text-emerald-400' :
    status === 'failed' || status === 'denied' ? 'text-red-400' :
    status === 'cancelled' || status === 'blocked' ? 'text-amber-400' :
    'text-[var(--accent)]';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border border-[var(--border)] ${color}`}>
      <StatusIcon status={status} stale={stale} />
      {status}
    </span>
  );
}

function Metric({ label, value }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-[var(--text-primary)]">{value}</div>
      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function AgentsPanel() {
  const { setShowOpenClawDashboard, openWindow, pendingAgentSelection, setPendingAgentSelection } = useMode();
  const [selectedId, setSelectedId] = useState('aider');
  const [jobsByAgent, setJobsByAgent] = useState(() => restorePersistedJobs());
  const [prompt, setPrompt] = useState('');
  const [notice, setNotice] = useState(null);
  const [queueing, setQueueing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [connectionWarning, setConnectionWarning] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState(() => {
    try {
      return readStringStorage('working_directory');
    } catch {
      return '';
    }
  });

  // Jules repo selection
  const [julesSelectedRepo, setJulesSelectedRepo] = useState(null); // { name, url, branch }
  const [julesRepoList, setJulesRepoList] = useState([]);      // [{ name, url, description, branch }]
  const [julesReposLoading, setJulesReposLoading] = useState(false);
  const [julesReposError, setJulesReposError] = useState(null);

  // Load repo list from gh CLI when Jules is selected
  useEffect(() => {
    if (selectedId !== 'jules') return;
    if (julesRepoList.length > 0 || julesReposLoading || julesReposError) return;

    let cancelled = false;
    async function loadRepos() {
      setJulesReposLoading(true);
      setJulesReposError(null);
      try {
        const repos = await window.electron?.listGitHubRepos?.();
        if (cancelled) return;
        if (repos?.error) {
          setJulesReposError(repos.error);
          setJulesRepoList([]);
          return;
        }
        if (Array.isArray(repos) && repos.length > 0) {
          setJulesRepoList(repos);
          // Auto-detect from local git if no explicit selection
          if (!julesSelectedRepo && repos.length > 0) {
            // Try to detect local git remote and match it
            try {
              const detected = await window.electron?.detectLocalRepo?.();
              if (detected?.repo) {
                const match = repos.find(r => r.name === detected.repo);
                if (match) {
                  setJulesSelectedRepo({ name: match.name, branch: match.branch || detected.branch });
                  return;
                }
              }
            } catch {}
            // Fallback: just pick the first repo
            setJulesSelectedRepo({ name: repos[0].name, branch: repos[0].branch || 'main' });
          }
        }
      } catch (err) {
        if (!cancelled) setJulesReposError(err.message || 'Failed to load repos.');
      } finally {
        if (!cancelled) setJulesReposLoading(false);
      }
    }
    void loadRepos();
    return () => { cancelled = true; };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [modelByAgent, setModelByAgent] = useState(() => {
    try {
      const parsed = JSON.parse(readStringStorage(AGENT_MODEL_PERSIST_KEY, '{}'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });

  const selectedAgent = useMemo(
    () => AGENT_DEFINITIONS.find((agent) => agent.id === selectedId) ?? AGENT_DEFINITIONS[0],
    [selectedId]
  );

  const selectedJobs = useMemo(
    () => jobsByAgent[selectedId] ?? [],
    [jobsByAgent, selectedId]
  );

  const filteredSelectedJobs = useMemo(
    () => {
      let jobs = selectedJobs.filter((job) => matchesJobFilter(job, statusFilter));
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        jobs = jobs.filter((job) =>
          (job.prompt_preview || '').toLowerCase().includes(q) ||
          (job.prompt_text || '').toLowerCase().includes(q) ||
          (job.output_preview || '').toLowerCase().includes(q) ||
          job.id.toLowerCase().includes(q)
        );
      }
      return jobs;
    },
    [selectedJobs, statusFilter, searchQuery]
  );

  const selectedJob = useMemo(
    () => filteredSelectedJobs.find((job) => job.id === selectedJobId) ?? filteredSelectedJobs[0] ?? null,
    [filteredSelectedJobs, selectedJobId]
  );

  const activeSelectedJob = selectedJobs.find((job) => isActiveStatus(job.status) && !isStaleJob(job)) ?? null;
  // OpenClaw and Hermes run through the job queue like CLI agents, but also
  // keep a shortcut to their dedicated window (isSpecializedAgent).
  const isSpecializedAgent = selectedAgent.id === 'openclaw' || selectedAgent.id === 'hermes' || selectedAgent.id === 'jules';
  const isCliAgent = Boolean(selectedAgent.requestType);

  const hasAnyActiveJob = useMemo(
    () => Object.values(jobsByAgent).some((jobList) => (jobList ?? []).some((job) => isActiveStatus(job.status))),
    [jobsByAgent]
  );

  const filterCounts = useMemo(() => ({
    all: selectedJobs.length,
    active: selectedJobs.filter((job) => matchesJobFilter(job, 'active')).length,
    completed: selectedJobs.filter((job) => matchesJobFilter(job, 'completed')).length,
    attention: selectedJobs.filter((job) => matchesJobFilter(job, 'attention')).length,
  }), [selectedJobs]);

  // Persist jobs
  useEffect(() => {
    try {
      writeStringStorage(AGENTS_PERSIST_KEY, JSON.stringify(jobsByAgent));
    } catch {}
  }, [jobsByAgent]);

  // Persist per-agent model choices
  useEffect(() => {
    try {
      writeStringStorage(AGENT_MODEL_PERSIST_KEY, JSON.stringify(modelByAgent));
    } catch {}
  }, [modelByAgent]);

  // Auto-select first job when filter changes
  useEffect(() => {
    if (filteredSelectedJobs.length === 0) {
      setSelectedJobId(null);
      return;
    }
    if (!selectedJobId || !filteredSelectedJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredSelectedJobs[0].id);
    }
  }, [filteredSelectedJobs, selectedJobId]);

  // Reset filter when switching agents
  useEffect(() => {
    setStatusFilter('all');
  }, [selectedId]);

  // Select the agent requested by the caller (e.g. clicking a desk in Perci HQ).
  useEffect(() => {
    if (!pendingAgentSelection) return;
    if (AGENT_DEFINITIONS.some((agent) => agent.id === pendingAgentSelection)) {
      setSelectedId(pendingAgentSelection);
    }
    setPendingAgentSelection(null);
  }, [pendingAgentSelection, setPendingAgentSelection]);

  // Load jobs from API
  const loadJobs = useCallback(async () => {
    if (!window.electron?.listAgentJobs) {
      setConnectionWarning('Agent jobs require the Perci desktop app.');
      return;
    }
    try {
      const jobs = await window.electron.listAgentJobs({ limit: AGENTS_JOBS_LIMIT, source: 'agents_page' });
      setConnectionWarning(null);
      setJobsByAgent((current) => {
        const next = {};
        for (const agent of AGENT_DEFINITIONS) {
          // Match by agent id (the IPC handler stores jobs with job.agent = agent id)
          const incoming = (jobs || []).filter((job) => job.agent === agent.id);
          const retainedLocalJobs = (current[agent.id] ?? []).filter((job) => !isActiveStatus(job.status));
          next[agent.id] = mergeJobsById(retainedLocalJobs, incoming);
        }
        return next;
      });
    } catch (error) {
      setConnectionWarning(formatAgentBridgeError(error, 'Could not reach Perci — last data may be stale.'));
    }
  }, []);

  // Poll for jobs
  useEffect(() => {
    const id = window.setInterval(() => void loadJobs(), hasAnyActiveJob ? 2500 : 7000);
    return () => window.clearInterval(id);
  }, [hasAnyActiveJob, loadJobs]);

  // Load on mount
  useEffect(() => { void loadJobs(); }, [loadJobs]);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function copyText(label, value) {
    if (!value?.trim()) {
      setNotice(`No ${label.toLowerCase()} available to copy.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function sendRequest() {
    if (!isCliAgent || !prompt.trim()) return;

    // Jules is a cloud agent — route through its own IPC bridge
    if (selectedAgent.id === 'jules') {
      if (!window.electron?.queueJulesJob) {
        setNotice('Jules integration requires the Perci desktop app.');
        return;
      }
      setQueueing(true);
      setNotice(null);
      try {
        const result = await window.electron.queueJulesJob({
          prompt,
          source: 'agents_page',
          repo: julesSelectedRepo?.name,
          branch: julesSelectedRepo?.branch,
        });
        if (!result?.ok) {
          setNotice(result?.error || 'Failed to queue Jules task.');
          return;
        }
        const queuedJob = result.job;
        setPrompt('');
        setNotice('Jules task queued. It will run in the cloud and create a PR when done.');
        setStatusFilter('active');
        setSelectedJobId(queuedJob.id);
        setJobsByAgent((current) => {
          const existing = current[selectedAgent.id] ?? [];
          return { ...current, [selectedAgent.id]: mergeJobsById(existing, [queuedJob]) };
        });
        await loadJobs();
      } catch (error) {
        setNotice(formatAgentBridgeError(error, 'Failed to queue Jules task.'));
      } finally {
        setQueueing(false);
      }
      return;
    }

    if (!window.electron?.queueAgentJob) {
      setNotice('Agent jobs require the Perci desktop app.');
      return;
    }
    setQueueing(true);
    setNotice(null);
    try {
      const result = await window.electron.queueAgentJob({
        agent: selectedAgent.id,
        prompt,
        working_directory: workingDirectory,
        model: AGENT_MODEL_HINTS[selectedAgent.id]
          ? resolveModelInput(selectedAgent.id, modelByAgent[selectedAgent.id]).value
          : '',
        source: 'agents_page',
      });
      if (!result?.ok) {
        setNotice(result?.error || 'Failed to queue agent request.');
        return;
      }
      const queuedJob = result.job;
      setPrompt('');
      setNotice(`${selectedAgent.label} request queued.`);
      setStatusFilter('active');
      setSelectedJobId(queuedJob.id);
      setJobsByAgent((current) => {
        const existing = current[selectedAgent.id] ?? [];
        return { ...current, [selectedAgent.id]: mergeJobsById(existing, [queuedJob]) };
      });
      await loadJobs();
    } catch (error) {
      setNotice(formatAgentBridgeError(error, 'Failed to queue agent request.'));
    } finally {
      setQueueing(false);
    }
  }

  async function cancelRequest(id) {
    if (!window.electron?.cancelAgentJob) return;
    try {
      const result = await window.electron.cancelAgentJob(id);
      if (!result?.ok) {
        setNotice(result?.error || 'Failed to cancel job.');
        return;
      }
      await loadJobs();
    } catch (error) {
      setNotice(formatAgentBridgeError(error, 'Failed to cancel job.'));
    }
  }

  async function chooseFolder() {
    if (!window.electron?.selectDirectory) {
      setNotice('Folder selection requires the Perci desktop app.');
      return;
    }
    try {
      const folderPath = await window.electron.selectDirectory();
      if (!folderPath) return;
      setWorkingDirectory(folderPath);
      writeStringStorage('working_directory', folderPath);
      setNotice(`Folder set to ${folderName(folderPath)}.`);
    } catch (error) {
      setNotice(error?.message || 'Could not choose folder.');
    }
  }

  function launchSpecializedAgent() {
    setNotice(null);
    if (selectedAgent.id === 'hermes') openWindow(HERMES_WINDOW_ID);
    else if (selectedAgent.id === 'jules') {
      // Jules is a cloud agent — show the queued jobs view (already selected)
      setNotice('Jules jobs are queued from this panel. Add your API key in Settings first.');
    } else setShowOpenClawDashboard(true);
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  function renderAgentCard(agent) {
    const agentJobs = jobsByAgent[agent.id] ?? [];
    const latest = agentJobs[0];
    const active = agentJobs.some((job) => isActiveStatus(job.status) && !isStaleJob(job));
    const stale = agentJobs.some((job) => isStaleJob(job));
    const isActive = selectedId === agent.id;

    return (
      <button
        key={agent.id}
        type="button"
        onClick={() => setSelectedId(agent.id)}
        className={`micro-interaction w-full text-left rounded-xl border p-3 transition-all ${
          isActive
            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
            : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-tertiary)]/50 hover:bg-[var(--bg-hover)]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">{agent.shortLabel}</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-tertiary)] line-clamp-2">{agent.detail}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
              active
                ? 'border-[var(--accent)]/30 text-[var(--accent)] bg-[var(--accent)]/10'
                : stale
                  ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                  : agent.status === 'specialized'
                    ? 'border-sky-500/30 text-sky-400 bg-sky-500/10'
                    : 'border-[var(--border)] text-[var(--text-tertiary)]'
            }`}>
              {active && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse-subtle" />}
              {statusLabel(agent, agentJobs)}
            </span>
            {latest && (
              <span className="text-[10px] text-[var(--text-tertiary)]">{formatTime(latest.created_at)}</span>
            )}
          </div>
        </div>
      </button>
    );
  }

  function renderJobCard(job) {
    const isSelected = selectedJob?.id === job.id;
    const stale = isStaleJob(job);

    return (
      <button
        key={job.id}
        type="button"
        onClick={() => setSelectedJobId(job.id)}
        className={`micro-interaction w-full text-left rounded-xl border p-3 transition-all ${
          isSelected
            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
            : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-tertiary)]/50 hover:bg-[var(--bg-hover)]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <StatusBadge status={job.status} stale={stale} />
              <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{job.id.slice(0, 8)}</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)] line-clamp-3">
              {job.prompt_preview || job.prompt_text || 'Prompt unavailable.'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[10px] text-[var(--text-tertiary)]">{formatTime(job.created_at)}</span>
            {job.started_at && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {formatElapsed(job.started_at, job.completed_at)}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  }

  function renderJobDetails() {
    if (!selectedJob) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-6">
          <Bot size={32} className="text-[var(--text-tertiary)] mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">Select a job to view details</p>
        </div>
      );
    }

    const stale = isStaleJob(selectedJob);
    const prompt = selectedJob.prompt_text?.trim() || selectedJob.prompt_preview?.trim() || 'Prompt unavailable.';
    const output = selectedJob.output_text?.trim() || selectedJob.output_preview?.trim();

    return (
      <div className="flex flex-col h-full">
        {/* Details header */}
        <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedJob.status} stale={stale} />
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{selectedJob.id.slice(0, 12)}</span>
            </div>
            <div className="flex items-center gap-1">
              {isActiveStatus(selectedJob.status) && window.electron?.cancelAgentJob && (
                <button
                  onClick={() => cancelRequest(selectedJob.id)}
                  className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Cancel job"
                >
                  <XCircle size={14} />
                </button>
              )}
              <button
                onClick={() => copyText('Job ID', selectedJob.id)}
                className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                title="Copy job ID"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Details body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Queued</div>
              <div className="text-xs text-[var(--text-primary)]">{formatDetailTime(selectedJob.created_at)}</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Started</div>
              <div className="text-xs text-[var(--text-primary)]">{formatDetailTime(selectedJob.started_at)}</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Completed</div>
              <div className="text-xs text-[var(--text-primary)]">{formatDetailTime(selectedJob.completed_at)}</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Elapsed</div>
              <div className="text-xs text-[var(--text-primary)]">{formatElapsed(selectedJob.started_at, selectedJob.completed_at)}</div>
            </div>
          </div>

          {/* Workspace / Repo context */}
          {selectedJob.repo && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Repository</div>
                <button
                  onClick={() => copyText('Repository', selectedJob.repo)}
                  className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <Copy size={11} />
                </button>
              </div>
              <div className="text-xs font-mono text-[var(--text-primary)] break-all">{selectedJob.repo}</div>
              {selectedJob.branch && (
                <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                  Branch: <span className="font-mono text-[var(--text-secondary)]">{selectedJob.branch}</span>
                </div>
              )}
            </div>
          )}

          {selectedJob.working_directory && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Workspace</div>
                <button
                  onClick={() => copyText('Workspace', selectedJob.working_directory)}
                  className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <Copy size={11} />
                </button>
              </div>
              <div className="text-xs font-mono text-[var(--text-primary)] break-all">{selectedJob.working_directory}</div>
            </div>
          )}

          {/* Prompt */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Prompt</div>
              <button
                onClick={() => copyText('Prompt', prompt)}
                className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Copy size={11} />
              </button>
            </div>
            <pre className="text-xs leading-5 text-[var(--text-secondary)] whitespace-pre-wrap break-words font-[inherit]">{prompt}</pre>
          </div>

          {/* Output */}
          {output && (
            <div className={`rounded-lg border p-3 ${
              selectedJob.output_kind === 'error'
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-[var(--border)] bg-[var(--bg-secondary)]'
            }`}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                {selectedJob.output_kind === 'error' ? 'Error Output' : 'Output'}
              </div>
              <pre className="text-xs leading-5 text-[var(--text-secondary)] whitespace-pre-wrap break-words font-mono">{output}</pre>
            </div>
          )}

          {/* Job status description */}
          {selectedJob.agent === 'jules' ? (
            <div className={`rounded-lg p-3 ${stale ? 'border border-amber-500/30 bg-amber-500/5' : 'border border-[var(--accent)]/20 bg-[var(--accent)]/5'}`}>
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                {stale
                  ? 'Jules session may have stalled. Check the PR on GitHub.'
                  : selectedJob.status === 'pending'
                    ? 'Jules session starting in the Google cloud...'
                    : selectedJob.status === 'running'
                      ? 'Jules is working in the cloud. It will create a PR when done — check the session ID or the GitHub PR.'
                      : selectedJob.status === 'completed'
                        ? 'Jules completed. Check the GitHub PR for results.'
                        : 'Jules session finished.'}
              </p>
              {selectedJob.session_id && (
                <p className="mt-1 text-[10px] font-mono text-[var(--text-tertiary)]">
                  Session: {selectedJob.session_id}
                </p>
              )}
            </div>
          ) : (
            <>
              {selectedJob.status === 'pending' && (
                <div className={`rounded-lg p-3 ${stale ? 'border border-amber-500/30 bg-amber-500/5' : 'border border-[var(--border)] bg-[var(--bg-secondary)]'}`}>
                  <p className="text-xs leading-5 text-[var(--text-secondary)]">
                    {stale ? 'Waiting for an available agent to pick this up.' : 'Queued, waiting for an agent to pick it up.'}
                  </p>
                </div>
              )}
              {(selectedJob.status === 'running' || selectedJob.status === 'claimed') && selectedJob.started_at && (
                <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3">
                  <p className="text-xs leading-5 text-[var(--text-secondary)]">Picked up by the local agent.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="h-full min-h-0 flex bg-[var(--bg-primary)] overflow-hidden">
      {/* ── Left rail: Agent list ── */}
      <aside className="w-[280px] xl:w-[320px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col min-h-0">
        <div className="shrink-0 p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center">
              <Bot size={18} className="text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Agent CLI</h1>
              <p className="text-[11px] text-[var(--text-tertiary)]">Manage CLI-based AI agents</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {AGENT_DEFINITIONS.map(renderAgentCard)}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Top bar */}
        <header className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-medium">Selected Agent</span>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-0.5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {selectedAgent.label}
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{selectedAgent.detail}</p>
          </div>
          <button
            onClick={() => void loadJobs()}
            className="micro-interaction p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Refresh jobs"
          >
            <RefreshCw size={16} />
          </button>
        </header>

        {/* Connection warning */}
        {connectionWarning && (
          <div className="shrink-0 px-5 py-2 border-b border-amber-500/30 bg-amber-500/5 text-xs font-medium text-amber-400 flex items-center gap-2">
            <AlertTriangle size={14} />
            {connectionWarning}
          </div>
        )}

        {/* Body: composer + history */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Composer panel */}
          <section className="lg:w-[420px] xl:w-[480px] shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {isCliAgent ? (
                <div className="space-y-4">
                  {/* OpenClaw: gateway agent turn runs through the job queue;
                      offer a dashboard shortcut for long-running workflows.
                      Jules: cloud coding agent triggered from this panel. */}
                  {isSpecializedAgent && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {selectedAgent.id === 'hermes'
                          ? 'Runs a headless one-shot through the local Hermes CLI.'
                          : selectedAgent.id === 'jules'
                            ? 'Cloud agent from Google Labs. Trigger tasks from this panel.'
                            : 'Sends a turn to the OpenClaw gateway agent.'}
                      </span>
                      {selectedAgent.id !== 'jules' && (
                        <button
                          type="button"
                          onClick={() => void launchSpecializedAgent()}
                          className="micro-interaction flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border)] text-[var(--text-secondary)] text-xs font-medium hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                        >
                          <TerminalSquare size={13} />
                          {selectedAgent.id === 'hermes' ? 'Open window' : 'Dashboard'}
                        </button>
                      )}
                    </div>
                  )}
                  {/* Jules: Repo selector */}
                  {selectedAgent.id === 'jules' && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                        Target Repository
                      </label>
                      {julesReposLoading ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                          <RefreshCw size={13} className="animate-spin text-[var(--text-tertiary)]" />
                          <span className="text-xs text-[var(--text-tertiary)]">Loading your GitHub repos...</span>
                        </div>
                      ) : julesReposError ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                          <p className="text-xs text-amber-400">{julesReposError}</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { setJulesRepoList([]); setJulesReposError(null); }}
                              className="text-[10px] text-[var(--accent)] hover:underline"
                            >
                              Retry
                            </button>
                            <button
                              type="button"
                              onClick={() => window.electron?.runTerminalCommand?.('gh auth login')}
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              <TerminalSquare size={10} />
                              gh auth login
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={julesSelectedRepo?.name || ''}
                            onChange={(e) => {
                              const selected = julesRepoList.find(r => r.name === e.target.value);
                              if (selected) setJulesSelectedRepo({ name: selected.name, branch: selected.branch || 'main' });
                            }}
                            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                          >
                            {julesRepoList.length === 0 ? (
                              <option value="">No repos found (run `gh auth login`)</option>
                            ) : (
                              julesRepoList.map((repo) => (
                                <option key={repo.name} value={repo.name}>
                                  {repo.name}
                                </option>
                              ))
                            )}
                          </select>
                          {julesSelectedRepo && (
                            <span className="shrink-0 text-[10px] font-mono text-[var(--text-tertiary)] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-secondary)]">
                              {julesSelectedRepo.branch || 'main'}
                            </span>
                          )}
                        </div>
                      )}
                      {julesSelectedRepo && (
                        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                          Jules will work on <span className="font-mono text-[var(--text-secondary)]">{julesSelectedRepo.name}</span> from branch <span className="font-mono text-[var(--text-secondary)]">{julesSelectedRepo.branch || 'main'}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {/* Workspace / folder */}
                  {(selectedAgent.capabilities.includes('working_directory') || selectedAgent.capabilities.includes('project_directory')) && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                        {selectedAgent.capabilities.includes('project_directory') ? 'Project' : 'Folder'}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={workingDirectory || 'Select workspace folder'}
                          className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] opacity-70 cursor-default"
                        />
                        <button
                          type="button"
                          onClick={() => void chooseFolder()}
                          className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                          title="Choose folder"
                        >
                          <FolderOpen size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Model */}
                  {AGENT_MODEL_HINTS[selectedAgent.id] && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                        Model <span className="text-[var(--text-tertiary)] font-normal">(optional)</span>
                      </label>
                      <input
                        list={`model-options-${selectedAgent.id}`}
                        value={modelByAgent[selectedAgent.id] || ''}
                        onChange={(e) =>
                          setModelByAgent((current) => ({ ...current, [selectedAgent.id]: e.target.value }))
                        }
                        placeholder={AGENT_MODEL_HINTS[selectedAgent.id]}
                        disabled={queueing}
                        spellCheck={false}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      />
                      {AGENT_MODEL_SUGGESTIONS[selectedAgent.id] && (
                        <datalist id={`model-options-${selectedAgent.id}`}>
                          {AGENT_MODEL_SUGGESTIONS[selectedAgent.id].map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      )}
                      {(() => {
                        const raw = (modelByAgent[selectedAgent.id] || '').trim();
                        if (!raw) {
                          return (
                            <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                              Pick a suggestion or type any model code. Passed to {selectedAgent.label} as <span className="font-mono">--model</span>; leave blank for its default.
                            </p>
                          );
                        }
                        const resolved = resolveModelInput(selectedAgent.id, raw);
                        const changed = resolved.value.toLowerCase() !== raw.toLowerCase();
                        if (resolved.matched && changed) {
                          return (
                            <p className="mt-1 text-[10px] text-[var(--accent)]">
                              → Will use <span className="font-mono">{resolved.value}</span>
                            </p>
                          );
                        }
                        if (resolved.matched) {
                          return (
                            <p className="mt-1 text-[10px] text-emerald-400">
                              ✓ <span className="font-mono">{resolved.value}</span>
                            </p>
                          );
                        }
                        return (
                          <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                            No close match — will pass <span className="font-mono">{raw}</span> as-is.
                          </p>
                        );
                      })()}
                    </div>
                  )}

                  {/* Prompt textarea */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Instructions</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={selectedAgent.defaultPrompt}
                      disabled={queueing}
                      rows={8}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <div className="w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center mb-3">
                    <AlertTriangle size={22} className="text-amber-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Setup Needed</h3>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {selectedAgent.setupNote || 'Use the specialized app for this agent until a Perci bridge exists.'}
                  </p>
                </div>
              )}
            </div>

            {/* Composer footer */}
            {isCliAgent && (
              <div className="shrink-0 px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30 flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-tertiary)] truncate min-w-0">
                  {notice || `${selectedAgent.label} ready`}
                </span>
                <button
                  onClick={() => void sendRequest()}
                  disabled={!prompt.trim() || queueing}
                  className="micro-interaction flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {queueing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Queuing...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Send
                    </>
                  )}
                </button>
              </div>
            )}
          </section>

          {/* History panel */}
          <section className="flex-1 min-w-0 min-h-0 flex flex-col">
            {/* History header with filters */}
            <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]/30">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Jobs</h3>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    {filterCounts.all === 0
                      ? 'No recent jobs yet.'
                      : `${filterCounts.active} active · ${filterCounts.completed} done · ${filterCounts.attention} needing attention`}
                  </p>
                </div>
                {activeSelectedJob && window.electron?.cancelAgentJob && (
                  <button
                    onClick={() => cancelRequest(activeSelectedJob.id)}
                    className="micro-interaction flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/10 transition-colors"
                  >
                    <XCircle size={12} />
                    Cancel
                  </button>
                )}
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {JOB_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setStatusFilter(filter.id)}
                    className={`micro-interaction inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      statusFilter === filter.id
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {filter.label}
                    {filterCounts[filter.id] > 0 && (
                      <span className={`text-[10px] ${statusFilter === filter.id ? 'text-white/70' : 'text-[var(--text-tertiary)]'}`}>
                        {filterCounts[filter.id]}
                      </span>
                    )}
                  </button>
                ))}

                {/* Search */}
                <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
                  <Search size={12} className="text-[var(--text-tertiary)]" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search jobs..."
                    className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] w-28"
                  />
                </div>
              </div>
            </div>

            {/* History body: job list + details */}
            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
              {/* Job list */}
              <div className="md:w-[340px] lg:w-[380px] shrink-0 border-b md:border-b-0 md:border-r border-[var(--border)] flex flex-col min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                  {filteredSelectedJobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6">
                      <Hourglass size={24} className="text-[var(--text-tertiary)] mb-2" />
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {statusFilter === 'all' ? 'No jobs yet. Send a request to get started.' : 'No jobs match this filter.'}
                      </p>
                    </div>
                  ) : (
                    filteredSelectedJobs.map(renderJobCard)
                  )}
                </div>
              </div>

              {/* Job details pane */}
              <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                {renderJobDetails()}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
