import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// Visualizes the Karpathy training-research loop written to `.autoresearch/`.
// The results.jsonl schema differs from prompt mode: each line is one training
// experiment scored by val_bpb (lower is better), plus hardware/throughput
// stats. Field names are read with fallbacks so minor skill variations parse.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (v, digits = 2) => (v == null ? '—' : v.toFixed(digits));

// Normalize one results.jsonl row, tolerating both the descriptive field names
// (peak_vram_GB, num_params_M, …) and shorter variants (vram_GB, params_M, …).
function normalizeRun(r, i) {
  return {
    run: r.run ?? i,
    commit: typeof r.commit === 'string' ? r.commit.slice(0, 7) : '',
    val_bpb: num(r.val_bpb),
    vram: num(r.peak_vram_GB ?? r.vram_GB),
    trainSecs: num(r.training_seconds ?? r.training_s),
    steps: num(r.num_steps ?? r.steps),
    params: num(r.num_params_M ?? r.params_M),
    depth: num(r.depth),
    mfu: num(r.mfu_percent ?? r.mfu_pct),
    tokens: num(r.total_tokens_M ?? r.tokens_M),
    status: r.status || '',
    idea: r.idea || '',
  };
}

const STATUS_COLOR = {
  keep: 'var(--accent)',
  baseline: 'var(--accent-cyan)',
  discard: 'var(--text-tertiary)',
  crash: '#f87171',
};

function statusColor(status) {
  return STATUS_COLOR[status] || 'var(--text-tertiary)';
}

function fmtTime(secs) {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`;
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`border rounded-lg px-3 py-2 ${highlight ? 'border-[var(--accent)]' : 'border-[var(--border)]'} bg-[var(--bg-secondary)]`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${highlight ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
    </div>
  );
}

export default function TrainingResults({ runs, state, programLog, lastReadAt }) {
  const [showLog, setShowLog] = useState(false);

  const rows = useMemo(() => runs.map(normalizeRun), [runs]);

  // Lower val_bpb is better. Prefer the value the loop recorded; fall back to the
  // best observed across runs.
  const bestVal = useMemo(() => {
    const fromState = num(state?.best_val_bpb);
    if (fromState != null) return fromState;
    const vals = rows.map(r => r.val_bpb).filter(v => v != null);
    return vals.length ? Math.min(...vals) : null;
  }, [state, rows]);

  // The run that holds the best val_bpb gets highlighted in the table.
  const bestRunIdx = useMemo(() => {
    let idx = -1;
    let best = Infinity;
    rows.forEach((r, i) => {
      if (r.val_bpb != null && r.val_bpb < best) { best = r.val_bpb; idx = i; }
    });
    return idx;
  }, [rows]);

  const hasData = state || rows.length > 0;
  if (!hasData) {
    return (
      <div className="text-sm text-[var(--text-tertiary)] text-center py-8">
        No <code className="font-mono">.autoresearch/</code> training data yet. Launch a run or point at a repo that has one.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Best val_bpb" value={bestVal != null ? fmt(bestVal, 4) : '—'} highlight />
        <Stat label="Experiments" value={String(rows.length || state?.run_number || 0)} />
        <Stat label="Plateau" value={state?.plateau_counter != null ? String(state.plateau_counter) : '—'} />
      </div>

      {(state?.experiments_kept != null || state?.experiments_discarded != null || state?.experiments_crashed != null) && (
        <div className="flex gap-3 text-xs text-[var(--text-secondary)]">
          <span><span className="text-[var(--accent)] font-medium">{state?.experiments_kept ?? 0}</span> kept</span>
          <span><span className="text-[var(--text-primary)] font-medium">{state?.experiments_discarded ?? 0}</span> discarded</span>
          <span><span style={{ color: '#f87171' }} className="font-medium">{state?.experiments_crashed ?? 0}</span> crashed</span>
        </div>
      )}

      {/* Run history table */}
      {rows.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-[var(--text-secondary)]">Experiment history</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums border-collapse">
              <thead>
                <tr className="text-[var(--text-tertiary)] text-left">
                  <th className="font-medium py-1 pr-2">#</th>
                  <th className="font-medium py-1 pr-2">commit</th>
                  <th className="font-medium py-1 pr-2 text-right">val_bpb</th>
                  <th className="font-medium py-1 pr-2 text-right">VRAM</th>
                  <th className="font-medium py-1 pr-2 text-right">params</th>
                  <th className="font-medium py-1 pr-2 text-right">depth</th>
                  <th className="font-medium py-1 pr-2 text-right">time</th>
                  <th className="font-medium py-1 pr-2">status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    title={r.idea}
                    className="border-t border-[var(--border)]"
                    style={i === bestRunIdx ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)' } : undefined}
                  >
                    <td className="py-1 pr-2 text-[var(--text-tertiary)]">{r.run}</td>
                    <td className="py-1 pr-2 font-mono text-[var(--text-tertiary)]">{r.commit || '—'}</td>
                    <td className="py-1 pr-2 text-right text-[var(--text-primary)]">{fmt(r.val_bpb, 4)}</td>
                    <td className="py-1 pr-2 text-right text-[var(--text-secondary)]">{r.vram != null ? `${fmt(r.vram, 1)}G` : '—'}</td>
                    <td className="py-1 pr-2 text-right text-[var(--text-secondary)]">{r.params != null ? `${fmt(r.params, 1)}M` : '—'}</td>
                    <td className="py-1 pr-2 text-right text-[var(--text-secondary)]">{r.depth ?? '—'}</td>
                    <td className="py-1 pr-2 text-right text-[var(--text-secondary)]">{fmtTime(r.trainSecs)}</td>
                    <td className="py-1 pr-2 font-medium" style={{ color: statusColor(r.status) }}>{r.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-[var(--text-tertiary)]">Hover a row to see the idea it tested. Best val_bpb row is highlighted.</div>
        </div>
      )}

      {/* Program log */}
      {programLog && (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <button
            onClick={() => setShowLog(v => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            {showLog ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Program log ({programLog.length.toLocaleString()} chars)
          </button>
          {showLog && (
            <pre className="px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words text-[var(--text-primary)] bg-[var(--bg-secondary)] max-h-72 overflow-y-auto">
              {programLog}
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
  );
}
