import { describe, expect, it } from 'vitest';
import { writeStringStorage } from '../src/lib/persistentStore.js';
import {
    BARS_IDEAS_KEY,
    BILLBOARD_SERVICES_KEY,
    answerPerciQuestion,
    createPerciContextSnapshot,
} from '../src/lib/perciContext.js';

describe('perciContext', () => {
    it('answers from real BARS and Bill Board storage keys', () => {
        writeStringStorage(BARS_IDEAS_KEY, JSON.stringify([
            {
                id: 'idea-old',
                title: 'Old note',
                notes: 'Already handled',
                status: 'Archived',
                impact: '1',
                effort: '1',
                next: '',
                updatedAt: '2026-06-20T12:00:00.000Z',
            },
            {
                id: 'idea-new',
                title: 'Perci context layer',
                notes: 'Make Desk know the last thing in BARS.',
                status: 'Building',
                impact: '5',
                effort: '2',
                next: 'Wire BARS into Perci Desk.',
                updatedAt: '2026-06-27T12:00:00.000Z',
            },
        ]));
        writeStringStorage(BILLBOARD_SERVICES_KEY, JSON.stringify([
            {
                id: 'bill-1',
                name: 'OpenRouter',
                status: 'active',
                billingCycle: 'monthly',
                monthlyCost: 25,
                nextBillingDate: '2026-06-25',
                updatedAt: '2026-06-26',
            },
            {
                id: 'bill-2',
                name: 'Static hosting',
                status: 'active',
                billingCycle: 'monthly',
                monthlyCost: 10,
                nextBillingDate: '2026-07-20',
                updatedAt: '2026-06-26',
            },
        ]));

        const snapshot = createPerciContextSnapshot({
            now: new Date('2026-06-27T10:00:00.000Z'),
        });

        expect(snapshot.bars.lastIdea.title).toBe('Perci context layer');
        expect(snapshot.billboard.obligations).toHaveLength(1);
        expect(snapshot.billboard.obligations[0].status).toBe('overdue');
        expect(snapshot.counts.overdue).toBe(1);

        const barsAnswer = answerPerciQuestion('What was the last thing I wrote in BARS?', snapshot);
        expect(barsAnswer.title).toBe('Last thing in BARS');
        expect(barsAnswer.body).toContain('Perci context layer');

        const billAnswer = answerPerciQuestion('What bills need action?', snapshot);
        expect(billAnswer.items.map(item => item.sourceLabel)).toEqual(['Bill Board']);
    });
});
