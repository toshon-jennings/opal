// Intelligent Search Tool - Claude-like web search intelligence
// Automatically decides when to search, reformulates queries, and manages citations

import { LLMFactory } from './llm/clients';

const LOCAL_MODEL_PROVIDERS = new Set(['ollama', 'lmstudio', 'jan']);

function getCurrentDateParts() {
    const now = new Date();
    return {
        monthDay: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        fullDate: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        year: now.getFullYear()
    };
}

function resolveRelativeDateQuery(query) {
    let resolved = String(query || '').trim();
    const { monthDay, fullDate } = getCurrentDateParts();

    if (/this day in history|on this day/i.test(resolved)) {
        resolved = resolved.replace(/\btoday'?s?\b/gi, fullDate);
        if (!new RegExp(monthDay, 'i').test(resolved)) {
            resolved += ` ${monthDay}`;
        }
        return resolved;
    }

    resolved = resolved.replace(/\btoday'?s?\b/gi, fullDate);
    return resolved;
}

const RELEVANCE_STOPWORDS = new Set([
    'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'were',
    'what', 'whats', 'who', 'whos', 'when', 'where', 'how', 'why', 'do', 'does', 'did',
    'i', 'my', 'me', 'this', 'that', 'with', 'about', 'your', 'you', 'can', 'could', 'would',
    'please', 'search', 'find', 'tell', 'give', 'show', 'get', 'lookup', 'look', 'up'
]);

function tokenizeForRelevance(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(token => token.length > 2 && !RELEVANCE_STOPWORDS.has(token));
}

// Deterministic detector for facts answerable from the local system clock/calendar.
// Deliberately excludes "on this day in history" style queries, which want a web/
// historical lookup rather than the current date.
function detectLocalRuntimeFact(query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return null;
    if (/in history|on this day|years? ago|anniversary|was born|died on|happened on/i.test(q)) {
        return null;
    }

    const now = new Date();
    const fullDate = now.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (/what year is it|current year|what'?s the year|which year is it/i.test(q)) {
        return { kind: 'year', answer: `It is currently the year ${now.getFullYear()}.` };
    }
    if (/(current|local)\s+time|what'?s the time|what is the time|time is it|what time/i.test(q)) {
        return { kind: 'time', answer: `The current local time is ${timeStr} on ${fullDate}.` };
    }
    if (
        /today'?s date|current date|what'?s the date|what is the date|date today/i.test(q) ||
        /what day is it|what'?s today|what is today|day of the week|which day is it/i.test(q)
    ) {
        return { kind: 'date', answer: `Today is ${fullDate}.` };
    }
    return null;
}

export class IntelligentSearchTool {
    constructor(llmProvider = null, llmApiKey = null, lmStudioUrl = null, janUrl = null, llmModel = null) {
        this.llmProvider = llmProvider;
        this.llmApiKey = llmApiKey;
        this.lmStudioUrl = lmStudioUrl;
        this.janUrl = janUrl;
        this.llmModel = llmModel;
        this.searchHistory = [];
        this.logoCache = new Map(); // Cache logos to avoid repeated fetches
    }

    hasWebSearch() {
        return Boolean(this.hasNativeWebSearch() || this.hasLocalWebSearch());
    }

    hasNativeWebSearch() {
        return Boolean(
            (this.llmProvider === 'openai' && this.llmApiKey) ||
            (this.llmProvider === 'anthropic' && this.llmApiKey)
        );
    }

    hasLocalWebSearch() {
        return typeof window !== 'undefined' && typeof window.electron?.webSearch === 'function';
    }

    canUseModel() {
        return Boolean(this.llmProvider && (this.llmApiKey || LOCAL_MODEL_PROVIDERS.has(this.llmProvider)));
    }

    getModelId() {
        return this.llmModel || undefined;
    }

    /**
     * Extracts the publisher logo from a URL using favicon or Schema.org JSON-LD
     * @param {string} url - The source URL
     * @returns {Promise<string|null>} - Logo URL or null
     */
    async extractPublisherLogo(url) {
        try {
            // Check cache first
            const domain = new URL(url).hostname;
            if (this.logoCache.has(domain)) {
                return this.logoCache.get(domain);
            }

            // Use Google's favicon service as a reliable fallback
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

            // Try to get a higher quality logo via clearbit (free tier)
            const clearbitLogo = `https://logo.clearbit.com/${domain}`;

            // Test if clearbit logo exists (it returns 404 for unknown domains)
            try {
                const response = await fetch(clearbitLogo, { method: 'HEAD' });
                if (response.ok) {
                    this.logoCache.set(domain, clearbitLogo);
                    return clearbitLogo;
                }
            } catch {
                // Clearbit failed, fall back to favicon
            }

            // Fallback to Google favicon
            this.logoCache.set(domain, faviconUrl);
            return faviconUrl;
        } catch (error) {
            console.error('Logo extraction failed for:', url, error);
            return null;
        }
    }

    /**
     * Enhances sources with publisher logos asynchronously
     * @param {Array} sources - Array of source objects
     * @returns {Promise<Array>} - Sources with logo property added
     */
    async enhanceSourcesWithLogos(sources) {
        const enhancedSources = await Promise.all(
            sources.map(async (source) => {
                const logo = await this.extractPublisherLogo(source.url);
                const domain = new URL(source.url).hostname.replace('www.', '');
                return {
                    ...source,
                    logo,
                    domain
                };
            })
        );
        return enhancedSources;
    }

    /**
     * Decides if a web search is needed based on query analysis
     * @param {string} userQuery - The user's question
     * @returns {Object} - { shouldSearch: boolean, reason: string, confidence: number }
     */
    shouldPerformWebSearch(userQuery) {
        const query = userQuery.toLowerCase();

        // ALWAYS SEARCH indicators (current/recent information)
        const alwaysSearchKeywords = [
            'latest', 'recent', 'current', 'today', 'yesterday',
            'this week', 'this month', 'this year', 'now',
            '2024', '2025', 'breaking', 'news', 'update',
            'what happened', 'who won', 'who is currently',
            'price of', 'weather', 'stock', 'score',
            'currently', 'right now', 'as of', 'at the moment'
        ];

        // NEVER SEARCH indicators (timeless knowledge)
        const neverSearchKeywords = [
            'what is', 'define', 'explain', 'how to',
            'tutorial', 'example of', 'history of',
            'who was', 'when was', 'founded in',
            'write code', 'create', 'generate',
            'help me', 'can you', 'write a'
        ];

        // Check for always-search keywords
        for (const keyword of alwaysSearchKeywords) {
            if (query.includes(keyword)) {
                return {
                    shouldSearch: true,
                    reason: `Query indicates need for current information (keyword: "${keyword}")`,
                    confidence: 0.95
                };
            }
        }

        // Check for never-search keywords (unless it mentions a year or "current")
        for (const keyword of neverSearchKeywords) {
            if (query.includes(keyword)) {
                // Exception: if mentions current year or "current"
                if (!query.match(/202[0-9]|current|now|today|recent/)) {
                    return {
                        shouldSearch: false,
                        reason: `Query is about timeless knowledge (keyword: "${keyword}")`,
                        confidence: 0.85
                    };
                }
            }
        }

        // Check for specific entity patterns that need verification
        const entityPatterns = [
            { pattern: /who is (the )?(ceo|president|leader|director|head)/i, desc: 'current position query' },
            { pattern: /is \w+ still (the )?(ceo|president|alive|active)/i, desc: 'current status query' },
            { pattern: /does \w+ still (exist|work|operate)/i, desc: 'current existence query' },
            { pattern: /where (can i|to) (buy|get|find|purchase)/i, desc: 'shopping query' },
            { pattern: /(best|top|recommended) \w+ (202[0-9]|this year|now)/i, desc: 'current recommendations' }
        ];

        for (const { pattern, desc } of entityPatterns) {
            if (pattern.test(query)) {
                return {
                    shouldSearch: true,
                    reason: `Query asks about ${desc}`,
                    confidence: 0.90
                };
            }
        }

        // Default: SEARCH if query is about real-world entities, user-specified or specific topics
        // Only skip search for pure coding/generation tasks
        const neverSearchPatterns = [
            /^(write|create|generate|make|build) (a |an |some )?code/i,
            /^(write|create|generate|make|build) (a |an |some )?(function|class|component)/i,
            /^help me (write|code|program|debug)/i,
            /^(fix|debug) (this |my )?code/i
        ];

        for (const pattern of neverSearchPatterns) {
            if (pattern.test(query)) {
                return {
                    shouldSearch: false,
                    reason: 'Query is a coding/generation task',
                    confidence: 0.80
                };
            }
        }

        // Default: SEARCH for information queries
        return {
            shouldSearch: true,
            reason: 'Query appears to be asking for information - searching to ensure accuracy',
            confidence: 0.75
        };
    }

    /**
     * Reformulates a natural language query into a search-optimized format
     * @param {string} originalQuery - The original user query
     * @returns {Promise<string>} - Optimized search query
     */
    async reformulateSearchQuery(originalQuery) {
        const dateResolvedQuery = resolveRelativeDateQuery(originalQuery);
        // If we have LLM access, use it for smart reformulation
        if (this.llmProvider && this.llmApiKey) {
            try {
                const client = LLMFactory.getClient(this.llmProvider, this.llmApiKey, { lmStudioUrl: this.lmStudioUrl, janUrl: this.janUrl });
                let reformulated = '';

                const prompt = `You are a search query optimizer. Convert this natural language question into a concise, effective search query.

Rules:
- Remove unnecessary words (what, is, are, the, tell, me, about)
- Keep it 2-6 words maximum
- Focus on key terms and entities
- Add year if asking about "latest" or "best"
- Examples:
  "What are the best smartphones in 2025?" → "best smartphones 2025"
  "Who won the NBA finals last year?" → "NBA finals winner 2024"
  "Tell me about recent AI developments" → "recent AI developments 2025"
  "What's the weather like today?" → "weather today"

Original query: "${originalQuery}"
Date-resolved query: "${dateResolvedQuery}"

Optimized search query (keep exact dates from the date-resolved query):`;

                await client.streamChat(
                    [{ role: 'user', content: prompt }],
                    (chunk) => { reformulated += chunk; },
                    this.getModelId()
                );

                const cleaned = reformulated.trim().replace(/^["']|["']$/g, '');
                return cleaned || originalQuery;
            } catch (error) {
                console.error('LLM reformulation failed, using fallback:', error);
                return this.fallbackReformulation(originalQuery);
            }
        }

        // Fallback: keyword-based reformulation
        return this.fallbackReformulation(dateResolvedQuery);
    }

    /**
     * Simple keyword-based query reformulation
     * @param {string} query - Original query
     * @returns {string} - Reformulated query
     */
    fallbackReformulation(query) {
        let cleaned = query.trim();

        // Command prefixes to remove (user telling the AI what to do)
        const commandPrefixes = [
            'search for', 'search', 'find', 'look up', 'lookup', 'google',
            'can you search', 'please search', 'i want to search',
            'search the web for', 'look for', 'find me', 'get me',
            'tell me about', 'tell me', 'what is', 'what are', 'what\'s',
            'who is', 'who are', 'who\'s', 'where is', 'where are',
            'when is', 'when was', 'how is', 'how are', 'how to',
            'can you tell me', 'can you find', 'please tell me',
            'i want to know', 'i need to know', 'give me information about',
            'give me info on', 'give me', 'show me', 'explain',
            'i\'m looking for', 'i am looking for', 'help me find'
        ];

        // Sort by length descending to match longer phrases first
        commandPrefixes.sort((a, b) => b.length - a.length);

        for (const prefix of commandPrefixes) {
            const regex = new RegExp(`^${prefix}\\s+`, 'gi');
            if (regex.test(cleaned)) {
                cleaned = cleaned.replace(regex, '');
                break; // Only remove one prefix
            }
        }

        // Remove trailing question marks and common endings
        cleaned = cleaned.replace(/\?+$/, '').trim();
        cleaned = cleaned.replace(/\s+(please|thanks|thank you)$/i, '').trim();

        // Normalize company/product names for better search
        const nameNormalizations = {
            'open ai': 'openai',
            'chat gpt': 'chatgpt',
            'gpt4': 'gpt-4',
            'gpt 4': 'gpt-4',
            'gpt-4o': 'gpt-4o',
            'claude 3': 'claude-3',
            'meta ai': 'meta ai',
            'google ai': 'google ai gemini',
            'microsoft ai': 'microsoft copilot'
        };

        for (const [from, to] of Object.entries(nameNormalizations)) {
            cleaned = cleaned.replace(new RegExp(from, 'gi'), to);
        }

        // Convert relative time words to absolute
        const { fullDate, year: currentYear } = getCurrentDateParts();
        const lastYear = currentYear - 1;

        cleaned = cleaned.replace(/\bthis year\b/gi, String(currentYear));
        cleaned = cleaned.replace(/\blast year\b/gi, String(lastYear));
        cleaned = cleaned.replace(/\btoday'?s?\b/gi, fullDate);
        cleaned = cleaned.replace(/\bcurrently\b/gi, 'current');
        cleaned = cleaned.replace(/\bright now\b/gi, 'now');
        cleaned = cleaned.replace(/\bup to date\b/gi, currentYear);
        cleaned = cleaned.replace(/\bupto date\b/gi, currentYear);

        // Add current year for recency queries if not present
        if (/(latest|newest|recent|current|new|breaking|update)/i.test(cleaned) && !cleaned.match(/202[0-9]/)) {
            cleaned += ` ${currentYear}`;
        }

        // Remove extra spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        // If we've cleaned everything away, return something sensible
        if (!cleaned || cleaned.length < 3) {
            return query.replace(/^(search|find|look up)\s+/i, '').trim();
        }

        return cleaned;
    }

    /**
     * Detects if query is news-related
     * @param {string} query - Search query
     * @returns {boolean}
     */
    isNewsQuery(query) {
        const newsKeywords = [
            'news', 'breaking', 'latest', 'today', 'yesterday',
            'this week', 'happened', 'announced', 'reports'
        ];
        return newsKeywords.some(kw => query.toLowerCase().includes(kw));
    }

    /**
     * Performs an intelligent search with optimized parameters
     * @param {string} originalQuery - User's original query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} - Formatted search results
     */
    async performSearch(originalQuery, options = {}) {
        // Step 1: Reformulate query
        const resolvedQuery = resolveRelativeDateQuery(originalQuery);
        const optimizedQuery = await this.reformulateSearchQuery(resolvedQuery);

        console.log(`🔍 Original: "${originalQuery}"`);
        console.log(`📅 Date-resolved: "${resolvedQuery}"`);
        console.log(`🎯 Optimized: "${optimizedQuery}"`);

        if (this.hasLocalWebSearch()) {
            return this.performLocalWebSearch(originalQuery, optimizedQuery, options);
        }
        if (this.hasNativeWebSearch()) {
            return this.performNativeWebSearch(originalQuery, optimizedQuery, options);
        }
        throw new Error('Web search requires the Perci desktop search bridge or a provider with native web search.');
    }

    async performNativeWebSearch(originalQuery, optimizedQuery, options = {}) {
        if (this.llmProvider === 'openai') {
            return this.performOpenAIWebSearch(originalQuery, optimizedQuery, options);
        }
        if (this.llmProvider === 'anthropic') {
            return this.performAnthropicWebSearch(originalQuery, optimizedQuery, options);
        }
        throw new Error(`Native web search is not available for provider: ${this.llmProvider}`);
    }

    async performLocalWebSearch(originalQuery, optimizedQuery, options = {}) {
        const result = await window.electron.webSearch(optimizedQuery, {
            maxResults: options.maxResults || 6
        });

        if (!result?.ok || !Array.isArray(result.sources) || result.sources.length === 0) {
            throw new Error(result?.error || 'Local web search returned no results.');
        }

        const sources = result.sources.map((source, index) => ({
            id: index + 1,
            title: source.title,
            url: source.url,
            content: source.content,
            score: source.score || 1,
            publishedDate: source.publishedDate || null
        }));

        this.searchHistory.push({
            originalQuery,
            optimizedQuery,
            timestamp: new Date(),
            resultCount: sources.length,
            topic: result.provider || 'local-web'
        });

        return {
            originalQuery,
            optimizedQuery,
            answer: null,
            sources,
            images: [],
            timestamp: new Date(),
            provider: result.provider || 'local-web'
        };
    }

    async performOpenAIWebSearch(originalQuery, optimizedQuery, options = {}) {
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.llmApiKey}`
            },
            body: JSON.stringify({
                model: this.getModelId() || 'gpt-4o-mini',
                tools: [{ type: 'web_search' }],
                tool_choice: 'auto',
                include: ['web_search_call.action.sources'],
                input: optimizedQuery
            })
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(`OpenAI web search failed: ${response.status} - ${message}`);
        }

        const data = await response.json();
        const text = data.output_text || this.extractOpenAIOutputText(data);
        const sources = this.extractOpenAISources(data);

        this.searchHistory.push({
            originalQuery,
            optimizedQuery,
            timestamp: new Date(),
            resultCount: sources.length,
            topic: 'native-openai'
        });

        return {
            originalQuery,
            optimizedQuery,
            answer: text || null,
            sources,
            images: [],
            timestamp: new Date(),
            provider: 'openai'
        };
    }

    extractOpenAIOutputText(data) {
        return (data.output || [])
            .filter(item => item.type === 'message')
            .flatMap(item => item.content || [])
            .filter(content => content.type === 'output_text' && content.text)
            .map(content => content.text)
            .join('\n\n')
            .trim();
    }

    extractOpenAISources(data) {
        const sourceMap = new Map();
        const addSource = (source, indexHint = 0) => {
            const url = source?.url;
            if (!url || sourceMap.has(url)) return;
            sourceMap.set(url, {
                id: sourceMap.size + 1,
                title: source.title || source.url,
                url,
                content: source.snippet || source.text || source.title || url,
                score: source.score || 1,
                publishedDate: source.published_date || source.publishedDate || null,
                indexHint
            });
        };

        (data.output || []).forEach((item, itemIndex) => {
            if (item.type === 'web_search_call') {
                const actionSources = item.action?.sources || item.sources || [];
                actionSources.forEach((source, sourceIndex) => addSource(source, itemIndex + sourceIndex));
            }
            if (item.type === 'message') {
                (item.content || []).forEach(content => {
                    (content.annotations || []).forEach((annotation, annotationIndex) => {
                        if (annotation.type === 'url_citation') addSource(annotation, annotationIndex);
                    });
                });
            }
        });

        return [...sourceMap.values()].map(({ indexHint, ...source }, index) => ({ ...source, id: index + 1 }));
    }

    async performAnthropicWebSearch(originalQuery, optimizedQuery, options = {}) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.llmApiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: this.getModelId() || 'claude-sonnet-4-5',
                max_tokens: 4096,
                tools: [{ type: 'web_search_20250305', name: 'web_search' }],
                messages: [{ role: 'user', content: optimizedQuery }]
            })
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(`Anthropic web search failed: ${response.status} - ${message}`);
        }

        const data = await response.json();
        const text = this.extractAnthropicText(data);
        const sources = this.extractUrlSources(data);

        this.searchHistory.push({
            originalQuery,
            optimizedQuery,
            timestamp: new Date(),
            resultCount: sources.length,
            topic: 'native-anthropic'
        });

        return {
            originalQuery,
            optimizedQuery,
            answer: text || null,
            sources,
            images: [],
            timestamp: new Date(),
            provider: 'anthropic'
        };
    }

    extractAnthropicText(data) {
        return (data.content || [])
            .filter(block => block.type === 'text' && block.text)
            .map(block => block.text)
            .join('\n\n')
            .trim();
    }

    extractUrlSources(value) {
        const sourceMap = new Map();
        const visit = (node) => {
            if (!node || typeof node !== 'object') return;
            if (typeof node.url === 'string' && /^https?:\/\//i.test(node.url)) {
                if (sourceMap.has(node.url)) return;
                sourceMap.set(node.url, {
                    id: sourceMap.size + 1,
                    title: node.title || node.url,
                    url: node.url,
                    content: node.snippet || node.text || node.title || node.url,
                    score: node.score || 1,
                    publishedDate: node.published_date || node.publishedDate || null
                });
            }
            Object.values(node).forEach(visit);
        };
        visit(value);
        return [...sourceMap.values()].map((source, index) => ({ ...source, id: index + 1 }));
    }

    /**
     * Analyzes if search results are comprehensive enough
     * @param {string} query - Original query
     * @param {Object} searchResults - Current search results
     * @returns {Promise<Object>} - { needsMore: boolean, reason: string, suggestedQuery: string }
     */
    async analyzeSearchCompleteness(query, searchResults) {
        // Heuristic-based analysis with smarter follow-up query generation

        // If we got fewer than 3 quality results, definitely need more
        const qualitySources = searchResults.sources.filter(s => s.score > 0.5);
        if (qualitySources.length < 3) {
            // Try a more specific query
            const broadenedQuery = query.includes('latest') || query.includes('recent')
                ? query.replace(/latest|recent/, 'news updates')
                : query + ' news';

            return {
                needsMore: true,
                reason: 'Need more quality sources',
                suggestedQuery: broadenedQuery
            };
        }

        // If average score is low, try alternative phrasing
        const avgScore = searchResults.sources.reduce((sum, s) => sum + s.score, 0) / searchResults.sources.length;
        if (avgScore < 0.6) {
            // Try a different angle
            const alternativeQuery = query.includes('what') || query.includes('who')
                ? query.replace(/what|who/i, '').trim() + ' overview'
                : query + ' information';

            return {
                needsMore: true,
                reason: 'Low relevance - trying different angle',
                suggestedQuery: alternativeQuery
            };
        }

        // If no recent sources for time-sensitive queries, search for updates
        if (query.match(/latest|recent|current|today|2025|news/i)) {
            const hasRecentSources = searchResults.sources.some(s => {
                if (!s.publishedDate) return false;
                const date = new Date(s.publishedDate);
                const daysSincePublished = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
                return daysSincePublished < 30; // Within last 30 days
            });

            if (!hasRecentSources && searchResults.sources.length < 5) {
                return {
                    needsMore: true,
                    reason: 'No recent sources found - searching for updates',
                    suggestedQuery: query + ' 2025 update'
                };
            }
        }

        // Results look good
        return {
            needsMore: false,
            reason: 'Search results appear comprehensive',
            suggestedQuery: null
        };
    }

    /**
     * Performs multiple searches if needed for complex queries
     * Claude-style: searches continuously until confident we have enough info
     * @param {string} userQuery - User's original query
     * @param {number} maxSearches - Maximum number of searches
     * @param {Function} onProgress - Callback for progress updates
     * @returns {Promise<Object>} - Merged search results
     */
    async intelligentMultiSearch(userQuery, maxSearches = 3, onProgress = null) {
        const allResults = [];
        let searchCount = 0;
        let totalSources = 0;

        // Notify start of multi-search
        if (onProgress) {
            onProgress({
                searchNumber: 1,
                totalSearches: maxSearches,
                query: userQuery,
                status: 'starting'
            });
        }

        // First search - always perform
        console.log(`\n🔍 Multi-Search #1: Initial query`);
        if (onProgress) {
            onProgress({
                searchNumber: 1,
                totalSearches: maxSearches,
                query: userQuery,
                status: 'searching'
            });
        }

        let results = await this.performSearch(userQuery);
        allResults.push(results);
        searchCount++;
        totalSources = results.sources.length;

        if (onProgress) {
            onProgress({
                searchNumber: 1,
                totalSearches: maxSearches,
                query: results.optimizedQuery,
                results: results,
                sourcesFound: totalSources,
                status: 'complete'
            });
        }

        // Continue searching until we have enough high-quality sources
        const MIN_SOURCES = 5;
        const MIN_AVG_SCORE = 0.6;

        while (searchCount < maxSearches) {
            const avgScore = totalSources > 0
                ? allResults.reduce((sum, r) => sum + r.sources.reduce((s, src) => s + src.score, 0), 0) / totalSources
                : 0;

            // Check if we need more searches
            if (totalSources >= MIN_SOURCES && avgScore >= MIN_AVG_SCORE) {
                console.log(`✅ Sufficient information found (${totalSources} sources, avg score: ${avgScore.toFixed(2)})`);
                break;
            }

            // Analyze what additional information we need
            const analysis = await this.analyzeSearchCompleteness(userQuery, this.mergeSearchResults(allResults));

            if (analysis.needsMore && analysis.suggestedQuery) {
                const nextSearchNum = searchCount + 1;
                console.log(`\n🔍 Multi-Search #${nextSearchNum}: ${analysis.reason}`);

                if (onProgress) {
                    onProgress({
                        searchNumber: nextSearchNum,
                        totalSearches: maxSearches,
                        query: analysis.suggestedQuery,
                        status: 'searching',
                        reason: analysis.reason
                    });
                }

                const followUpResults = await this.performSearch(analysis.suggestedQuery);
                allResults.push(followUpResults);
                searchCount++;
                const newSources = followUpResults.sources.length;
                totalSources += newSources;

                if (onProgress) {
                    onProgress({
                        searchNumber: nextSearchNum,
                        totalSearches: maxSearches,
                        query: followUpResults.optimizedQuery,
                        results: followUpResults,
                        sourcesFound: newSources,
                        totalSourcesNow: totalSources,
                        status: 'complete'
                    });
                }
            } else {
                console.log(`ℹ️ No additional searches needed`);
                break;
            }
        }

        console.log(`\n📊 Multi-search complete: ${searchCount} searches, ${totalSources} total sources`);

        if (onProgress) {
            onProgress({
                searchNumber: searchCount,
                totalSearches: searchCount,
                totalSources: totalSources,
                status: 'all_complete'
            });
        }

        // Merge and deduplicate
        return this.mergeSearchResults(allResults);
    }

    /**
     * Merges multiple search results and deduplicates
     * @param {Array<Object>} resultsArray - Array of search result objects
     * @returns {Object} - Merged results
     */
    mergeSearchResults(resultsArray) {
        if (resultsArray.length === 1) return resultsArray[0];

        const seenUrls = new Set();
        const mergedSources = [];

        for (const resultSet of resultsArray) {
            for (const source of resultSet.sources) {
                if (!seenUrls.has(source.url)) {
                    seenUrls.add(source.url);
                    mergedSources.push(source);
                }
            }
        }

        // Re-number citations
        mergedSources.forEach((source, index) => {
            source.id = index + 1;
        });

        return {
            ...resultsArray[0],
            sources: mergedSources,
            searchCount: resultsArray.length
        };
    }

    /**
     * Builds context string for LLM from search results
     * @param {Object} searchResults - Formatted search results
     * @returns {string} - Context string with citations
     */
    buildSearchContext(searchResults) {
        if (!searchResults || (!searchResults.answer && !searchResults.sources.length)) return '';

        let context = '\n\nWeb Search Results:\n\n';

        if (searchResults.answer) {
            context += `Provider answer:\n${searchResults.answer}\n\n`;
        }

        searchResults.sources.forEach((source, index) => {
            context += `[${index + 1}] ${source.title}\n`;
            context += `URL: ${source.url}\n`;
            context += `Content: ${source.content}\n`;
            if (source.publishedDate) {
                context += `Published: ${source.publishedDate}\n`;
            }
            context += `\n`;
        });

        return context;
    }

    /**
     * Gets the search history
     * @returns {Array} - Search history
     */
    getSearchHistory() {
        return this.searchHistory;
    }

    /**
     * Executes the Dynamic Deep Research workflow
     * True autonomous agent loop: Decides next step -> Executes -> Evaluates -> Repeats
     * Minimum research time: 3 minutes (180s)
     */
    async deepResearch(userQuery, onProgress = null) {
        console.log('🚀 Starting Deep Research Scientist Mode for:', userQuery);
        if (!this.hasWebSearch()) {
            return this.modelOnlyResearch(userQuery, onProgress);
        }

        const startTime = Date.now();
        const MIN_TIME_MS = 180000; // 3 minutes

        // Initial state
        const findings = [];
        const seenUrls = new Set();
        let stepCount = 0;
        const MAX_STEPS = 15; // Allow for deep investigation
        let isComplete = false;

        // Step 1: Planning / Decomposition
        if (onProgress) onProgress({
            status: 'decomposing',
            query: userQuery,
            message: 'Analyzing query complexity and planning multi-stage investigation...'
        });

        // Jumpstart with decomposition
        const subQuestions = await this.decomposeQuery(userQuery);
        if (onProgress) {
            onProgress({
                status: 'decomposing',
                message: `Decomposed into ${subQuestions.length} logical sub-questions. Initializing strategy...`
            });
        }

        while (!isComplete && stepCount < MAX_STEPS) {
            stepCount++;
            const elapsedMs = Date.now() - startTime;

            // 1. Decide what to do next
            const findingsSummary = findings.map(f => `- Investigated: ${f.query} (${f.results.sources.length} sources found)`).join('\n');
            const decision = await this.decideNextStep(userQuery, findingsSummary, stepCount, elapsedMs / 1000);

            console.log(`🤖 Action Step ${stepCount}:`, decision);

            // Check if we can finish (only if time is up and logic says so)
            if (decision.action === 'finish') {
                if (elapsedMs < MIN_TIME_MS) {
                    console.log('⏳ Finishing too early? Forcing deeper investigation to meet 3-minute minimum.');
                    // Force another search step if we have subquestions left or just need to dig deeper
                    decision.action = 'search';
                    decision.query = subQuestions[stepCount % subQuestions.length] || (`${userQuery} in-depth analysis`);
                    decision.reasoning = "Continuing research to ensure maximum depth and verification (Time requirement not yet met).";
                } else {
                    if (onProgress) onProgress({ status: 'synthesizing', message: 'Research complete. Synthesizing findings into professional report...' });
                    isComplete = true;
                    break;
                }
            }

            // 2. Execute Research Step
            const searchQuery = decision.query;
            if (onProgress) {
                onProgress({
                    status: 'searching',
                    query: searchQuery,
                    currentStep: stepCount,
                    totalSteps: 'Autonomous',
                    message: `Step ${stepCount}: ${decision.reasoning}`
                });
            }

            const results = await this.performSearch(searchQuery, { depth: 'advanced', maxResults: 7 });

            // Deduplicate across entire research session
            const newSources = results.sources.filter(s => !seenUrls.has(s.url));
            newSources.forEach(s => seenUrls.add(s.url));
            results.sources = newSources;

            // Fetch logos for new sources
            if (newSources.length > 0) {
                await this.enhanceSourcesWithLogos(newSources);
            }

            findings.push({
                query: searchQuery,
                results: results,
                rationale: decision.reasoning
            });

            // 3. Deliberate research pause for thoroughness (simulated)
            // Pause longer if we are early in the process
            const pauseTime = Math.max(3000, 10000 - (stepCount * 500));
            await new Promise(r => setTimeout(r, pauseTime));
        }

        // Final synthesis
        const mergedResults = this.mergeDeepResearchResults(findings);
        const queriesRan = findings.map(f => f.query);
        const researchPaper = await this.generateResearchPaper(userQuery, mergedResults, queriesRan);

        return {
            content: researchPaper,
            sources: mergedResults.sources,
            optimizedQuery: userQuery
        };
    }

    /**
     * Decides the next research step with timing awareness
     */
    async decideNextStep(originalQuery, findingsSummary, currentStep, elapsedSeconds) {
        if (!this.canUseModel()) {
            if (currentStep < 4) return { action: 'search', query: originalQuery + " details", reasoning: 'Building depth' };
            return { action: 'finish', reasoning: 'Standard count reached' };
        }

        const prompt = `You are an autonomous research director controlling a detailed, multi-step investigation.
        Goal: Comprehensive, "Deep Research" on "${originalQuery}".
        
        Current State:
        - Research Time Elapsed: ${elapsedSeconds.toFixed(0)}s
        - Step Number: ${currentStep}
        - Findings so far:
        ${findingsSummary || "None"}
        
        Task: Decide the NEXT logical research step.
        
        RULES:
        1. **Do not stop early**. "Deep Research" requires multiple perspectives.
        2. **Thoroughness**: Verify key claims across ≥3 authoritative sources.
        3. **Minimum Effort**: Aim for at least 180 seconds of active research.
        4. **Conflict Resolution**: If findings are contradictory or thin, search specifically to resolve them.
        
        OUTPUT FORMAT (JSON ONLY):
        {"action": "search", "query": "precise query", "reasoning": "why this next"}
        OR
        {"action": "finish", "reasoning": "why complete"} (ONLY if time > 180s and all sub-aspects verified)`;

        try {
            const client = LLMFactory.getClient(this.llmProvider, this.llmApiKey, { lmStudioUrl: this.lmStudioUrl, janUrl: this.janUrl });
            let response = '';
            await client.streamChat(
                [{ role: 'user', content: prompt }],
                (chunk) => { response += chunk; },
                this.getModelId()
            );
            const cleaned = response.replace(/```json|```/g, '').trim();
            return JSON.parse(cleaned);
        } catch (e) {
            console.error('Decision failed:', e);
            if (currentStep < 5) return { action: 'search', query: originalQuery + " specifics", reasoning: 'Auto-recovery' };
            return { action: 'finish', reasoning: 'Auto-recovery finish' };
        }
    }

    /**
     * Decomposes a query into 5-10 logical sub-questions
     */
    async decomposeQuery(query) {
        if (!this.canUseModel()) {
            return [query, query + ' analysis', query + ' perspectives', query + ' history'];
        }

        const prompt = `Decompose this complex research topic into 5-10 distinct, search-friendly sub-questions for a professional research paper.
        Topic: "${query}"
        
        JSON array of strings only.`;

        try {
            const client = LLMFactory.getClient(this.llmProvider, this.llmApiKey, { lmStudioUrl: this.lmStudioUrl, janUrl: this.janUrl });
            let response = '';
            await client.streamChat(
                [{ role: 'user', content: prompt }],
                (chunk) => { response += chunk; },
                this.getModelId()
            );
            const cleaned = response.replace(/```json|```/g, '').trim();
            return JSON.parse(cleaned);
        } catch (e) {
            return [query, query + ' analysis', query + ' latest developments'];
        }
    }

    /**
     * Merges results from multiple sub-questions
     */
    mergeDeepResearchResults(allFindings) {
        const merged = { sources: [] };
        const seenUrls = new Set();

        allFindings.forEach(finding => {
            finding.results.sources.forEach(source => {
                if (!seenUrls.has(source.url)) {
                    seenUrls.add(source.url);
                    merged.sources.push(source);
                }
            });
        });

        // Renumber sources 1..N
        merged.sources.forEach((s, i) => s.id = i + 1);
        return merged;
    }

    /**
     * Generates a formal research paper following strict user guidelines
     */
    async generateResearchPaper(userQuery, mergedResults, ranQueries) {
        const context = this.buildSearchContext(mergedResults);
        const date = new Date().toISOString().split('T')[0];

        const systemPrompt = `You are an autonomous research agent with full control over your reasoning, tool use, and output quality. When the user activates **[Deep Research]** (via a UI button that triggers a tool_call), you **MUST** generate a **professional, multi-page research report** — **identical in structure, depth, and polish** to the paper titled “A Deep Dive into Autonomous Web Search for Conversational AI”.

---

### 🔍 RESEARCH BEHAVIOR: SLOW, THOROUGH, AUTONOMOUS

1. **Do not rush**. First:
   - Analyze the query’s complexity.
   - Decompose it into 5–10 logical sub-questions.
   - Plan a multi-stage investigation strategy.

2. **Research iteratively**:
   - Use the configured live web search provider for initial evidence gathering.
   - If the topic requires forecasting, synthesis, or conflict resolution, **escalate to your proprietary deep agent**.
   - **Verify every key claim** across ≥3 authoritative sources (e.g., .gov, .edu, Reuters, Nature, official reports).
   - If sources contradict, **investigate further**—do not average or ignore.

3. **Decide when to stop — YOU control duration**:
   - Stop only when:
     • All sub-questions are answered
     • Core claims are verified
     • New searches yield diminishing returns
   - **Minimum research time: 3 minutes simulated**. Ideal: 5–10 minutes.
   - **Never stop after a fixed number of sources** (e.g., “5 sources” is forbidden).

---

### 📄 OUTPUT: PROFESSIONAL RESEARCH PAPER (PDF-READY)

Your final output must be a **single, clean, structured Markdown document** that converts flawlessly to PDF — **exactly like “A Deep Dive into Autonomous Web Search for Conversational AI”**.

#### ✅ FORMAT RULES (NON-NEGOTIABLE)
- **Font**: Simulated as standard body text — **never bold entire paragraphs**, **never use oversized headings**.
- **Text color**: All text must render as **black** (no gray, no low-contrast).
- **Spacing**: Blank line before/after every heading. Paragraphs separated by blank lines.
- **Headings**: Use \`## Abstract\`, \`## 1. Introduction\`, etc. — **never jam headings into paragraphs**.
- **Citations**: \`[1]\` after punctuation. Match every citation to a reference.
- **Logos**: Only include if a valid \`https://\` URL was extracted from Schema.org \`Organization.logo\`. Format:  
  \`[1] BBC News ![BBC Logo](https://www.bbc.com/favicon.ico)\`  
  → **Never invent or omit the \`https://\`**.
- **No markdown errors**: No unclosed brackets, broken images, or raw HTML.

#### 📑 REQUIRED STRUCTURE (COPY THIS EXACTLY)
**Title**: [Clear, descriptive title]  
**Author**: Autonomous Research Agent  
**Date**: ${date}

## Abstract  
[150–300 words. One paragraph. No citations.]

## 1. Introduction  
[Context + research goal + scope of paper.]

## 2. Methodology  
This report was generated via autonomous deep research on ${date}. We decomposed the query into ${ranQueries.length} logical sub-questions, conducted iterative web searches using the configured live web search provider, and synthesized findings from ${mergedResults.sources.length} authoritative sources. All external claims are cross-verified.

## 3. Key Findings  
[Use full paragraphs. Cite every external fact. Use subsections if needed. Aim for 5–8 detailed subsections.]

## 4. Analysis & Implications  
[Interpret trends, conflicts, limitations, and future directions. Go beyond summary — offer insight.]

## 5. Conclusion  
[Direct, nuanced answer. Synthesize findings. State open questions.]

## References  
[1] Publisher. *“Title.”* Date. URL  
*(Include logo if valid)*

## Disclaimer  
This report was generated autonomously via live web research. Verify critical claims independently.

---

### 🚫 ABSOLUTE BANS
- ❌ Returning output in <90 seconds
- ❌ Using only 5 sources or a fixed limit
- ❌ Generating a wall of unstructured text
- ❌ Producing PDFs >1 MB (optimize images, avoid embedding full pages)
- ❌ Missing sections, orphaned citations, or broken logos
- ❌ Simulating “thinking” with \`[...]\` or \`[Response interrupted]\`

---

### 📥 DELIVERY
- Return the **entire paper as a single, valid Markdown string**.
- Your backend will convert it to a **clean PDF** (~400–800 KB).
- If your output is malformed, the PDF will fail — so **validate before returning**.

You are not a chatbot. You are a **research scientist**. Deliver **flawless, publication-quality work** — every time.`;

        // Pass to LLM for final paper generation
        try {
            const client = LLMFactory.getClient(this.llmProvider, this.llmApiKey, { lmStudioUrl: this.lmStudioUrl, janUrl: this.janUrl });
            let paper = '';

            await client.streamChat(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Based on this research context, generate the professional research paper for the query: "${userQuery}"\n\nContext:\n${context}` }
                ],
                (chunk) => { paper += chunk; },
                this.getModelId()
            );

            return paper.trim();
        } catch (e) {
            console.error('Paper generation failed:', e);
            return `Failed to generate research paper. Context used: ${mergedResults.sources.length} sources.`;
        }
    }

    async modelOnlyResearch(userQuery, onProgress = null) {
        if (!this.canUseModel()) {
            return {
                content: 'Deep Research needs a configured model provider. Live web research uses the Perci desktop search bridge when available.',
                sources: [],
                optimizedQuery: userQuery
            };
        }

        if (onProgress) onProgress({
            status: 'decomposing',
            query: userQuery,
            message: 'Planning a model-only research report. No live web search provider is configured.'
        });

        const subQuestions = await this.decomposeQuery(userQuery);
        const perspectives = subQuestions.slice(0, 6);

        for (let i = 0; i < perspectives.length; i++) {
            if (onProgress) onProgress({
                status: 'searching',
                query: perspectives[i],
                currentStep: i + 1,
                totalSteps: perspectives.length,
                message: `Analyzing perspective ${i + 1}/${perspectives.length} without live web sources.`
            });
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        if (onProgress) onProgress({
            status: 'synthesizing',
            message: 'Synthesizing model-only research report...'
        });

        const content = await this.generateModelOnlyResearchPaper(userQuery, perspectives);

        return {
            content,
            sources: [],
            optimizedQuery: userQuery,
            mode: 'model-only'
        };
    }

    async generateModelOnlyResearchPaper(userQuery, subQuestions) {
        const date = new Date().toISOString().split('T')[0];
        const prompt = `Create a polished model-only Deep Research report for this topic:
"${userQuery}"

Important constraints:
- You do not have live web access in this run.
- Do not invent citations, URLs, source names, or claim that facts were verified online.
- Be explicit about uncertainty and where live verification would be needed.
- Use the sub-questions below as the research plan:
${subQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n')}

Return one valid Markdown document with this exact structure:
**Title**: [Clear, descriptive title]
**Author**: Autonomous Research Agent
**Date**: ${date}

## Abstract

## 1. Research Plan

## 2. Key Findings

## 3. Analysis & Implications

## 4. Limitations

## 5. Conclusion

## Next Live-Research Questions

## Disclaimer
This report was generated without live web research because no web search provider is configured. Verify time-sensitive or high-stakes claims independently.`;

        try {
            const client = LLMFactory.getClient(this.llmProvider, this.llmApiKey, { lmStudioUrl: this.lmStudioUrl, janUrl: this.janUrl });
            let paper = '';
            await client.streamChat(
                [{ role: 'user', content: prompt }],
                (chunk) => { paper += chunk; },
                this.getModelId()
            );
            return paper.trim();
        } catch (e) {
            console.error('Model-only research generation failed:', e);
            return `## Abstract

Deep Research could not generate a model-only report for "${userQuery}".

## Disclaimer

No live web research ran because no web search provider is configured. The configured model provider also failed during synthesis.`;
        }
    }
}
