export function buildMissionTransitGraph(runs = [], memories = []) {
    const nodes = [];
    const edges = [];
    const addNode = (id, label, type, meta = {}) => {
        if (!nodes.some(node => node.id === id)) nodes.push({ id, label, type, ...meta });
    };
    addNode('start', 'Prompt', 'origin');
    addNode('validation', 'Validation', 'control');
    addNode('memory', 'Memory', 'memory', { count: memories.length });

    runs.slice(0, 18).forEach((run, index) => {
        const runId = `run-${run.id}`;
        const sourceType = getRunSourceType(run);
        addNode(runId, run.title || `Run ${index + 1}`, sourceType, {
            status: run.status,
            updatedAt: run.updatedAt
        });
        edges.push({ from: index === 0 ? 'start' : `run-${runs[index - 1].id}`, to: runId, label: sourceType });
        if (run.validation) edges.push({ from: runId, to: 'validation', label: run.validation.status });
        if (['completed', 'blocked'].includes(run.status)) edges.push({ from: runId, to: 'memory', label: 'candidate' });
        (run.files || []).slice(0, 5).forEach(file => {
            const fileId = `file-${file}`;
            addNode(fileId, file.split('/').pop(), 'file', { path: file });
            edges.push({ from: runId, to: fileId, label: 'touches' });
        });
    });
    return { nodes, edges };
}

export function assignTransitLayout(graph, width = 760, height = 420) {
    const lanes = {
        origin: 0,
        terminal: 1,
        cowork: 2,
        code: 3,
        build: 4,
        gateway: 1,
        file: 5,
        control: 6,
        memory: 7,
        general: 2
    };
    const laneCount = 8;
    const margin = 36;
    const laneWidth = (width - margin * 2) / Math.max(1, laneCount - 1);
    const laneUsage = {};
    const nodes = graph.nodes.map(node => {
        const lane = lanes[node.type] ?? lanes.general;
        laneUsage[lane] = (laneUsage[lane] || 0) + 1;
        const yOffset = (laneUsage[lane] - 1) * 58;
        return {
            ...node,
            x: margin + lane * laneWidth,
            y: margin + (yOffset % Math.max(120, height - margin * 2))
        };
    });
    return { ...graph, nodes, width, height };
}

function getRunSourceType(run) {
    if (run.id === 'mission-openclaw-health' || run.gateway) return 'gateway';
    if (run.id?.startsWith('terminal-') || run.agent === 'Opal Terminal') return 'terminal';
    if (run.id?.startsWith('cowork-') || run.agent === 'Opal Cowork Agent') return 'cowork';
    if (run.id?.startsWith('code-') || run.agent === 'Opal Code Assistant' || run.agent === 'Opal Code Editor') return 'code';
    if (run.id?.startsWith('build-') || run.agent === 'Opal Build Assistant') return 'build';
    return 'general';
}
