import { describe, it, expect } from 'vitest';
import { isEncrypted } from '../src/utils/note-crypto';

describe('isEncrypted', () => {
    it('returns true for a valid encrypted string', () => {
        expect(isEncrypted('<!--ENC:v1-->{"salt":"123","iv":"456","ct":"789"}')).toBe(true);
    });

    it('returns false for a string not starting with the marker', () => {
        expect(isEncrypted('Hello World!')).toBe(false);
        expect(isEncrypted(' <!--ENC:v1-->something')).toBe(false);
    });

    it('returns falsy for an empty string', () => {
        expect(isEncrypted('')).toBeFalsy();
    });

    it('returns falsy for null or undefined', () => {
        expect(isEncrypted(null)).toBeFalsy();
        expect(isEncrypted(undefined)).toBeFalsy();
    });
});
