import { describe, it, expect, vi, afterEach } from 'vitest';
import { getLocaleLocationName } from '../src/lib/weatherService.js';

describe('getLocaleLocationName', () => {
    const originalIntl = globalThis.Intl;

    afterEach(() => {
        globalThis.Intl = originalIntl;
        vi.restoreAllMocks();
    });

    it('returns the city name from the timezone', () => {
        const mockDateTimeFormat = vi.fn().mockReturnValue({
            resolvedOptions: vi.fn().mockReturnValue({
                timeZone: 'America/New_York'
            })
        });
        globalThis.Intl = { DateTimeFormat: mockDateTimeFormat };

        expect(getLocaleLocationName()).toBe('New York');
    });

    it('handles timezones without a city part', () => {
        const mockDateTimeFormat = vi.fn().mockReturnValue({
            resolvedOptions: vi.fn().mockReturnValue({
                timeZone: 'UTC'
            })
        });
        globalThis.Intl = { DateTimeFormat: mockDateTimeFormat };

        expect(getLocaleLocationName()).toBe('UTC');
    });

    it('returns empty string if Intl is undefined', () => {
        globalThis.Intl = undefined;
        expect(getLocaleLocationName()).toBe('');
    });

    it('returns empty string if timeZone is missing', () => {
        const mockDateTimeFormat = vi.fn().mockReturnValue({
            resolvedOptions: vi.fn().mockReturnValue({})
        });
        globalThis.Intl = { DateTimeFormat: mockDateTimeFormat };

        expect(getLocaleLocationName()).toBe('');
    });

    it('handles timezone with multiple slashes', () => {
        const mockDateTimeFormat = vi.fn().mockReturnValue({
            resolvedOptions: vi.fn().mockReturnValue({
                timeZone: 'America/Argentina/Buenos_Aires'
            })
        });
        globalThis.Intl = { DateTimeFormat: mockDateTimeFormat };

        expect(getLocaleLocationName()).toBe('Buenos Aires');
    });
});
