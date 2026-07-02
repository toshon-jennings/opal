import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Run stop-slop analysis on text — checks for AI writing patterns.
 * Returns score object with scores, checks, and verdict.
 */
function runDeSlop(text) {
    const checks = [];
    const score = { directness: 10, rhythm: 10, trust: 10, authenticity: 10, density: 10 };

    // Throat-clearing openers
    const openers = [
        /here('s| is) the thing/i, /here('s| is) what/i, /here('s| is) why/i,
        /the uncomfortable truth/i, /it turns out/i, /let me be clear/i,
        /the truth is/i, /i('m| am) going to be honest/i
    ];
    const hasOpeners = openers.some(r => r.test(text));
    if (hasOpeners) { checks.push('Throat-clearing openers — state the point directly'); score.directness -= 3; }

    // Adverbs
    const adverbMatch = text.match(/\b(really|just|literally|genuinely|honestly|simply|actually|deeply|truly|fundamentally|interestingly|importantly|crucially)\b/gi);
    if (adverbMatch) { checks.push(`Adverbs (${adverbMatch.length}): "${adverbMatch.join(', ')}" — delete them`); score.density -= Math.min(adverbMatch.length, 5); }

    // Binary contrasts
    const hasBinary = [/not because/i, /isn't the problem/i, /not just.*but also/i].some(r => r.test(text));
    if (hasBinary) { checks.push('Binary contrast pattern — state your point directly'); score.directness -= 2; }

    // Em dashes
    const emDashCount = (text.match(/—/g) || []).length;
    if (emDashCount > 0) { checks.push(`Em dashes (${emDashCount}) — replace with commas or periods`); score.rhythm -= Math.min(emDashCount, 3); }

    // Passive voice
    const passiveMatch = text.match(/\b(was|were|been|being)\s+\w+ed\b/gi);
    if (passiveMatch) { checks.push(`Passive voice (${passiveMatch.length}) — find the actor, make them the subject`); score.authenticity -= Math.min(passiveMatch.length, 3); }

    // Lazy extremes
    const extremes = text.match(/\b(every|always|never|everyone|everybody|nobody)\b/gi);
    if (extremes) { checks.push(`Lazy extremes (${extremes.length}) — use specifics instead`); score.trust -= Math.min(extremes.length, 2); }

    // Wh- sentence starters
    const whStarts = text.split(/[.?!]\s+/).filter(s => /^(What|When|Where|Which|Who|Why|How)\s/.test(s.trim()));
    if (whStarts.length > 0) { checks.push(`Wh- sentence starters (${whStarts.length}) — restructure to lead with subject`); score.rhythm -= Math.min(whStarts.length, 2); }

    // Vague declaratives
    const hasVague = [/the reasons are/i, /the implications are/i, /the stakes are/i, /the consequences are/i].some(r => r.test(text));
    if (hasVague) { checks.push('Vague declaratives — name the specific thing'); score.density -= 2; }

    // Meta-commentary
    if (/(plot twist|spoiler|but that's another post|the rest of this|as we'll see|let me walk you through)/i.test(text)) {
        checks.push('Meta-commentary — let the content speak for itself'); score.trust -= 2;
    }

    // Normalize scores
    Object.keys(score).forEach(k => { score[k] = Math.max(1, Math.min(10, score[k])); });
    const total = Object.values(score).reduce((a, b) => a + b, 0);

    return {
        total,
        score,
        checks,
        verdict: total < 35 ? 'Revise' : total < 40 ? 'Needs polish' : 'Clean',
        checksCount: checks.length
    };
}

/**
 * De-slop analysis popover — shows stop-slop scoring for a text response.
 */
function DeSlopPopover({ result }) {
    if (!result) return null;
    return (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-[var(--text-primary)]">De-slop Analysis</span>
                <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                    result.verdict === 'Clean'
                        ? 'text-green-500 bg-green-500/10'
                        : result.verdict === 'Needs polish'
                        ? 'text-yellow-500 bg-yellow-500/10'
                        : 'text-red-500 bg-red-500/10'
                }`}>
                    {result.verdict}
                </span>
            </div>
            <div className="flex gap-3 mb-2 text-[var(--text-muted)]">
                {Object.entries(result.score).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1">
                        <span className="capitalize">{key}:</span>
                        <span className={`font-mono font-bold ${
                            val >= 8 ? 'text-green-500' : val >= 6 ? 'text-yellow-500' : 'text-red-500'
                        }`}>{val}/10</span>
                    </div>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                    <span>Total:</span>
                    <span className={`font-mono font-bold ${
                        result.total >= 40 ? 'text-green-500' : result.total >= 35 ? 'text-yellow-500' : 'text-red-500'
                    }`}>{result.total}/50</span>
                </div>
            </div>
            {result.checks.length > 0 ? (
                <div className="space-y-1">
                    {result.checks.map((check, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[var(--text-secondary)]">
                            <span className="shrink-0 mt-0.5 text-yellow-500">!</span>
                            <span>{check}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-green-500">No AI writing patterns detected. Clean prose.</p>
            )}
        </div>
    );
}

/**
 * De-slop button + popover — standalone component for any message rendering context.
 *
 * Usage:
 *   <DeSlopButton text={messageContent} />
 *
 * Add it alongside existing action buttons (Copy, etc.) in any mode's message UI.
 * The component manages its own open/closed state internally.
 * Pass singleUse={true} to auto-dismiss after first click.
 */
export default function DeSlopButton({ text, singleUse }) {
    const [result, setResult] = React.useState(null);

    const handleClick = () => {
        if (singleUse && result) return;
        setResult(result ? null : { ...runDeSlop(text || ''), _ts: Date.now() });
    };

    return (
        <>
            <button
                type="button"
                onClick={handleClick}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[rgba(var(--accent-rgb),0.1)] transition-colors"
                title="Check for AI writing patterns"
            >
                <Sparkles size={13} />
                <span>De-slop</span>
            </button>
            {result && <DeSlopPopover result={result} />}
        </>
    );
}