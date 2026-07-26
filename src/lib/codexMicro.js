export const CODEX_MICRO_PERSIST_KEY = 'perci_codex_micro:v1';
export const CODEX_AGENT_JOBS_PERSIST_KEY = 'perci-agents-recent-jobs';
export const CODEX_AGENT_MODEL_PERSIST_KEY = 'perci-agents-model-by-agent';

export const CODEX_REASONING_LEVELS = [
    { id: 'low', label: 'Light', angle: -54 },
    { id: 'medium', label: 'Medium', angle: -18 },
    { id: 'high', label: 'High', angle: 18 },
    { id: 'xhigh', label: 'Extra high', angle: 54 },
];

export const CODEX_WORKFLOWS = [
    {
        id: 'review',
        direction: 'up',
        label: 'Review',
        prompt: 'Review the current changes in this workspace. Focus on correctness, regressions, security, and missing tests. Return findings first with file references; do not edit unless I ask.',
    },
    {
        id: 'debug',
        direction: 'right',
        label: 'Debug',
        prompt: 'Diagnose the most likely failing or broken path in this workspace. Reproduce it if possible, identify the root cause with evidence, and propose the smallest safe fix. Do not edit until the cause is clear.',
    },
    {
        id: 'refactor',
        direction: 'down',
        label: 'Refactor',
        prompt: 'Find one high-value simplification in the current workspace. Preserve behavior, remove duplication, make the smallest coherent refactor, and run focused validation.',
    },
    {
        id: 'tests',
        direction: 'left',
        label: 'Tests',
        prompt: 'Inspect the current changes and add or improve the smallest focused tests that cover the behavior. Run those tests and report the result.',
    },
];

export const CODEX_ACTIVE_JOB_STATUSES = new Set(['pending', 'claimed', 'running', 'retry_queued']);

export function normalizeCodexMicroSettings(value) {
    const settings = value && typeof value === 'object' ? value : {};
    const reasoning = CODEX_REASONING_LEVELS.some((level) => level.id === settings.reasoning)
        ? settings.reasoning
        : 'medium';
    const workflowId = CODEX_WORKFLOWS.some((workflow) => workflow.id === settings.workflowId)
        ? settings.workflowId
        : null;

    return {
        reasoning,
        workflowId,
        prompt: typeof settings.prompt === 'string' ? settings.prompt : '',
    };
}

export function sortCodexJobs(jobs, limit = 6) {
    if (!Array.isArray(jobs)) return [];
    return jobs
        .filter((job) => job && job.agent === 'codex' && typeof job.id === 'string')
        .sort((a, b) => {
            const aTime = new Date(a.created_at || 0).getTime();
            const bTime = new Date(b.created_at || 0).getTime();
            return bTime - aTime;
        })
        .slice(0, limit);
}

export function mergeCodexJobs(current, incoming, limit = 6) {
    const merged = new Map();
    for (const job of [...(current || []), ...(incoming || [])]) {
        if (job?.agent === 'codex' && typeof job.id === 'string') {
            merged.set(job.id, job);
        }
    }
    return sortCodexJobs(Array.from(merged.values()), limit);
}

export function selectCodexMicroJobs(jobs, limit = 6) {
    const sorted = sortCodexJobs(jobs, Number.MAX_SAFE_INTEGER);
    const active = sorted.filter(isCodexJobActive);
    const finished = sorted.filter((job) => !isCodexJobActive(job));
    return [...active, ...finished].slice(0, limit);
}

export function codexJobTone(status) {
    if (status === 'running' || status === 'claimed') return 'running';
    if (status === 'pending' || status === 'retry_queued') return 'waiting';
    if (status === 'completed') return 'complete';
    if (status === 'failed' || status === 'denied') return 'failed';
    if (status === 'cancelled' || status === 'blocked') return 'cancelled';
    return 'idle';
}

export function codexJobResponse(job) {
    const raw = typeof job?.output_preview === 'string' && job.output_preview.trim()
        ? job.output_preview
        : job?.output;
    if (typeof raw !== 'string' || !raw.trim()) return '';

    const escapeCharacter = String.fromCharCode(27);
    const backspaceCharacter = String.fromCharCode(8);
    const ansiPattern = new RegExp(`${escapeCharacter}\\[[0-?]*[ -/]*[@-~]`, 'g');
    const clean = raw
        .replace(ansiPattern, '')
        .split(backspaceCharacter).join('')
        .replace(/\r/g, '');
    const lines = clean.split('\n');
    let responseStart = -1;

    for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].trim() === 'codex') responseStart = index + 1;
    }

    if (responseStart >= 0) {
        const responseEndOffset = lines
            .slice(responseStart)
            .findIndex((line) => line.trim() === 'tokens used');
        const responseEnd = responseEndOffset >= 0
            ? responseStart + responseEndOffset
            : lines.length;
        return lines.slice(responseStart, responseEnd).join('\n').trim();
    }

    return clean.trim();
}

export function isCodexJobActive(job) {
    return Boolean(job && CODEX_ACTIVE_JOB_STATUSES.has(job.status));
}
