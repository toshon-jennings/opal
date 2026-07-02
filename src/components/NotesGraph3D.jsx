import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Billboard } from '@react-three/drei';
import { Settings, X, Share2, Link2, Crosshair, FileText, ArrowUpRight, Palette } from 'lucide-react';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';
import { useTheme } from '../context/ThemeContext';

/* Perci Notes — 3D knowledge graph.
 * Renders every note as a node and every [[wikilink]] / md-link as an edge,
 * laid out with a small hand-rolled velocity-Verlet force simulation (no
 * external graph/physics deps). Interactions: orbit/zoom (OrbitControls),
 * hover to highlight a node + its neighbours, drag to reposition, click to
 * open the note. A persisted settings panel drives physics + appearance. */

const SETTINGS_KEY = 'perci_notes_graph_settings';

const SAMPLES = 12;     // points sampled per bezier edge
const MAX_PULSES = 3;   // buffer sized for max; we only fill pulsesPerEdge
const TRAIL_LENGTH = 3; // particle trail length for pulses
const MAX_RIPPLE_POINTS = 200; // max concurrent interactive ripple pulses

const DEFAULT_SETTINGS = {
    dimensions: '3d',      // '2d' | '3d'
    linkDistance: 18,
    repulsion: 240,
    centerGravity: 0.045,
    nodeSize: 1,
    sizeByDegree: true,
    colorMode: 'cluster',  // 'accent' | 'degree' | 'cluster'
    linkOpacity: 0.3,
    labelMode: 'smart',    // 'hidden' | 'smart' | 'all'
    labelThreshold: 2,
    autoRotate: false,
    rotateSpeed: 0.6,
    glow: 0.7,
    includeUnlinked: false,
    includeSharedTags: false,
    curvature: 0.28,       // 0 = straight, ~0.3 = nice bow
    pulses: true,          // traveling lights on edges
    pulseSpeed: 0.35,      // 0.05-1
    pulsesPerEdge: 1,      // 1-3
    twinkle: true,         // idle node light-up
    nodeGlow: true,        // additive halo behind nodes
    starfield: true,       // space backdrop
    shootingStars: true,   // periodic shooting stars
    shootingStarSpeed: 1.0, // speed multiplier
    shootingStarFreq: 1.0,  // spawn rate multiplier
    rippleWave: true,      // interactive ripple wave on hover
    colorMatchedPulses: true, // pulses inherit cluster color
    pulseTails: true,      // shooting star trails
    edgeTension: true,     // stress color shifts on edges
};

const CLUSTER_PALETTE = [
    '#C5692D', '#39C0C8', '#A78BFA', '#F472B6', '#34D399', '#FBBF24',
    '#60A5FA', '#FB7185', '#4ADE80', '#E879F9', '#22D3EE', '#FB923C',
];

function loadSettings() {
    try {
        const raw = readStringStorage(SETTINGS_KEY, '{}');
        if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
}

const lerp = (a, b, t) => a + (b - a) * t;

// Quadratic bezier evaluator — writes into out at offset o.
function bezierInto(out, o, ax, ay, az, cx, cy, cz, bx, by, bz, t) {
    const mt = 1 - t, a = mt * mt, b = 2 * mt * t, c = t * t;
    out[o]     = a * ax + b * cx + c * bx;
    out[o + 1] = a * ay + b * cy + c * by;
    out[o + 2] = a * az + b * cz + c * bz;
}

function hexToRgb(hex) {
    const h = (hex || '').replace('#', '');
    if (h.length < 6) return { r: 0.77, g: 0.41, b: 0.18 };
    return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255,
    };
}

// Build node / undirected-edge data from the notes graph.
function buildGraphData(noteIds, graph, includeUnlinked, includeSharedTags) {
    const idIndex = new Map();
    noteIds.forEach((id, i) => idIndex.set(id, i));

    const nodes = noteIds.map((id, i) => ({ id, idx: i, deg: 0, cluster: 0 }));
    const linkMap = new Map();

    const addLink = (a, b, weak, tag) => {
        if (a == null || b == null || a === b) return;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        const existing = linkMap.get(key);
        if (existing) {
            if (!weak) existing.weak = false;
            if (tag && !existing.tags.includes(tag)) existing.tags.push(tag);
            return;
        }
        linkMap.set(key, {
            s: Math.min(a, b),
            t: Math.max(a, b),
            weak: !!weak,
            tags: tag ? [tag] : [],
        });
    };

    Object.entries(graph.outgoing || {}).forEach(([from, set]) => {
        const a = idIndex.get(from);
        if (a == null || !set) return;
        set.forEach(to => addLink(a, idIndex.get(to), false));
    });

    if (includeUnlinked) {
        Object.entries(graph.unlinkedMentions || {}).forEach(([target, mentions]) => {
            const b = idIndex.get(target);
            if (b == null || !mentions) return;
            mentions.forEach(m => addLink(idIndex.get(m.fromNoteId), b, true));
        });
    }

    if (includeSharedTags) {
        Object.values(graph.notesByTag || {}).forEach(entry => {
            const noteIdsForTag = Array.isArray(entry?.notes) ? entry.notes : [];
            for (let i = 0; i < noteIdsForTag.length; i++) {
                for (let j = i + 1; j < noteIdsForTag.length; j++) {
                    addLink(idIndex.get(noteIdsForTag[i]), idIndex.get(noteIdsForTag[j]), true, entry.tag);
                }
            }
        });
    }

    const links = Array.from(linkMap.values());

    // Degree + connected-component clustering (union-find over solid links).
    const parent = nodes.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    links.forEach(l => {
        nodes[l.s].deg++; nodes[l.t].deg++;
        if (!l.weak) { const ra = find(l.s), rb = find(l.t); if (ra !== rb) parent[ra] = rb; }
    });
    const clusterIds = new Map();
    nodes.forEach(n => {
        const root = find(n.idx);
        if (!clusterIds.has(root)) clusterIds.set(root, clusterIds.size);
        n.cluster = clusterIds.get(root);
    });

    const maxDeg = nodes.reduce((m, n) => Math.max(m, n.deg), 0);
    return { nodes, links, maxDeg };
}

function nodeRadius(node, settings) {
    const base = settings.sizeByDegree ? 0.75 + Math.sqrt(node.deg) * 0.45 : 1.2;
    return base * settings.nodeSize;
}

function nodeColor(node, data, settings, theme) {
    if (settings.colorMode === 'accent') return theme.accent;
    if (settings.colorMode === 'degree') {
        const t = data.maxDeg ? node.deg / data.maxDeg : 0;
        const cold = hexToRgb(theme.cyan), hot = hexToRgb(theme.accent);
        const r = Math.round(lerp(cold.r, hot.r, t) * 255);
        const g = Math.round(lerp(cold.g, hot.g, t) * 255);
        const b = Math.round(lerp(cold.b, hot.b, t) * 255);
        return `rgb(${r},${g},${b})`;
    }
    return CLUSTER_PALETTE[node.cluster % CLUSTER_PALETTE.length];
}

/* --------------------------- starfield background --------------------------- */

function Starfield({ settings, theme }) {
    const starRef = useRef();
    const starCount = 350;

    const [starGeometry, starMaterial] = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(starCount * 3);
        const phase = new Float32Array(starCount);

        const r = 260;
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            pos[i * 3 + 2] = r * Math.cos(phi);

            phase[i] = Math.random() * Math.PI * 2;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));

        const mat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color() },
                uSize: { value: 5.5 },
                uPR: { value: Math.min(window.devicePixelRatio || 1, 2) }
            },
            vertexShader: `
                attribute float phase;
                uniform float uTime;
                uniform float uPR;
                uniform float uSize;
                varying float vOpacity;
                void main() {
                    vOpacity = 0.25 + 0.75 * sin(uTime * 0.8 + phase);
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mv;
                    gl_PointSize = uSize * uPR * (200.0 / max(-mv.z, 0.001));
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                varying float vOpacity;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    float a = smoothstep(0.5, 0.0, d);
                    gl_FragColor = vec4(uColor, a * vOpacity);
                }
            `
        });
        return [geo, mat];
    }, []);

    // Periodic Shooting Stars logic
    const shootingRef = useRef();
    const starsList = useRef([]);
    const lastSpawn = useRef(0);
    const nextSpawnDelay = useRef(2.5 + Math.random() * 3.5);

    const maxStars = 4;
    const [lineGeometry, linePositions, lineColors] = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(maxStars * 2 * 3);
        const cols = new Float32Array(maxStars * 2 * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        return [geo, pos, cols];
    }, []);

    useEffect(() => {
        if (!starMaterial) return;
        const color = theme.isDark 
            ? new THREE.Color(theme.text).lerp(new THREE.Color(theme.cyan), 0.15) 
            : new THREE.Color(theme.text).lerp(new THREE.Color('#94A3B8'), 0.5);
        starMaterial.uniforms.uColor.value = color;
    }, [theme, starMaterial]);

    useFrame((state, delta) => {
        const time = state.clock.elapsedTime;
        
        // Rotate background star points
        if (starRef.current) {
            starRef.current.rotation.y = time * 0.009;
            starRef.current.rotation.x = time * 0.005;
        }
        if (starMaterial) {
            starMaterial.uniforms.uTime.value = time;
        }

        // Update shooting stars
        const dt = Math.min(delta, 0.1);
        const list = starsList.current;
        if (!settings.shootingStars) {
            list.length = 0; // clear active stars instantly if disabled
        } else {
            for (let i = list.length - 1; i >= 0; i--) {
                const star = list[i];
                star.age += dt;
                if (star.age >= star.maxAge) {
                    list.splice(i, 1);
                }
            }
        }

        // Spawn periodic shooting stars
        if (settings.shootingStars && time - lastSpawn.current > nextSpawnDelay.current && list.length < maxStars) {
            // Horizontal spread: X from -90 to 50
            const startX = -90 + Math.random() * 140;
            // Always starts high up: Y from 70 to 100
            const startY = 70 + Math.random() * 30;
            // Depth spread: Z from -80 to 20
            const startZ = -80 + Math.random() * 100;
            
            const start = new THREE.Vector3(startX, startY, startZ);

            // Diagonal downward motion (moving downwards and to the right)
            const dir = new THREE.Vector3(
                0.5 + Math.random() * 0.4,   // moving rightward
                -0.8 - Math.random() * 0.3,  // moving downward
                (Math.random() * 2 - 1) * 0.3 // slight depth deviation
            ).normalize();

            // Speed, age, and trail length using multiplier settings
            const speedMultiplier = settings.shootingStarSpeed ?? 1.0;
            const baseSpeed = 190 + Math.random() * 100;
            const speed = baseSpeed * speedMultiplier;

            const baseMaxAge = 0.8 + Math.random() * 0.6;
            const maxAge = baseMaxAge / Math.sqrt(speedMultiplier); // adjust flight age to speed ratio
            const length = (16 + Math.random() * 10) * Math.min(speedMultiplier, 1.5);

            const colHex = Math.random() > 0.45 ? theme.cyan : theme.accent;
            const baseColor = new THREE.Color(colHex || '#39C0C8');

            list.push({
                start,
                dir,
                speed,
                age: 0,
                maxAge,
                length,
                color: baseColor
            });

            lastSpawn.current = time;
            const rateMultiplier = settings.shootingStarFreq ?? 1.0;
            const baseDelay = 1.5 + Math.random() * 2.5;
            nextSpawnDelay.current = baseDelay / Math.max(rateMultiplier, 0.05); // frequency scaling
        }

        // Populate lines geometry
        linePositions.fill(0);
        lineColors.fill(0);

        for (let i = 0; i < maxStars; i++) {
            const offsetPos = i * 2 * 3;
            const offsetCol = i * 2 * 3;

            if (i < list.length) {
                const star = list[i];
                const dist = star.speed * star.age;

                const hx = star.start.x + star.dir.x * dist;
                const hy = star.start.y + star.dir.y * dist;
                const hz = star.start.z + star.dir.z * dist;

                const tailDist = Math.max(0, dist - star.length);
                const tx = star.start.x + star.dir.x * tailDist;
                const ty = star.start.y + star.dir.y * tailDist;
                const tz = star.start.z + star.dir.z * tailDist;

                const lifeRatio = star.age / star.maxAge;
                const fade = Math.max(0, 1.0 - lifeRatio);

                // Vertex 0: Tail (black, fades visually due to additive blending)
                linePositions[offsetPos] = tx;
                linePositions[offsetPos + 1] = ty;
                linePositions[offsetPos + 2] = tz;

                lineColors[offsetCol] = 0;
                lineColors[offsetCol + 1] = 0;
                lineColors[offsetCol + 2] = 0;

                // Vertex 1: Head (bright color, fades over time)
                linePositions[offsetPos + 3] = hx;
                linePositions[offsetPos + 4] = hy;
                linePositions[offsetPos + 5] = hz;

                lineColors[offsetCol + 3] = star.color.r * fade * 1.5;
                lineColors[offsetCol + 4] = star.color.g * fade * 1.5;
                lineColors[offsetCol + 5] = star.color.b * fade * 1.5;
            } else {
                // Park offscreen
                linePositions[offsetPos + 1] = 1e6;
                linePositions[offsetPos + 4] = 1e6;
            }
        }

        if (shootingRef.current) {
            const geo = shootingRef.current.geometry;
            geo.getAttribute('position').needsUpdate = true;
            geo.getAttribute('color').needsUpdate = true;
            geo.setDrawRange(0, list.length * 2);
        }
    });

    if (settings.dimensions !== '3d') return null;

    return (
        <group>
            <points ref={starRef} geometry={starGeometry} material={starMaterial} />
            {settings.starfield && settings.shootingStars && (
                <lineSegments ref={shootingRef} geometry={lineGeometry}>
                    <lineBasicMaterial
                        vertexColors
                        transparent
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </lineSegments>
            )}
        </group>
    );
}

/* ----------------------------- 3D scene ----------------------------- */

function GraphScene({ data, settings, theme, hovered, setHovered, neighbors, activeNoteId, onOpenNote, selectedNodeId, setSelectedNodeId, onUpdateCoords }) {
    const { gl, camera } = useThree();
    const controlsRef = useRef();
    const groupRefs = useRef([]);
    const matRefs = useRef([]);
    const lineRef = useRef();
    const hlLineRef = useRef();
    const pulseRef = useRef();
    const nodeGlowRef = useRef();
    const rippleRef = useRef();
    const sim = useRef(null);
    const dragRef = useRef(null);

    const focusNodeIdx = useRef(null);

    // Precalculate node colors for fast lookup in useFrame (especially for colored pulses)
    const nodeColors = useMemo(() => {
        return data.nodes.map(node => {
            const c = nodeColor(node, data, settings, theme);
            return new THREE.Color(c);
        });
    }, [data, settings, theme]);

    // Track index of the selected node for camera focus
    useEffect(() => {
        if (selectedNodeId != null) {
            const idx = data.nodes.findIndex(n => n.id === selectedNodeId);
            focusNodeIdx.current = idx !== -1 ? idx : null;
            if (sim.current) sim.current.alpha = Math.max(sim.current.alpha, 0.2);
        } else {
            focusNodeIdx.current = null;
        }
    }, [selectedNodeId, data]);

    // Push coordinates to parent on selection change
    useEffect(() => {
        if (selectedNodeId && sim.current) {
            const idx = data.nodes.findIndex(n => n.id === selectedNodeId);
            if (idx !== -1) {
                const p = sim.current.pts[idx];
                if (p) onUpdateCoords({ x: p.x, y: p.y, z: p.z });
            }
        } else {
            onUpdateCoords(null);
        }
    }, [selectedNodeId, data, onUpdateCoords]);

    // Background click on Canvas to deselect selected node
    useEffect(() => {
        const handler = (e) => {
            if (e.target === gl.domElement) {
                setSelectedNodeId(null);
            }
        };
        gl.domElement.addEventListener('click', handler);
        return () => gl.domElement.removeEventListener('click', handler);
    }, [gl, setSelectedNodeId]);

    // (Re)initialise the simulation whenever the node/edge set changes.
    useEffect(() => {
        const n = data.nodes.length;
        const radius = 6 + Math.cbrt(Math.max(1, n)) * 9;
        const pts = data.nodes.map(() => {
            const u = Math.random(), v = Math.random();
            const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
            const rr = radius * Math.cbrt(Math.random());
            return {
                x: rr * Math.sin(ph) * Math.cos(th),
                y: rr * Math.sin(ph) * Math.sin(th),
                z: settings.dimensions === '2d' ? 0 : rr * Math.cos(ph),
                vx: 0, vy: 0, vz: 0, fx: null, fy: null, fz: null,
            };
        });
        sim.current = {
            pts,
            alpha: 1,
            linePos: new Float32Array(data.links.length * (SAMPLES - 1) * 2 * 3),
            lineColors: new Float32Array(data.links.length * (SAMPLES - 1) * 2 * 3),
            pulsePos: new Float32Array(data.links.length * MAX_PULSES * TRAIL_LENGTH * 3),
            pulseColors: new Float32Array(data.links.length * MAX_PULSES * TRAIL_LENGTH * 3),
            pulseAlphas: new Float32Array(data.links.length * MAX_PULSES * TRAIL_LENGTH),
            pulseScales: new Float32Array(data.links.length * MAX_PULSES * TRAIL_LENGTH),
            nodeGlowPos: new Float32Array(data.nodes.length * 3),
            nodePhase: data.nodes.map(() => Math.random() * Math.PI * 2),
            edgeSeed: data.links.map(() => Math.random()),
            pulseRef: null,
            nodeGlowRef: null,
            
            // Interactive ripple wave state
            ripplePos: new Float32Array(MAX_RIPPLE_POINTS * 3),
            rippleRef: null,
            lastHovered: null,
            rippleStartTime: 0,
        };
        // Wire up geometry for pulse + glow points (refs may have already fired).
        if (pulseRef.current && !pulseRef.current.geometry.getAttribute('position')) {
            const geo = pulseRef.current.geometry;
            geo.setAttribute('position', new THREE.BufferAttribute(sim.current.pulsePos, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(sim.current.pulseColors, 3));
            geo.setAttribute('aAlpha', new THREE.BufferAttribute(sim.current.pulseAlphas, 1));
            geo.setAttribute('aScale', new THREE.BufferAttribute(sim.current.pulseScales, 1));
            const trailLen = settings.pulseTails ? TRAIL_LENGTH : 1;
            geo.setDrawRange(0, data.links.length * Math.min(settings.pulsesPerEdge, MAX_PULSES) * trailLen);
            sim.current.pulseRef = pulseRef.current;
        }
        if (nodeGlowRef.current && !nodeGlowRef.current.geometry.getAttribute('position')) {
            nodeGlowRef.current.geometry.setAttribute('position',
                new THREE.BufferAttribute(sim.current.nodeGlowPos, 3));
            sim.current.nodeGlowRef = nodeGlowRef.current;
        }
        if (rippleRef.current && !rippleRef.current.geometry.getAttribute('position')) {
            rippleRef.current.geometry.setAttribute('position',
                new THREE.BufferAttribute(sim.current.ripplePos, 3));
            sim.current.rippleRef = rippleRef.current;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    // Reheat the layout when physics-affecting settings change.
    useEffect(() => {
        if (sim.current) sim.current.alpha = Math.max(sim.current.alpha, 0.5);
    }, [settings.linkDistance, settings.repulsion, settings.centerGravity, settings.dimensions]);

    // Pointer drag — move a node in the camera-facing plane.
    const onNodeDown = useCallback((i, e) => {
        e.stopPropagation();
        if (!sim.current) return;
        dragRef.current = { i };
        if (controlsRef.current) controlsRef.current.enabled = false;
        const el = gl.domElement;
        const ndc = new THREE.Vector2();
        const ray = new THREE.Raycaster();
        const plane = new THREE.Plane();
        const normal = new THREE.Vector3();
        const hit = new THREE.Vector3();
        const move = (ev) => {
            const d = dragRef.current; if (!d || !sim.current) return;
            const rect = el.getBoundingClientRect();
            ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
            ray.setFromCamera(ndc, camera);
            camera.getWorldDirection(normal);
            const p = sim.current.pts[d.i];
            plane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(p.x, p.y, p.z));
            if (ray.ray.intersectPlane(plane, hit)) {
                p.fx = hit.x; p.fy = hit.y; p.fz = settings.dimensions === '2d' ? 0 : hit.z;
            }
            sim.current.alpha = Math.max(sim.current.alpha, 0.45);
        };
        const up = () => {
            const d = dragRef.current;
            if (d && sim.current) {
                const p = sim.current.pts[d.i];
                p.fx = p.fy = p.fz = null;
                if (selectedNodeId && data.nodes[d.i]?.id === selectedNodeId) {
                    onUpdateCoords({ x: p.x, y: p.y, z: p.z });
                }
            }
            dragRef.current = null;
            if (controlsRef.current) controlsRef.current.enabled = true;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }, [gl, camera, settings.dimensions, selectedNodeId, data.nodes, onUpdateCoords]);

    useFrame((state) => {
        const s = sim.current;
        if (!s) return;
        const pts = s.pts;
        const n = pts.length;
        const is2d = settings.dimensions === '2d';
        const time = state.clock.elapsedTime;

        if (s.alpha > 0.005) {
            const a = s.alpha;
            const rep = settings.repulsion;
            // Repulsion (O(n^2) — fine for typical vaults).
            for (let i = 0; i < n; i++) {
                const pi = pts[i];
                for (let j = i + 1; j < n; j++) {
                    const pj = pts[j];
                    let dx = pi.x - pj.x, dy = pi.y - pj.y, dz = pi.z - pj.z;
                    let d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 < 0.01) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = 0.01; }
                    const f = (rep * a) / d2;
                    const inv = 1 / Math.sqrt(d2);
                    const fx = dx * inv * f, fy = dy * inv * f, fz = dz * inv * f;
                    pi.vx += fx; pi.vy += fy; pi.vz += fz;
                    pj.vx -= fx; pj.vy -= fy; pj.vz -= fz;
                }
            }
            // Spring links.
            const ld = settings.linkDistance;
            for (let k = 0; k < data.links.length; k++) {
                const l = data.links[k];
                const pa = pts[l.s], pb = pts[l.t];
                let dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
                const strength = l.weak ? 0.18 : 0.5;
                const diff = ((dist - ld) / dist) * a * strength;
                const ox = dx * diff, oy = dy * diff, oz = dz * diff;
                pa.vx += ox; pa.vy += oy; pa.vz += oz;
                pb.vx -= ox; pb.vy -= oy; pb.vz -= oz;
            }
            // Centering gravity + integrate.
            const g = settings.centerGravity * a;
            for (let i = 0; i < n; i++) {
                const p = pts[i];
                p.vx -= p.x * g; p.vy -= p.y * g; p.vz -= p.z * g;
                if (p.fx != null) { p.x = p.fx; p.y = p.fy; p.z = p.fz; p.vx = p.vy = p.vz = 0; }
                else {
                    p.vx *= 0.6; p.vy *= 0.6; p.vz *= 0.6;
                    p.x += p.vx; p.y += p.vy; p.z += (is2d ? 0 : p.vz);
                }
                if (is2d) { p.z = 0; p.vz = 0; }
            }
            s.alpha *= 0.985;
            if (s.alpha < 0.005) s.alpha = 0;
        }

        // Write node group positions + per-node material highlight.
        const baseGlow = 0.25 + settings.glow * 0.6;
        for (let i = 0; i < n; i++) {
            const grp = groupRefs.current[i];
            if (grp) grp.position.set(pts[i].x, pts[i].y, pts[i].z);
            const mat = matRefs.current[i];
            if (mat) {
                const dim = neighbors && !neighbors.has(i);
                const isHot = neighbors && neighbors.has(i);
                const tw = settings.twinkle ? (0.5 + 0.5 * Math.sin(time * 1.6 + s.nodePhase[i])) : 0;
                const target = (isHot ? baseGlow + 0.8 : baseGlow) + tw * 0.45 * settings.glow;
                mat.opacity = lerp(mat.opacity, dim ? 0.12 : 1, 0.25);
                mat.emissiveIntensity = lerp(mat.emissiveIntensity, target, 0.2);
            }
        }

        // Node glow halo positions.
        if (settings.nodeGlow) {
            for (let i = 0; i < n; i++) {
                const o = i * 3;
                s.nodeGlowPos[o] = pts[i].x;
                s.nodeGlowPos[o + 1] = pts[i].y;
                s.nodeGlowPos[o + 2] = pts[i].z;
            }
            if (s.nodeGlowRef) {
                const attr = s.nodeGlowRef.geometry.getAttribute('position');
                if (attr) { attr.array.set(s.nodeGlowPos); attr.needsUpdate = true; }
            }
        }

        // Edge geometry (curved bezier) + pulse positions + stress-based color.
        const lp = s.linePos;
        const lc = s.lineColors;
        const seg = SAMPLES - 1;
        const themeText = new THREE.Color(theme.text);
        const themeAccent = new THREE.Color(theme.accent);
        const themeCyan = new THREE.Color(theme.cyan);
        const linkDist = settings.linkDistance;

        for (let kk = 0; kk < data.links.length; kk++) {
            const l = data.links[kk];
            const pa = pts[l.s], pb = pts[l.t];

            // Control point: midpoint pushed radially outward.
            const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, mz = (pa.z + pb.z) / 2;
            const ml = Math.hypot(mx, my, mz) || 1e-3;
            const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
            const k = settings.curvature * dist;
            const cx = mx + (mx / ml) * k, cy = my + (my / ml) * k, cz = mz + (mz / ml) * k;

            // Sample bezier into linePos buffer.
            const base = kk * seg * 2 * 3;
            for (let sIdx = 0; sIdx < seg; sIdx++) {
                const t0 = sIdx / seg, t1 = (sIdx + 1) / seg;
                bezierInto(lp, base + sIdx * 6,     pa.x, pa.y, pa.z, cx, cy, cz, pb.x, pb.y, pb.z, t0);
                bezierInto(lp, base + sIdx * 6 + 3, pa.x, pa.y, pa.z, cx, cy, cz, pb.x, pb.y, pb.z, t1);
            }

            // Spring tension color feedback.
            let edgeColor = themeText;
            if (settings.edgeTension) {
                const stress = (dist - linkDist) / linkDist; // positive = stretched, negative = compressed
                if (stress > 0.05) {
                    const t = Math.min(stress * 2.5, 0.85); // limit max color interpolation
                    edgeColor = new THREE.Color().lerpColors(themeText, themeAccent, t);
                } else if (stress < -0.05) {
                    const t = Math.min(Math.abs(stress) * 2.5, 0.85);
                    edgeColor = new THREE.Color().lerpColors(themeText, themeCyan, t);
                }
            }

            for (let sIdx = 0; sIdx < seg * 2; sIdx++) {
                const o = base + sIdx * 3;
                lc[o] = edgeColor.r;
                lc[o + 1] = edgeColor.g;
                lc[o + 2] = edgeColor.b;
            }

            // Traveling pulse lights.
            if (settings.pulses) {
                const seed = s.edgeSeed[kk];
                const kCount = Math.min(settings.pulsesPerEdge, MAX_PULSES);
                const trailLen = settings.pulseTails ? TRAIL_LENGTH : 1;
                const sourceColor = nodeColors[l.s] || new THREE.Color(theme.cyan);

                for (let j = 0; j < kCount; j++) {
                    const tp_base = (time * settings.pulseSpeed * 0.15 + seed + j / kCount) % 1;

                    for (let tIdx = 0; tIdx < trailLen; tIdx++) {
                        // Offset backward along the curve for trail particles
                        const tp = (tp_base - tIdx * 0.02 + 1) % 1;
                        const pulseIdx = (kk * MAX_PULSES * TRAIL_LENGTH + j * TRAIL_LENGTH + tIdx);

                        bezierInto(s.pulsePos, pulseIdx * 3,
                            pa.x, pa.y, pa.z, cx, cy, cz, pb.x, pb.y, pb.z, tp);

                        // Pulse color
                        if (settings.colorMatchedPulses) {
                            s.pulseColors[pulseIdx * 3] = sourceColor.r;
                            s.pulseColors[pulseIdx * 3 + 1] = sourceColor.g;
                            s.pulseColors[pulseIdx * 3 + 2] = sourceColor.b;
                        } else {
                            const cyanRgb = hexToRgb(theme.cyan);
                            s.pulseColors[pulseIdx * 3] = cyanRgb.r;
                            s.pulseColors[pulseIdx * 3 + 1] = cyanRgb.g;
                            s.pulseColors[pulseIdx * 3 + 2] = cyanRgb.b;
                        }

                        // Pulse alpha and scale decay along the trail
                        s.pulseAlphas[pulseIdx] = 1.0 - (tIdx / trailLen) * 0.65;
                        s.pulseScales[pulseIdx] = 1.0 - (tIdx / trailLen) * 0.55;
                    }
                }

                // Park unused pulse slots offscreen
                for (let j = 0; j < MAX_PULSES; j++) {
                    const activeSlots = j < kCount ? trailLen : 0;
                    for (let tIdx = activeSlots; tIdx < TRAIL_LENGTH; tIdx++) {
                        const pulseIdx = (kk * MAX_PULSES * TRAIL_LENGTH + j * TRAIL_LENGTH + tIdx);
                        s.pulsePos[pulseIdx * 3 + 1] = 1e6;
                        s.pulseAlphas[pulseIdx] = 0;
                    }
                }
            }
        }

        if (lineRef.current) {
            const posAttr = lineRef.current.geometry.getAttribute('position');
            const colAttr = lineRef.current.geometry.getAttribute('color');
            if (posAttr) { posAttr.array.set(lp); posAttr.needsUpdate = true; }
            if (colAttr) { colAttr.array.set(lc); colAttr.needsUpdate = true; }
        }

        if (settings.pulses && s.pulseRef) {
            const geo = s.pulseRef.geometry;
            const posAttr = geo.getAttribute('position');
            const colAttr = geo.getAttribute('color');
            const alpAttr = geo.getAttribute('aAlpha');
            const scaAttr = geo.getAttribute('aScale');
            if (posAttr && colAttr && alpAttr && scaAttr) {
                posAttr.array.set(s.pulsePos);
                posAttr.needsUpdate = true;
                colAttr.array.set(s.pulseColors);
                colAttr.needsUpdate = true;
                alpAttr.array.set(s.pulseAlphas);
                alpAttr.needsUpdate = true;
                scaAttr.array.set(s.pulseScales);
                scaAttr.needsUpdate = true;
                const trailLen = settings.pulseTails ? TRAIL_LENGTH : 1;
                geo.setDrawRange(0, data.links.length * Math.min(settings.pulsesPerEdge, MAX_PULSES) * trailLen);
            }
        }

        // Interactive ripple wave logic
        if (settings.rippleWave) {
            if (hovered !== s.lastHovered) {
                if (hovered != null) {
                    s.lastHovered = hovered;
                    s.rippleStartTime = time;
                } else {
                    s.lastHovered = null;
                }
            }

            let activeRippleCount = 0;
            if (s.lastHovered != null) {
                const dt = time - s.rippleStartTime;
                const tp = dt * 2.2; // traverse speed (shockwave crosses link in ~0.45s)
                if (tp < 1.0) {
                    for (let k = 0; k < data.links.length; k++) {
                        const l = data.links[k];
                        if (l.s === s.lastHovered || l.t === s.lastHovered) {
                            if (activeRippleCount >= MAX_RIPPLE_POINTS) break;

                            const pa = pts[l.s], pb = pts[l.t];
                            const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, mz = (pa.z + pb.z) / 2;
                            const ml = Math.hypot(mx, my, mz) || 1e-3;
                            const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
                            const curveK = settings.curvature * dist;
                            const cx = mx + (mx / ml) * curveK, cy = my + (my / ml) * curveK, cz = mz + (mz / ml) * curveK;

                            const progress = l.s === s.lastHovered ? tp : 1.0 - tp;
                            bezierInto(s.ripplePos, activeRippleCount * 3, pa.x, pa.y, pa.z, cx, cy, cz, pb.x, pb.y, pb.z, progress);
                            activeRippleCount++;
                        }
                    }
                }
            }

            for (let i = activeRippleCount; i < MAX_RIPPLE_POINTS; i++) {
                s.ripplePos[i * 3 + 1] = 1e6;
            }

            if (s.rippleRef) {
                const posAttr = s.rippleRef.geometry.getAttribute('position');
                if (posAttr) {
                    posAttr.array.set(s.ripplePos);
                    posAttr.needsUpdate = true;
                    s.rippleRef.geometry.setDrawRange(0, activeRippleCount);
                }
            }
        }

        // Highlighted edges for the hovered node (also curved).
        if (hlLineRef.current) {
            if (hovered != null) {
                const inc = [];
                for (let k = 0; k < data.links.length; k++) {
                    const l = data.links[k];
                    if (l.s === hovered || l.t === hovered) {
                        const pa = pts[l.s], pb = pts[l.t];
                        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, mz = (pa.z + pb.z) / 2;
                        const ml = Math.hypot(mx, my, mz) || 1e-3;
                        const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
                        const kk = settings.curvature * dist;
                        const cx = mx + (mx / ml) * kk, cy = my + (my / ml) * kk, cz = mz + (mz / ml) * kk;
                        for (let sIdx = 0; sIdx < seg; sIdx++) {
                            const t0 = sIdx / seg, t1 = (sIdx + 1) / seg;
                            const o0 = inc.length;
                            inc.push(0, 0, 0);
                            bezierInto(inc, o0, pa.x, pa.y, pa.z, cx, cy, cz, pb.x, pb.y, pb.z, t0);
                            const o1 = inc.length;
                            inc.push(0, 0, 0);
                            bezierInto(inc, o1, pa.x, pa.y, pa.z, cx, cy, cz, pb.x, pb.y, pb.z, t1);
                        }
                    }
                }
                const arr = new Float32Array(inc);
                hlLineRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
                hlLineRef.current.geometry.setDrawRange(0, inc.length / 3);
                hlLineRef.current.visible = inc.length > 0;
            } else {
                hlLineRef.current.visible = false;
            }
        }

        // Camera focus target interpolation
        if (focusNodeIdx.current !== null && pts[focusNodeIdx.current] && controlsRef.current) {
            const p = pts[focusNodeIdx.current];
            const target = controlsRef.current.target;
            target.x = lerp(target.x, p.x, 0.08);
            target.y = lerp(target.y, p.y, 0.08);
            target.z = lerp(target.z, p.z, 0.08);
            controlsRef.current.update();
        }
    });

    const shouldLabel = (node) => {
        if (settings.labelMode === 'all') return true;
        if (neighbors && neighbors.has(node.idx)) return true;
        if (node.id === activeNoteId) return true;
        if (node.id === selectedNodeId) return true;
        if (settings.labelMode === 'smart') return node.deg >= settings.labelThreshold;
        return false;
    };

    return (
        <>
            {settings.starfield && <Starfield settings={settings} theme={theme} />}

            <ambientLight intensity={0.85} />
            <pointLight position={[40, 60, 60]} intensity={1.1} />
            <pointLight position={[-50, -30, -40]} intensity={0.5} color={theme.cyan} />

            <lineSegments ref={lineRef} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        array={sim.current ? sim.current.linePos : new Float32Array(data.links.length * (SAMPLES - 1) * 2 * 3)}
                        count={data.links.length * (SAMPLES - 1) * 2}
                        itemSize={3}
                    />
                    <bufferAttribute
                        attach="attributes-color"
                        array={sim.current ? sim.current.lineColors : new Float32Array(data.links.length * (SAMPLES - 1) * 2 * 3)}
                        count={data.links.length * (SAMPLES - 1) * 2}
                        itemSize={3}
                    />
                </bufferGeometry>
                <lineBasicMaterial vertexColors transparent opacity={settings.linkOpacity} depthWrite={false} />
            </lineSegments>

            <lineSegments ref={hlLineRef} frustumCulled={false} visible={false}>
                <bufferGeometry />
                <lineBasicMaterial color={theme.accent} transparent opacity={0.9} depthWrite={false} />
            </lineSegments>

            {settings.pulses && (
                <points
                    ref={(el) => {
                        pulseRef.current = el;
                        if (sim.current) {
                            sim.current.pulseRef = el;
                            if (el && !el.geometry.getAttribute('position')) {
                                const geo = el.geometry;
                                geo.setAttribute('position', new THREE.BufferAttribute(sim.current.pulsePos, 3));
                                geo.setAttribute('color', new THREE.BufferAttribute(sim.current.pulseColors, 3));
                                geo.setAttribute('aAlpha', new THREE.BufferAttribute(sim.current.pulseAlphas, 1));
                                geo.setAttribute('aScale', new THREE.BufferAttribute(sim.current.pulseScales, 1));
                                const trailLen = settings.pulseTails ? TRAIL_LENGTH : 1;
                                geo.setDrawRange(0, data.links.length * Math.min(settings.pulsesPerEdge, MAX_PULSES) * trailLen);
                            }
                        }
                    }}
                    frustumCulled={false}
                >
                    <bufferGeometry />
                    <shaderMaterial
                        transparent
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                        uniforms={{
                            uSize: { value: 14 },
                            uPR: { value: Math.min(window.devicePixelRatio || 1, 2) },
                        }}
                        vertexShader={`
                            attribute float aAlpha;
                            attribute float aScale;
                            attribute vec3 color;
                            uniform float uSize; uniform float uPR;
                            varying float vAlpha;
                            varying vec3 vColor;
                            void main() {
                                vAlpha = aAlpha;
                                vColor = color;
                                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                                gl_Position = projectionMatrix * mv;
                                gl_PointSize = uSize * aScale * uPR * (300.0 / max(-mv.z, 0.001));
                            }`}
                        fragmentShader={`
                            varying float vAlpha;
                            varying vec3 vColor;
                            void main() {
                                float d = length(gl_PointCoord - vec2(0.5));
                                float a = smoothstep(0.5, 0.0, d); a = pow(a, 1.6);
                                gl_FragColor = vec4(vColor, a * vAlpha);
                            }`}
                    />
                </points>
            )}

            {settings.rippleWave && (
                <points
                    ref={(el) => {
                        rippleRef.current = el;
                        if (sim.current) {
                            sim.current.rippleRef = el;
                            if (el && !el.geometry.getAttribute('position')) {
                                el.geometry.setAttribute('position',
                                    new THREE.BufferAttribute(sim.current.ripplePos, 3));
                            }
                        }
                    }}
                    frustumCulled={false}
                >
                    <bufferGeometry />
                    <shaderMaterial
                        transparent
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                        uniforms={{
                            uColor: { value: new THREE.Color(theme.accent) },
                            uSize: { value: 34 },
                            uPR: { value: Math.min(window.devicePixelRatio || 1, 2) },
                        }}
                        vertexShader={`
                            uniform float uSize; uniform float uPR;
                            void main() {
                                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                                gl_Position = projectionMatrix * mv;
                                gl_PointSize = uSize * uPR * (300.0 / max(-mv.z, 0.001));
                            }`}
                        fragmentShader={`
                            uniform vec3 uColor;
                            void main() {
                                float d = length(gl_PointCoord - vec2(0.5));
                                float ring = smoothstep(0.5, 0.4, d) * smoothstep(0.3, 0.4, d);
                                float core = smoothstep(0.2, 0.0, d) * 0.8;
                                float a = ring + core;
                                gl_FragColor = vec4(uColor, a);
                            }`}
                    />
                </points>
            )}

            {settings.nodeGlow && (
                <points
                    ref={(el) => {
                        nodeGlowRef.current = el;
                        if (sim.current) {
                            sim.current.nodeGlowRef = el;
                            if (el && !el.geometry.getAttribute('position')) {
                                el.geometry.setAttribute('position',
                                    new THREE.BufferAttribute(sim.current.nodeGlowPos, 3));
                            }
                        }
                    }}
                    frustumCulled={false}
                >
                    <bufferGeometry />
                    <shaderMaterial
                        transparent
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                        uniforms={{
                            uColor: { value: new THREE.Color(theme.accent) },
                            uSize: { value: 10 },
                            uPR: { value: Math.min(window.devicePixelRatio || 1, 2) },
                        }}
                        vertexShader={`
                            uniform float uSize; uniform float uPR;
                            void main() {
                                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                                gl_Position = projectionMatrix * mv;
                                gl_PointSize = uSize * uPR * (300.0 / max(-mv.z, 0.001));
                            }`}
                        fragmentShader={`
                            uniform vec3 uColor;
                            void main() {
                                float d = length(gl_PointCoord - vec2(0.5));
                                float a = smoothstep(0.5, 0.0, d); a = pow(a, 1.6);
                                gl_FragColor = vec4(uColor, a);
                            }`}
                    />
                </points>
            )}

            {data.nodes.map((node, i) => {
                const r = nodeRadius(node, settings);
                const isActive = node.id === activeNoteId;
                const color = isActive ? theme.cyan : nodeColor(node, data, settings, theme);
                return (
                    <group key={node.id} ref={el => (groupRefs.current[i] = el)}>
                        <mesh
                            scale={r}
                            onPointerOver={(e) => { e.stopPropagation(); setHovered(i); gl.domElement.style.cursor = 'pointer'; }}
                            onPointerOut={() => { setHovered(null); gl.domElement.style.cursor = 'grab'; }}
                            onPointerDown={(e) => onNodeDown(i, e)}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!dragRef.current) {
                                    setSelectedNodeId(node.id);
                                }
                            }}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                onOpenNote(node.id);
                            }}
                        >
                            <sphereGeometry args={[1, 18, 18]} />
                            <meshStandardMaterial
                                ref={el => (matRefs.current[i] = el)}
                                color={color}
                                emissive={color}
                                emissiveIntensity={0.4}
                                roughness={0.35}
                                metalness={0.1}
                                transparent
                                opacity={1}
                            />
                        </mesh>
                        {isActive && (
                            <mesh scale={r * 1.5}>
                                <sphereGeometry args={[1, 18, 18]} />
                                <meshBasicMaterial color={theme.cyan} transparent opacity={0.12} depthWrite={false} />
                            </mesh>
                        )}
                        {shouldLabel(node) && (
                            <Billboard position={[0, r + 1.6, 0]}>
                                <Text
                                    fontSize={2.1}
                                    color={theme.text}
                                    anchorX="center"
                                    anchorY="middle"
                                    outlineWidth={0.06}
                                    outlineColor="#000000"
                                    maxWidth={26}
                                >
                                    {node.id}
                                </Text>
                            </Billboard>
                        )}
                    </group>
                );
            })}

            <OrbitControls
                ref={controlsRef}
                enableDamping
                dampingFactor={0.12}
                rotateSpeed={0.7}
                autoRotate={settings.autoRotate}
                autoRotateSpeed={settings.rotateSpeed}
                makeDefault
                onStart={() => { focusNodeIdx.current = null; }}
            />
        </>
    );
}

/* --------------------------- settings panel --------------------------- */

function SliderRow({ label, value, min, max, step, onChange, format }) {
    return (
        <label className="block">
            <div className="flex justify-between text-[11px] text-[var(--text-secondary)] mb-1">
                <span>{label}</span>
                <span className="font-mono text-[var(--text-tertiary)]">{format ? format(value) : value}</span>
            </div>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full accent-[var(--accent)] cursor-pointer"
            />
        </label>
    );
}

function ToggleRow({ label, checked, onChange }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className="w-full flex items-center justify-between text-[11px] text-[var(--text-secondary)] py-1"
        >
            <span>{label}</span>
            <span className={`relative h-4 w-7 rounded-full transition-colors ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)] border border-[var(--border)]'}`}>
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
            </span>
        </button>
    );
}

function Segmented({ label, value, options, onChange }) {
    return (
        <div>
            <div className="text-[11px] text-[var(--text-secondary)] mb-1">{label}</div>
            <div className="flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--bg-primary)]">
                {options.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={`flex-1 px-2 py-1 rounded-md text-[11px] capitalize transition-all ${
                            value === opt.value
                                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold shadow-sm'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ------------------------------ wrapper ------------------------------ */

export default function NotesGraph3D({ noteIds, graph, activeNoteId, onOpenNote, onClose }) {
    const containerRef = useRef(null);
    const [settings, setSettings] = useState(loadSettings);
    const [showSettings, setShowSettings] = useState(false);
    const [hovered, setHovered] = useState(null);
    const [recenterKey, setRecenterKey] = useState(0);
    const [theme, setTheme] = useState({ accent: '#C5692D', cyan: '#39C0C8', text: '#E8E8E8' });

    // Interactive overlays state
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [selectedNodeCoords, setSelectedNodeCoords] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showExplore, setShowExplore] = useState(true);
    const [showLegend, setShowLegend] = useState(true);

    const data = useMemo(
        () => buildGraphData(noteIds, graph, settings.includeUnlinked, settings.includeSharedTags),
        [noteIds, graph, settings.includeUnlinked, settings.includeSharedTags]
    );

    const neighbors = useMemo(() => {
        if (hovered == null) return null;
        const set = new Set([hovered]);
        data.links.forEach(l => {
            if (l.s === hovered) set.add(l.t);
            else if (l.t === hovered) set.add(l.s);
        });
        return set;
    }, [hovered, data.links]);

    // Compute neighbors for details panel
    const selectedNodeNeighbors = useMemo(() => {
        if (!selectedNodeId) return [];
        const nList = [];
        data.links.forEach(l => {
            const sourceNode = data.nodes[l.s];
            const targetNode = data.nodes[l.t];
            if (sourceNode && targetNode) {
                if (sourceNode.id === selectedNodeId) {
                    nList.push({ id: targetNode.id, type: l.weak ? 'Mention' : 'Link' });
                } else if (targetNode.id === selectedNodeId) {
                    nList.push({ id: sourceNode.id, type: l.weak ? 'Mention' : 'Link' });
                }
            }
        });
        return nList;
    }, [selectedNodeId, data]);

    // Search filter
    const filteredNodes = useMemo(() => {
        if (!searchQuery.trim()) return [];
        return data.nodes.filter(n => n.id.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [searchQuery, data.nodes]);

    const { isDarkMode } = useTheme();

    // Resolve theme colors from the (themed) container so CSS vars inherit.
    useEffect(() => {
        if (!containerRef.current) return;
        const cs = getComputedStyle(containerRef.current);
        const get = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
        setTheme({
            accent: get('--accent', '#C5692D'),
            cyan: get('--accent-cyan', '#39C0C8'),
            text: get('--text-primary', '#E8E8E8'),
            isDark: isDarkMode,
        });
    }, [isDarkMode]);

    useEffect(() => {
        try { writeStringStorage(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
    }, [settings]);

    const set = (patch) => setSettings(s => ({ ...s, ...patch }));
    const hoveredNode = hovered != null ? data.nodes[hovered] : null;

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full overflow-hidden"
            style={{ background: 'radial-gradient(circle at 50% 35%, var(--bg-secondary), var(--bg-primary) 70%)' }}
        >
            {data.nodes.length > 0 ? (
                <Canvas
                    key={recenterKey}
                    camera={{ position: [0, 0, 90], fov: 55, near: 0.1, far: 4000 }}
                    gl={{ alpha: true, antialias: true }}
                    dpr={[1, 2]}
                >
                    <GraphScene
                        data={data}
                        settings={settings}
                        theme={theme}
                        hovered={hovered}
                        setHovered={setHovered}
                        neighbors={neighbors}
                        activeNoteId={activeNoteId}
                        onOpenNote={onOpenNote}
                        selectedNodeId={selectedNodeId}
                        setSelectedNodeId={setSelectedNodeId}
                        onUpdateCoords={setSelectedNodeCoords}
                    />
                </Canvas>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-center text-[var(--text-tertiary)] text-sm">
                    No notes to graph yet.
                </div>
            )}

            {/* Top toolbar */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)]/80 backdrop-blur border border-[var(--border)] text-xs pointer-events-auto">
                    <Share2 size={13} className="text-[var(--accent)]" />
                    <span className="font-semibold text-[var(--text-primary)]">Knowledge Graph</span>
                    <span className="text-[var(--text-tertiary)]">·</span>
                    <span className="text-[var(--text-secondary)]">{data.nodes.length} notes</span>
                    <span className="text-[var(--text-tertiary)] flex items-center gap-1"><Link2 size={11} />{data.links.length}</span>
                </div>
                <div className="flex items-center gap-1.5 pointer-events-auto">
                    {/* Horizontal Legend items inline on the same row */}
                    {showLegend && (
                        <div className="flex items-center gap-3 px-3 py-1.5 mr-1 rounded-lg bg-[var(--bg-secondary)]/85 backdrop-blur border border-[var(--border)] text-[10px] text-[var(--text-secondary)] animate-in fade-in slide-in-from-right-3 duration-200">
                            {settings.colorMode === 'cluster' && (
                                <div className="flex items-center gap-3 border-r border-[var(--border)]/40 pr-3">
                                    {CLUSTER_PALETTE.slice(0, 6).map((color, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5 shrink-0">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                            <span className="text-[10px] text-[var(--text-secondary)] font-medium">Group {idx + 1}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {settings.colorMode === 'degree' && (
                                <div className="flex items-center gap-2 border-r border-[var(--border)]/40 pr-3">
                                    <span className="text-[10px] text-[var(--text-tertiary)]">Fewer Links</span>
                                    <div className="w-16 h-2 rounded bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent)]" />
                                    <span className="text-[10px] text-[var(--text-tertiary)]">More Links</span>
                                </div>
                            )}
                            {settings.colorMode === 'accent' && (
                                <div className="flex items-center gap-2 border-r border-[var(--border)]/40 pr-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                                    <span className="text-[10px] text-[var(--text-secondary)]">All Note Nodes</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-cyan)] shadow-[0_0_8px_var(--accent-cyan)]" style={{ backgroundColor: theme.cyan }} />
                                <span className="text-[10px] text-[var(--text-secondary)]">Active Note</span>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => setShowLegend(v => !v)}
                        title={showLegend ? "Minimize legend" : "Maximize legend"}
                        className={`p-2 rounded-lg backdrop-blur border transition-all ${
                            showLegend
                                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                                : 'bg-[var(--bg-secondary)]/80 border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        <Palette size={14} />
                    </button>
                    <button
                        onClick={() => setRecenterKey(k => k + 1)}
                        title="Recenter view"
                        className="p-2 rounded-lg bg-[var(--bg-secondary)]/80 backdrop-blur border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                    >
                        <Crosshair size={14} />
                    </button>
                    <button
                        onClick={() => setShowSettings(v => !v)}
                        title="Graph settings"
                        className={`p-2 rounded-lg backdrop-blur border transition-all ${
                            showSettings
                                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                                : 'bg-[var(--bg-secondary)]/80 border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        <Settings size={14} />
                    </button>
                    <button
                        onClick={onClose}
                        title="Close graph"
                        className="p-2 rounded-lg bg-[var(--bg-secondary)]/80 backdrop-blur border border-[var(--border)] text-[var(--text-secondary)] hover:text-rose-300 transition-all"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Search Input Box */}
            <div className="absolute top-14 left-3 z-20 w-80 pointer-events-auto">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search notes by title..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[var(--bg-secondary)]/90 border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] px-3 py-2 text-xs backdrop-blur-md rounded-lg shadow-lg outline-none focus:border-[var(--accent)] transition-all animate-in fade-in slide-in-from-top-2 duration-200"
                    />
                    {searchQuery && filteredNodes.length > 0 && (
                        <div className="absolute top-10 left-0 right-0 bg-[var(--bg-secondary)]/95 border border-[var(--border)] rounded-lg overflow-hidden max-h-72 overflow-y-auto backdrop-blur-md shadow-2xl p-1 space-y-0.5">
                            {filteredNodes.slice(0, 10).map((n) => (
                                <button
                                    key={n.id}
                                    onClick={() => {
                                        setSelectedNodeId(n.id);
                                        setSearchQuery('');
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs rounded-md transition-colors font-mono flex items-center gap-2"
                                >
                                    <span className="text-[var(--accent)] text-[8px]">●</span>
                                    {n.id}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Selected Node Details Drawer */}
            {selectedNodeId && (
                <div className="absolute bottom-3 right-3 w-80 bg-[var(--bg-secondary)]/95 border border-[var(--border)] rounded-xl p-4 shadow-2xl space-y-3.5 backdrop-blur-md max-h-[calc(100%-8rem)] overflow-y-auto pointer-events-auto z-20 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex justify-between items-start">
                        <div className="min-w-0 pr-2">
                            <h3 className="text-xs font-bold text-[var(--text-primary)] font-mono truncate flex items-center gap-1.5" title={selectedNodeId}>
                                <Share2 size={12} className="text-[var(--accent)] shrink-0" />
                                {selectedNodeId}
                            </h3>
                            <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Node Details</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => onOpenNote(selectedNodeId)}
                                title="Open in Editor"
                                className="p-1 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all"
                            >
                                <ArrowUpRight size={12} />
                            </button>
                            <button
                                onClick={() => setSelectedNodeId(null)}
                                className="p-1 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-rose-400 transition-all"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="border-t border-[var(--border)]/65 pt-3">
                            <h4 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full" />
                                Connected Notes ({selectedNodeNeighbors.length})
                            </h4>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                {selectedNodeNeighbors.map((neighbor, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedNodeId(neighbor.id)}
                                        className="w-full text-left text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-primary)]/50 hover:bg-[var(--bg-tertiary)] p-2 rounded border border-[var(--border)]/40 hover:border-[var(--accent)]/50 transition-all flex items-center justify-between font-mono"
                                    >
                                        <span className="truncate pr-2">{neighbor.id}</span>
                                        <span className="text-[9px] text-[var(--text-tertiary)] uppercase px-1 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border)]/30 shrink-0">
                                            {neighbor.type}
                                        </span>
                                    </button>
                                ))}
                                {selectedNodeNeighbors.length === 0 && (
                                    <p className="text-[10px] text-[var(--text-tertiary)] italic">No direct connections.</p>
                                )}
                            </div>
                        </div>

                        {selectedNodeCoords && (
                            <div className="border-t border-[var(--border)]/65 pt-3">
                                <h4 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full" />
                                    Coordinates
                                </h4>
                                <p className="text-[10px] text-[var(--text-secondary)] font-mono bg-[var(--bg-primary)]/50 p-1.5 rounded border border-[var(--border)]/40">
                                    X: {selectedNodeCoords.x.toFixed(1)}, Y: {selectedNodeCoords.y.toFixed(1)}{settings.dimensions === '3d' && `, Z: ${selectedNodeCoords.z.toFixed(1)}`}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}



            {/* How to Explore Guide */}
            {showExplore && (
                <div className="absolute bottom-3 left-3 w-72 bg-[var(--bg-secondary)]/90 border border-[var(--border)] rounded-lg p-3 text-[11px] space-y-2 backdrop-blur-md shadow-lg pointer-events-auto z-20 animate-in fade-in slide-in-from-left-2 duration-200">
                    <div className="flex justify-between items-center font-semibold text-[var(--text-primary)] border-b border-[var(--border)]/40 pb-1.5">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full" />
                            How to Explore
                        </div>
                        <button
                            onClick={() => setShowExplore(false)}
                            className="text-[var(--text-secondary)] hover:text-rose-400 transition-colors p-0.5 rounded"
                        >
                            <X size={10} />
                        </button>
                    </div>
                    <ul className="space-y-1.5 text-[var(--text-secondary)]">
                        <li className="flex items-start gap-1.5">
                            <span className="text-[var(--accent)] font-bold">→</span>
                            <span>Drag with left click to rotate space ({settings.dimensions.toUpperCase()})</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="text-[var(--accent)] font-bold">→</span>
                            <span>Drag with right click / Ctrl+drag to pan</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="text-[var(--accent)] font-bold">→</span>
                            <span>Scroll wheel to zoom in/out</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="text-[var(--accent)] font-bold">→</span>
                            <span>Hover node to view links, click to select</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="text-[var(--accent)] font-bold">→</span>
                            <span>Double-click node or click <FileText size={10} className="inline mb-0.5" /> to edit note</span>
                        </li>
                    </ul>
                </div>
            )}

            {/* Hover chip */}
            {hoveredNode && !selectedNodeId && (
                <div className="absolute bottom-3 left-3 px-3 py-2 rounded-lg bg-[var(--bg-secondary)]/90 backdrop-blur border border-[var(--border)] text-xs pointer-events-none z-10">
                    <div className="font-semibold text-[var(--text-primary)] font-mono">{hoveredNode.id}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                        {hoveredNode.deg} link{hoveredNode.deg === 1 ? '' : 's'} · click to focus
                    </div>
                </div>
            )}

            {/* Empty-links hint */}
            {data.nodes.length > 0 && data.links.length === 0 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)]/90 backdrop-blur border border-[var(--border)] text-[11px] text-[var(--text-tertiary)] pointer-events-none text-center z-10">
                    No links yet — connect notes with <span className="font-mono text-[var(--accent)]">[[wikilinks]]</span> to see them here.
                </div>
            )}

            {/* Settings panel */}
            {showSettings && (
                <div className="absolute top-14 right-3 w-64 max-h-[calc(100%-5rem)] overflow-y-auto rounded-xl bg-[var(--bg-secondary)]/95 backdrop-blur border border-[var(--border)] shadow-2xl p-3.5 space-y-3.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Graph Settings</span>
                        <button onClick={() => setSettings({ ...DEFAULT_SETTINGS })} className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--accent)]">Reset</button>
                    </div>

                    <Segmented
                        label="Dimensions"
                        value={settings.dimensions}
                        onChange={(v) => set({ dimensions: v })}
                        options={[{ value: '3d', label: '3D' }, { value: '2d', label: '2D' }]}
                    />

                    <div className="pt-1 border-t border-[var(--border)] space-y-2.5">
                        <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Physics</div>
                        <SliderRow label="Link distance" value={settings.linkDistance} min={6} max={60} step={1} onChange={(v) => set({ linkDistance: v })} />
                        <SliderRow label="Repulsion" value={settings.repulsion} min={40} max={700} step={10} onChange={(v) => set({ repulsion: v })} />
                        <SliderRow label="Center gravity" value={settings.centerGravity} min={0} max={0.2} step={0.005} onChange={(v) => set({ centerGravity: v })} format={(v) => v.toFixed(3)} />
                    </div>

                    <div className="pt-1 border-t border-[var(--border)] space-y-2.5">
                        <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Appearance</div>
                        <Segmented
                            label="Color by"
                            value={settings.colorMode}
                            onChange={(v) => set({ colorMode: v })}
                            options={[{ value: 'cluster', label: 'Cluster' }, { value: 'degree', label: 'Links' }, { value: 'accent', label: 'Solid' }]}
                        />
                        <SliderRow label="Node size" value={settings.nodeSize} min={0.4} max={2.5} step={0.1} onChange={(v) => set({ nodeSize: v })} format={(v) => `${v.toFixed(1)}x`} />
                        <ToggleRow label="Size by links" checked={settings.sizeByDegree} onChange={(v) => set({ sizeByDegree: v })} />
                        <SliderRow label="Glow" value={settings.glow} min={0} max={1.5} step={0.05} onChange={(v) => set({ glow: v })} format={(v) => v.toFixed(2)} />
                        <SliderRow label="Link opacity" value={settings.linkOpacity} min={0.05} max={1} step={0.05} onChange={(v) => set({ linkOpacity: v })} format={(v) => v.toFixed(2)} />
                        <SliderRow label="Edge curve" value={settings.curvature} min={0} max={0.6} step={0.02} onChange={(v) => set({ curvature: v })} format={(v) => v.toFixed(2)} />
                        <ToggleRow label="Traveling lights" checked={settings.pulses} onChange={(v) => set({ pulses: v })} />
                        {settings.pulses && (
                            <>
                                <SliderRow label="Light speed" value={settings.pulseSpeed} min={0.05} max={1} step={0.05} onChange={(v) => set({ pulseSpeed: v })} format={(v) => v.toFixed(2)} />
                                <SliderRow label="Lights per edge" value={settings.pulsesPerEdge} min={1} max={3} step={1} onChange={(v) => set({ pulsesPerEdge: v })} />
                                <ToggleRow label="Colored lights" checked={settings.colorMatchedPulses} onChange={(v) => set({ colorMatchedPulses: v })} />
                                <ToggleRow label="Light trails" checked={settings.pulseTails} onChange={(v) => set({ pulseTails: v })} />
                            </>
                        )}
                        <ToggleRow label="Interactive ripples" checked={settings.rippleWave} onChange={(v) => set({ rippleWave: v })} />
                        <ToggleRow label="Spring tension color" checked={settings.edgeTension} onChange={(v) => set({ edgeTension: v })} />
                        <ToggleRow label="Twinkling space dust" checked={settings.starfield} onChange={(v) => set({ starfield: v })} />
                        {settings.starfield && (
                            <>
                                <ToggleRow label="Shooting stars" checked={settings.shootingStars} onChange={(v) => set({ shootingStars: v })} />
                                {settings.shootingStars && (
                                    <>
                                        <SliderRow label="Shooting star speed" value={settings.shootingStarSpeed} min={0.25} max={3.0} step={0.05} onChange={(v) => set({ shootingStarSpeed: v })} format={(v) => `${v.toFixed(2)}x`} />
                                        <SliderRow label="Shooting star rate" value={settings.shootingStarFreq} min={0.1} max={4.0} step={0.05} onChange={(v) => set({ shootingStarFreq: v })} format={(v) => `${v.toFixed(2)}x`} />
                                    </>
                                )}
                            </>
                        )}
                        <ToggleRow label="Node twinkle" checked={settings.twinkle} onChange={(v) => set({ twinkle: v })} />
                        <ToggleRow label="Node glow" checked={settings.nodeGlow} onChange={(v) => set({ nodeGlow: v })} />
                    </div>

                    <div className="pt-1 border-t border-[var(--border)] space-y-2.5">
                        <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Labels & Motion</div>
                        <Segmented
                            label="Labels"
                            value={settings.labelMode}
                            onChange={(v) => set({ labelMode: v })}
                            options={[{ value: 'smart', label: 'Smart' }, { value: 'all', label: 'All' }, { value: 'hidden', label: 'Off' }]}
                        />
                        {settings.labelMode === 'smart' && (
                            <SliderRow label="Label threshold" value={settings.labelThreshold} min={1} max={8} step={1} onChange={(v) => set({ labelThreshold: v })} format={(v) => `${v}+ links`} />
                        )}
                        <ToggleRow label="Auto-rotate" checked={settings.autoRotate} onChange={(v) => set({ autoRotate: v })} />
                        {settings.autoRotate && (
                            <SliderRow label="Rotate speed" value={settings.rotateSpeed} min={0.1} max={3} step={0.1} onChange={(v) => set({ rotateSpeed: v })} format={(v) => v.toFixed(1)} />
                        )}
                        <ToggleRow label="Show unlinked mentions" checked={settings.includeUnlinked} onChange={(v) => set({ includeUnlinked: v })} />
                        <ToggleRow label="Show shared tags" checked={settings.includeSharedTags} onChange={(v) => set({ includeSharedTags: v })} />
                    </div>
                </div>
            )}
        </div>
    );
}
