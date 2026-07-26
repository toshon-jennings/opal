import { describe, expect, it } from 'vitest';
import {
    createProviderAccountFromLink,
    describeProviderLink,
    normalizeProviderAccount,
    providerAccountHasUrl,
} from '../src/lib/billboardProviders.js';

describe('Bill Board provider links', () => {
    it('turns a pasted provider URL into a ready-to-track account', () => {
        expect(createProviderAccountFromLink(
            'console.anthropic.com/settings/usage',
            { id: 'provider-1', date: '2026-07-25' },
        )).toMatchObject({
            id: 'provider-1',
            name: 'Anthropic',
            category: 'AI / ML',
            url: 'https://console.anthropic.com/settings/usage',
            links: [],
            status: 'active',
            createdAt: '2026-07-25',
            updatedAt: '2026-07-25',
        });
    });

    it('preserves fragment-based destinations used by provider dashboards', () => {
        expect(createProviderAccountFromLink(
            'https://provider.example/#/usage',
            { id: 'provider-1', date: '2026-07-25' },
        )?.url).toBe('https://provider.example/#/usage');
    });

    it('accepts schemeless provider and localhost URLs with ports', () => {
        expect(describeProviderLink('provider.example:8443/usage')?.url)
            .toBe('https://provider.example:8443/usage');
        expect(describeProviderLink('localhost:11434/usage')).toMatchObject({
            url: 'http://localhost:11434/usage',
            hostname: 'localhost',
            faviconUrl: expect.stringContaining('http%3A%2F%2Flocalhost%3A11434'),
        });
    });

    it('derives a useful account name from multi-part public domains', () => {
        expect(describeProviderLink('https://console.provider.co.uk/usage')?.name)
            .toBe('Provider');
        expect(describeProviderLink('https://api.mistral.ai/v1/usage')?.name)
            .toBe('Mistral');
        expect(describeProviderLink('https://api.openai.com/v1/usage')?.name)
            .toBe('OpenAI');
    });

    it('keeps distinct valid management links and removes unsafe or duplicate URLs', () => {
        expect(normalizeProviderAccount({
            id: 'provider-1',
            name: 'OpenAI — Perci',
            url: 'platform.openai.com/usage',
            links: [
                { id: 'usage', label: ' Usage ', url: 'https://platform.openai.com/usage' },
                { id: 'billing', label: 'Billing', url: 'platform.openai.com/settings/organization/billing' },
                { id: 'unsafe', label: 'Keys', url: 'javascript:alert(1)' },
            ],
        }).links).toEqual([
            {
                id: 'billing',
                label: 'Billing',
                url: 'https://platform.openai.com/settings/organization/billing',
            },
        ]);
    });

    it('bounds imported provider fields and management-link collections', () => {
        const normalized = normalizeProviderAccount({
            id: 'provider-1',
            name: 'N'.repeat(200),
            notes: 'x'.repeat(12_000),
            tags: Array.from({ length: 80 }, (_, index) => `tag-${index}`),
            links: Array.from({ length: 30 }, (_, index) => ({
                id: `link-${index}`,
                label: 'L'.repeat(100),
                url: `https://provider.example/link-${index}`,
            })),
        });

        expect(normalized.name).toHaveLength(120);
        expect(normalized.notes).toHaveLength(10_000);
        expect(normalized.tags).toHaveLength(50);
        expect(normalized.links).toHaveLength(24);
        expect(normalized.links[0].label).toHaveLength(60);
    });

    it('recognizes a URL already saved as either a primary or management link', () => {
        const accounts = [{
            url: 'https://openrouter.ai/activity',
            links: [{ label: 'Keys', url: 'https://openrouter.ai/settings/keys' }],
        }];

        expect(providerAccountHasUrl(accounts, 'openrouter.ai/activity')).toBe(true);
        expect(providerAccountHasUrl(accounts, 'https://openrouter.ai/settings/keys#new')).toBe(false);
        expect(providerAccountHasUrl(accounts, 'https://openrouter.ai/credits')).toBe(false);
    });

    it('uses a cross-origin-compatible favicon URL for isolated browser contexts', () => {
        expect(describeProviderLink('https://platform.openai.com/usage')?.faviconUrl)
            .toBe('https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https%3A%2F%2Fplatform.openai.com&size=64');
    });
});
