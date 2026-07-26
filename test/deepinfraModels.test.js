import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { modelService } from '../src/lib/llm/ModelService.js';

// Shapes below are trimmed from real https://api.deepinfra.com/v1/openai/models
// responses. DeepInfra returns its whole catalog — image, video, speech,
// embedding and reranker models sit alongside chat ones — and only the tags
// distinguish them, which is what these tests pin down.
const CATALOG = {
    object: 'list',
    data: [
        {
            id: 'zai-org/GLM-5.2',
            metadata: { context_length: 1048576, tags: ['chat', 'prompt_cache', 'reasoning'] },
        },
        {
            id: 'google/gemma-4-31B-it',
            metadata: { context_length: 262144, tags: ['chat', 'vlm', 'vision', 'reasoning'] },
        },
        {
            id: 'black-forest-labs/FLUX-2-max',
            metadata: { context_length: null, tags: ['image-gen'] },
        },
        {
            // Only 5 of DeepInfra's 24 embedding models say "embed" in the id,
            // so an id-substring filter (what the OpenRouter path uses) leaks
            // models like this one into the chat picker.
            id: 'sentence-transformers/all-MiniLM-L12-v2',
            metadata: { context_length: 512, tags: ['embed'] },
        },
        { id: 'Qwen/Qwen3-TTS', metadata: { tags: ['tts'] } },
        { id: 'XiaomiMiMo/MiMo-V2.5-video', metadata: { tags: ['video-gen'] } },
        { id: 'openai/whisper-large-v3', metadata: { tags: ['stt'] } },
    ],
};

function stubCatalog(payload = CATALOG, ok = true) {
    const fetchMock = vi.fn(async () => ({ ok, json: async () => payload }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

beforeEach(() => {
    modelService.clearCache('deepinfra');
});

afterEach(() => {
    vi.unstubAllGlobals();
    modelService.clearCache('deepinfra');
});

describe('fetchDeepInfraModels', () => {
    it('keeps only chat-capable models, dropping every non-chat tag', async () => {
        stubCatalog();
        const models = await modelService.fetchDeepInfraModels();

        expect(models.map(m => m.id)).toEqual([
            'google/gemma-4-31B-it',
            'zai-org/GLM-5.2',
        ]);
    });

    it('derives vision support from tags, not from the model id', async () => {
        stubCatalog();
        const models = await modelService.fetchDeepInfraModels();
        const byId = Object.fromEntries(models.map(m => [m.id, m]));

        // Tagged vlm+vision. Nothing in this id matches Perci's name-based
        // vision patterns, so name detection alone would disable images.
        expect(byId['google/gemma-4-31B-it'].capabilities.image).toBe(true);
        expect(byId['zai-org/GLM-5.2'].capabilities.image).toBe(false);
    });

    it('carries context window and tags the provider', async () => {
        stubCatalog();
        const models = await modelService.fetchDeepInfraModels();
        const glm = models.find(m => m.id === 'zai-org/GLM-5.2');

        expect(glm.provider).toBe('deepinfra');
        expect(glm.contextWindow).toBe(1048576);
    });

    it('browses the public catalog without a key, and authenticates with one', async () => {
        const anon = stubCatalog();
        await modelService.fetchDeepInfraModels();
        expect(anon.mock.calls[0][0]).toBe('https://api.deepinfra.com/v1/openai/models');
        expect(anon.mock.calls[0][1].headers.Authorization).toBeUndefined();

        vi.unstubAllGlobals();
        modelService.clearCache('deepinfra');

        const keyed = stubCatalog();
        await modelService.fetchDeepInfraModels('sk-test');
        expect(keyed.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-test');
    });

    it('returns an empty list rather than throwing when the catalog fails', async () => {
        stubCatalog({}, false);
        await expect(modelService.fetchDeepInfraModels()).resolves.toEqual([]);
    });

    it('tolerates models that carry no metadata', async () => {
        stubCatalog({ data: [{ id: 'bare/model' }] });
        const models = await modelService.fetchDeepInfraModels();

        expect(models).toHaveLength(1);
        expect(models[0].capabilities.image).toBe(false);
        expect(models[0].contextWindow).toBeUndefined();
    });
});
