// ARMS layers (Applications / Routines / Memory / Skills) for the Notes
// knowledge graph. Memory is the notes themselves; this module supplies the
// other three layers from data Perci already has:
//   Applications — surface stations + route polylines from perciSurfaceMap
//   Routines     — Mission Control runs (persistentStore)
//   Skills       — installed skills via the skills:get-installed IPC
// buildArmsLayers is pure (tested); loadArmsLayers gathers the live inputs.

import { PERCI_SURFACE_STATIONS, PERCI_SURFACE_ROUTES } from './perciSurfaceMap';
import { readMissionRuns } from './missionControl';

export const ARMS_CORE_KEY = 'core:perci';

// Layer accents, matched to the ARMS reference look: apps blue, routines
// yellow, skills orange; hubs and the core stay neutral/bright.
export const ARMS_LAYER_COLORS = {
    core: '#E8E8E8',
    hub: '#A78BFA',
    app: '#60A5FA',
    routine: '#FBBF24',
    skill: '#C5692D',
};

const MAX_SKILLS = 36;
const MAX_ROUTINES = 12;

export function buildArmsLayers({ stations = [], routes = [], skills = [], missionRuns = [] } = {}) {
    const nodes = [{ key: ARMS_CORE_KEY, label: 'Perci', type: 'core', hue: ARMS_LAYER_COLORS.core }];
    const links = [];
    const known = new Set([ARMS_CORE_KEY]);

    const addNode = (key, label, type) => {
        if (known.has(key)) return;
        known.add(key);
        nodes.push({ key, label, type, hue: ARMS_LAYER_COLORS[type] });
    };
    const addLink = (a, b, weak = false) => {
        if (a !== b && known.has(a) && known.has(b)) links.push({ a, b, weak });
    };

    // Applications: stations as nodes, consecutive route stops as edges.
    stations.forEach(st => addNode(`app:${st.id}`, st.label, 'app'));
    routes.forEach(route => {
        const ids = route.stationIds || [];
        for (let i = 1; i < ids.length; i++) {
            addLink(`app:${ids[i - 1]}`, `app:${ids[i]}`);
        }
    });
    // The home surface anchors the application layer to the core.
    addLink('app:dashboard', ARMS_CORE_KEY);

    // Skills and Routines: leaf nodes spoked to a per-layer hub on the core.
    const spokeLayer = (hubKey, hubLabel, items) => {
        if (!items.length) return;
        addNode(hubKey, hubLabel, 'hub');
        addLink(hubKey, ARMS_CORE_KEY);
        items.forEach(({ key, label, type }) => {
            addNode(key, label, type);
            addLink(key, hubKey);
        });
    };
    spokeLayer('hub:skills', 'Skills', skills.slice(0, MAX_SKILLS).map(s => ({
        key: `skill:${s.name}`, label: s.name, type: 'skill',
    })));
    spokeLayer('hub:routines', 'Routines', missionRuns.slice(0, MAX_ROUTINES).map(r => ({
        key: `routine:${r.id}`, label: r.title || r.id, type: 'routine',
    })));

    return { nodes, links };
}

export async function loadArmsLayers() {
    let skills = [];
    try {
        skills = (await window.electron?.getInstalledSkills?.()) || [];
    } catch { /* skills surface unavailable — layer renders empty */ }
    let missionRuns = [];
    try {
        missionRuns = readMissionRuns() || [];
    } catch { /* ignore */ }
    return buildArmsLayers({
        stations: PERCI_SURFACE_STATIONS,
        routes: PERCI_SURFACE_ROUTES,
        skills,
        missionRuns,
    });
}
