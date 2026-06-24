import { describe, expect, it } from 'vitest';
import {
    PERCI_SURFACE_ROUTES,
    PERCI_SURFACE_STATIONS,
    SURFACE_MAP_DISTRICTS,
    SURFACE_ROUTE_TYPES,
    filterSurfaceMapRoutes,
    getSurfaceDistrict,
    getSurfaceMapSummary,
    getVisibleSurfaceStationIds,
} from '../src/lib/perciSurfaceMap.js';

describe('perciSurfaceMap', () => {
    it('keeps every route pointed at known stations', () => {
        const stationIds = new Set(PERCI_SURFACE_STATIONS.map(station => station.id));

        for (const route of PERCI_SURFACE_ROUTES) {
            expect(SURFACE_ROUTE_TYPES[route.type]).toBeTruthy();
            expect(route.stationIds.length).toBeGreaterThan(1);
            for (const stationId of route.stationIds) {
                expect(stationIds.has(stationId), `${route.id} references ${stationId}`).toBe(true);
            }
        }
    });

    it('keeps every station launchable', () => {
        for (const station of PERCI_SURFACE_STATIONS) {
            expect(station.targetId, `${station.id} is missing a target`).toBeTruthy();
        }
    });

    it('places every station inside a known district', () => {
        const districtIds = new Set(SURFACE_MAP_DISTRICTS.map(district => district.id));

        for (const station of PERCI_SURFACE_STATIONS) {
            expect(districtIds.has(station.districtId), `${station.id} has an unknown district`).toBe(true);
            expect(getSurfaceDistrict(station)?.id).toBe(station.districtId);
        }
    });

    it('keeps station coordinates inside their planner district bounds', () => {
        for (const station of PERCI_SURFACE_STATIONS) {
            const district = getSurfaceDistrict(station);
            expect(station.x, `${station.id} is left of ${district.label}`).toBeGreaterThanOrEqual(district.x);
            expect(station.x, `${station.id} is right of ${district.label}`).toBeLessThanOrEqual(district.x + district.width);
            expect(station.y, `${station.id} is above ${district.label}`).toBeGreaterThanOrEqual(district.y);
            expect(station.y, `${station.id} is below ${district.label}`).toBeLessThanOrEqual(district.y + district.height);
        }
    });

    it('models planner districts instead of a flat scatter of stations', () => {
        const districtCounts = PERCI_SURFACE_STATIONS.reduce((counts, station) => {
            counts.set(station.districtId, (counts.get(station.districtId) || 0) + 1);
            return counts;
        }, new Map());

        expect(SURFACE_MAP_DISTRICTS.map(district => district.id)).toEqual([
            'core-concourse',
            'knowledge-quarter',
            'creation-yard',
            'operations-terminal',
            'local-systems-depot',
            'business-office',
        ]);
        expect(districtCounts.get('core-concourse')).toBe(3);
        expect(districtCounts.get('business-office')).toBe(2);
        expect(Math.min(...districtCounts.values())).toBeGreaterThanOrEqual(2);
    });

    it('filters route types without dropping unrelated route definitions', () => {
        const contextRoutes = filterSurfaceMapRoutes(['context']);

        expect(contextRoutes.map(route => route.type)).toEqual(['context']);
        expect(getVisibleSurfaceStationIds(contextRoutes).has('workspace')).toBe(true);
        expect(getVisibleSurfaceStationIds(contextRoutes).has('openclaw')).toBe(false);
    });

    it('places Bill Board on the expense route rather than governance', () => {
        const expenseStationIds = getVisibleSurfaceStationIds(filterSurfaceMapRoutes(['expenses']));
        const governanceStationIds = getVisibleSurfaceStationIds(filterSurfaceMapRoutes(['governance']));

        expect(expenseStationIds.has('bill-board')).toBe(true);
        expect(governanceStationIds.has('bill-board')).toBe(false);
    });

    it('keeps Expenses visually distinct from Shared Context', () => {
        expect(SURFACE_ROUTE_TYPES.expenses.color).toBe('#84cc16');
        expect(SURFACE_ROUTE_TYPES.expenses.color).not.toBe(SURFACE_ROUTE_TYPES.context.color);
    });

    it('assigns route line patterns so flow types are not color-only', () => {
        const patterns = Object.values(SURFACE_ROUTE_TYPES).map(routeType => routeType.linePattern?.id);

        expect(patterns.every(Boolean)).toBe(true);
        expect(new Set(patterns).size).toBe(patterns.length);
        expect(SURFACE_ROUTE_TYPES.movement.linePattern.dasharray).toBe('');
        expect(SURFACE_ROUTE_TYPES.research.linePattern.id).toBe('dotted');
    });

    it('summarizes the currently visible map', () => {
        const routes = filterSurfaceMapRoutes(['movement', 'runtime']);
        const summary = getSurfaceMapSummary(routes);

        expect(summary.routeCount).toBe(2);
        expect(summary.routeTypes).toEqual(['movement', 'runtime']);
        expect(summary.stationCount).toBeGreaterThan(10);
    });
});
