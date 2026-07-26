import { describe, expect, it } from 'vitest';
import {
    estimateModelCost,
    fetchPricingCatalog,
    getUnpricedTokenTypes,
    matchPricingProvider,
    normalizePricingCatalog,
} from '../src/lib/billboardPricing.js';

describe('Bill Board model pricing', () => {
    it('normalizes Portkey token prices into dollars per million tokens', () => {
        const catalog = normalizePricingCatalog('openai', {
            'gpt-example': {
                pricing_config: {
                    pay_as_you_go: {
                        request_token: { price: 0.00025 },
                        response_token: { price: 0.0015 },
                        cache_read_input_token: { price: 0.000025 },
                        cache_write_input_token: { price: 0.0003 },
                        additional_units: {
                            web_search: { price: 1 },
                        },
                    },
                },
            },
        }, {
            etag: '"catalog-v1"',
            retrievedAt: '2026-07-26T12:00:00.000Z',
        });

        expect(catalog).toMatchObject({
            provider: 'openai',
            etag: '"catalog-v1"',
            retrievedAt: '2026-07-26T12:00:00.000Z',
            models: [{
                id: 'gpt-example',
                rates: {
                    input: 2.5,
                    output: 15,
                    cacheRead: 0.25,
                    cacheWrite: 3,
                },
                additionalUnits: [{
                    id: 'web_search',
                    dollarsPerUnit: 0.01,
                }],
            }],
        });
    });

    it('estimates a workload from uncached, cached, and output token counts', () => {
        const model = {
            rates: {
                input: 2.5,
                output: 15,
                cacheRead: 0.25,
                cacheWrite: 3,
            },
        };

        expect(estimateModelCost(model, {
            inputTokens: 2_000_000,
            outputTokens: 500_000,
            cacheReadTokens: 1_000_000,
            cacheWriteTokens: 250_000,
        })).toEqual({
            input: 5,
            output: 7.5,
            cacheRead: 0.25,
            cacheWrite: 0.75,
            total: 13.5,
        });
    });

    it('identifies entered usage that has no catalog rate instead of treating it as free', () => {
        expect(getUnpricedTokenTypes({
            input: 2.5,
            output: null,
            cacheRead: null,
            cacheWrite: 3,
        }, {
            inputTokens: 1_000_000,
            outputTokens: 250_000,
            cacheReadTokens: 0,
            cacheWriteTokens: 100_000,
        })).toEqual(['output']);
    });

    it('uses explicit batch rates when the catalog provides them', () => {
        const catalog = normalizePricingCatalog('anthropic', {
            'claude-example': {
                pricing_config: {
                    pay_as_you_go: {
                        request_token: { price: 0.0003 },
                        response_token: { price: 0.0015 },
                    },
                    batch_config: {
                        request_token: { price: 0.00015 },
                        response_token: { price: 0.00075 },
                    },
                },
            },
        });

        expect(catalog.models[0].batchRates).toMatchObject({
            input: 1.5,
            output: 7.5,
        });
        expect(estimateModelCost(catalog.models[0], {
            inputTokens: 1_000_000,
            outputTokens: 1_000_000,
        }, 'batch').total).toBe(9);
    });

    it('excludes catalog entries that have no supported token rates', () => {
        const catalog = normalizePricingCatalog('openai', {
            'gpt-example': {
                pricing_config: {
                    pay_as_you_go: {
                        request_token: { price: 0.00025 },
                    },
                },
            },
            'image-example': {
                pricing_config: {
                    pay_as_you_go: {
                        additional_units: {
                            image: { price: 4 },
                        },
                    },
                },
            },
        });

        expect(catalog.models.map(model => model.id)).toEqual(['gpt-example']);
    });

    it('matches a tracked provider account to its pricing catalog', () => {
        expect(matchPricingProvider({
            name: 'Claude API',
            url: 'https://console.anthropic.com/settings/usage',
        })).toBe('anthropic');
        expect(matchPricingProvider({
            name: 'Google AI Studio',
            url: 'https://aistudio.google.com/usage',
        })).toBe('google');
        expect(matchPricingProvider({
            name: 'My Bedrock account',
            url: 'https://us-east-1.console.aws.amazon.com/bedrock',
        })).toBe('bedrock');
        expect(matchPricingProvider({
            name: 'Azure OpenAI',
            url: 'https://portal.azure.com/#view/AzureOpenAI',
        })).toBe('azure-openai');
        expect(matchPricingProvider({
            name: 'Google AI Vertex',
            url: 'https://console.cloud.google.com/vertex-ai',
        })).toBe('vertex-ai');
        expect(matchPricingProvider({
            name: 'Azure OpenAI',
            url: '',
        })).toBe('azure-openai');
        expect(matchPricingProvider({
            name: 'Unknown provider',
            url: 'https://example.com/usage',
        })).toBe('');
    });

    it('fetches only known provider catalogs and retains freshness metadata', async () => {
        const fetchCalls = [];
        const fetchImpl = async (url) => {
            fetchCalls.push(url);
            return {
                ok: true,
                headers: { get: name => name === 'ETag' ? '"fresh-v2"' : null },
                json: async () => ({
                    'model-1': {
                        pricing_config: {
                            pay_as_you_go: {
                                request_token: { price: 0.0001 },
                            },
                        },
                    },
                }),
            };
        };

        const catalog = await fetchPricingCatalog('openai', {
            fetchImpl,
            retrievedAt: '2026-07-26T13:00:00.000Z',
        });

        expect(fetchCalls).toEqual(['https://configs.portkey.ai/pricing/openai.json']);
        expect(catalog).toMatchObject({
            provider: 'openai',
            etag: '"fresh-v2"',
            retrievedAt: '2026-07-26T13:00:00.000Z',
        });
        await expect(fetchPricingCatalog('../unsafe', { fetchImpl }))
            .rejects.toThrow('Unsupported pricing provider');
    });
});
