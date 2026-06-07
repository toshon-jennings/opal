export const BUDGET_STATE_KEY = 'perci_budget_state';

const DEFAULT_BUDGET = {
    maxIterations: 8,
    maxToolCalls: 24,
    maxPromptChars: 120000,
    maxResponseChars: 60000,
    maxElapsedMs: 8 * 60 * 1000
};

export function createBudgetRun(label, overrides = {}) {
    return {
        id: `budget-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        label,
        startedAt: Date.now(),
        iteration: 0,
        toolCalls: 0,
        promptChars: 0,
        responseChars: 0,
        limits: {
            ...DEFAULT_BUDGET,
            ...overrides
        },
        warnings: []
    };
}

export function estimateCharsFromMessages(messages = []) {
    return messages.reduce((total, message) => total + estimateChars(message?.content), 0);
}

export function estimateChars(value) {
    if (Array.isArray(value)) {
        return value.reduce((total, item) => total + estimateChars(item?.text || item?.content || JSON.stringify(item)), 0);
    }
    return String(value || '').length;
}

export function recordBudgetIteration(run, promptChars = 0) {
    const next = {
        ...run,
        iteration: run.iteration + 1,
        promptChars: run.promptChars + promptChars
    };
    return evaluateBudget(next);
}

export function recordBudgetToolCalls(run, count = 1) {
    const next = {
        ...run,
        toolCalls: run.toolCalls + count
    };
    return evaluateBudget(next);
}

export function recordBudgetResponse(run, responseChars = 0) {
    const next = {
        ...run,
        responseChars: run.responseChars + responseChars
    };
    return evaluateBudget(next);
}

export function evaluateBudget(run) {
    const elapsedMs = Date.now() - run.startedAt;
    const warnings = [
        run.iteration >= run.limits.maxIterations ? `Iteration limit reached (${run.iteration}/${run.limits.maxIterations}).` : '',
        run.toolCalls >= run.limits.maxToolCalls ? `Tool-call limit reached (${run.toolCalls}/${run.limits.maxToolCalls}).` : '',
        run.promptChars >= run.limits.maxPromptChars ? `Prompt budget reached (${run.promptChars}/${run.limits.maxPromptChars} chars).` : '',
        run.responseChars >= run.limits.maxResponseChars ? `Response budget reached (${run.responseChars}/${run.limits.maxResponseChars} chars).` : '',
        elapsedMs >= run.limits.maxElapsedMs ? `Elapsed-time limit reached (${Math.round(elapsedMs / 1000)}s).` : ''
    ].filter(Boolean);
    return {
        ...run,
        elapsedMs,
        warnings,
        blocked: warnings.length > 0
    };
}

export function buildBudgetPrompt(run) {
    return [
        'Budget governor:',
        `- Maximum iterations: ${run.limits.maxIterations}`,
        `- Maximum tool calls: ${run.limits.maxToolCalls}`,
        `- Maximum response size: ${run.limits.maxResponseChars} characters`,
        '- If the task cannot be completed within budget, stop with a concise status, what was done, and the next concrete action.'
    ].join('\n');
}
