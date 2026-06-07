export const DIFF_REVIEW_KEY = 'perci_diff_reviews';

export function createIntentReview({ title = 'Workspace review', command = '', output = '', files = [], validation = null } = {}) {
    const parsed = parseDiffLikeOutput(output);
    const touchedFiles = Array.from(new Set([...files, ...parsed.files])).filter(Boolean);
    const review = {
        id: `review-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        command,
        createdAt: new Date().toISOString(),
        files: touchedFiles,
        summary: summarizeIntent({ command, output, files: touchedFiles, parsed }),
        risks: inferRisks({ output, files: touchedFiles, validation }),
        validation: validation || inferValidation(command, output),
        stats: parsed.stats
    };
    saveIntentReview(review);
    return review;
}

export function readIntentReviews() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DIFF_REVIEW_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveIntentReview(review) {
    const reviews = [review, ...readIntentReviews().filter(item => item.id !== review.id)].slice(0, 30);
    localStorage.setItem(DIFF_REVIEW_KEY, JSON.stringify(reviews));
    return reviews;
}

export function formatIntentReview(review) {
    if (!review) return 'Intent review unavailable.';
    return [
        `Intent review: ${review.summary}`,
        `Files: ${review.files.length ? review.files.join(', ') : 'No files detected.'}`,
        `Validation: ${review.validation?.summary || 'No validation detected.'}`,
        `Risks: ${review.risks.length ? review.risks.join(' ') : 'No obvious risks detected.'}`
    ].join('\n');
}

function parseDiffLikeOutput(output) {
    const lines = String(output || '').split('\n');
    const files = [];
    const stats = {
        insertions: 0,
        deletions: 0,
        filesChanged: 0
    };
    for (const line of lines) {
        const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
        if (diffMatch) files.push(diffMatch[2]);
        const statMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)/);
        if (statMatch && !statMatch[1].includes('file changed')) files.push(statMatch[1].trim());
        const changedMatch = line.match(/(\d+)\s+files?\s+changed/);
        if (changedMatch) stats.filesChanged = Number(changedMatch[1]);
        const insertMatch = line.match(/(\d+)\s+insertions?/);
        if (insertMatch) stats.insertions = Number(insertMatch[1]);
        const deleteMatch = line.match(/(\d+)\s+deletions?/);
        if (deleteMatch) stats.deletions = Number(deleteMatch[1]);
    }
    stats.filesChanged = stats.filesChanged || Array.from(new Set(files)).length;
    return { files: Array.from(new Set(files)), stats };
}

function summarizeIntent({ command, output, files, parsed }) {
    const normalized = `${command}\n${output}`.toLowerCase();
    const verbs = [];
    if (normalized.includes('mission')) verbs.push('Mission Control');
    if (normalized.includes('memory')) verbs.push('memory');
    if (normalized.includes('budget')) verbs.push('budgeting');
    if (normalized.includes('model')) verbs.push('model routing');
    if (normalized.includes('diff')) verbs.push('review');
    if (normalized.includes('transit')) verbs.push('visualization');
    const area = verbs.length ? verbs.join(', ') : 'workspace behavior';
    const count = parsed.stats.filesChanged || files.length;
    return `${count || 'Some'} changed file${count === 1 ? '' : 's'} appear to affect ${area}.`;
}

function inferRisks({ output, files, validation }) {
    const risks = [];
    if (!validation || validation.status !== 'passed') risks.push('Validation has not passed yet.');
    if (files.some(file => /missionControl|terminal|electron|preload/.test(file))) risks.push('Execution-control changes can affect local command safety.');
    if (files.some(file => /llm|Model|Cowork|CodeMode|BuildMode/.test(file))) risks.push('Model or prompt changes should be checked with at least one real provider.');
    if (String(output || '').length > 40000) risks.push('Large diffs need focused review for accidental unrelated changes.');
    return risks;
}

function inferValidation(command, output) {
    const text = `${command}\n${output}`.toLowerCase();
    if (/exit code 0|built in|✓ built|compiled successfully|npm run build/.test(text) && !/error|failed/.test(text)) {
        return { status: 'passed', summary: 'Validation output appears to have passed.' };
    }
    if (/error|failed|exit code [1-9]/.test(text)) {
        return { status: 'failed', summary: 'Validation output contains a failure signal.' };
    }
    return { status: 'needed', summary: 'No validation result was detected.' };
}
