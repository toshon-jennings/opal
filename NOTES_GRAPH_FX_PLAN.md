# Plan: "Living" FX for the Notes 3D Knowledge Graph

**For:** Hermes (or any coding agent)
**Target file:** `src/components/NotesGraph3D.jsx` (single file — everything below lives here)
**Goal:** Make the Notes knowledge graph feel alive, matching the reference "memory graph":
1. **Nodes light up** — idle twinkle + glow halos (not just on hover).
2. **Curved edges** — replace straight lines with bowed bézier curves.
3. **Pulsing lights running across the lines** — glowing orbs that travel along each edge.

## Constraints (read first)

- **No new npm dependencies.** Stack already present: `three@0.184`, `@react-three/fiber@8`,
  `@react-three/drei@9`. There is **no** `@react-three/postprocessing`, so do **not** reach for
  `<Bloom>`. Fake glow with **additive `THREE.Points`** + a soft radial-falloff fragment shader.
- Follow repo rules (`AGENTS.md`, `~/.config/agent-rules/GLOBAL.md`): **minimal code, no duplication,
  match surrounding style.** This is one fork file — keep the hand-rolled, dependency-light spirit.
- Everything must keep working in **both 2D and 3D** modes and with **0 links** (empty-graph guard).
- All edits go to `/Users/toshonjennings/opal` (main project), never a worktree.

## Current architecture (so you don't re-derive it)

- Force sim is hand-rolled in `GraphScene`'s `useFrame` (lines ~221–322). Node positions live in
  `sim.current.pts[]` (`{x,y,z,vx,vy,vz,fx,fy,fz}`). `sim.current.alpha` decays to 0 when settled.
- Edges today: one `<lineSegments ref={lineRef}>` (lines ~338–348) with a flat
  `sim.current.linePos = Float32Array(links*6)` — 2 verts per link, rewritten every frame in the
  "Edge geometry" block (~289–301).
- Hover highlight edges: `<lineSegments ref={hlLineRef}>` (~350–353), rebuilt in the highlight block
  (~303–321).
- Nodes: `data.nodes.map()` → `<group>` per node with a `<mesh>` + `meshStandardMaterial`
  (refs in `matRefs.current[i]`). Hover brightens neighbors via `emissiveIntensity` (~277–287).
- Theme colors arrive as `theme.accent` (`#C5692D`), `theme.cyan` (`#39C0C8`), `theme.text`.

---

## Step 1 — New settings + per-instance random phases

**1a. Add to `DEFAULT_SETTINGS` (lines 16–32):**

```js
curvature: 0.28,     // 0 = straight (back-compat), ~0.3 = nice bow
pulses: true,        // traveling lights on edges
pulseSpeed: 0.35,    // 0.05–1
pulsesPerEdge: 1,    // 1–3
twinkle: true,       // idle node light-up
nodeGlow: true,      // additive halo behind nodes
```
(They persist automatically via the existing `localStorage` effect at ~510–512.)

**1b. Stash random phases when the graph rebuilds.** In the sim-init `useEffect` (~160–176), where
`sim.current = {...}` is set, also store:

```js
sim.current = {
  pts,
  alpha: 1,
  linePos: new Float32Array(data.links.length * (SAMPLES - 1) * 2 * 3), // see Step 2
  pulsePos: new Float32Array(data.links.length * MAX_PULSES * 3),       // see Step 3
  nodePhase: data.nodes.map(() => Math.random() * Math.PI * 2),
  edgeSeed: data.links.map(() => Math.random()),
};
```

Add module consts near the top:
```js
const SAMPLES = 12;     // points sampled per bézier edge
const MAX_PULSES = 3;   // buffer is sized for the max; we only fill `pulsesPerEdge`
```

---

## Step 2 — Curved edges (bézier)

**Helper (module scope), evaluates a quadratic bézier into an array:**
```js
function bezierInto(out, o, ax,ay,az, cx,cy,cz, bx,by,bz, t) {
  const mt = 1 - t, a = mt*mt, b = 2*mt*t, c = t*t;
  out[o]   = a*ax + b*cx + c*bx;
  out[o+1] = a*ay + b*cy + c*by;
  out[o+2] = a*az + b*cz + c*bz;
}
```

**Control point** = edge midpoint pushed radially outward from origin, scaled by edge length so long
edges bow more (keeps z=0 in 2D automatically because midpoint z stays 0):
```js
// per edge, computed once per frame:
const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2, mz=(pa.z+pb.z)/2;
const ml = Math.hypot(mx,my,mz) || 1e-3;
const dist = Math.hypot(pb.x-pa.x, pb.y-pa.y, pb.z-pa.z);
const k = settings.curvature * dist;
const cx = mx + (mx/ml)*k, cy = my + (my/ml)*k, cz = mz + (mz/ml)*k;
```

**Rewrite the "Edge geometry" block (~289–301)** so each edge writes `SAMPLES-1` segments
(`SAMPLES-1` * 2 verts). Fold the pulse eval (Step 3) into this same per-edge loop — you already
have `cx,cy,cz` here, so don't compute the curve twice:
```js
const lp = s.linePos;
const seg = SAMPLES - 1;
for (let kk = 0; kk < data.links.length; kk++) {
  const l = data.links[kk];
  const pa = pts[l.s], pb = pts[l.t];
  // ...compute cx,cy,cz as above...
  const base = kk * seg * 2 * 3;
  for (let sIdx = 0; sIdx < seg; sIdx++) {
    const t0 = sIdx / seg, t1 = (sIdx + 1) / seg;
    bezierInto(lp, base + sIdx*6,     pa.x,pa.y,pa.z, cx,cy,cz, pb.x,pb.y,pb.z, t0);
    bezierInto(lp, base + sIdx*6 + 3, pa.x,pa.y,pa.z, cx,cy,cz, pb.x,pb.y,pb.z, t1);
  }
  // (Step 3 pulse positions go here — reuse cx,cy,cz)
}
if (lineRef.current) { const attr = lineRef.current.geometry.getAttribute('position');
  if (attr) { attr.array.set(lp); attr.needsUpdate = true; } }
```

**Update the base `<lineSegments>` JSX (~338–348):** the `bufferAttribute` `array` fallback and
`count` must use the new size:
```jsx
array={sim.current ? sim.current.linePos : new Float32Array(data.links.length * (SAMPLES-1) * 2 * 3)}
count={data.links.length * (SAMPLES - 1) * 2}
```

**Highlight edges (~303–321):** sample the incident edges the same way (push `SAMPLES-1` segment
pairs per incident edge instead of one straight pair). Same control-point formula.

**Perf note:** curve sampling multiplies per-frame edge work by ~`SAMPLES`. Fine for typical vaults.
Optional optimization: only rebuild the **base** curve buffer while `s.alpha > 0.005` (nodes moving);
pulses (Step 3) must update every frame regardless.

---

## Step 3 — Traveling pulse lights (additive Points)

**Fill `pulsePos` inside the same per-edge loop from Step 2** (uses `t` = elapsed time; capture it via
`useFrame((state) => { const time = state.clock.elapsedTime; ... })` — currently the callback ignores
its arg):
```js
if (settings.pulses) {
  const seed = s.edgeSeed[kk];
  const kCount = Math.min(settings.pulsesPerEdge, MAX_PULSES);
  for (let j = 0; j < kCount; j++) {
    const tp = (time * settings.pulseSpeed * 0.15 + seed + j / kCount) % 1;
    bezierInto(s.pulsePos, (kk*MAX_PULSES + j)*3, pa.x,pa.y,pa.z, cx,cy,cz, pb.x,pb.y,pb.z, tp);
  }
  // park unused pulse slots far offscreen so stale buffer values don't render:
  for (let j = kCount; j < MAX_PULSES; j++) s.pulsePos[(kk*MAX_PULSES + j)*3 + 1] = 1e6;
}
```
After the loop, flag the pulse geometry attribute `needsUpdate = true` (via a `pulseRef`).

**Add the Points object + shader.** Put a reusable additive glow material near the top:
```jsx
function GlowPoints({ posRef, count, color, size }) {
  const ref = useRef();
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size },
                uPR: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uSize; uniform float uPR;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * (300.0 / max(-mv.z, 0.001));
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.0, d); a = pow(a, 1.6);
        gl_FragColor = vec4(uColor, a);
      }`,
  }), [color, size]);
  // expose geometry ref to caller so useFrame can flag needsUpdate
  return (
    <points ref={(el)=>{ ref.current=el; if (posRef) posRef.current=el; }} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position"
          array={/* sim.current.pulsePos or zeros */} count={count} itemSize={3} />
      </bufferGeometry>
      <primitive object={material} attach="material" />
    </points>
  );
}
```
Render it inside `GraphScene` (only when `settings.pulses`), color `theme.cyan` (or alternate
accent/cyan per pulse if you want extra flavor), e.g. `size ≈ 14`. Wire its geometry ref so the
useFrame block can do `attr.array.set(s.pulsePos); attr.needsUpdate = true`.

This gives bright bloom-like orbs sliding along the curves. (1px GL lines can't be made thick
reliably; the additive orbs are what sells the effect.)

---

## Step 4 — Nodes light up

**4a. Idle twinkle.** In the per-node material loop (~277–287), capture `time` and modulate emissive
with the per-node phase (keep hover logic; twinkle is additive and subtle):
```js
const isHot = neighbors && neighbors.has(i);
const dim   = neighbors && !neighbors.has(i);
const tw = settings.twinkle ? (0.5 + 0.5*Math.sin(time*1.6 + s.nodePhase[i])) : 0;
const target = (isHot ? baseGlow + 0.8 : baseGlow) + tw * 0.45 * settings.glow;
mat.opacity = lerp(mat.opacity, dim ? 0.12 : 1, 0.25);
mat.emissiveIntensity = lerp(mat.emissiveIntensity, target, 0.2);
```
Different phases → "some nodes light up" at different times, exactly the reference behavior.

**4b. Glow halos (optional but recommended).** Add a second `GlowPoints` at node centers
(when `settings.nodeGlow`), color `theme.accent`, `size` scaled by node degree. Maintain a
`Float32Array(nodes*3)` updated each frame from `pts` (write it in the existing node loop that
already sets `grp.position`). Additive halos behind the solid spheres read as soft light.

---

## Step 5 — Settings panel UI

In the **Appearance** section of the panel (~624–636), add controls (reuse existing `SliderRow` /
`ToggleRow` / `Segmented` components — do not invent new ones):
```jsx
<SliderRow label="Edge curve" value={settings.curvature} min={0} max={0.6} step={0.02}
  onChange={(v)=>set({ curvature: v })} format={(v)=>v.toFixed(2)} />
<ToggleRow label="Traveling lights" checked={settings.pulses} onChange={(v)=>set({ pulses: v })} />
{settings.pulses && <>
  <SliderRow label="Light speed" value={settings.pulseSpeed} min={0.05} max={1} step={0.05}
    onChange={(v)=>set({ pulseSpeed: v })} format={(v)=>v.toFixed(2)} />
  <SliderRow label="Lights per edge" value={settings.pulsesPerEdge} min={1} max={3} step={1}
    onChange={(v)=>set({ pulsesPerEdge: v })} />
</>}
<ToggleRow label="Node twinkle" checked={settings.twinkle} onChange={(v)=>set({ twinkle: v })} />
<ToggleRow label="Node glow" checked={settings.nodeGlow} onChange={(v)=>set({ nodeGlow: v })} />
```

---

## Gotchas / checklist

- [ ] `linePos` **and** `pulsePos` buffers are re-allocated in the sim-init effect (sized from
      `SAMPLES` / `MAX_PULSES`) — they must resize when `data` changes or 2D/3D toggles.
- [ ] Base `<lineSegments>` JSX `count` and fallback `array` length updated to the new sampled size
      (mismatch = invisible or garbage edges).
- [ ] `useFrame` callback now needs its `state` arg for `state.clock.elapsedTime`.
- [ ] Empty-graph guard still holds (`data.nodes.length > 0` wrapper at ~523 stays).
- [ ] 2D mode: curves stay in-plane (radial control-point keeps z=0) — verify visually.
- [ ] `curvature: 0` renders effectively straight (back-compat sanity).
- [ ] Additive `Points` use `depthWrite:false` + `AdditiveBlending` so they glow over edges/nodes.
- [ ] Note any dead/unclear code you touch per `AGENTS.md` (don't expect to find any here).

## Verify

1. `npm run dev` (or `npm run electron:dev`), open **Notes mode → Knowledge Graph** (Share2 icon).
2. Confirm: edges bow, glowing orbs travel along them, nodes gently twinkle, hover still highlights
   neighbors, click still opens a note, drag still repositions.
3. Toggle each new setting (curve / lights / speed / per-edge / twinkle / glow) and the 2D/3D switch.
4. `npm run lint` clean. Watch the console for shader compile errors.
5. Sanity-check FPS on the largest available vault; if heavy, drop `SAMPLES` to 8 and/or gate the
   base-curve rebuild on `s.alpha > 0.005`.
