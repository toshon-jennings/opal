import { describe, it, expect } from 'vitest';
import { buildArmsLayers, ARMS_CORE_KEY, ARMS_LAYER_COLORS } from '../src/lib/armsGraph.js';

describe('buildArmsLayers', () => {
    const stations = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'chat', label: 'Chat' },
        { id: 'notes', label: 'Notes' },
    ];
    const routes = [{ id: 'line', stationIds: ['dashboard', 'chat', 'notes'] }];

    it('turns stations into app nodes and route stops into consecutive edges', () => {
        const { nodes, links } = buildArmsLayers({ stations, routes });
        const appKeys = nodes.filter(n => n.type === 'app').map(n => n.key);
        expect(appKeys).toEqual(['app:dashboard', 'app:chat', 'app:notes']);
        expect(links).toContainEqual({ a: 'app:dashboard', b: 'app:chat', weak: false });
        expect(links).toContainEqual({ a: 'app:chat', b: 'app:notes', weak: false });
        // Home surface anchors the layer to the core.
        expect(links).toContainEqual({ a: 'app:dashboard', b: ARMS_CORE_KEY, weak: false });
    });

    it('spokes skills and routines to per-layer hubs, omitting empty layers', () => {
        const withLayers = buildArmsLayers({
            skills: [{ name: 'pdf' }],
            missionRuns: [{ id: 'run-1', title: 'Nightly check' }],
        });
        expect(withLayers.links).toContainEqual({ a: 'skill:pdf', b: 'hub:skills', weak: false });
        expect(withLayers.links).toContainEqual({ a: 'routine:run-1', b: 'hub:routines', weak: false });
        expect(withLayers.nodes.find(n => n.key === 'routine:run-1').label).toBe('Nightly check');

        const empty = buildArmsLayers({});
        expect(empty.nodes.map(n => n.type)).toEqual(['core']);
        expect(empty.links).toEqual([]);
    });

    it('caps layer sizes and colors nodes by layer', () => {
        const skills = Array.from({ length: 60 }, (_, i) => ({ name: `skill-${i}` }));
        const { nodes } = buildArmsLayers({ skills });
        expect(nodes.filter(n => n.type === 'skill')).toHaveLength(36);
        expect(nodes.find(n => n.type === 'skill').hue).toBe(ARMS_LAYER_COLORS.skill);
    });
});
