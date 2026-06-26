import {
    MODES,
    OPENCLAW_WINDOW_ID,
    HERMES_WINDOW_ID,
    GDASH_WINDOW_ID,
    ARTIFACT_WINDOW_ID,
    RESEARCH_WINDOW_ID,
    COMPARE_WINDOW_ID,
    EIDOS_WINDOW_ID,
    LOCALHOST_WINDOW_ID,
    KLIPIT_WINDOW_ID,
    SKILLS_WINDOW_ID,
} from '../context/ModeContext';

export const SURFACE_ROUTE_TYPES = {
    movement: {
        id: 'movement',
        label: 'Movement',
        shortLabel: 'Move',
        color: '#2563eb',
        linePattern: { id: 'solid', label: 'Solid', dasharray: '' },
        description: 'Where a user can intentionally move from one surface to another.',
    },
    context: {
        id: 'context',
        label: 'Shared context',
        shortLabel: 'Context',
        color: '#059669',
        linePattern: { id: 'long-dash', label: 'Long dash', dasharray: '18 12' },
        description: 'Surfaces that carry ideas, notes, workspace scope, or memory forward.',
    },
    automation: {
        id: 'automation',
        label: 'Agent work',
        shortLabel: 'Agents',
        color: '#d97706',
        linePattern: { id: 'dash-dot', label: 'Dash dot', dasharray: '16 8 3 8' },
        description: 'Agent, skill, gateway, and mission-control orchestration.',
    },
    creation: {
        id: 'creation',
        label: 'Build output',
        shortLabel: 'Build',
        color: '#e11d48',
        linePattern: { id: 'short-dash', label: 'Short dash', dasharray: '8 8' },
        description: 'Generation, code, preview, artifact, and shipping flow.',
    },
    research: {
        id: 'research',
        label: 'Research',
        shortLabel: 'Research',
        color: '#db2777',
        linePattern: { id: 'dotted', label: 'Dotted', dasharray: '2 10' },
        description: 'Question, investigation, synthesis, and saved knowledge.',
    },
    runtime: {
        id: 'runtime',
        label: 'Local runtime',
        shortLabel: 'Runtime',
        color: '#0891b2',
        linePattern: { id: 'rail', label: 'Rail dash', dasharray: '24 7 6 7' },
        description: 'Local services, ports, external dashboards, and embedded apps.',
    },
    governance: {
        id: 'governance',
        label: 'Governance',
        shortLabel: 'Rules',
        color: '#7c3aed',
        linePattern: { id: 'fine-dot', label: 'Fine dotted', dasharray: '1 7' },
        description: 'Configuration, subscriptions, skills, and safety rails.',
    },
    expenses: {
        id: 'expenses',
        label: 'Expenses',
        shortLabel: 'Spend',
        color: '#84cc16',
        linePattern: { id: 'ledger', label: 'Ledger dash', dasharray: '14 6 2 6 2 6' },
        description: 'Costs, subscriptions, bills, and user spend tracking.',
    },
};

// District boxes are derived from the same 120x80 grid MapGrid draws
// (vertical lines at 80,200,...,1280; horizontal lines at 80,160,...,800).
// Every district spans a whole number of grid cells, inset by a uniform
// 20px margin on each side, so any two adjacent districts end up exactly
// 40px apart along their shared boundary — no ad hoc gaps.
export const SURFACE_MAP_DISTRICTS = [
    {
        id: 'core-concourse',
        label: 'Core Concourse',
        description: 'The orientation layer: where users start, return, and understand the workspace.',
        x: 460,
        y: 260,
        width: 200,
        height: 200,
    },
    {
        id: 'knowledge-quarter',
        label: 'Knowledge Quarter',
        description: 'Ideas, notes, research, and durable memory.',
        x: 100,
        y: 100,
        width: 320,
        height: 360,
    },
    {
        id: 'creation-yard',
        label: 'Creation Yard',
        description: 'Conversation, coding, build output, previews, and generated artifacts.',
        x: 220,
        y: 500,
        width: 440,
        height: 280,
    },
    {
        id: 'operations-terminal',
        label: 'Operations Terminal',
        description: 'Agent work, mission supervision, CLI skills, and AI runtimes.',
        x: 700,
        y: 100,
        width: 560,
        height: 280,
    },
    {
        id: 'local-systems-depot',
        label: 'Local Systems Depot',
        description: 'Machine-local services, ports, terminals, and embedded external tools.',
        x: 700,
        y: 420,
        width: 560,
        height: 360,
    },
    {
        id: 'business-office',
        label: 'Business Office',
        description: 'User money, bills, workspace administration, and business dashboards.',
        x: 460,
        y: 100,
        width: 200,
        height: 120,
    },
];

// Station coordinates sit on a tidy row/column grid inside each district's
// box above, with even spacing and equal padding from the district edges —
// see SURFACE_MAP_DISTRICTS for the shared grid this is derived from.
export const PERCI_SURFACE_STATIONS = [
    { id: 'dashboard', targetId: MODES.DASHBOARD, label: 'Dashboard', kind: 'home', districtId: 'core-concourse', x: 510, y: 310, description: 'The desktop base: launchpad, live rail, guides, and status.' },
    { id: 'workspace', targetId: MODES.POWER_WORKSPACE, label: 'Workspace', kind: 'native', districtId: 'core-concourse', x: 610, y: 310, description: 'The power-user loop that links ideas, notes, missions, folders, and next actions.' },
    { id: 'perci-map', targetId: MODES.SURFACE_MAP, label: 'Perci Map', kind: 'native', districtId: 'core-concourse', x: 510, y: 410, description: 'This conceptual transit map of Perci surfaces and relationships.' },
    { id: 'perci-now', targetId: MODES.PERCI_NOW, label: 'Perci Now', kind: 'native', districtId: 'core-concourse', x: 610, y: 410, description: 'Live derived state of open surfaces, active work, and attention right now.' },
    { id: 'chat', targetId: MODES.CHAT, label: 'Chat', kind: 'native', districtId: 'creation-yard', x: 275, y: 570, description: 'General model conversation and attachment-driven work.' },
    { id: 'ensemble', targetId: MODES.ENSEMBLE, label: 'Ensemble', kind: 'native', districtId: 'creation-yard', x: 385, y: 570, description: 'Multi-model panel, judge, and synthesis surface.' },
    { id: 'cowork', targetId: MODES.COWORK, label: 'Cowork', kind: 'native', districtId: 'creation-yard', x: 495, y: 570, description: 'Session-based deep work with task handoffs.' },
    { id: 'code', targetId: MODES.CODE, label: 'Code', kind: 'native', districtId: 'creation-yard', x: 605, y: 570, description: 'Repository-aware coding assistant surface.' },
    { id: 'build', targetId: MODES.BUILD, label: 'Build', kind: 'native', districtId: 'creation-yard', x: 385, y: 710, description: 'Project generation and shipping surface.' },
    { id: 'compare', targetId: COMPARE_WINDOW_ID, label: 'Compare', kind: 'utility', districtId: 'creation-yard', x: 495, y: 710, description: 'Prompt comparison and multi-output review window.' },
    { id: 'artifacts', targetId: ARTIFACT_WINDOW_ID, label: 'Artifacts', kind: 'utility', districtId: 'creation-yard', x: 605, y: 710, description: 'Generated artifact preview and inspection window.' },
    { id: 'notes', targetId: MODES.NOTES, label: 'Notes', kind: 'native', districtId: 'knowledge-quarter', x: 180, y: 280, description: 'Markdown wiki, backlinks, and workspace-linked note references.' },
    { id: 'bars', targetId: MODES.BARS, label: 'BARS', kind: 'system', districtId: 'knowledge-quarter', x: 180, y: 160, description: 'Idea notebook surface integrated into Perci.' },
    { id: 'research', targetId: MODES.AUTORESEARCH, label: 'Research', kind: 'native', districtId: 'knowledge-quarter', x: 260, y: 400, description: 'Prompt-optimization and research loop monitor.' },
    { id: 'research-results', targetId: RESEARCH_WINDOW_ID, label: 'Results', kind: 'utility', districtId: 'knowledge-quarter', x: 340, y: 280, description: 'Research result window for synthesized findings and sources.' },
    { id: 'eidos', targetId: EIDOS_WINDOW_ID, label: 'Eidos', kind: 'system', districtId: 'knowledge-quarter', x: 340, y: 160, description: 'Persistent memory service embedded as a Perci window.' },
    { id: 'office', targetId: MODES.OFFICE, label: 'Perci HQ', kind: 'native', districtId: 'operations-terminal', x: 800, y: 170, description: 'Animated office scene and agent presence view.' },
    { id: 'mission', targetId: MODES.MISSION, label: 'Mission', kind: 'native', districtId: 'operations-terminal', x: 800, y: 310, description: 'Run supervision, validation, memory candidates, and transit-map precedent.' },
    { id: 'agents', targetId: MODES.AGENTS, label: 'Agents', kind: 'native', districtId: 'operations-terminal', x: 980, y: 310, description: 'Agent cards, queued jobs, and CLI-backed orchestration.' },
    { id: 'openclaw', targetId: OPENCLAW_WINDOW_ID, label: 'OpenClaw', kind: 'system', districtId: 'operations-terminal', x: 1160, y: 310, description: 'Gateway dashboard and local agent runtime surface.' },
    { id: 'hermes', targetId: HERMES_WINDOW_ID, label: 'Hermes', kind: 'system', districtId: 'operations-terminal', x: 980, y: 170, description: 'CLI agent dashboard and memory/session surface.' },
    { id: 'skills', targetId: SKILLS_WINDOW_ID, label: 'Skills', kind: 'native', districtId: 'operations-terminal', x: 1160, y: 170, description: 'System skills, agent CLIs, safety scans, and tool readiness.' },
    { id: 'git-shells', targetId: MODES.PROJECTS, label: 'Git Shells', kind: 'native', districtId: 'local-systems-depot', x: 800, y: 510, description: 'Project terminal command center.' },
    { id: 'localhost', targetId: LOCALHOST_WINDOW_ID, label: 'Localhost', kind: 'system', districtId: 'local-systems-depot', x: 800, y: 690, description: 'Preview and inspect local development servers.' },
    { id: 'lighthouse', targetId: MODES.LIGHTHOUSE, label: 'Lighthouse', kind: 'system', districtId: 'local-systems-depot', x: 980, y: 510, description: 'Port scanning, active-process context, and conflict detection.' },
    { id: 'markitdown', targetId: MODES.MARKITDOWN, label: 'MarkItDownUI', kind: 'system', districtId: 'local-systems-depot', x: 1160, y: 690, description: 'Local file and URL conversion into Markdown.' },
    { id: 'studioos', targetId: MODES.STUDIOOS, label: 'StudioOS', kind: 'system', districtId: 'local-systems-depot', x: 1160, y: 510, description: 'Embedded StudioOS workspace view.' },
    { id: 'klipit', targetId: KLIPIT_WINDOW_ID, label: 'Klipit', kind: 'system', districtId: 'local-systems-depot', x: 980, y: 690, description: 'Secure web clipping surface.' },
    { id: 'bill-board', targetId: MODES.CONCERNS, label: 'Bill Board', kind: 'system', districtId: 'business-office', x: 510, y: 160, description: 'User expenses, bills, and subscription tracking.' },
    { id: 'gdash', targetId: GDASH_WINDOW_ID, label: 'G-Dash', kind: 'system', districtId: 'business-office', x: 610, y: 160, description: 'Google Workspace dashboard surface.' },
];

export const PERCI_SURFACE_ROUTES = [
    { id: 'circle-line', type: 'movement', label: 'Circle Line', stationIds: ['dashboard', 'perci-map', 'perci-now', 'workspace', 'chat', 'cowork', 'code', 'git-shells', 'lighthouse', 'mission', 'agents', 'office', 'dashboard'] },
    { id: 'workspace-context', type: 'context', label: 'Workspace Context', stationIds: ['bars', 'notes', 'workspace', 'mission', 'cowork', 'code', 'git-shells', 'eidos'] },
    { id: 'agent-rail', type: 'automation', label: 'Agent Rail', stationIds: ['office', 'mission', 'perci-now', 'agents', 'openclaw', 'hermes', 'skills'] },
    { id: 'build-main', type: 'creation', label: 'Build Main', stationIds: ['chat', 'ensemble', 'compare', 'cowork', 'code', 'build', 'artifacts', 'localhost'] },
    { id: 'research-loop', type: 'research', label: 'Research Loop', stationIds: ['chat', 'research', 'research-results', 'notes', 'workspace'] },
    { id: 'local-runtime', type: 'runtime', label: 'Runtime Connector', stationIds: ['markitdown', 'localhost', 'git-shells', 'lighthouse', 'openclaw', 'studioos', 'klipit'] },
    { id: 'governance-line', type: 'governance', label: 'Governance Line', stationIds: ['skills', 'agents', 'mission', 'eidos', 'notes'] },
    { id: 'expense-line', type: 'expenses', label: 'Expense Line', stationIds: ['bill-board', 'gdash', 'workspace', 'notes'] },
];

export function filterSurfaceMapRoutes(routeTypeIds, routes = PERCI_SURFACE_ROUTES) {
    const active = new Set(routeTypeIds);
    return routes.filter(route => active.has(route.type));
}

export function getVisibleSurfaceStationIds(routes) {
    return new Set(routes.flatMap(route => route.stationIds));
}

export function getSurfaceMapSummary(routes = PERCI_SURFACE_ROUTES, stations = PERCI_SURFACE_STATIONS) {
    const stationIds = getVisibleSurfaceStationIds(routes);
    return {
        routeCount: routes.length,
        stationCount: stations.filter(station => stationIds.has(station.id)).length,
        routeTypes: Array.from(new Set(routes.map(route => route.type))),
    };
}

export function getSurfaceDistrict(station, districts = SURFACE_MAP_DISTRICTS) {
    return districts.find(district => district.id === station?.districtId) || null;
}
