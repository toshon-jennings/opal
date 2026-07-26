const CENTS_PER_DOLLAR = 100;
const TOKENS_PER_MILLION = 1_000_000;
const TOKEN_RATE_FIELDS = [
    ['input', 'inputTokens', 'input'],
    ['output', 'outputTokens', 'output'],
    ['cacheRead', 'cacheReadTokens', 'cache read'],
    ['cacheWrite', 'cacheWriteTokens', 'cache write'],
];

export const BILLBOARD_PRICING_PROVIDERS = [
    { id: 'openai', label: 'OpenAI', officialPricingUrl: 'https://developers.openai.com/api/docs/pricing', domains: ['openai.com'], terms: ['openai'] },
    { id: 'anthropic', label: 'Anthropic', officialPricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing', domains: ['anthropic.com'], terms: ['anthropic', 'claude'] },
    { id: 'google', label: 'Google AI', officialPricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing', domains: ['aistudio.google.com', 'ai.google.dev'], terms: ['google ai', 'gemini'] },
    { id: 'openrouter', label: 'OpenRouter', officialPricingUrl: 'https://openrouter.ai/models', domains: ['openrouter.ai'], terms: ['openrouter'] },
    { id: 'bedrock', label: 'Amazon Bedrock', officialPricingUrl: 'https://aws.amazon.com/bedrock/pricing/', domains: ['console.aws.amazon.com'], terms: ['bedrock'] },
    { id: 'vertex-ai', label: 'Google Vertex AI', officialPricingUrl: 'https://cloud.google.com/vertex-ai/generative-ai/pricing', domains: ['console.cloud.google.com'], terms: ['vertex ai', 'vertex'] },
    { id: 'azure-openai', label: 'Azure OpenAI', officialPricingUrl: 'https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/', domains: ['portal.azure.com'], terms: ['azure openai'] },
    { id: 'groq', label: 'Groq', officialPricingUrl: 'https://groq.com/pricing', domains: ['groq.com'], terms: ['groq'] },
    { id: 'together-ai', label: 'Together AI', officialPricingUrl: 'https://www.together.ai/pricing', domains: ['together.ai'], terms: ['together ai'] },
    { id: 'fireworks-ai', label: 'Fireworks AI', officialPricingUrl: 'https://fireworks.ai/pricing', domains: ['fireworks.ai'], terms: ['fireworks ai'] },
    { id: 'deepinfra', label: 'DeepInfra', officialPricingUrl: 'https://deepinfra.com/pricing', domains: ['deepinfra.com'], terms: ['deepinfra'] },
    { id: 'mistral-ai', label: 'Mistral AI', officialPricingUrl: 'https://mistral.ai/pricing', domains: ['mistral.ai'], terms: ['mistral'] },
    { id: 'x-ai', label: 'xAI', officialPricingUrl: 'https://docs.x.ai/developers/models', domains: ['x.ai'], terms: ['xai', 'grok'] },
    { id: 'cohere', label: 'Cohere', officialPricingUrl: 'https://cohere.com/pricing', domains: ['cohere.com'], terms: ['cohere'] },
];

function dollarsPerMillion(entry) {
    const centsPerToken = Number(entry?.price);
    return Number.isFinite(centsPerToken)
        ? (centsPerToken * TOKENS_PER_MILLION) / CENTS_PER_DOLLAR
        : null;
}

function normalizeRates(config) {
    return {
        input: dollarsPerMillion(config?.request_token),
        output: dollarsPerMillion(config?.response_token),
        cacheRead: dollarsPerMillion(config?.cache_read_input_token),
        cacheWrite: dollarsPerMillion(config?.cache_write_input_token),
    };
}

function hasSupportedTokenRate(rates) {
    return Object.values(rates || {}).some(Number.isFinite);
}

function normalizeAdditionalUnits(units) {
    return Object.entries(units || {}).map(([id, entry]) => ({
        id,
        dollarsPerUnit: Number(entry?.price) / CENTS_PER_DOLLAR,
    })).filter(unit => Number.isFinite(unit.dollarsPerUnit));
}

function boundedCount(value) {
    const count = Number(value);
    return Number.isFinite(count) ? Math.min(Math.max(count, 0), 1_000_000_000_000) : 0;
}

function tokenCost(rate, tokenCount) {
    return (Number(rate) || 0) * boundedCount(tokenCount) / TOKENS_PER_MILLION;
}

function roundDollars(value) {
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function getUnpricedTokenTypes(rates, usage = {}) {
    return TOKEN_RATE_FIELDS
        .filter(([rateField, usageField]) =>
            boundedCount(usage[usageField]) > 0 && !Number.isFinite(rates?.[rateField])
        )
        .map(([, , label]) => label);
}

export function normalizePricingCatalog(provider, rawCatalog, metadata = {}) {
    const models = Object.entries(rawCatalog || {})
        .filter(([id, entry]) => id !== 'default' && entry?.pricing_config?.pay_as_you_go)
        .map(([id, entry]) => {
            const rates = normalizeRates(entry.pricing_config.pay_as_you_go);
            const batchRates = entry.pricing_config.batch_config
                ? normalizeRates(entry.pricing_config.batch_config)
                : null;
            return {
                id,
                rates,
                batchRates: hasSupportedTokenRate(batchRates) ? batchRates : null,
                additionalUnits: normalizeAdditionalUnits(entry.pricing_config.pay_as_you_go.additional_units),
            };
        })
        .filter(model => hasSupportedTokenRate(model.rates))
        .sort((a, b) => a.id.localeCompare(b.id));

    return {
        provider,
        models,
        etag: metadata.etag || '',
        retrievedAt: metadata.retrievedAt || new Date().toISOString(),
    };
}

export function estimateModelCost(model, usage = {}, mode = 'standard') {
    const rates = mode === 'batch' && model?.batchRates
        ? model.batchRates
        : model?.rates || {};
    const estimate = {
        input: tokenCost(rates.input, usage.inputTokens),
        output: tokenCost(rates.output, usage.outputTokens),
        cacheRead: tokenCost(rates.cacheRead, usage.cacheReadTokens),
        cacheWrite: tokenCost(rates.cacheWrite, usage.cacheWriteTokens),
    };

    return {
        input: roundDollars(estimate.input),
        output: roundDollars(estimate.output),
        cacheRead: roundDollars(estimate.cacheRead),
        cacheWrite: roundDollars(estimate.cacheWrite),
        total: roundDollars(Object.values(estimate).reduce((sum, cost) => sum + cost, 0)),
    };
}

export function matchPricingProvider(account) {
    const name = String(account?.name || '').toLowerCase();
    let hostname = '';
    try {
        hostname = new URL(account?.url || '').hostname.toLowerCase();
    } catch {
        hostname = '';
    }

    const domainMatch = BILLBOARD_PRICING_PROVIDERS.find(provider =>
        provider.domains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))
    );
    if (domainMatch) return domainMatch.id;

    return BILLBOARD_PRICING_PROVIDERS
        .flatMap(provider => provider.terms
            .filter(term => name.includes(term))
            .map(term => ({ provider, term })))
        .sort((a, b) => b.term.length - a.term.length)[0]?.provider.id || '';
}

export async function fetchPricingCatalog(provider, options = {}) {
    if (!BILLBOARD_PRICING_PROVIDERS.some(candidate => candidate.id === provider)) {
        throw new Error('Unsupported pricing provider');
    }

    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(`https://configs.portkey.ai/pricing/${provider}.json`);
    if (!response.ok) {
        throw new Error(`Pricing catalog request failed (${response.status || 'unknown'})`);
    }

    const rawCatalog = await response.json();
    if (!rawCatalog || typeof rawCatalog !== 'object' || Array.isArray(rawCatalog)) {
        throw new Error('Pricing catalog returned invalid data');
    }

    return normalizePricingCatalog(provider, rawCatalog, {
        etag: response.headers?.get?.('ETag') || '',
        retrievedAt: options.retrievedAt || new Date().toISOString(),
    });
}
