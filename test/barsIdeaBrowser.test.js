import { describe, expect, it } from 'vitest';
import { parseIdeaBrowserBar } from '../src/lib/barsIdeaBrowser.js';

const glpEmailFixture = `Subject: Idea of the Day: GLP-1 pharmacy index

Today's email is brought to you by Attio.

Idea of the Day

Patients buying compounded weight-loss medications piece together pricing from Reddit threads and
outdated pharmacy listings. Prices swing from $200 to $600 per vial for the same concentration.
Compounding regulations shift by jurisdiction and change without warning. Half the telehealth providers
advertising online operate in legal gray zones that look identical to the legitimate ones. Buyers want
safe, affordable medication. Instead they get a comparison nightmare.

Pepcheck is a comparison platform that shows real-time pricing, vial concentrations, and
jurisdiction-level legality for vetted telehealth pharmacies selling compounded GLP-1 medications. A
patient picks a region, compares options side by side, reads verified reviews, and confirms the provider
operates legally where they live. Provider listings update when shortage rules or compounding
regulations change...

[Browse this idea ->](https://www.ideabrowser.com/idea/vetted-price-and-legality-comparison-for-compounded-glp-1-patients-6cd22471?utm_source=iotd)

Also released today:

[Overnight activity dashboard for AI coding agents](https://www.ideabrowser.com/idea/home-screen-dashboard-for-ai-coding-agent-activity-41d40c00)`;

describe('parseIdeaBrowserBar', () => {
    it('turns the June 12 GLP-1 IdeaBrowser email into a Bars idea', () => {
        const idea = parseIdeaBrowserBar(glpEmailFixture);

        expect(idea).toMatchObject({
            kind: 'Idea',
            title: 'GLP-1 pharmacy index',
            status: 'New',
            category: 'Healthcare marketplace',
            impact: '4',
            effort: '3',
        });
        expect(idea.notes).toContain('Core thesis:');
        expect(idea.notes).toContain('Pepcheck is a comparison platform');
        expect(idea.notes).toContain('Prices swing from $200 to $600 per vial');
        expect(idea.notes).toContain('Follow-up angles:');
        expect(idea.notes).toContain('https://www.ideabrowser.com/idea/vetted-price-and-legality-comparison-for-compounded-glp-1-patients-6cd22471');
        expect(idea.notes).not.toContain('Overnight activity dashboard');
        expect(idea.tags).toEqual(expect.arrayContaining(['glp-1', 'healthcare', 'pharmacy', 'pricing', 'compliance', 'marketplace', 'ideabrowser']));
        expect(idea.next).toBe('Verify pharmacy pricing, concentration, and legality data sources.');
    });

    it('creates a usable idea shell from an IdeaBrowser idea URL', () => {
        const idea = parseIdeaBrowserBar('https://www.ideabrowser.com/idea/vetted-price-and-legality-comparison-for-compounded-glp-1-patients-6cd22471?utm_source=iotd');

        expect(idea.title).toBe('Vetted Price and Legality Comparison for Compounded GLP-1 Patients');
        expect(idea.status).toBe('New');
        expect(idea.notes).toContain('Source: https://www.ideabrowser.com/idea/vetted-price-and-legality-comparison-for-compounded-glp-1-patients-6cd22471');
        expect(idea.tags).toEqual(expect.arrayContaining(['glp-1', 'pricing', 'compliance', 'ideabrowser']));
    });
});
