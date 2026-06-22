import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Billboard } from '@react-three/drei';
import { Settings, X, Share2, Link2, Crosshair } from 'lucide-react';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';

/* Perci Notes — 3D knowledge graph.
 * Renders every note as a node and every [[wikilink]] / md-link as an edge,
 * laid out with a small hand-rolled velocity-Verlet force simulation (no
 * external graph/physics deps). Interactions: orbit/zoom (OrbitControls),
 * hover to highlight a node + its neighbours, drag to reposition, click to
 * open the note. A persisted settings panel drives physics + appearance. */

const SETTINGS_KEY = 'perci_notes_graph_settings';

const SAMPLES = 12;     // points sampled per bezier edge
const MAX_PULSES = 3;   // buffer sized for max; we only fill pulsesPerEdge

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

/* ----------------------------- 3D scene ----------------------------- */

function GraphScene({ data, settings, theme, hovered, setHovered, neighbors, activeNoteId, onOpenNote }) {
    const { gl, camera } = useThree();
    const controlsRef = useRef();
    const groupRefs = useRef([]);
    const matRefs = useRef([]);
    const lineRef = useRef();
    const hlLineRef = useRef();
    const pulseRef = useRef();
    const nodeGlowRef = useRef();
    const sim = useRef(null);
    const dragRef = useRef(null);

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
            pulsePos: new Float32Array(data.links.length * MAX_PULSES * 3),
            nodeGlowPos: new Float32Array(data.nodes.length * 3),
            nodePhase: data.nodes.map(() => Math.random() * Math.PI * 2),
            edgeSeed: data.links.map(() => Math.random()),
            pulseRef: null,
            nodeGlowRef: null,
        };
        // Wire up geometry for pulse + glow points (refs may have already fired).
        if (pulseRef.current && !pulseRef.current.geometry.getAttribute('position')) {
            pulseRef.current.geometry.setAttribute('position',
                new THREE.BufferAttribute(sim.current.pulsePos, 3));
            pulseRef.current.geometry.setDrawRange(0, data.links.length * Math.min(settings.pulsesPerEdge, MAX_PULSES));
            sim.current.pulseRef = pulseRef.current;
        }
        if (nodeGlowRef.current && !nodeGlowRef.current.geometry.getAttribute('position')) {
            nodeGlowRef.current.geometry.setAttribute('position',
                new THREE.BufferAttribute(sim.current.nodeGlowPos, 3));
            sim.current.nodeGlowRef = nodeGlowRef.current;
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
            if (d && sim.current) { const p = sim.current.pts[d.i]; p.fx = p.fy = p.fz = null; }
            dragRef.current = null;
            if (controlsRef.current) controlsRef.current.enabled = true;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }, [gl, camera, settings.dimensions]);

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

        // Edge geometry (curved bezier) + pulse positions.
        const lp = s.linePos;
        const seg = SAMPLES - 1;
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

            // Traveling pulse lights.
            if (settings.pulses) {
                const seed = s.edgeSeed[kk];
                const kCount = Math.min(settings.pulsesPerEdge, MAX_PULSES);
                for (let j = 0; j < kCount; j++) {
                    const tp = (time * settings.pulseSpeed * 0.15 + seed + j / kCount) % 1;
                    bezierInto(s.pulsePos, (kk * MAX_PULSES + j) * 3,
                        pa.x, pa.y, pa.z, cx, cy, cz, pb.x, pb.y, pb.z, tp);
                }
                for (let j = kCount; j < MAX_PULSES; j++) {
                    s.pulsePos[(kk * MAX_PULSES + j) * 3 + 1] = 1e6;
                }
            }
        }

        if (lineRef.current) {
            const attr = lineRef.current.geometry.getAttribute('position');
            if (attr) { attr.array.set(lp); attr.needsUpdate = true; }
        }

        if (settings.pulses && s.pulseRef) {
            const geo = s.pulseRef.geometry;
            const posAttr = geo.getAttribute('position');
            if (posAttr) {
                posAttr.array.set(s.pulsePos);
                posAttr.needsUpdate = true;
                geo.setDrawRange(0, data.links.length * Math.min(settings.pulsesPerEdge, MAX_PULSES));
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
    });

    const shouldLabel = (node) => {
        if (settings.labelMode === 'all') return true;
        if (neighbors && neighbors.has(node.idx)) return true;
        if (node.id === activeNoteId) return true;
        if (settings.labelMode === 'smart') return node.deg >= settings.labelThreshold;
        return false;
    };

    return (
        <>
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
                </bufferGeometry>
                <lineBasicMaterial color={theme.text} transparent opacity={settings.linkOpacity} depthWrite={false} />
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
                                el.geometry.setAttribute('position',
                                    new THREE.BufferAttribute(sim.current.pulsePos, 3));
                                el.geometry.setDrawRange(0, data.links.length * Math.min(settings.pulsesPerEdge, MAX_PULSES));
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
                            uColor: { value: new THREE.Color(theme.cyan) },
                            uSize: { value: 14 },
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
                            onClick={(e) => { e.stopPropagation(); if (!dragRef.current) onOpenNote(node.id); }}
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

    // Resolve theme colors from the (themed) container so CSS vars inherit.
    useEffect(() => {
        if (!containerRef.current) return;
        const cs = getComputedStyle(containerRef.current);
        const get = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
        setTheme({
            accent: get('--accent', '#C5692D'),
            cyan: get('--accent-cyan', '#39C0C8'),
            text: get('--text-primary', '#E8E8E8'),
        });
    }, []);

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

            {/* Hover chip */}
            {hoveredNode && (
                <div className="absolute bottom-3 left-3 px-3 py-2 rounded-lg bg-[var(--bg-secondary)]/90 backdrop-blur border border-[var(--border)] text-xs pointer-events-none">
                    <div className="font-semibold text-[var(--text-primary)] font-mono">{hoveredNode.id}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                        {hoveredNode.deg} link{hoveredNode.deg === 1 ? '' : 's'} · click to open
                    </div>
                </div>
            )}

            {/* Empty-links hint */}
            {data.nodes.length > 0 && data.links.length === 0 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)]/90 backdrop-blur border border-[var(--border)] text-[11px] text-[var(--text-tertiary)] pointer-events-none text-center">
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
