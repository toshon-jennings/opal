const PROVIDER_NAMES = new Map([
    ['aistudio.google.com', 'Google AI Studio'],
    ['ai.google.dev', 'Google AI'],
    ['anthropic.com', 'Anthropic'],
    ['openai.com', 'OpenAI'],
    ['openrouter.ai', 'OpenRouter'],
    ['groq.com', 'Groq'],
    ['mistral.ai', 'Mistral'],
    ['cohere.com', 'Cohere'],
    ['replicate.com', 'Replicate'],
    ['together.ai', 'Together AI'],
    ['fireworks.ai', 'Fireworks AI'],
    ['deepinfra.com', 'DeepInfra'],
    ['huggingface.co', 'Hugging Face'],
    ['fal.ai', 'fal.ai'],
    ['x.ai', 'xAI'],
]);

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
    'ac.uk', 'co.in', 'co.jp', 'co.nz', 'co.uk',
    'com.au', 'com.br', 'com.cn', 'com.sg', 'org.uk',
]);

const MAX_URL_LENGTH = 2_048;
const MAX_MANAGEMENT_LINKS = 24;
const MAX_TAGS = 50;

function boundedString(value, maxLength, fallback = '') {
    const text = value === undefined || value === null ? fallback : String(value);
    return text.slice(0, maxLength);
}

function normalizeHttpUrl(input) {
    const value = String(input || '').trim();
    if (!value || value.length > MAX_URL_LENGTH) return null;

    try {
        const hasHttpScheme = /^https?:\/\//i.test(value);
        const hasOtherScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
        const looksLikeHostWithPort = /^[^/?#\s]+:\d+(?:[/?#]|$)/.test(value);
        if (hasOtherScheme && !hasHttpScheme && !looksLikeHostWithPort) return null;

        const isLocalHost = /^(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?(?:[/?#]|$)/i.test(value);
        const candidate = hasHttpScheme ? value : `${isLocalHost ? 'http' : 'https'}://${value}`;
        const url = new URL(candidate);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.toString();
    } catch {
        return null;
    }
}

function providerName(hostname) {
    const normalized = hostname.replace(/^www\./, '').toLowerCase();
    for (const [domain, name] of PROVIDER_NAMES) {
        if (normalized === domain || normalized.endsWith(`.${domain}`)) return name;
    }

    const parts = normalized.split('.');
    const suffix = parts.slice(-2).join('.');
    const rootIndex = MULTI_PART_PUBLIC_SUFFIXES.has(suffix) ? parts.length - 3 : parts.length - 2;
    const root = parts[Math.max(0, rootIndex)];
    return root
        .split(/[-_]/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function describeProviderLink(input) {
    const url = normalizeHttpUrl(input);
    if (!url) return null;

    const parsed = new URL(url);
    const faviconTarget = encodeURIComponent(parsed.origin);
    return {
        url,
        hostname: parsed.hostname.replace(/^www\./, ''),
        name: providerName(parsed.hostname),
        faviconUrl: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${faviconTarget}&size=64`,
    };
}

export function createProviderAccountFromLink(input, options = {}) {
    const link = describeProviderLink(input);
    if (!link) return null;

    const date = options.date || new Date().toISOString().slice(0, 10);
    return {
        id: options.id || crypto.randomUUID(),
        name: link.name,
        category: 'AI / ML',
        url: link.url,
        purpose: '',
        apiKey: '',
        monthlyCost: 0,
        billingCycle: 'usage-based',
        nextBillingDate: '',
        notes: '',
        tags: ['provider'],
        links: [],
        status: 'active',
        valueRating: 0,
        createdAt: date,
        updatedAt: date,
    };
}

export function normalizeProviderAccount(service) {
    const primaryUrl = normalizeHttpUrl(service?.url) || '';
    const seenUrls = new Set(primaryUrl ? [primaryUrl] : []);
    const links = [];

    for (const candidate of (Array.isArray(service?.links) ? service.links : []).slice(0, MAX_MANAGEMENT_LINKS)) {
        const url = normalizeHttpUrl(candidate?.url);
        if (!url || seenUrls.has(url)) continue;

        seenUrls.add(url);
        links.push({
            id: boundedString(candidate.id, 128) || crypto.randomUUID(),
            label: boundedString(candidate.label || 'Link', 60).trim() || 'Link',
            url,
        });
    }

    const monthlyCost = Number(service?.monthlyCost);
    const valueRating = Number(service?.valueRating);
    return {
        id: boundedString(service?.id, 128) || crypto.randomUUID(),
        name: boundedString(service?.name, 120),
        category: boundedString(service?.category, 60, 'AI / ML'),
        url: primaryUrl,
        purpose: boundedString(service?.purpose, 500),
        apiKey: boundedString(service?.apiKey, 8_192),
        monthlyCost: Number.isFinite(monthlyCost) ? Math.min(Math.max(monthlyCost, 0), 1_000_000_000) : 0,
        billingCycle: boundedString(service?.billingCycle, 32, 'usage-based'),
        nextBillingDate: boundedString(service?.nextBillingDate, 32),
        notes: boundedString(service?.notes, 10_000),
        tags: (Array.isArray(service?.tags) ? service.tags : [])
            .slice(0, MAX_TAGS)
            .map(tag => boundedString(tag, 60).trim())
            .filter(Boolean),
        links,
        status: boundedString(service?.status, 32, 'active'),
        valueRating: Number.isFinite(valueRating) ? Math.min(Math.max(Math.round(valueRating), 0), 5) : 0,
        createdAt: boundedString(service?.createdAt, 40),
        updatedAt: boundedString(service?.updatedAt, 40),
    };
}

export function providerAccountHasUrl(accounts, input) {
    const target = normalizeHttpUrl(input);
    if (!target) return false;

    return accounts.some(account => {
        if (normalizeHttpUrl(account?.url) === target) return true;
        return (Array.isArray(account?.links) ? account.links : [])
            .some(link => normalizeHttpUrl(link?.url) === target);
    });
}
