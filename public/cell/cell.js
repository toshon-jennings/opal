const STORAGE_KEY = 'lumen-digital-cell:v1';
const THEME_KEY = 'lumen-theme';
const STATE_VERSION = 2;
const MAX_CELLS = 28;
const MAX_FEEDERS = 76;
const TAU = Math.PI * 2;

const canvas = document.querySelector('#cell-canvas');
const ctx = canvas.getContext('2d');
const vitals = document.querySelector('#vitals');
const eventLog = document.querySelector('#event-log');
const feedButton = document.querySelector('#feed-button');
const pauseButton = document.querySelector('#pause-button');
const themeButton = document.querySelector('#theme-button');
const fullscreenButton = document.querySelector('#fullscreen-button');
const speedButtons = [...document.querySelectorAll('[data-speed]')];

const dom = {
  age: document.querySelector('#age-value'),
  cultureDay: document.querySelector('#culture-day'),
  divisions: document.querySelector('#division-value'),
  generation: document.querySelector('#generation-value'),
  health: document.querySelector('#health-state'),
  lineageName: document.querySelector('#lineage-name'),
  livePopulation: document.querySelector('#live-population'),
  mutations: document.querySelector('#mutation-value'),
  offspring: document.querySelector('#offspring-value'),
  phase: document.querySelector('#phase-label'),
  population: document.querySelector('#population-value'),
  specimen: document.querySelector('#specimen-id'),
  temperature: document.querySelector('#temperature'),
  trait: document.querySelector('#trait-note'),
};

const vitalDefinitions = [
  ['energy', 'Energy'],
  ['nutrients', 'Nutrients'],
  ['membrane', 'Membrane'],
  ['genome', 'Genome'],
  ['health', 'Health'],
];

vitals.innerHTML = vitalDefinitions.map(([key, label]) => `
  <div class="vital">
    <span class="vital-label">${label}</span>
    <span class="vital-track"><span data-vital-bar="${key}"></span></span>
    <span class="vital-value" data-vital-value="${key}">0%</span>
  </div>
`).join('');

const vitalBars = Object.fromEntries(vitalDefinitions.map(([key]) => [
  key,
  document.querySelector(`[data-vital-bar="${key}"]`),
]));
const vitalValues = Object.fromEntries(vitalDefinitions.map(([key]) => [
  key,
  document.querySelector(`[data-vital-value="${key}"]`),
]));

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function randomValue() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function defaultTraits() {
  return {
    uptake: 1,
    metabolism: 1,
    membraneSynthesis: 1,
    fidelity: 0.993,
    divisionThreshold: 1.67,
  };
}

function createCell(overrides = {}) {
  const id = Number(overrides.id || 1);
  const visualSeed = Number(overrides.visualSeed || hashString(`${id}-${Date.now()}`));
  const angle = seededUnit(visualSeed) * TAU;
  return {
    id,
    parentId: overrides.parentId ?? null,
    specimenId: overrides.specimenId || `L-${String(id).padStart(3, '0')}`,
    lineageName: overrides.lineageName || 'Lumen-1',
    generation: Number(overrides.generation || 1),
    offspring: Number(overrides.offspring || 0),
    ageHours: Number(overrides.ageHours || 0),
    generationAge: Number(overrides.generationAge || 0),
    mass: Number(overrides.mass ?? 1),
    energy: Number(overrides.energy ?? 0.67),
    nutrients: Number(overrides.nutrients ?? 0.52),
    membrane: Number(overrides.membrane ?? 0.58),
    proteins: Number(overrides.proteins ?? 0.48),
    genome: Number(overrides.genome ?? 0.98),
    waste: Number(overrides.waste ?? 0.08),
    health: Number(overrides.health ?? 0.94),
    phase: overrides.phase || 'metabolizing',
    divisionProgress: Number(overrides.divisionProgress || 0),
    recoveryTimer: Number(overrides.recoveryTimer || 0),
    densityDelay: Number(overrides.densityDelay || 0),
    deathTimer: Number(overrides.deathTimer || 0),
    eventCooldown: Number(overrides.eventCooldown || 0),
    x: clamp(Number(overrides.x ?? 0.5), 0.08, 0.92),
    y: clamp(Number(overrides.y ?? 0.47), 0.12, 0.86),
    vx: Number(overrides.vx ?? Math.cos(angle) * 0.0007),
    vy: Number(overrides.vy ?? Math.sin(angle) * 0.0007),
    driftPhase: Number(overrides.driftPhase ?? seededUnit(visualSeed + 11) * TAU),
    visualSeed,
    hue: Number(overrides.hue ?? 151 + seededUnit(visualSeed + 23) * 16),
    traits: { ...defaultTraits(), ...(overrides.traits || {}) },
    mutations: Array.isArray(overrides.mutations) ? overrides.mutations.slice(-18) : [],
  };
}

function createInitialCulture() {
  const specimenNumber = String(Math.floor(100 + Math.random() * 900));
  const lineageName = `Lumen-${Math.floor(Math.random() * 6) + 1}`;
  const seed = hashString(`${Date.now()}-${specimenNumber}`);
  const founder = createCell({
    id: 1,
    specimenId: `L-${specimenNumber}`,
    lineageName,
    visualSeed: seed ^ 0x9E3779B9,
  });

  return {
    version: STATE_VERSION,
    cultureId: founder.specimenId,
    seed,
    simTime: 0,
    ageHours: 0,
    temperature: 30,
    totalDivisions: 0,
    nextCellId: 2,
    selectedCellId: founder.id,
    cells: [founder],
    events: [
      { time: 0, message: 'Culture stabilized in fresh medium.' },
      { time: 0, message: 'Founder genome transcription is active.' },
    ],
    lastSavedAt: Date.now(),
  };
}

function migrateSingleton(saved) {
  const culture = createInitialCulture();
  const founder = createCell({
    id: 1,
    specimenId: saved.specimenId || culture.cultureId,
    lineageName: saved.lineageName || culture.cells[0].lineageName,
    generation: saved.generation || 1,
    offspring: saved.divisions || 0,
    ageHours: saved.generationAge ?? saved.ageHours ?? 0,
    generationAge: saved.generationAge ?? 0,
    mass: saved.mass,
    energy: saved.energy,
    nutrients: saved.nutrients,
    membrane: saved.membrane,
    proteins: saved.proteins,
    genome: saved.genome,
    waste: saved.waste,
    health: saved.health,
    phase: saved.phase === 'dividing' ? 'recovering' : saved.phase,
    recoveryTimer: saved.phase === 'dividing' ? 5 : saved.recoveryTimer,
    traits: saved.traits,
    mutations: saved.mutations,
    visualSeed: saved.seed || culture.seed,
  });

  return {
    ...culture,
    cultureId: founder.specimenId,
    seed: saved.seed || culture.seed,
    simTime: Number(saved.simTime || 0),
    ageHours: Number(saved.ageHours || 0),
    temperature: Number(saved.temperature || 30),
    totalDivisions: Number(saved.divisions || 0),
    cells: [founder],
    events: Array.isArray(saved.events) ? saved.events.slice(-12) : culture.events,
    lastSavedAt: Number(saved.lastSavedAt || Date.now()),
  };
}

function normalizeCulture(saved) {
  const fresh = createInitialCulture();
  const cells = Array.isArray(saved.cells)
    ? saved.cells.slice(0, MAX_CELLS).map((cell, index) => createCell({
      ...cell,
      id: Number(cell.id || index + 1),
      phase: cell.phase === 'dividing' ? 'recovering' : cell.phase,
      divisionProgress: 0,
      recoveryTimer: cell.phase === 'dividing' ? 5 : cell.recoveryTimer,
    }))
    : fresh.cells;
  const selectedCellId = cells.some((cell) => cell.id === saved.selectedCellId)
    ? saved.selectedCellId
    : cells[0].id;

  return {
    ...fresh,
    ...saved,
    version: STATE_VERSION,
    cultureId: saved.cultureId || cells[0].specimenId,
    nextCellId: Math.max(
      Number(saved.nextCellId || 1),
      ...cells.map((cell) => cell.id + 1),
    ),
    selectedCellId,
    cells,
    events: Array.isArray(saved.events) ? saved.events.slice(-12) : fresh.events,
    lastSavedAt: Number(saved.lastSavedAt || Date.now()),
  };
}

function loadCulture() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return createInitialCulture();
    if (saved.version === 1 && typeof saved.mass === 'number') return migrateSingleton(saved);
    if (saved.version === STATE_VERSION && Array.isArray(saved.cells) && saved.cells.length) {
      return normalizeCulture(saved);
    }
  } catch {
    // Start a new culture when browser storage is malformed or unavailable.
  }
  return createInitialCulture();
}

const state = loadCulture();
const random = mulberry32(state.seed ^ Math.floor(state.simTime * 1000));
const feeders = [];
const motes = [];

let width = 0;
let height = 0;
let dpr = 1;
let speed = 1;
let previousSpeed = 1;
let lastFrame = performance.now();
let feederTimer = 0;
let saveTimer = 0;
let uiTimer = 0;
let manualStepping = false;
let hoverCellId = null;

for (let index = 0; index < 120; index += 1) {
  motes.push({
    x: random(),
    y: random(),
    radius: 0.25 + random() * 0.95,
    phase: random() * TAU,
  });
}

function selectedCell() {
  const selected = state.cells.find((cell) => cell.id === state.selectedCellId);
  if (selected) return selected;
  const fallback = state.cells[0];
  if (fallback) state.selectedCellId = fallback.id;
  return fallback;
}

function cellName(cell) {
  return `${cell.lineageName} · ${cell.id}`;
}

function addEvent(message) {
  const previous = state.events.at(-1);
  if (previous?.message === message && state.ageHours - previous.time < 1.2) return;
  state.events.push({ time: state.ageHours, message });
  state.events = state.events.slice(-12);
}

function phaseLabel(cell) {
  if (!cell) return 'Culture empty';
  if (cell.health <= 0.02 || cell.phase === 'dormant') return 'Dormant';
  if (cell.phase === 'dividing') return 'Dividing';
  if (cell.phase === 'recovering') return 'Reorganizing';
  if (cell.densityDelay > 0) return 'Crowding response';
  if (cell.nutrients < 0.18) return 'Foraging';
  if (cell.energy < 0.22) return 'Energy conservation';
  if (cell.waste > 0.62) return 'Clearing waste';
  if (cell.mass > cell.traits.divisionThreshold * 0.86) return 'Preparing to divide';
  if (cell.membrane < 0.35) return 'Synthesizing membrane';
  return 'Metabolizing';
}

function currentTraitNote(cell) {
  const latest = cell?.mutations.at(-1);
  if (!latest) return 'Baseline uptake phenotype';
  return `${latest.label} · inherited generation ${latest.generation}`;
}

function healthLabel(cell) {
  if (!cell || cell.health <= 0.02) return 'Dormant';
  if (cell.health > 0.78) return 'Stable';
  if (cell.health > 0.5) return 'Adapting';
  if (cell.health > 0.22) return 'Stressed';
  return 'Critical';
}

function formatAge(hours) {
  if (hours < 24) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`;
}

function formatEventTime(hours) {
  if (hours < 1) return `${Math.max(0, Math.floor(hours * 60))}m`;
  return `${Math.floor(hours)}h`;
}

function updateUi() {
  const cell = selectedCell();
  if (!cell) return;
  const population = state.cells.length;

  dom.age.textContent = formatAge(cell.ageHours);
  dom.cultureDay.textContent = `day ${Math.floor(state.ageHours / 24)}`;
  dom.divisions.textContent = state.totalDivisions;
  dom.generation.textContent = cell.generation;
  dom.health.textContent = healthLabel(cell);
  dom.lineageName.textContent = cellName(cell);
  dom.livePopulation.textContent = `${population} ${population === 1 ? 'cell' : 'cells'}`;
  dom.mutations.textContent = cell.mutations.length;
  dom.offspring.textContent = cell.offspring;
  dom.phase.textContent = phaseLabel(cell);
  dom.population.textContent = population;
  dom.specimen.textContent = `Specimen ${cell.specimenId}`;
  dom.temperature.textContent = `${state.temperature.toFixed(1)}°C`;
  dom.trait.textContent = currentTraitNote(cell);
  dom.health.style.opacity = cell.health < 0.5 ? '0.82' : '1';

  vitalDefinitions.forEach(([key]) => {
    const value = clamp(cell[key]);
    vitalBars[key].style.width = `${value * 100}%`;
    vitalValues[key].textContent = `${Math.round(value * 100)}%`;
  });

  eventLog.innerHTML = [...state.events].reverse().slice(0, 4).map((event) => `
    <li><time>${formatEventTime(event.time)}</time><span>${event.message}</span></li>
  `).join('');
}

function saveState() {
  state.lastSavedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The simulation remains usable when storage is unavailable.
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  constrainCellsToField();
}

function populationZoom() {
  const count = Math.max(1, state.cells.length);
  return clamp(1.42 / Math.sqrt(0.48 + count * 0.46), 0.52, 1.22);
}

function cellGeometry(cell) {
  const baseRadius = Math.min(width, height) * 0.122 * populationZoom();
  return {
    x: cell.x * width,
    y: cell.y * height,
    radius: baseRadius * Math.sqrt(clamp(cell.mass, 0.55, 2.1)),
  };
}

function fieldBounds(cell) {
  const geometry = cellGeometry(cell);
  const compact = width < 620;
  return {
    minX: clamp(geometry.radius / width + 0.035, 0.07, 0.35),
    maxX: clamp(1 - geometry.radius / width - 0.035, 0.65, 0.93),
    minY: clamp(geometry.radius / height + 0.075, 0.12, 0.38),
    maxY: clamp((compact ? 0.78 : 0.91) - geometry.radius / height, 0.6, 0.88),
  };
}

function constrainCell(cell) {
  if (!width || !height) return;
  const bounds = fieldBounds(cell);
  if (cell.x < bounds.minX) {
    cell.x = bounds.minX;
    cell.vx = Math.abs(cell.vx);
  } else if (cell.x > bounds.maxX) {
    cell.x = bounds.maxX;
    cell.vx = -Math.abs(cell.vx);
  }
  if (cell.y < bounds.minY) {
    cell.y = bounds.minY;
    cell.vy = Math.abs(cell.vy);
  } else if (cell.y > bounds.maxY) {
    cell.y = bounds.maxY;
    cell.vy = -Math.abs(cell.vy);
  }
}

function constrainCellsToField() {
  state.cells.forEach(constrainCell);
}

function spawnFeeder(burst = false) {
  const side = Math.floor(random() * 4);
  let x = random();
  let y = random();
  if (side === 0) y = -0.05;
  if (side === 1) x = 1.05;
  if (side === 2) y = 1.05;
  if (side === 3) x = -0.05;

  const targetX = 0.24 + random() * 0.52;
  const targetY = 0.22 + random() * 0.5;
  const targetAngle = Math.atan2(targetY - y, targetX - x) + (random() - 0.5) * 0.32;
  const velocity = burst ? 0.022 + random() * 0.014 : 0.0055 + random() * 0.005;

  feeders.push({
    x,
    y,
    vx: Math.cos(targetAngle) * velocity,
    vy: Math.sin(targetAngle) * velocity,
    radius: 5 + random() * 5.5,
    nutrient: 0.042 + random() * 0.036,
    membrane: 0.008 + random() * 0.01,
    phase: random() * TAU,
    opacity: 0,
  });
}

function addFeederBurst() {
  for (let index = 0; index < 28; index += 1) spawnFeeder(true);
  addEvent('A concentrated pulse of feeder vesicles entered the culture.');
  feedButton.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(0.97)' },
      { transform: 'scale(1)' },
    ],
    { duration: 220, easing: 'ease-out' },
  );
}

function nearestCellForFeeder(feeder) {
  let target = null;
  let bestScore = Infinity;
  for (const cell of state.cells) {
    if (cell.phase === 'dividing') continue;
    const dx = cell.x - feeder.x;
    const dy = cell.y - feeder.y;
    const distance = Math.hypot(dx * width, dy * height);
    const uptakeAdvantage = 0.78 + cell.traits.uptake * 0.22;
    const score = distance / uptakeAdvantage;
    if (score < bestScore) {
      bestScore = score;
      target = cell;
    }
  }
  return target;
}

function absorbFeeder(cell, feeder) {
  const efficiency = clamp(cell.traits.uptake * (0.72 + cell.genome * 0.28), 0.52, 1.48);
  cell.nutrients = clamp(cell.nutrients + feeder.nutrient * efficiency);
  cell.membrane = clamp(cell.membrane + feeder.membrane * cell.traits.membraneSynthesis);
  cell.energy = clamp(cell.energy + feeder.nutrient * 0.12);
  cell.mass += feeder.membrane * 0.42 + feeder.nutrient * 0.052;

  if (cell.phase === 'dormant' || cell.health <= 0.02) {
    cell.health = 0.12;
    cell.energy = Math.max(cell.energy, 0.2);
    cell.phase = 'recovering';
    cell.recoveryTimer = 8;
    cell.deathTimer = 0;
    addEvent(`${cellName(cell)} revived after a feeder fusion.`);
  } else if (cell.eventCooldown <= 0 && random() > 0.72) {
    addEvent(`${cellName(cell)} captured a feeder vesicle.`);
    cell.eventCooldown = 8;
  }
}

function updateFeeders(dt) {
  feederTimer -= dt;
  if (feederTimer <= 0 && feeders.length < MAX_FEEDERS) {
    spawnFeeder(false);
    feederTimer = 1.15 + random() * 1.2;
  }

  for (let index = feeders.length - 1; index >= 0; index -= 1) {
    const feeder = feeders[index];
    const target = nearestCellForFeeder(feeder);
    if (target) {
      const dx = target.x - feeder.x;
      const dy = target.y - feeder.y;
      const distance = Math.hypot(dx, dy) || 1;
      const attraction = 0.000055 * target.traits.uptake;
      feeder.vx += dx / distance * attraction * dt;
      feeder.vy += dy / distance * attraction * dt;
      const velocity = Math.hypot(feeder.vx, feeder.vy) || 1;
      const maxVelocity = 0.04;
      if (velocity > maxVelocity) {
        feeder.vx = feeder.vx / velocity * maxVelocity;
        feeder.vy = feeder.vy / velocity * maxVelocity;
      }
    }

    feeder.x += feeder.vx * dt;
    feeder.y += feeder.vy * dt;
    feeder.phase += dt * 1.4;
    feeder.opacity = clamp(feeder.opacity + dt * 0.8);

    let consumed = false;
    for (const cell of state.cells) {
      if (cell.phase === 'dividing') continue;
      const geometry = cellGeometry(cell);
      const dx = feeder.x * width - geometry.x;
      const dy = feeder.y * height - geometry.y;
      const captureRadius = geometry.radius * (0.91 + (cell.traits.uptake - 1) * 0.16);
      if (Math.hypot(dx, dy) < captureRadius + feeder.radius * 0.65) {
        absorbFeeder(cell, feeder);
        feeders.splice(index, 1);
        consumed = true;
        break;
      }
    }
    if (consumed) continue;

    if (feeder.x < -0.16 || feeder.x > 1.16 || feeder.y < -0.16 || feeder.y > 1.16) {
      feeders.splice(index, 1);
    }
  }
}

function mutateCell(cell, chance) {
  if (random() > chance) return false;
  const candidates = [
    {
      trait: 'uptake',
      positive: 'Feeder capture became more efficient',
      negative: 'Feeder capture weakened',
      scale: 1,
    },
    {
      trait: 'metabolism',
      positive: 'Energy conversion accelerated',
      negative: 'Energy conversion slowed',
      scale: 1,
    },
    {
      trait: 'membraneSynthesis',
      positive: 'Membrane synthesis became more efficient',
      negative: 'Membrane synthesis became more costly',
      scale: 1,
    },
    {
      trait: 'divisionThreshold',
      positive: 'Division begins at a lower cell mass',
      negative: 'Division requires a larger cell mass',
      scale: -1,
    },
    {
      trait: 'fidelity',
      positive: 'Genome replication fidelity improved',
      negative: 'Genome replication fidelity declined',
      scale: 0.08,
    },
  ];
  const candidate = candidates[Math.floor(random() * candidates.length)];
  const beneficial = random() > 0.4;
  const direction = beneficial ? 1 : -1;
  const rawChange = (0.035 + random() * 0.055) * direction * candidate.scale;

  if (candidate.trait === 'divisionThreshold') {
    cell.traits.divisionThreshold = clamp(cell.traits.divisionThreshold + rawChange, 1.48, 1.94);
  } else if (candidate.trait === 'fidelity') {
    cell.traits.fidelity = clamp(cell.traits.fidelity + rawChange, 0.965, 0.9995);
  } else {
    cell.traits[candidate.trait] = clamp(cell.traits[candidate.trait] + rawChange, 0.72, 1.36);
  }

  cell.hue = clamp(cell.hue + direction * (2 + random() * 4), 138, 178);
  const label = beneficial ? candidate.positive : candidate.negative;
  cell.mutations.push({
    id: `${state.totalDivisions}-${cell.id}-${Math.floor(state.simTime)}`,
    trait: candidate.trait,
    label,
    generation: cell.generation,
    beneficial,
  });
  cell.mutations = cell.mutations.slice(-18);
  addEvent(`${cellName(cell)} inherited a ${beneficial ? 'beneficial' : 'costly'} variation.`);
  return true;
}

function beginDivision(cell) {
  if (state.cells.length >= MAX_CELLS) {
    if (cell.densityDelay <= 0) addEvent('Culture density temporarily inhibited further division.');
    cell.densityDelay = 24;
    cell.mass = Math.min(cell.mass, cell.traits.divisionThreshold * 1.03);
    return;
  }
  cell.phase = 'dividing';
  cell.divisionProgress = 0;
  addEvent(`${cellName(cell)} began membrane constriction.`);
}

function inheritConcentration(value, bias = 1) {
  return clamp(value * (0.8 + random() * 0.16) * bias);
}

function finishDivision(cell) {
  if (!state.cells.includes(cell)) return;
  if (state.cells.length >= MAX_CELLS) {
    cell.phase = 'recovering';
    cell.recoveryTimer = 5;
    cell.divisionProgress = 0;
    cell.mass = cell.traits.divisionThreshold * 0.92;
    return;
  }

  const childId = state.nextCellId;
  state.nextCellId += 1;
  const angle = random() * TAU;
  const separation = 0.024 + 0.018 * populationZoom();
  const source = {
    mass: cell.mass,
    energy: cell.energy,
    nutrients: cell.nutrients,
    membrane: cell.membrane,
    proteins: cell.proteins,
    genome: cell.genome,
    waste: cell.waste,
    health: cell.health,
  };
  const massBias = 0.47 + random() * 0.06;
  const nextGeneration = cell.generation + 1;
  const child = createCell({
    id: childId,
    parentId: cell.id,
    specimenId: `${state.cultureId}-${String(childId).padStart(2, '0')}`,
    lineageName: cell.lineageName,
    generation: nextGeneration,
    mass: clamp(source.mass * (1 - massBias), 0.7, 1.08),
    energy: inheritConcentration(source.energy, 0.98 + random() * 0.05),
    nutrients: inheritConcentration(source.nutrients, 0.96 + random() * 0.08),
    membrane: inheritConcentration(source.membrane),
    proteins: inheritConcentration(source.proteins),
    genome: clamp(source.genome - random() * (1 - cell.traits.fidelity) * 2.3, 0.66, 1),
    waste: clamp(source.waste * (0.42 + random() * 0.13)),
    health: clamp(source.health * 0.94 + 0.035, 0.42, 1),
    phase: 'recovering',
    recoveryTimer: 6,
    x: cell.x + Math.cos(angle) * separation,
    y: cell.y + Math.sin(angle) * separation,
    vx: Math.cos(angle) * (0.0023 + random() * 0.0012),
    vy: Math.sin(angle) * (0.0023 + random() * 0.0012),
    visualSeed: hashString(`${state.seed}-${childId}-${state.totalDivisions}`),
    hue: cell.hue,
    traits: { ...cell.traits },
    mutations: cell.mutations.map((mutation) => ({ ...mutation })),
  });

  cell.generation = nextGeneration;
  cell.offspring += 1;
  cell.ageHours = 0;
  cell.generationAge = 0;
  cell.mass = clamp(source.mass * massBias, 0.7, 1.08);
  cell.energy = inheritConcentration(source.energy, 0.98 + random() * 0.05);
  cell.nutrients = inheritConcentration(source.nutrients, 0.96 + random() * 0.08);
  cell.membrane = inheritConcentration(source.membrane);
  cell.proteins = inheritConcentration(source.proteins);
  cell.genome = clamp(source.genome - random() * (1 - cell.traits.fidelity) * 2.3, 0.66, 1);
  cell.waste = clamp(source.waste * (0.42 + random() * 0.13));
  cell.health = clamp(source.health * 0.94 + 0.035, 0.42, 1);
  cell.phase = 'recovering';
  cell.recoveryTimer = 6;
  cell.divisionProgress = 0;
  cell.x -= Math.cos(angle) * separation;
  cell.y -= Math.sin(angle) * separation;
  cell.vx = -Math.cos(angle) * (0.0023 + random() * 0.0012);
  cell.vy = -Math.sin(angle) * (0.0023 + random() * 0.0012);

  state.cells.push(child);
  state.totalDivisions += 1;
  mutateCell(cell, 0.18);
  mutateCell(child, 0.32);
  constrainCell(cell);
  constrainCell(child);
  addEvent(`Division produced ${cellName(child)}; both daughters remain in culture.`);
}

function updateCellBiology(cell, dt, offline = false) {
  cell.eventCooldown -= dt;
  cell.densityDelay = Math.max(0, cell.densityDelay - dt);
  cell.ageHours += dt * 0.18;
  cell.generationAge += dt * 0.18;

  if (cell.phase === 'dormant' || cell.health <= 0.02) {
    cell.phase = 'dormant';
    cell.health = 0;
    cell.deathTimer += dt;
    return;
  }

  if (cell.phase === 'dividing') {
    cell.divisionProgress += dt / 8.5;
    cell.energy = clamp(cell.energy - dt * 0.0042);
    if (cell.divisionProgress >= 1) finishDivision(cell);
    return;
  }

  if (cell.phase === 'recovering') {
    cell.recoveryTimer -= dt;
    if (cell.recoveryTimer <= 0) cell.phase = 'metabolizing';
  }

  const temperatureFactor = 1 - Math.abs(state.temperature - 30) * 0.025;
  const nutrientUse = Math.min(
    cell.nutrients,
    dt * 0.0032 * cell.traits.metabolism * temperatureFactor,
  );
  cell.nutrients = clamp(cell.nutrients - nutrientUse);
  cell.energy = clamp(cell.energy + nutrientUse * 0.58 - dt * (0.00082 + cell.mass * 0.00034));
  cell.proteins = clamp(cell.proteins + nutrientUse * 0.22 - dt * 0.00038);
  cell.membrane = clamp(
    cell.membrane + nutrientUse * 0.17 * cell.traits.membraneSynthesis - dt * 0.00018,
  );
  cell.waste = clamp(cell.waste + nutrientUse * 0.21 - dt * (0.00046 + cell.genome * 0.00018));
  cell.genome = clamp(cell.genome - dt * 0.000006 * (1 - cell.traits.fidelity) * 100);

  const growthConditions = Math.min(
    clamp((cell.energy - 0.28) * 2.1),
    clamp((cell.proteins - 0.2) * 1.7),
    clamp((cell.membrane - 0.22) * 1.5),
  );
  cell.mass += dt * 0.00078 * growthConditions * cell.traits.membraneSynthesis;
  cell.energy = clamp(cell.energy - dt * 0.0002 * growthConditions);

  const stress =
    clamp((0.18 - cell.energy) * 4) +
    clamp((cell.waste - 0.62) * 2.1) +
    clamp((0.7 - cell.genome) * 1.5);
  if (stress > 0) {
    cell.health = clamp(cell.health - dt * 0.0015 * stress);
  } else {
    cell.health = clamp(cell.health + dt * 0.00042 * cell.genome);
  }

  if (cell.energy < 0.18 && cell.eventCooldown <= 0) {
    addEvent(`${cellName(cell)} entered energy conservation.`);
    cell.eventCooldown = 14;
  } else if (cell.waste > 0.64 && cell.eventCooldown <= 0) {
    addEvent(`${cellName(cell)} is stressed by waste accumulation.`);
    cell.eventCooldown = 14;
  }

  if (
    cell.mass >= cell.traits.divisionThreshold &&
    cell.energy > 0.38 &&
    cell.proteins > 0.34 &&
    cell.genome > 0.66 &&
    cell.densityDelay <= 0
  ) {
    beginDivision(cell);
  }

  if (offline && cell.nutrients < 0.36) {
    const ambientShare = dt * 0.0026 / Math.sqrt(Math.max(1, state.cells.length));
    cell.nutrients = clamp(cell.nutrients + ambientShare);
    cell.membrane = clamp(cell.membrane + ambientShare * 0.24);
  }
}

function updateCellMotion(cell, dt) {
  if (!width || !height || cell.phase === 'dormant') return;
  cell.driftPhase += dt * (0.025 + seededUnit(cell.visualSeed + 4) * 0.018);
  cell.vx += Math.cos(cell.driftPhase) * dt * 0.000012;
  cell.vy += Math.sin(cell.driftPhase * 0.91) * dt * 0.000012;
  const velocity = Math.hypot(cell.vx, cell.vy) || 1;
  const maxVelocity = cell.phase === 'recovering' ? 0.004 : 0.0021;
  if (velocity > maxVelocity) {
    cell.vx = cell.vx / velocity * maxVelocity;
    cell.vy = cell.vy / velocity * maxVelocity;
  }
  cell.x += cell.vx * dt;
  cell.y += cell.vy * dt;
  cell.vx *= Math.pow(0.992, dt);
  cell.vy *= Math.pow(0.992, dt);
  constrainCell(cell);
}

function resolveCellCollisions() {
  if (!width || !height) return;
  for (let firstIndex = 0; firstIndex < state.cells.length; firstIndex += 1) {
    const first = state.cells[firstIndex];
    const firstGeometry = cellGeometry(first);
    for (let secondIndex = firstIndex + 1; secondIndex < state.cells.length; secondIndex += 1) {
      const second = state.cells[secondIndex];
      const secondGeometry = cellGeometry(second);
      let dx = secondGeometry.x - firstGeometry.x;
      let dy = secondGeometry.y - firstGeometry.y;
      let distance = Math.hypot(dx, dy);
      const minimum = (firstGeometry.radius + secondGeometry.radius) * 0.92;
      if (distance >= minimum) continue;
      if (distance < 0.01) {
        const angle = seededUnit(first.visualSeed + second.visualSeed) * TAU;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }
      const overlap = minimum - distance;
      const nx = dx / distance;
      const ny = dy / distance;
      first.x -= nx * overlap * 0.5 / width;
      first.y -= ny * overlap * 0.5 / height;
      second.x += nx * overlap * 0.5 / width;
      second.y += ny * overlap * 0.5 / height;
      first.vx -= nx * 0.0001;
      first.vy -= ny * 0.0001;
      second.vx += nx * 0.0001;
      second.vy += ny * 0.0001;
      constrainCell(first);
      constrainCell(second);
    }
  }
}

function removeExpiredDormantCells() {
  if (state.cells.length <= 1) return;
  const expired = state.cells.filter((cell) => cell.phase === 'dormant' && cell.deathTimer > 42);
  if (!expired.length) return;
  for (const cell of expired) {
    state.cells = state.cells.filter((candidate) => candidate.id !== cell.id);
    addEvent(`${cellName(cell)} was lost from the culture.`);
  }
  if (!state.cells.some((cell) => cell.id === state.selectedCellId)) {
    const healthiest = [...state.cells].sort((a, b) => b.health - a.health)[0];
    state.selectedCellId = healthiest.id;
  }
}

function updateCulture(dt, { offline = false, move = true, includeFeeders = true } = {}) {
  state.simTime += dt;
  state.ageHours += dt * 0.18;
  state.temperature = 30 + Math.sin(state.simTime * 0.018) * 0.36;
  if (includeFeeders && width && height) updateFeeders(dt);

  const currentCells = [...state.cells];
  currentCells.forEach((cell) => updateCellBiology(cell, dt, offline));
  if (move) {
    state.cells.forEach((cell) => updateCellMotion(cell, dt));
    resolveCellCollisions();
  }
  removeExpiredDormantCells();
}

function applyOfflineProgress() {
  const elapsedSeconds = clamp((Date.now() - Number(state.lastSavedAt || Date.now())) / 1000, 0, 7200);
  if (elapsedSeconds < 20) return;
  let remaining = Math.min(480, elapsedSeconds * 0.1);
  while (remaining > 0) {
    const step = Math.min(3, remaining);
    updateCulture(step, { offline: true, move: false, includeFeeders: false });
    remaining -= step;
  }
  addEvent(`The population continued for ${Math.round(elapsedSeconds / 60)}m while away.`);
}

function update(dt) {
  const boundedDt = Math.min(dt, 0.2);
  if (speed <= 0) return;
  const simDt = boundedDt * speed;
  updateCulture(simDt);

  saveTimer += boundedDt;
  uiTimer += boundedDt;
  if (saveTimer >= 4) {
    saveState();
    saveTimer = 0;
  }
  if (uiTimer >= 0.32) {
    updateUi();
    uiTimer = 0;
  }
}

function palette() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return dark ? {
    backgroundA: '#071310',
    backgroundB: '#0b211b',
    field: 'rgba(66, 139, 115, 0.075)',
    grid: 'rgba(142, 211, 187, 0.038)',
    mote: 'rgba(190, 231, 216, 0.18)',
    feederFill: 'rgba(97, 211, 178, 0.13)',
    feederStroke: 'rgba(129, 232, 202, 0.5)',
    feederCore: 'rgba(183, 241, 222, 0.7)',
    protein: 'rgba(194, 244, 226, 0.55)',
    enzyme: 'rgba(244, 195, 102, 0.68)',
    ribosome: 'rgba(118, 210, 255, 0.64)',
    dna: 'rgba(229, 249, 241, 0.68)',
    selection: 'rgba(138, 244, 211, 0.92)',
    dormant: 'rgba(115, 131, 124, 0.34)',
  } : {
    backgroundA: '#e9eee7',
    backgroundB: '#dce8df',
    field: 'rgba(24, 111, 86, 0.065)',
    grid: 'rgba(30, 80, 64, 0.045)',
    mote: 'rgba(20, 76, 59, 0.15)',
    feederFill: 'rgba(20, 135, 104, 0.1)',
    feederStroke: 'rgba(20, 121, 94, 0.42)',
    feederCore: 'rgba(18, 102, 79, 0.58)',
    protein: 'rgba(244, 255, 249, 0.7)',
    enzyme: 'rgba(180, 119, 32, 0.64)',
    ribosome: 'rgba(35, 116, 157, 0.58)',
    dna: 'rgba(239, 255, 248, 0.84)',
    selection: 'rgba(9, 102, 76, 0.88)',
    dormant: 'rgba(104, 116, 109, 0.3)',
  };
}

function cellPalette(cell) {
  const dark = document.documentElement.dataset.theme === 'dark';
  const healthAlpha = 0.54 + clamp(cell.health) * 0.42;
  return dark ? {
    glow: `hsla(${cell.hue}, 72%, 55%, ${0.08 + cell.health * 0.1})`,
    cytoplasmA: `hsla(${cell.hue}, 54%, 48%, ${0.28 * healthAlpha})`,
    cytoplasmB: `hsla(${cell.hue - 5}, 63%, 20%, ${0.64 * healthAlpha})`,
    membrane: `hsla(${cell.hue + 4}, 72%, 76%, ${0.56 + cell.health * 0.32})`,
    membraneInner: `hsla(${cell.hue}, 58%, 49%, 0.62)`,
    nucleus: `hsla(${cell.hue + 5}, 61%, 65%, 0.15)`,
  } : {
    glow: `hsla(${cell.hue}, 62%, 37%, ${0.07 + cell.health * 0.09})`,
    cytoplasmA: `hsla(${cell.hue}, 47%, 47%, ${0.3 * healthAlpha})`,
    cytoplasmB: `hsla(${cell.hue - 5}, 58%, 32%, ${0.5 * healthAlpha})`,
    membrane: `hsla(${cell.hue - 3}, 75%, 27%, ${0.52 + cell.health * 0.25})`,
    membraneInner: `hsla(${cell.hue}, 55%, 42%, 0.52)`,
    nucleus: `hsla(${cell.hue}, 54%, 34%, 0.13)`,
  };
}

function drawBackground(colors) {
  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.46,
    0,
    width * 0.5,
    height * 0.46,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(0, colors.backgroundB);
  gradient.addColorStop(1, colors.backgroundA);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  const gridSize = 56;
  ctx.beginPath();
  for (let x = (state.simTime * 0.32) % gridSize; x < width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = (state.simTime * 0.18) % gridSize; y < height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  motes.forEach((mote) => {
    const pulse = 0.55 + Math.sin(state.simTime * 0.22 + mote.phase) * 0.35;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = colors.mote;
    ctx.beginPath();
    ctx.arc(mote.x * width, mote.y * height, mote.radius, 0, TAU);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  const field = ctx.createRadialGradient(
    width * 0.5,
    height * 0.47,
    30,
    width * 0.5,
    height * 0.47,
    Math.min(width, height) * 0.5,
  );
  field.addColorStop(0, 'transparent');
  field.addColorStop(0.72, colors.field);
  field.addColorStop(1, 'transparent');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, width, height);
}

function drawFeeder(feeder, colors) {
  ctx.save();
  ctx.globalAlpha = feeder.opacity;
  ctx.translate(feeder.x * width, feeder.y * height);
  const wobble = 1 + Math.sin(feeder.phase) * 0.08;
  ctx.scale(wobble, 2 - wobble);
  ctx.fillStyle = colors.feederFill;
  ctx.strokeStyle = colors.feederStroke;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0, feeder.radius, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = colors.feederCore;
  ctx.beginPath();
  ctx.arc(0, 0, 0.9, 0, TAU);
  ctx.fill();
  for (let index = 0; index < 2; index += 1) {
    const angle = feeder.phase * 0.18 + index * 2.43 + feeder.radius;
    ctx.beginPath();
    ctx.arc(
      Math.cos(angle) * feeder.radius * (0.34 + index * 0.08),
      Math.sin(angle) * feeder.radius * (0.34 + index * 0.08),
      0.55 + index * 0.14,
      0,
      TAU,
    );
    ctx.fill();
  }
  ctx.restore();
}

function wobblePath(x, y, radius, phase) {
  const points = 64;
  ctx.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const angle = index / points * TAU;
    const ripple =
      Math.sin(angle * 3 + phase * 0.74) * 0.012 +
      Math.sin(angle * 7 - phase * 0.41) * 0.008 +
      Math.sin(angle * 11 + phase * 0.18) * 0.004;
    const r = radius * (1 + ripple);
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function fillCellBody(cell, x, y, radius, alpha = 1) {
  const colors = cellPalette(cell);
  const cytoplasm = ctx.createRadialGradient(
    x - radius * 0.23,
    y - radius * 0.28,
    radius * 0.08,
    x,
    y,
    radius,
  );
  cytoplasm.addColorStop(0, colors.cytoplasmA);
  cytoplasm.addColorStop(1, colors.cytoplasmB);

  ctx.save();
  ctx.globalAlpha *= alpha * (cell.phase === 'dormant' ? 0.45 : 1);
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = radius * 0.22;
  wobblePath(x, y, radius, state.simTime + cell.visualSeed * 0.00001);
  ctx.fillStyle = cytoplasm;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = colors.membrane;
  ctx.lineWidth = Math.max(1.3, radius * 0.018);
  ctx.stroke();
  ctx.strokeStyle = colors.membraneInner;
  ctx.lineWidth = Math.max(0.8, radius * 0.008);
  wobblePath(x, y, radius * 0.968, state.simTime + cell.visualSeed * 0.00001 + 1.1);
  ctx.stroke();
  ctx.restore();
}

function drawInternalLife(cell, geometry, colors, alpha = 1) {
  if (geometry.radius < 19 || cell.phase === 'dormant') return;
  const pulse = 1 + Math.sin(state.simTime * 1.7 + cell.visualSeed) * 0.018;
  const nucleusRadius = geometry.radius * 0.29 * pulse;
  const nucleusX = geometry.x - geometry.radius * 0.08;
  const nucleusY = geometry.y + Math.sin(state.simTime * 0.41 + cell.visualSeed) * geometry.radius * 0.025;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = cellPalette(cell).nucleus;
  ctx.beginPath();
  ctx.arc(nucleusX, nucleusY, nucleusRadius, 0, TAU);
  ctx.fill();

  if (geometry.radius > 29) {
    ctx.strokeStyle = colors.dna;
    ctx.lineWidth = Math.max(0.8, geometry.radius * 0.012);
    ctx.globalAlpha = alpha * 0.78;
    ctx.beginPath();
    for (let index = 0; index <= 28; index += 1) {
      const t = index / 28;
      const angle = t * TAU * 2.1 + state.simTime * 0.16 + cell.visualSeed;
      const x = nucleusX + (t - 0.5) * nucleusRadius * 1.4;
      const y = nucleusY + Math.sin(angle) * nucleusRadius * 0.28;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const particleCount = Math.min(34, Math.max(10, Math.floor(geometry.radius * 0.32)));
  for (let index = 0; index < particleCount; index += 1) {
    const seed = cell.visualSeed * 0.0001 + index * 17.37;
    const angle = seededUnit(seed) * TAU + state.simTime * (0.012 + seededUnit(seed + 2) * 0.015);
    const distance = Math.sqrt(seededUnit(seed + 1)) * geometry.radius * 0.71;
    const x = geometry.x + Math.cos(angle) * distance;
    const y = geometry.y + Math.sin(angle) * distance;
    const kind = index % 9;
    ctx.fillStyle = kind === 0 ? colors.enzyme : kind === 4 ? colors.ribosome : colors.protein;
    ctx.globalAlpha = alpha * (0.28 + cell.energy * 0.48);
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + seededUnit(seed + 4) * Math.max(1.2, geometry.radius * 0.035), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawChannels(cell, geometry) {
  if (geometry.radius < 22 || cell.phase === 'dormant') return;
  const colors = cellPalette(cell);
  const channelCount = Math.round(7 + cell.traits.uptake * 5);
  ctx.save();
  ctx.translate(geometry.x, geometry.y);
  for (let index = 0; index < channelCount; index += 1) {
    const angle = index / channelCount * TAU + state.simTime * 0.015 + cell.visualSeed;
    const jitter = Math.sin(index * 4.7 + state.simTime * 0.12) * 0.02;
    const radius = geometry.radius * (1 + jitter);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = colors.membrane;
    ctx.globalAlpha = 0.28 + clamp(cell.traits.uptake - 0.72) * 0.48;
    const size = clamp(geometry.radius * 0.032, 1.3, 3.2);
    ctx.fillRect(-size, -1, size * 2, 2);
    ctx.rotate(-angle);
    ctx.translate(-x, -y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawSelection(cell, geometry, colors, strong = true) {
  ctx.save();
  ctx.strokeStyle = colors.selection;
  ctx.globalAlpha = strong ? 0.9 : 0.34;
  ctx.lineWidth = strong ? 1.4 : 1;
  ctx.setLineDash(strong ? [3, 5] : [2, 7]);
  ctx.lineDashOffset = -state.simTime * 0.8;
  ctx.beginPath();
  ctx.arc(geometry.x, geometry.y, geometry.radius + (strong ? 9 : 6), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawCell(cell, colors) {
  const geometry = cellGeometry(cell);
  if (cell.phase === 'dividing') {
    const progress = clamp(cell.divisionProgress);
    const eased = progress * progress * (3 - 2 * progress);
    const lobeRadius = geometry.radius * (1 - eased * 0.24);
    const offset = geometry.radius * eased * 0.64;
    const angle = cell.driftPhase;
    const dx = Math.cos(angle) * offset;
    const dy = Math.sin(angle) * offset;
    fillCellBody(cell, geometry.x - dx, geometry.y - dy, lobeRadius, 1);
    fillCellBody(cell, geometry.x + dx, geometry.y + dy, lobeRadius, 0.96);
    drawInternalLife(cell, { x: geometry.x - dx, y: geometry.y - dy, radius: lobeRadius }, colors, 0.76);
    drawInternalLife(cell, { x: geometry.x + dx, y: geometry.y + dy, radius: lobeRadius }, colors, 0.62);
  } else {
    fillCellBody(cell, geometry.x, geometry.y, geometry.radius, 1);
    drawInternalLife(cell, geometry, colors);
    drawChannels(cell, geometry);
  }

  if (cell.id === state.selectedCellId) drawSelection(cell, geometry, colors, true);
  else if (cell.id === hoverCellId) drawSelection(cell, geometry, colors, false);
}

function render() {
  const colors = palette();
  ctx.clearRect(0, 0, width, height);
  drawBackground(colors);
  feeders.forEach((feeder) => drawFeeder(feeder, colors));
  const orderedCells = [...state.cells].sort((first, second) => {
    if (first.id === state.selectedCellId) return 1;
    if (second.id === state.selectedCellId) return -1;
    return first.mass - second.mass;
  });
  orderedCells.forEach((cell) => drawCell(cell, colors));
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (!manualStepping) update(dt);
  render();
  requestAnimationFrame(frame);
}

function setSpeed(nextSpeed) {
  speed = nextSpeed;
  if (speed > 0) previousSpeed = speed;
  speedButtons.forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.speed) === speed);
  });
  pauseButton.classList.toggle('paused', speed === 0);
  pauseButton.setAttribute('aria-label', speed === 0 ? 'Resume simulation' : 'Pause simulation');
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  themeButton.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

function initializeTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(stored || (systemDark ? 'dark' : 'light'));
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.querySelector('.microscope-card').requestFullscreen();
  }
}

function cellAtCanvasPoint(x, y) {
  const ordered = [...state.cells].sort((first, second) => second.id - first.id);
  for (const cell of ordered) {
    const geometry = cellGeometry(cell);
    if (Math.hypot(x - geometry.x, y - geometry.y) <= geometry.radius * 1.12) return cell;
  }
  return null;
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

feedButton.addEventListener('click', addFeederBurst);
pauseButton.addEventListener('click', () => setSpeed(speed === 0 ? previousSpeed : 0));
speedButtons.forEach((button) => {
  button.addEventListener('click', () => setSpeed(Number(button.dataset.speed)));
});
themeButton.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
fullscreenButton.addEventListener('click', toggleFullscreen);
canvas.addEventListener('pointerdown', (event) => {
  const point = canvasPoint(event);
  const cell = cellAtCanvasPoint(point.x, point.y);
  if (!cell) return;
  state.selectedCellId = cell.id;
  updateUi();
  saveState();
});
canvas.addEventListener('pointermove', (event) => {
  const point = canvasPoint(event);
  const cell = cellAtCanvasPoint(point.x, point.y);
  hoverCellId = cell?.id || null;
  canvas.style.cursor = cell ? 'pointer' : 'crosshair';
});
canvas.addEventListener('pointerleave', () => {
  hoverCellId = null;
  canvas.style.cursor = 'crosshair';
});
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  window.setTimeout(resizeCanvas, 30);
});
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey) toggleFullscreen();
  if (event.key === ' ') {
    event.preventDefault();
    setSpeed(speed === 0 ? previousSpeed : 0);
  }
});
window.addEventListener('resize', resizeCanvas);
window.addEventListener('beforeunload', saveState);

function textCell(cell) {
  const geometry = cellGeometry(cell);
  return {
    id: cell.id,
    specimen: cell.specimenId,
    selected: cell.id === state.selectedCellId,
    parentId: cell.parentId,
    generation: cell.generation,
    offspring: cell.offspring,
    x: Number(geometry.x.toFixed(1)),
    y: Number(geometry.y.toFixed(1)),
    radius: Number(geometry.radius.toFixed(1)),
    mass: Number(cell.mass.toFixed(3)),
    energy: Number(cell.energy.toFixed(3)),
    nutrients: Number(cell.nutrients.toFixed(3)),
    health: Number(cell.health.toFixed(3)),
    phase: phaseLabel(cell),
    uptake: Number(cell.traits.uptake.toFixed(3)),
    mutations: cell.mutations.length,
    divisionProgress: Number(cell.divisionProgress.toFixed(3)),
  };
}

window.render_game_to_text = () => {
  const cell = selectedCell();
  return JSON.stringify({
    coordinateSystem: 'Canvas origin is top-left; x increases right, y increases down. Click a cell to inspect it.',
    mode: speed === 0 ? 'paused' : 'observing',
    speed,
    culture: {
      id: state.cultureId,
      ageHours: Number(state.ageHours.toFixed(2)),
      population: state.cells.length,
      totalDivisions: state.totalDivisions,
      maxGeneration: Math.max(...state.cells.map((candidate) => candidate.generation)),
      selectedCellId: state.selectedCellId,
    },
    selectedCell: textCell(cell),
    cells: state.cells.map(textCell),
    visibleFeeders: feeders.slice(0, 28).map((feeder) => ({
      x: Number((feeder.x * width).toFixed(1)),
      y: Number((feeder.y * height).toFixed(1)),
      radius: Number(feeder.radius.toFixed(1)),
    })),
    recentEvent: state.events.at(-1)?.message || null,
  });
};

window.advanceTime = (milliseconds) => {
  manualStepping = true;
  const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) update(1 / 60);
  render();
  updateUi();
  manualStepping = false;
};

initializeTheme();
applyOfflineProgress();
resizeCanvas();
updateUi();
for (let index = 0; index < 14; index += 1) spawnFeeder(false);
requestAnimationFrame(frame);
