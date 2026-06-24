// Ensemble — multi-model deliberation engine.
//
// Three-stage pipeline (optionally looped over multiple rounds):
//   1. Fan-out:   the prompt goes to a panel of models in parallel.
//   2. Judge:     one model analyses the anonymised panel responses
//                 (consensus / unique insights / contradictions / blind spots).
//   3. Synthesis: one model writes the final answer using the judge's guidance.
//
// Unlike OpenRouter's `openrouter/fusion` alias (a fixed black-box panel + hidden
// judge), every model here is chosen by the user, so panel/judge/synth are all
// swappable. The engine is provider-agnostic: it talks to a `streamModel`
// function injected by the caller, which keeps it pure and unit-testable.

import { LLMFactory } from './llm/clients';

export const ENSEMBLE_CONFIG_KEY = 'perci_ensemble_config';

export const MAX_PANEL_MODELS = 6;

// Editable prompt templates. Placeholders ({{PROMPT}}, {{RESPONSES}}, {{JUDGE}},
// {{CANDIDATE}}, {{N}}) are filled by `renderTemplate` before each call.
export const DEFAULT_ENSEMBLE_PROMPTS = {
    panelistSystem:
        'You are one of several expert models answering a user\'s question independently. ' +
        'Answer thoroughly and accurately, and briefly show the key reasoning behind your answer. ' +
        'Do not mention that you are part of a panel.',

    judge: `You are the deliberation judge for a multi-model panel. {{N}} expert models each answered the user's prompt independently. Your job is to analyse their responses — do NOT write your own answer to the user yet.

USER PROMPT:
"""
{{PROMPT}}
"""

PANEL RESPONSES:
{{RESPONSES}}

Produce a structured analysis with exactly these sections:

1. CONSENSUS — claims, recommendations, or facts that most or all responses agree on. These are high-confidence.
2. UNIQUE INSIGHTS — valuable points raised by only one response. Cite the response by its label and explain why the point matters.
3. CONTRADICTIONS — points where responses disagree. For each, state which position is better supported and why.
4. ERRORS & BLIND SPOTS — factual mistakes, flawed reasoning, missing considerations, or important angles none of the responses addressed.
5. SYNTHESIS GUIDANCE — concrete instructions for writing the best possible final answer: what to keep, what to drop, what to add, and how to resolve each disagreement.

Cite responses by their label. Be specific and critical — surface real weaknesses rather than flattering the responses.`,

    synth: `You are writing the final answer for the user. You are given {{N}} independent draft answers from a panel of models and a judge's structured analysis of them. Produce a single, cohesive, high-quality answer to the user's original prompt.

Follow the judge's SYNTHESIS GUIDANCE: keep the consensus, fold in the best unique insights, resolve every contradiction in favour of the better-supported position, and avoid the errors and blind spots the judge identified. The final answer must be better than any individual draft.

Do NOT mention the panel, the drafts, the judge, or that this answer is a synthesis. Answer the user directly, in your own voice.

USER PROMPT:
"""
{{PROMPT}}
"""

JUDGE ANALYSIS:
"""
{{JUDGE}}
"""

PANEL DRAFTS (for reference):
{{RESPONSES}}`,

    refine: `Below is a candidate answer to the user's question. Critique it rigorously: identify what is wrong, missing, unclear, or weaker than it should be. Then write your own improved, complete answer to the user's original question.

USER QUESTION:
"""
{{PROMPT}}
"""

CANDIDATE ANSWER:
"""
{{CANDIDATE}}
"""`,
};

export function modelKey(model) {
    return `${model.provider}::${model.modelId}`;
}

// 0 → "A", 1 → "B", … 25 → "Z", 26 → "AA" (panels never get this large, but be safe).
export function responseLabel(index) {
    let label = '';
    let n = index;
    do {
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return label;
}

export function renderTemplate(template, vars = {}) {
    return Object.entries(vars).reduce(
        (out, [key, value]) => out.replaceAll(`{{${key}}}`, String(value ?? '')),
        String(template ?? ''),
    );
}

// Builds the labelled "PANEL RESPONSES" block. When anonymise is on, panelists are
// "Response A/B/C…" so the judge can't be swayed by model identity.
export function buildResponsesBlock(responses, anonymise = true) {
    return responses
        .map((r, i) => {
            const heading = anonymise ? `Response ${responseLabel(i)}` : `${r.model.name} (${r.model.provider})`;
            return `--- ${heading} ---\n${r.text.trim()}`;
        })
        .join('\n\n');
}

// Builds the "PROJECT CONTEXT" block from attached files. Each file is fenced by
// its path so models can cite sources. Returns '' when nothing usable is attached.
export function buildContextBlock(files = []) {
    const usable = (files || []).filter(
        (f) => f && f.path && typeof f.content === 'string' && f.content.trim(),
    );
    if (usable.length === 0) return '';
    const blocks = usable.map((f) => `===== FILE: ${f.path} =====\n${f.content.trim()}`);
    return (
        'The user has attached the following project files as context. ' +
        'Ground your answer in them and cite file paths where relevant.\n\n' +
        blocks.join('\n\n')
    );
}

// Prepends the shared context block (if any) to a stage's user message.
function withContext(context, userText) {
    return context ? `${context}\n\n${userText}` : userText;
}

// Default streamModel built on the app's LLM clients. The component supplies the
// user's API keys and local-runtime URLs. Returns the full completion text.
export function createStreamModel({ apiKeys = {}, lmStudioUrl, janUrl } = {}) {
    return async function streamModel({ provider, modelId, system, user, onToken, signal }) {
        const client = LLMFactory.getClient(provider, apiKeys[provider], { lmStudioUrl, janUrl });
        // Fold the system prompt into the user turn — proven to work across every
        // client (Anthropic, Gemini, etc. handle `system` differently).
        const content = system ? `${system}\n\n${user}` : user;
        let full = '';
        await client.streamChat(
            [{ role: 'user', content }],
            (chunk, meta) => {
                if (meta?.isThinking) return; // keep reasoning out of the answer text
                full += chunk;
                onToken?.(chunk);
            },
            modelId,
            { signal },
        );
        return full;
    };
}

/**
 * Run the Ensemble pipeline.
 *
 * @param {object} config
 *   - prompt {string}                       the user's question
 *   - panel  {Array<{provider,modelId,name}>} models that answer in parallel
 *   - judge  {{provider,modelId,name}}        model that analyses the panel
 *   - synth  {{provider,modelId,name}|null}   model that writes the final answer (defaults to judge)
 *   - rounds {number}                         deliberation rounds (>=1)
 *   - anonymise {boolean}                     hide model identity from the judge
 *   - context {string}                        project files block (see buildContextBlock); fed to every stage
 *   - prompts {object}                        overrides for DEFAULT_ENSEMBLE_PROMPTS
 * @param {object} deps
 *   - streamModel {function}                  async ({provider,modelId,system,user,onToken,signal}) => fullText
 *   - onEvent     {function}                   lifecycle events (see below)
 *   - signal      {AbortSignal}
 *
 * Events: round:start · panel:start/token/done/error · judge:start/token/done ·
 *         synth:start/token/done · done
 *
 * @returns {Promise<{answer:string, responses:Array, judge:string}>}
 */
export async function runEnsemble(config, deps = {}) {
    const {
        prompt,
        panel,
        judge,
        synth,
        rounds = 1,
        anonymise = true,
    } = config;
    const prompts = { ...DEFAULT_ENSEMBLE_PROMPTS, ...(config.prompts || {}) };
    const context = typeof config.context === 'string' ? config.context.trim() : '';
    const { streamModel, onEvent = () => {}, signal } = deps;

    if (typeof streamModel !== 'function') throw new Error('runEnsemble requires a streamModel dependency');
    if (!prompt || !prompt.trim()) throw new Error('A prompt is required');
    if (!Array.isArray(panel) || panel.length === 0) throw new Error('Add at least one panel model');
    if (!judge?.provider || !judge?.modelId) throw new Error('Select a judge model');

    const synthModel = synth?.provider && synth?.modelId ? synth : judge;
    const totalRounds = Math.max(1, Math.floor(rounds) || 1);

    let candidate = null;     // synthesised answer carried across rounds
    let lastResponses = [];
    let lastJudge = '';

    for (let round = 1; round <= totalRounds; round++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        onEvent({ type: 'round:start', round, totalRounds });

        // ── Stage 1: parallel fan-out ─────────────────────────────────────────
        const userContent = round === 1
            ? prompt
            : renderTemplate(prompts.refine, { PROMPT: prompt, CANDIDATE: candidate });

        const settled = await Promise.all(panel.map(async (model) => {
            const key = modelKey(model);
            onEvent({ type: 'panel:start', key, round });
            try {
                let text = '';
                await streamModel({
                    provider: model.provider,
                    modelId: model.modelId,
                    system: prompts.panelistSystem,
                    user: withContext(context, userContent),
                    onToken: (token) => {
                        text += token;
                        onEvent({ type: 'panel:token', key, token, round });
                    },
                    signal,
                });
                onEvent({ type: 'panel:done', key, text, round });
                return { model, key, text, ok: true };
            } catch (err) {
                if (err?.name === 'AbortError') throw err;
                const message = err?.message || 'Panel model failed';
                onEvent({ type: 'panel:error', key, error: message, round });
                return { model, key, text: '', ok: false, error: message };
            }
        }));

        const usable = settled.filter((r) => r.ok && r.text.trim());
        if (usable.length === 0) throw new Error('All panel models failed to produce a response.');
        lastResponses = usable;

        const responsesBlock = buildResponsesBlock(usable, anonymise);

        // ── Stage 2: judge ───────────────────────────────────────────────────
        onEvent({ type: 'judge:start', round });
        let judgeText = '';
        await streamModel({
            provider: judge.provider,
            modelId: judge.modelId,
            user: withContext(context, renderTemplate(prompts.judge, {
                N: usable.length,
                PROMPT: prompt,
                RESPONSES: responsesBlock,
            })),
            onToken: (token) => {
                judgeText += token;
                onEvent({ type: 'judge:token', token, round });
            },
            signal,
        });
        onEvent({ type: 'judge:done', text: judgeText, round });
        lastJudge = judgeText;

        // ── Stage 3: synthesis ───────────────────────────────────────────────
        onEvent({ type: 'synth:start', round });
        let synthText = '';
        await streamModel({
            provider: synthModel.provider,
            modelId: synthModel.modelId,
            user: withContext(context, renderTemplate(prompts.synth, {
                N: usable.length,
                PROMPT: prompt,
                JUDGE: judgeText,
                RESPONSES: responsesBlock,
            })),
            onToken: (token) => {
                synthText += token;
                onEvent({ type: 'synth:token', token, round });
            },
            signal,
        });
        onEvent({ type: 'synth:done', text: synthText, round });
        candidate = synthText;
    }

    onEvent({ type: 'done', answer: candidate });
    return { answer: candidate, responses: lastResponses, judge: lastJudge };
}
