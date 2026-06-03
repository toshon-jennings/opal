const LOCAL_PROVIDERS = ['ollama', 'lmstudio', 'jan'];
const LOW_COST_PROVIDERS = ['groq', 'openrouter'];
const STRONG_PROVIDERS = ['anthropic', 'openai', 'gemini', 'mistral'];

export function chooseModelForTask({
    task = '',
    selectedProvider,
    selectedModel,
    availableModels = {},
    apiKeys = {},
    requiresTools = false,
    requiresImages = false,
    preferLocal = false
} = {}) {
    const complexity = classifyTaskComplexity(task);
    const providerOrder = buildProviderOrder({ complexity, requiresTools, requiresImages, preferLocal });
    const selectedAvailable = selectedProvider && selectedModel && providerHasModel(availableModels, selectedProvider, selectedModel);
    if (selectedAvailable && shouldKeepSelected({ complexity, requiresTools, selectedProvider, preferLocal })) {
        return buildRoute(selectedProvider, selectedModel, 'kept selected model', complexity);
    }

    for (const provider of providerOrder) {
        if (providerRequiresKey(provider) && !apiKeys[provider]) continue;
        const model = pickProviderModel(provider, availableModels[provider], { complexity, requiresTools, requiresImages });
        if (model) {
            return buildRoute(provider, model.id, `routed to ${complexity} task fit`, complexity);
        }
    }

    if (selectedProvider && selectedModel) {
        return buildRoute(selectedProvider, selectedModel, 'fallback to selected model', complexity);
    }
    return buildRoute(null, null, 'no available model route', complexity);
}

export function buildRoutingPrompt(route) {
    if (!route?.provider || !route?.model) return 'Model router: no automatic route was available; use the selected model only if configured.';
    return `Model router: ${route.reason}. Selected route is ${route.provider}/${route.model} for a ${route.complexity} task.`;
}

function classifyTaskComplexity(task) {
    const text = String(task || '').toLowerCase();
    const hardSignals = ['refactor', 'architecture', 'debug', 'fix', 'agent', 'tool', 'write files', 'multi-file', 'complex', 'build app', 'implement'];
    const simpleSignals = ['summarize', 'rename', 'format', 'explain', 'list', 'draft', 'short'];
    const hardScore = hardSignals.filter(signal => text.includes(signal)).length;
    const simpleScore = simpleSignals.filter(signal => text.includes(signal)).length;
    if (text.length > 1200 || hardScore >= 2) return 'hard';
    if (hardScore === 1) return 'medium';
    if (simpleScore > 0 || text.length < 220) return 'simple';
    return 'medium';
}

function buildProviderOrder({ complexity, requiresTools, requiresImages, preferLocal }) {
    if (requiresImages) return ['openai', 'gemini', 'anthropic', 'openrouter'];
    if (preferLocal && !requiresTools) return [...LOCAL_PROVIDERS, ...LOW_COST_PROVIDERS, ...STRONG_PROVIDERS];
    if (complexity === 'hard' || requiresTools) return [...STRONG_PROVIDERS, ...LOW_COST_PROVIDERS, ...LOCAL_PROVIDERS];
    if (complexity === 'medium') return [...LOW_COST_PROVIDERS, ...STRONG_PROVIDERS, ...LOCAL_PROVIDERS];
    return [...LOCAL_PROVIDERS, ...LOW_COST_PROVIDERS, ...STRONG_PROVIDERS];
}

function shouldKeepSelected({ complexity, requiresTools, selectedProvider, preferLocal }) {
    if (preferLocal && LOCAL_PROVIDERS.includes(selectedProvider)) return true;
    if (requiresTools && LOCAL_PROVIDERS.includes(selectedProvider)) return false;
    if (complexity === 'hard' && LOCAL_PROVIDERS.includes(selectedProvider)) return false;
    return true;
}

function pickProviderModel(provider, models = [], options = {}) {
    if (!Array.isArray(models) || models.length === 0) return null;
    const names = options.complexity === 'hard'
        ? ['opus', 'sonnet', 'gpt-5', 'gpt-4', 'pro', 'large']
        : options.complexity === 'medium'
            ? ['sonnet', 'gpt-5', 'gpt-4', 'mini', 'flash', 'large']
            : ['mini', 'flash', 'small', 'llama', 'qwen'];
    return models.find(model => names.some(name => String(model.id || model.name).toLowerCase().includes(name))) || models[0];
}

function providerHasModel(availableModels, provider, modelId) {
    return Array.isArray(availableModels?.[provider]) && availableModels[provider].some(model => model.id === modelId);
}

function providerRequiresKey(provider) {
    return !LOCAL_PROVIDERS.includes(provider);
}

function buildRoute(provider, model, reason, complexity) {
    return {
        provider,
        model,
        reason,
        complexity
    };
}
