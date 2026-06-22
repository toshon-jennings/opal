import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, FolderOpen, Play, RefreshCw, ChevronDown, ChevronRight, AlertCircle, BookOpen, Cpu } from 'lucide-react';
import skillText from '../assets/autoresearch-skill.md?raw';
import karpathySkillText from '../assets/karpathy-skill.md?raw';
import TrainingResults from './TrainingResults';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';

const SUBMODE_KEY = 'autoresearch_submode';

// CLI agents that take a prompt + working directory and can run an autonomous
// multi-step loop. The skill instructions are inlined into the prompt (below),
// so this works on any of them — no ~/.claude/skills install required.
const LAUNCH_AGENTS = [
  { id: 'claude_code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'opencode', label: 'opencode' },
  { id: 'cursor_cli', label: 'Cursor' },
  { id: 'copilot', label: 'Copilot' },
  { id: 'qwen_code', label: 'Qwen' },
  { id: 'aider', label: 'Aider' },
];

// Prepended to the inlined skill so a headless one-shot run doesn't stall on the
// skill's "ask the user to switch to Plan mode" step. Prompt mode confines writes
// to .autoresearch/; training mode must edit train.py and commit, so it can't.
function buildPrompt(mode, target) {
  const autonomous = [
    'You are running autonomously and non-interactively as a one-shot agent job.',
    'Do NOT ask to switch to Plan mode or wait for any approval — proceed through all phases automatically.',
  ];
  if (mode === 'training') {
    const goal = target.trim()
      ? `Optional research steer (still discover ideas autonomously): ${target.trim()}.`
      : 'Discover and test training ideas autonomously.';
    return [
      ...autonomous,
      goal,
      '',
      'Follow the skill instructions below:',
      '',
      karpathySkillText,
    ].join('\n');
  }
  const goal = target.trim()
    ? `Optimization target: ${target.trim()}.`
    : 'Scan the repository and choose a sensible optimization target.';
  return [
    ...autonomous,
    'Confine all file writes to the `.autoresearch/` directory at the repository root.',
    goal,
    '',
    'Follow the skill instructions below:',
    '',
    skillText,
  ].join('\n');
}

// Monitors a repo's `.autoresearch/` directory (written by the
// "autoresearch-universal" skill) and visualizes the optimization loop:
// best score, per-run history, mutation operators, and the winning prompt.
// Also offers a convenience launch via the Claude Code agent.
//
// The skill must be installed at ~/.claude/skills/autoresearch-universal/ and
// is only picked up by the Claude Code (or Cursor) CLI agent — see the
// precondition banner below.

const POLL_INTERVAL_MS = 4000;

function folderName(p) {
  if (!p) return '';
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || p;
}

// Reads a file via the Electron bridge; returns null if it doesn't exist yet.
async function readMaybe(filePath) {
  if (!window.electron?.readFile) return null;
  try {
    return await window.electron.readFile(filePath);
  } catch {
    return null; // missing file throws in the main process — treat as "no data"
  }
}

function parseJsonl(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

export default function AutoresearchPanel() {
  const [targetDir, setTargetDir] = useState(() => {
    try { return readStringStorage('working_directory') || ''; } catch { return ''; }
  });
  const [tab, setTab] = useState('research');
  const [submode, setSubmode] = useState(() => {
    try { return readStringStorage(SUBMODE_KEY) === 'training' ? 'training' : 'prompt'; } catch { return 'prompt'; }
  });
  const [target, setTarget] = useState('');
  const [agent, setAgent] = useState('claude_code');
  const [state, setState] = useState(null);
  const [runs, setRuns] = useState([]);
  const [bestPrompt, setBestPrompt] = useState('');
  const [programLog, setProgramLog] = useState('');
  const [showBestPrompt, setShowBestPrompt] = useState(false);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [notice, setNotice] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [jobStatus, setJobStatus] = useState(null);

  const launchedJobIdRef = useRef(null);

  const arDir = targetDir ? `${targetDir.replace(/\/+$/, '')}/.autoresearch` : '';

  // Both sub-modes share state.json + results.jsonl (different schemas, but both
  // are generic JSON). Prompt mode additionally reads best_prompt.txt; training
  // mode additionally reads program_log.md.
  const refresh = useCallback(async () => {
    if (!arDir) return;
    const [stateText, resultsText, promptText, logText] = await Promise.all([
      readMaybe(`${arDir}/state.json`),
      readMaybe(`${arDir}/results.jsonl`),
      submode === 'prompt' ? readMaybe(`${arDir}/best_prompt.txt`) : Promise.resolve(null),
      submode === 'training' ? readMaybe(`${arDir}/program_log.md`) : Promise.resolve(null),
    ]);

    let parsedState = null;
    if (stateText) {
      try { parsedState = JSON.parse(stateText); } catch { parsedState = null; }
    }
    setState(parsedState);
    setRuns(parseJsonl(resultsText));
    setBestPrompt(promptText || '');
    setProgramLog(logText || '');
    setLastReadAt(Date.now());
  }, [arDir, submode]);

  // Persist the chosen sub-mode and clear stale results when switching, so the
  // other schema's rows don't flash in the wrong view before the next refresh.
  useEffect(() => {
    try { writeStringStorage(SUBMODE_KEY, submode); } catch { /* ignore */ }
    setState(null);
    setRuns([]);
    setBestPrompt('');
    setProgramLog('');
  }, [submode]);

  // Poll the .autoresearch/ files while a target is set.
  useEffect(() => {
    if (!arDir) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [arDir, refresh]);

  // Poll the launched job's status, if any.
  useEffect(() => {
    if (!launchedJobIdRef.current || !window.electron?.listAgentJobs) return;
    let active = true;
    const tick = async () => {
      try {
        const jobs = await window.electron.listAgentJobs({ limit: 24, source: 'agents_page' });
        if (!active) return;
        const job = jobs.find(j => j.id === launchedJobIdRef.current);
        if (job) setJobStatus(job.status);
      } catch { /* ignore */ }
    };
    void tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => { active = false; window.clearInterval(id); };
  }, [jobStatus]); // re-arm when a job is first set

  async function chooseFolder() {
    if (!window.electron?.selectDirectory) {
      setNotice('Folder selection requires the Perci desktop app.');
      return;
    }
    try {
      const folderPath = await window.electron.selectDirectory();
      if (!folderPath) return;
      setTargetDir(folderPath);
      try { writeStringStorage('working_directory', folderPath); } catch { /* ignore */ }
      setNotice(null);
    } catch (err) {
      setNotice(err?.message || 'Could not choose folder.');
    }
  }

  async function launch() {
    if (!window.electron?.queueAgentJob) {
      setNotice('Launching requires the Perci desktop app.');
      return;
    }
    if (!targetDir) {
      setNotice('Pick a target repo first.');
      return;
    }
    setLaunching(true);
    setNotice(null);
    try {
      const result = await window.electron.queueAgentJob({
        agent,
        prompt: buildPrompt(submode, target),
        working_directory: targetDir,
      });
      if (result?.ok && result.job?.id) {
        launchedJobIdRef.current = result.job.id;
        setJobStatus(result.job.status || 'running');
        const label = LAUNCH_AGENTS.find(a => a.id === agent)?.label || agent;
        setNotice(`Launched via ${label}. It runs autonomously (no plan-review step) — watch results below.`);
      } else {
        setNotice(result?.error || 'Failed to launch.');
      }
    } catch (err) {
      setNotice(err?.message || 'Failed to launch.');
    } finally {
      setLaunching(false);
    }
  }

  const maxScore = useMemo(() => {
    const fromState = Number(state?.max_score);
    if (Number.isFinite(fromState) && fromState > 0) return fromState;
    return runs.reduce((m, r) => Math.max(m, Number(r.max) || 0), 0);
  }, [state, runs]);

  const bestScore = Number(state?.best_score);
  const hasData = state || runs.length > 0 || bestPrompt;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <FlaskConical size={18} className="text-[var(--accent)]" />
        <div className="font-semibold">Autoresearch</div>
        <div className="text-xs text-[var(--text-tertiary)]">
          {submode === 'training' ? 'Karpathy-inspired training-research loop' : 'Karpathy-inspired prompt-optimization loop'}
        </div>
        {tab === 'research' && (
          <button
            onClick={() => void refresh()}
            className="ml-auto p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Refresh now"
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 pt-2 border-b border-[var(--border)]">
        {[
          { id: 'research', label: 'Research', icon: FlaskConical },
          { id: 'guide', label: 'Guide', icon: BookOpen },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${active ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'guide' ? (
        <AutoresearchGuide submode={submode} onTryExample={(t) => { setTarget(t); setTab('research'); }} />
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Sub-mode toggle */}
        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-0.5">
          {[
            { id: 'prompt', label: 'Prompt', icon: FlaskConical },
            { id: 'training', label: 'Training', icon: Cpu },
          ].map(m => {
            const active = submode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSubmode(m.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${active ? 'text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                style={active ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-cyan))' } : undefined}
              >
                <m.icon size={14} />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Precondition note */}
        <div className="flex gap-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3">
          <AlertCircle size={14} className="shrink-0 mt-0.5 text-[var(--accent)]" />
          <span>
            {submode === 'training' ? (
              <>
                Training mode runs Karpathy&apos;s autoresearch loop on a <code className="font-mono">train.py</code>: it edits the
                script, runs a fixed 5-minute job, and keeps changes that lower <code className="font-mono">val_bpb</code>. The skill
                is inlined into the prompt, so any agent below works — no install. Point at a repo with a <code className="font-mono">train.py</code>.
              </>
            ) : (
              <>
                Launch inlines the skill instructions into the prompt, so it works with any agent below — no install needed. The
                panel monitors the <code className="font-mono">.autoresearch/</code> output in the target repo regardless of how the
                run was started.
              </>
            )}
          </span>
        </div>

        {/* Config row */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={chooseFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[var(--bg-secondary)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <FolderOpen size={15} />
              {targetDir ? folderName(targetDir) : 'Pick target repo'}
            </button>
            {targetDir && <span className="text-xs font-mono text-[var(--text-tertiary)] truncate">{targetDir}</span>}
          </div>

          <input
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder={submode === 'training'
              ? 'Optional research steer (e.g. focus on LR schedules) — leave blank to let it explore'
              : 'Optimization target (e.g. docstring completeness, accessibility)'}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-secondary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={launch}
              disabled={launching || !targetDir}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-cyan))' }}
            >
              <Play size={14} />
              {launching ? 'Launching…' : 'Launch'}
            </button>
            <select
              value={agent}
              onChange={e => setAgent(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-sm bg-[var(--bg-secondary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
              title="Agent to run the loop"
            >
              {LAUNCH_AGENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            {jobStatus && (
              <span className="text-xs text-[var(--text-secondary)]">
                Job: <span className="font-medium text-[var(--text-primary)]">{jobStatus}</span>
              </span>
            )}
          </div>
        </div>

        {notice && (
          <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-2.5">
            {notice}
          </div>
        )}

        {/* Results */}
        {submode === 'training' ? (
          targetDir ? (
            <TrainingResults runs={runs} state={state} programLog={programLog} lastReadAt={lastReadAt} />
          ) : (
            <div className="text-sm text-[var(--text-tertiary)] text-center py-8">Pick a target repo to begin.</div>
          )
        ) : !hasData ? (
          <div className="text-sm text-[var(--text-tertiary)] text-center py-8">
            {targetDir ? 'No .autoresearch/ data yet. Launch a run or point at a repo that has one.' : 'Pick a target repo to begin.'}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score summary */}
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Best score" value={Number.isFinite(bestScore) && bestScore >= 0 ? (maxScore ? `${bestScore} / ${maxScore}` : String(bestScore)) : '—'} />
              <Stat label="Runs" value={String(runs.length || state?.run_number || 0)} />
              <Stat label="Plateau" value={state?.plateau_counter != null ? String(state.plateau_counter) : '—'} />
            </div>

            {state?.target && (
              <div className="text-xs text-[var(--text-secondary)]">
                Target: <span className="text-[var(--text-primary)]">{state.target}</span>
              </div>
            )}

            {/* Run history */}
            {runs.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-[var(--text-secondary)]">Run history</div>
                {runs.map((r, i) => {
                  const score = Number(r.score) || 0;
                  const rmax = Number(r.max) || maxScore || 1;
                  const pct = rmax ? Math.round((score / rmax) * 100) : 0;
                  const kept = r.status === 'keep';
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-8 text-[var(--text-tertiary)] tabular-nums">#{r.run ?? i + 1}</span>
                      <div className="flex-1 h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: kept ? 'linear-gradient(90deg, var(--accent), var(--accent-cyan))' : 'var(--text-tertiary)' }}
                        />
                      </div>
                      <span className="w-12 text-right tabular-nums text-[var(--text-secondary)]">{score}/{rmax}</span>
                      <span className={`w-12 text-right ${kept ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`}>{r.status || ''}</span>
                      <span className="w-32 truncate text-[var(--text-tertiary)]" title={r.mutation_operator}>{r.mutation_operator || ''}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Best prompt */}
            {bestPrompt && (
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowBestPrompt(v => !v)}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  {showBestPrompt ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Best prompt ({bestPrompt.length} chars)
                </button>
                {showBestPrompt && (
                  <pre className="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words text-[var(--text-primary)] bg-[var(--bg-secondary)] max-h-64 overflow-y-auto">
                    {bestPrompt}
                  </pre>
                )}
              </div>
            )}

            {lastReadAt && (
              <div className="text-[10px] text-[var(--text-tertiary)] text-right">
                Updated {new Date(lastReadAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

// Concrete targets a user can click to prefill the Research tab. Each is the
// kind of repeatable, judge-able task where an optimized prompt pays off.
const GUIDE_EXAMPLES = [
  {
    target: 'docstring completeness on public functions',
    when: 'You have a library where some functions are documented well and others barely at all, and you want one prompt that reliably writes good docstrings.',
    criteria: ['States what it returns', 'Names every parameter', 'Has a usage example', 'No restating the function name'],
  },
  {
    target: 'accessibility of React components',
    when: 'You keep asking an agent to "make this accessible" and getting inconsistent results — alt text one time, ARIA roles the next.',
    criteria: ['Images have alt text', 'Interactive elements are keyboard-reachable', 'Color contrast noted', 'Form inputs have labels'],
  },
  {
    target: 'commit messages from a diff',
    when: 'You want a house style for commit messages that an agent applies the same way every time.',
    criteria: ['Imperative mood subject', 'Subject under 60 chars', 'Body explains why not what', 'References issue if present'],
  },
  {
    target: 'PR review comments for correctness bugs',
    when: 'Your review prompt catches style nits but misses real logic bugs — you want to tune it toward the bugs that matter.',
    criteria: ['Flags off-by-one / null cases', 'No purely stylistic nits', 'Cites the exact line', 'Suggests a concrete fix'],
  },
];

function GuideStep({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs font-semibold flex items-center justify-center">{n}</div>
      <div className="flex-1 pt-0.5">
        <div className="text-sm font-medium text-[var(--text-primary)]">{title}</div>
        <div className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function GuideHeading({ children }) {
  return <div className="text-sm font-semibold text-[var(--text-primary)] pt-2">{children}</div>;
}

const AUTORESEARCH_SKILL_URL = 'https://github.com/balukosuri/Andrej-Karpathy-s-Autoresearch-As-a-Universal-Skill';

// Credit to the original "Autoresearch As a Universal Skill" repo this feature
// is built on. `lead` tailors the wording to each sub-mode's relationship to it.
function GuideCredit({ lead }) {
  return (
    <div className="text-[11px] text-[var(--text-tertiary)] leading-relaxed border-t border-[var(--border)] pt-3">
      {lead}{' '}
      <a
        href={AUTORESEARCH_SKILL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--accent)] hover:underline"
      >
        balukosuri/Autoresearch As a Universal Skill
      </a>
      , which applies Andrej Karpathy&apos;s autoresearch pattern.
    </div>
  );
}

function AutoresearchGuide({ submode, onTryExample }) {
  if (submode === 'training') return <TrainingGuide onTryExample={onTryExample} />;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 text-[var(--text-secondary)]">
      {/* What it is */}
      <div className="space-y-2">
        <GuideHeading>What this is</GuideHeading>
        <p className="text-xs leading-relaxed">
          Autoresearch tunes a <span className="text-[var(--text-primary)] font-medium">prompt</span> for you, automatically. You
          give it a repeatable task and a few yes/no rules for what “good” looks like. An agent then writes a prompt, runs it on
          sample items, scores the output against your rules, keeps the prompt if it improved, tweaks it, and repeats — a
          generate → evaluate → score → mutate loop. You walk away with the highest-scoring prompt it found.
        </p>
        <p className="text-xs leading-relaxed">
          It is <span className="text-[var(--text-primary)] font-medium">not</span> a chat or a code generator. It does not change
          your app. It only writes prompt experiments and results into a <code className="font-mono">.autoresearch/</code> folder.
        </p>
      </div>

      {/* When to use */}
      <div className="space-y-2">
        <GuideHeading>When to reach for it</GuideHeading>
        <p className="text-xs leading-relaxed">Good fit when all three are true:</p>
        <ul className="text-xs leading-relaxed list-disc pl-5 space-y-1">
          <li>You do the <span className="text-[var(--text-primary)]">same kind of task repeatedly</span> (not a one-off).</li>
          <li>Quality is <span className="text-[var(--text-primary)]">inconsistent</span> and you can’t say why one result is better in a sentence.</li>
          <li>You can write <span className="text-[var(--text-primary)]">4–6 yes/no checks</span> a grader could tick off.</li>
        </ul>
        <p className="text-xs leading-relaxed">
          Skip it for one-time asks, anything needing human taste you can’t reduce to checks, or tasks with no sample items to test against.
        </p>
      </div>

      {/* Examples */}
      <div className="space-y-2">
        <GuideHeading>Examples — click one to prefill</GuideHeading>
        <div className="space-y-2">
          {GUIDE_EXAMPLES.map((ex) => (
            <div key={ex.target} className="border border-[var(--border)] rounded-lg p-3 space-y-1.5">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{ex.target}</div>
                  <div className="text-xs mt-0.5 leading-relaxed">{ex.when}</div>
                </div>
                <button
                  onClick={() => onTryExample(ex.target)}
                  className="shrink-0 px-2.5 py-1 rounded-md text-xs font-medium text-white"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-cyan))' }}
                >
                  Use this
                </button>
              </div>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {ex.criteria.map((c) => (
                  <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-tertiary)]">{c}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
          The tags under each example are the yes/no criteria the agent grades against — it picks its own when you don’t supply
          them, but naming a clear target (and mentioning criteria like these in it) gives sharper results.
        </p>
      </div>

      {/* How to use this panel */}
      <div className="space-y-3">
        <GuideHeading>How to use this panel</GuideHeading>
        <GuideStep n={1} title="Pick the target repo">
          On the Research tab, click <span className="text-[var(--text-primary)]">Pick target repo</span> and choose the codebase
          you want to optimize against. The loop reads sample items from here and writes results into its
          <code className="font-mono"> .autoresearch/</code> folder.
        </GuideStep>
        <GuideStep n={2} title="Describe the target">
          Type what you’re optimizing in the text box, e.g. <span className="text-[var(--text-primary)]">“docstring completeness on public functions”</span>.
          Be specific about what good looks like — that becomes the agent’s grading rubric.
        </GuideStep>
        <GuideStep n={3} title="Choose an agent and Launch">
          Pick an agent in the dropdown (Claude Code and Codex follow long instructions best) and press
          <span className="text-[var(--text-primary)]"> Launch</span>. The full skill is inlined into the prompt, so no install is
          needed. The run is <span className="text-[var(--text-primary)]">autonomous</span> — it won’t stop to ask you anything.
        </GuideStep>
        <GuideStep n={4} title="Watch the results fill in">
          The panel polls the <code className="font-mono">.autoresearch/</code> folder every few seconds and shows the best score,
          each run’s score, and the winning prompt as they’re written. Nothing to refresh by hand.
        </GuideStep>
      </div>

      {/* Reading results */}
      <div className="space-y-2">
        <GuideHeading>Reading the results</GuideHeading>
        <ul className="text-xs leading-relaxed space-y-1.5">
          <li><span className="text-[var(--text-primary)] font-medium">Best score</span> — highest the loop has reached, out of the max (criteria × sample items). Higher is better.</li>
          <li><span className="text-[var(--text-primary)] font-medium">Run history bars</span> — one row per experiment. Colored bars are runs it <span className="text-[var(--accent)]">kept</span> (an improvement); grey bars it <span className="text-[var(--text-tertiary)]">discarded</span>.</li>
          <li><span className="text-[var(--text-primary)] font-medium">Mutation</span> — how it changed the prompt that run (e.g. <span className="font-mono">add_constraint</span>, <span className="font-mono">remove_bloat</span>).</li>
          <li><span className="text-[var(--text-primary)] font-medium">Plateau</span> — runs since the last improvement; a high number means it’s near its ceiling.</li>
          <li><span className="text-[var(--text-primary)] font-medium">Best prompt</span> — expand it to copy the tuned prompt. This is the deliverable; paste it wherever you do the real task.</li>
        </ul>
      </div>

      {/* Caveat */}
      <div className="flex gap-2 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3">
        <AlertCircle size={14} className="shrink-0 mt-0.5 text-[var(--accent)]" />
        <span className="leading-relaxed">
          The skill normally pauses for a plan review before running. Launching from here skips that — it runs straight through
          autonomously. If you want to review the plan first, run the agent in a terminal instead (in interactive Claude Code,
          press <span className="font-mono">Shift+Tab</span> to reach Plan mode), then come back here to watch the results.
        </span>
      </div>

      <GuideCredit lead="The prompt-optimization skill is adapted from" />
    </div>
  );
}

// Ideas a user can click to prefill the optional "research steer" in Training mode.
const TRAINING_EXAMPLES = [
  { target: 'learning-rate schedule and warmup', when: 'Steer the loop toward LR decay, warmup length, and peak-LR experiments first.' },
  { target: 'depth vs width under fixed params', when: 'Have it trade layers against hidden size while holding the parameter budget roughly constant.' },
  { target: 'optimizer and weight decay', when: 'Focus on optimizer choice, betas, and weight-decay tuning before architecture changes.' },
  { target: 'precision and memory (fit a bigger model)', when: 'Push on dtype/precision and memory so a larger model fits in the same VRAM budget.' },
];

function TrainingGuide({ onTryExample }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 text-[var(--text-secondary)]">
      {/* What it is */}
      <div className="space-y-2">
        <GuideHeading>What this is</GuideHeading>
        <p className="text-xs leading-relaxed">
          Training mode runs Karpathy&apos;s autoresearch loop on an LLM <span className="text-[var(--text-primary)] font-medium">training script</span>.
          An agent repeatedly edits <code className="font-mono">train.py</code>, runs a fixed 5-minute training job
          (<code className="font-mono">uv run train.py</code>), reads the validation <span className="text-[var(--text-primary)] font-medium">bits-per-byte</span> (
          <code className="font-mono">val_bpb</code>), and keeps the change only if it lowered <code className="font-mono">val_bpb</code> — otherwise it
          <code className="font-mono"> git reset</code>s and tries the next idea. It runs forever until you interrupt it.
        </p>
        <p className="text-xs leading-relaxed">
          <span className="text-[var(--text-primary)] font-medium">Lower <code className="font-mono">val_bpb</code> is better</span> — the opposite
          direction from Prompt mode&apos;s score. Each experiment is a git commit; the research branch always sits at the best configuration found.
        </p>
      </div>

      {/* Requirements */}
      <div className="space-y-2">
        <GuideHeading>What the repo needs</GuideHeading>
        <ul className="text-xs leading-relaxed list-disc pl-5 space-y-1">
          <li>A runnable <code className="font-mono">train.py</code> launched with <code className="font-mono">uv run train.py</code>.</li>
          <li>The script should print a <span className="text-[var(--text-primary)]">validation bits-per-byte</span> you can read from its log.</li>
          <li>A GPU and a training setup that completes meaningful steps within ~5 minutes.</li>
          <li>Clean git working tree — the loop commits each experiment and resets on discards.</li>
        </ul>
        <p className="text-xs leading-relaxed">
          This is built for nanochat / nanoGPT-style repos. If there&apos;s no <code className="font-mono">train.py</code>, the agent has nothing to optimize.
        </p>
      </div>

      {/* Examples */}
      <div className="space-y-2">
        <GuideHeading>Steer ideas — click to prefill (optional)</GuideHeading>
        <p className="text-xs leading-relaxed">
          You can leave the steer blank and let it explore. Or nudge where it starts:
        </p>
        <div className="space-y-2">
          {TRAINING_EXAMPLES.map((ex) => (
            <div key={ex.target} className="border border-[var(--border)] rounded-lg p-3 flex items-start gap-2">
              <div className="flex-1">
                <div className="text-sm font-medium text-[var(--text-primary)]">{ex.target}</div>
                <div className="text-xs mt-0.5 leading-relaxed">{ex.when}</div>
              </div>
              <button
                onClick={() => onTryExample(ex.target)}
                className="shrink-0 px-2.5 py-1 rounded-md text-xs font-medium text-white"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-cyan))' }}
              >
                Use this
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* How to use */}
      <div className="space-y-3">
        <GuideHeading>How to use this panel</GuideHeading>
        <GuideStep n={1} title="Pick the training repo">
          On the Research tab, choose a repo with a <code className="font-mono">train.py</code>. The loop writes its bookkeeping into that
          repo&apos;s <code className="font-mono">.autoresearch/</code> folder.
        </GuideStep>
        <GuideStep n={2} title="Optionally add a steer">
          Leave the box blank to let it explore, or type a focus like <span className="text-[var(--text-primary)]">&ldquo;learning-rate schedule&rdquo;</span> to bias its first ideas.
        </GuideStep>
        <GuideStep n={3} title="Choose an agent and Launch">
          Pick an agent (Claude Code and Codex follow long instructions best) and press <span className="text-[var(--text-primary)]">Launch</span>.
          The skill is inlined — no install. The run is <span className="text-[var(--text-primary)]">autonomous and endless</span>; stop it from the Agents page when you&apos;ve seen enough.
        </GuideStep>
        <GuideStep n={4} title="Watch experiments accrue">
          The panel polls <code className="font-mono">.autoresearch/</code> and shows best <code className="font-mono">val_bpb</code>, a per-experiment table, and the
          program log as the agent writes them.
        </GuideStep>
      </div>

      {/* Reading results */}
      <div className="space-y-2">
        <GuideHeading>Reading the results</GuideHeading>
        <ul className="text-xs leading-relaxed space-y-1.5">
          <li><span className="text-[var(--text-primary)] font-medium">Best val_bpb</span> — lowest validation bits-per-byte reached. Lower is better.</li>
          <li><span className="text-[var(--text-primary)] font-medium">Experiment table</span> — one row per run with commit, val_bpb, VRAM, params, depth, time, and status. The best row is highlighted; hover for the idea it tested.</li>
          <li><span className="text-[var(--text-primary)] font-medium">Status</span> — <span style={{ color: 'var(--accent)' }}>keep</span> (improved), <span className="text-[var(--text-tertiary)]">discard</span> (no gain, reset), or <span style={{ color: '#f87171' }}>crash</span> (run failed).</li>
          <li><span className="text-[var(--text-primary)] font-medium">Plateau</span> — consecutive non-improvements; at 5 the loop makes a bigger, more exploratory jump.</li>
          <li><span className="text-[var(--text-primary)] font-medium">Program log</span> — expand for the agent&apos;s human-readable notes on each experiment.</li>
        </ul>
      </div>

      {/* Caveat */}
      <div className="flex gap-2 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3">
        <AlertCircle size={14} className="shrink-0 mt-0.5 text-[var(--accent)]" />
        <span className="leading-relaxed">
          Training runs really execute <code className="font-mono">train.py</code> and consume GPU time, and the loop does not stop on its own —
          end it from the Agents page. It edits the script and commits on a research branch, so run it on a repo where that&apos;s safe.
        </span>
      </div>

      <GuideCredit lead="Built on the same autoresearch lineage as" />
    </div>
  );
}
