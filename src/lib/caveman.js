// Caveman mode — output-compression directives injected into the system prompt
// for Perci's direct-API surfaces (Chat/Cowork/Code). These surfaces call the
// Anthropic Messages API directly and never load the Claude Code skill harness,
// so we replicate the level model from the caveman skill in-prompt.
// Levels mirror github.com/JuliusBrussee/caveman: lite / full / ultra / wenyan.

export const CAVEMAN_LEVELS = [
    { id: 'off', label: 'Caveman off', short: 'Off', desc: 'Normal verbosity' },
    { id: 'lite', label: 'Lite', short: 'Lite', desc: 'Trim filler, keep sentences' },
    { id: 'full', label: 'Full', short: 'Full', desc: 'Classic caveman, drop articles' },
    { id: 'ultra', label: 'Ultra', short: 'Ultra', desc: 'Telegraphic, abbreviate prose' },
    { id: 'wenyan', label: 'Wényán', short: 'Wényán', desc: 'Classical Chinese, max terse' },
];

// Applies to every active level: compress prose, never accuracy.
const GUARDRAIL =
    'Never alter code blocks, identifiers, function names, or API calls — keep them exact. ' +
    'Standard well-known tech acronyms are fine; never invent abbreviations the reader cannot decode. ' +
    'Keep technical terms precise; compress prose only, never accuracy.';

const RULES = {
    lite:
        'No filler or hedging. Keep articles and full sentences. Professional but tight.',
    full:
        'Drop articles; sentence fragments OK; short synonyms. Classic caveman style. ' +
        'No tool-call narration, no decorative tables or emoji, no long raw error-log dumps unless asked.',
    ultra:
        'Telegraphic. Abbreviate prose words (DB/auth/config/req/res/fn/impl) — prose words only, ' +
        'never real code symbols or function names. Strip conjunctions. Use arrows for causality (X → Y). ' +
        'One word when one word will do.',
    wenyan:
        'Reply fully in 文言文 (Classical Chinese) at maximum terseness — aim for 80–90% character reduction. ' +
        'Use classical sentence patterns: verbs precede objects, omit subjects where clear, use classical particles (之/乃/為/其).',
};

/**
 * Build the system-prompt directive for a caveman level.
 * Returns '' for 'off' or any unknown level (no injection).
 */
export function cavemanDirective(level) {
    const rule = RULES[level];
    if (!rule) return '';
    return `\n\nCAVEMAN MODE — output compression ("${level}"). Compress your prose accordingly:\n${rule}\n${GUARDRAIL}`;
}
