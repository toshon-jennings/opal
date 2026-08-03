import { describe, it, expect } from 'vitest';
import { tasteDirective } from '../src/lib/taste';

describe('tasteDirective', () => {
    it('returns empty string if config is missing', () => {
        expect(tasteDirective()).toBe('');
        expect(tasteDirective(null)).toBe('');
    });

    it('returns empty string if variance is not a number', () => {
        expect(tasteDirective({})).toBe('');
        expect(tasteDirective({ variance: '5', motion: 5, density: 5 })).toBe('');
        expect(tasteDirective({ motion: 5, density: 5 })).toBe('');
    });

    it('generates directive with inferred read when designRead is missing', () => {
        const config = { variance: 7, motion: 3, density: 8 };
        const result = tasteDirective(config);

        expect(result).toContain('DESIGN_VARIANCE: 7');
        expect(result).toContain('MOTION_INTENSITY: 3');
        expect(result).toContain('VISUAL_DENSITY: 8');
        expect(result).toContain('Inferred read: variance=7, motion=3, density=8. Adjust output accordingly.');
        expect(result).toContain('TASTE-SKILL MODE — design-taste directives for frontend/UI generation.');
    });

    it('generates directive with explicit designRead when provided', () => {
        const config = { variance: 2, motion: 9, density: 4, designRead: 'Luxury minimalist portfolio' };
        const result = tasteDirective(config);

        expect(result).toContain('DESIGN_VARIANCE: 2');
        expect(result).toContain('MOTION_INTENSITY: 9');
        expect(result).toContain('VISUAL_DENSITY: 4');
        expect(result).toContain('Design read: "Luxury minimalist portfolio"');
        expect(result).toContain('TASTE-SKILL MODE — design-taste directives for frontend/UI generation.');
        expect(result).not.toContain('Inferred read:');
    });
});
