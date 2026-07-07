// Shared keyword-relevance tokenizer. Used by the web search tool
// (IntelligentSearchTool) and the notes brain (brain.js) so both strip the
// same filler words before scoring.

export const RELEVANCE_STOPWORDS = new Set([
    'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'were',
    'what', 'whats', 'who', 'whos', 'when', 'where', 'how', 'why', 'do', 'does', 'did',
    'i', 'my', 'me', 'this', 'that', 'with', 'about', 'your', 'you', 'can', 'could', 'would',
    'please', 'search', 'find', 'tell', 'give', 'show', 'get', 'lookup', 'look', 'up'
]);

export function tokenizeForRelevance(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(token => token.length > 2 && !RELEVANCE_STOPWORDS.has(token));
}
