import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, ContactShadows, useCursor, useTexture, Text, Billboard } from '@react-three/drei';

/* Perci HQ rendered as a real 3D room (react-three-fiber). Sir Perci is a
 * rigged primitive model — legs, arms, antennae and weapons are separate
 * groups posed every frame in useFrame, driven by the same mood states the
 * 2D mascot used. Desk pods mirror the data passed from OfficePanel. */

const PERCI = '#C5692D';
const PERCI_DARK = '#7A3C16';
const GOLD = '#CD9A3C';
const BLADE = '#E7E3DB';

const MOOD_GLOW = { attention: '#ef4444', done: '#4ade80', idle: '#2e3947' };

const PATROL_MAX_X = 5.6;
const AISLE_Z = 3.4;

const TIME_SCENES = {
    dawn: {
        sky: '#f6a86b',
        horizon: '#ffe0a6',
        outsideGlow: '#ffb36b',
        fog: '#24172a',
        background: '#1c1421',
        ambient: '#ffd2aa',
        ambientIntensity: 0.82,
        sunColor: '#ffd38a',
        sunIntensity: 1.25,
        lampIntensity: 10,
        pointIntensity: 8,
        starOpacity: 0.12,
        body: 'dawn',
    },
    day: {
        sky: '#75bdf4',
        horizon: '#d8f1ff',
        outsideGlow: '#bdeaff',
        fog: '#223345',
        background: '#182536',
        ambient: '#fff1dc',
        ambientIntensity: 0.95,
        sunColor: '#fff3cf',
        sunIntensity: 1.75,
        lampIntensity: 4,
        pointIntensity: 4,
        starOpacity: 0,
        body: 'day',
    },
    lateNoon: {
        sky: '#5a9fd4',
        horizon: '#e8d4a8',
        outsideGlow: '#d4a86a',
        fog: '#232e3d',
        background: '#1a2130',
        ambient: '#ffe8c8',
        ambientIntensity: 0.88,
        sunColor: '#ffe0a0',
        sunIntensity: 1.5,
        lampIntensity: 6,
        pointIntensity: 5,
        starOpacity: 0,
        body: 'lateNoon',
    },
    dusk: {
        sky: '#7750a5',
        horizon: '#f28f62',
        outsideGlow: '#e67662',
        fog: '#25172d',
        background: '#1b1322',
        ambient: '#ffc2a2',
        ambientIntensity: 0.76,
        sunColor: '#ffae73',
        sunIntensity: 1.15,
        lampIntensity: 13,
        pointIntensity: 10,
        starOpacity: 0.2,
        body: 'dusk',
    },
    night: {
        sky: '#101b33',
        horizon: '#17213c',
        outsideGlow: '#f5e6c8',
        fog: '#1b1322',
        background: '#1b1322',
        ambient: '#ffd9b8',
        ambientIntensity: 0.58,
        sunColor: '#d7e7ff',
        sunIntensity: 0.45,
        lampIntensity: 16,
        pointIntensity: 12,
        starOpacity: 1,
        body: 'night',
    },
};

function getTimeScene(date) {
    const hour = date.getHours() + date.getMinutes() / 60;
    if (hour >= 5 && hour < 7) return TIME_SCENES.dawn;
    if (hour >= 7 && hour < 15) return TIME_SCENES.day;
    if (hour >= 15 && hour < 17) return TIME_SCENES.lateNoon;
    if (hour >= 17 && hour < 20.5) return TIME_SCENES.dusk;
    return TIME_SCENES.night;
}

// ── Sir Perci ────────────────────────────────────────────────────────────

/* Shield = gold { brace }, traced from the 2D mascot's SVG path
   (M92 164 C... 68 207 ... 92 250) and swept as a tube. */
const BRACE_GEOMETRY = (() => {
    const v = (x, y) => new THREE.Vector3(x, y, 0);
    const path = new THREE.CurvePath();
    path.add(new THREE.CubicBezierCurve3(v(0.084, 0.3), v(0, 0.3), v(0, 0.216), v(0, 0.133)));
    path.add(new THREE.CubicBezierCurve3(v(0, 0.133), v(0, 0.07), v(-0.014, 0.035), v(-0.084, 0)));
    path.add(new THREE.CubicBezierCurve3(v(-0.084, 0), v(-0.014, -0.035), v(0, -0.07), v(0, -0.133)));
    path.add(new THREE.CubicBezierCurve3(v(0, -0.133), v(0, -0.216), v(0, -0.3), v(0.084, -0.3)));
    return new THREE.TubeGeometry(path, 48, 0.038, 8, false);
})();

function PerciBackGear() {
    return (
        <group position={[0, 0.02, -0.35]}>
            <group rotation={[0, 0, -0.72]}>
                <mesh position={[0, 0.15, 0]}>
                    <boxGeometry args={[0.08, 0.82, 0.028]} />
                    <meshStandardMaterial color="#5b3924" roughness={0.72} metalness={0.08} />
                </mesh>
                <mesh position={[0, 0.6, 0]}>
                    <boxGeometry args={[0.09, 0.06, 0.034]} />
                    <meshStandardMaterial color={BLADE} roughness={0.36} metalness={0.45} />
                </mesh>
                <mesh position={[0, -0.28, 0]}>
                    <boxGeometry args={[0.2, 0.045, 0.05]} />
                    <meshStandardMaterial color={GOLD} roughness={0.4} metalness={0.5} />
                </mesh>
            </group>
            <group rotation={[0, 0, 0.72]}>
                <mesh geometry={BRACE_GEOMETRY} position={[0, 0.12, 0.03]}>
                    <meshStandardMaterial color={GOLD} roughness={0.45} metalness={0.35} />
                </mesh>
                {/* round end caps, like the SVG's strokeLinecap */}
                {[0.3, -0.3].map((y) => (
                    <mesh key={y} position={[0.084, 0.12 + y, 0.03]}>
                        <sphereGeometry args={[0.038, 10, 10]} />
                        <meshStandardMaterial color={GOLD} roughness={0.45} metalness={0.35} />
                    </mesh>
                ))}
            </group>
        </group>
    );
}

function Perci3D({ state, bubble, reduce }) {
    const root = useRef();
    const body = useRef();
    const legL = useRef();
    const legR = useRef();
    const armL = useRef();
    const armR = useRef();
    const antL = useRef();
    const antR = useRef();
    const walk = useRef({ x: -2, dir: 1, phase: 0 });

    useFrame((s, dt) => {
        if (reduce || !root.current || !body.current) return;
        const t = s.clock.elapsedTime;
        const w = walk.current;
        const speed = state === 'error' ? 0 : state === 'working' ? 1.9 : state === 'happy' ? 1.4 : 0.8;

        w.x += w.dir * speed * dt;
        if (w.x > PATROL_MAX_X) { w.x = PATROL_MAX_X; w.dir = -1; }
        if (w.x < -PATROL_MAX_X) { w.x = -PATROL_MAX_X; w.dir = 1; }
        w.phase += dt * (3 + speed * 4.5);
        root.current.position.x = w.x;

        // face the walking direction; face the camera when stopped
        const targetRot = speed === 0 ? 0 : w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, targetRot, 5, dt);

        // legs: alternating stride
        const stride = speed === 0 ? 0 : 0.55;
        if (legL.current) legL.current.rotation.x = Math.sin(w.phase) * stride;
        if (legR.current) legR.current.rotation.x = -Math.sin(w.phase) * stride;

        // body: bob + waddle (+ hop when happy, jitter when erroring)
        body.current.position.y = 0.62
            + Math.abs(Math.sin(w.phase)) * 0.05
            + (state === 'happy' ? Math.abs(Math.sin(t * 5)) * 0.16 : 0);
        body.current.rotation.z = Math.sin(w.phase) * 0.05;
        body.current.position.x = state === 'error' ? Math.sin(t * 28) * 0.02 : 0;

        // antennae sway, livelier when busy or celebrating
        const antSpeed = state === 'working' || state === 'happy' ? 7 : 2.5;
        if (antL.current) antL.current.rotation.z = 0.88 + Math.sin(t * antSpeed) * 0.12;
        if (antR.current) antR.current.rotation.z = -0.88 + Math.sin(t * antSpeed + 1) * 0.12;

        // arms: empty-handed office gesture instead of guard/chop
        const swing = speed === 0 ? 0 : Math.sin(w.phase) * 0.45;
        if (armL.current) armL.current.rotation.set(swing * 0.45 + 0.24, 0, -0.78);
        if (armR.current) armR.current.rotation.set(-swing * 0.35 + 0.46, 0, 0.62);
        if (state === 'error' && armL.current) armL.current.rotation.set(-0.46, 0, -0.82);
        if (state === 'working' && armR.current) armR.current.rotation.x = 0.25 + Math.sin(t * 5) * 0.18;
        if (state === 'happy' && armR.current) armR.current.rotation.set(-0.18, 0, 1.65);
    });

    return (
        <group ref={root} position={[-2, 0, AISLE_Z]} scale={1.25}>
            {/* legs (hips at root so the stride pivots correctly) */}
            {[[legL, -0.16], [legR, 0.16]].map(([ref, x]) => (
                <group key={x} ref={ref} position={[x, 0.3, 0]}>
                    <mesh position={[0, -0.07, 0]}>
                        <cylinderGeometry args={[0.05, 0.05, 0.18, 8]} />
                        <meshStandardMaterial color={PERCI} roughness={0.6} />
                    </mesh>
                    <mesh position={[0, -0.2, 0.02]}>
                        <sphereGeometry args={[0.09, 12, 12]} />
                        <meshStandardMaterial color={PERCI} roughness={0.6} />
                    </mesh>
                </group>
            ))}

            {/* body carries face, antennae and arms so the bob moves them all */}
            <group ref={body} position={[0, 0.62, 0]}>
                <PerciBackGear />
                <mesh scale={[1, 0.95, 0.88]}>
                    <sphereGeometry args={[0.42, 24, 20]} />
                    <meshStandardMaterial color={PERCI} roughness={0.55} />
                </mesh>

                {/* face */}
                <mesh position={[-0.14, 0.08, 0.355]}>
                    <sphereGeometry args={[0.05, 10, 10]} />
                    <meshStandardMaterial color={PERCI_DARK} />
                </mesh>
                <mesh position={[0.14, 0.08, 0.355]}>
                    <sphereGeometry args={[0.05, 10, 10]} />
                    <meshStandardMaterial color={PERCI_DARK} />
                </mesh>
                <mesh position={[0, -0.03, 0.37]} rotation={[0.25, 0, -Math.PI / 2 - 0.35 * Math.PI]}>
                    <torusGeometry args={[0.12, 0.022, 8, 16, Math.PI * 0.7]} />
                    <meshStandardMaterial color={PERCI_DARK} />
                </mesh>

                {/* antennae */}
                {[[antL, -0.2, 0.72], [antR, 0.2, -0.72]].map(([ref, x, tilt]) => (
                    <group key={x} ref={ref} position={[x, 0.35, 0.02]} rotation={[0, 0, tilt]}>
                        <mesh position={[0, 0.18, 0]}>
                            <cylinderGeometry args={[0.028, 0.028, 0.34, 8]} />
                            <meshStandardMaterial color={PERCI} roughness={0.6} />
                        </mesh>
                        <mesh position={[0, 0.4, 0]}>
                            <sphereGeometry args={[0.07, 12, 12]} />
                            <meshStandardMaterial color={PERCI} roughness={0.6} />
                        </mesh>
                    </group>
                ))}

                {/* arms stay empty; sword and shield are crossed on his back */}
                <group ref={armL} position={[-0.42, 0.04, 0]} rotation={[0.24, 0, -0.78]}>
                    <mesh position={[0, -0.12, 0]}>
                        <capsuleGeometry args={[0.06, 0.13, 4, 8]} />
                        <meshStandardMaterial color={PERCI} roughness={0.6} />
                    </mesh>
                    <mesh position={[0, -0.24, 0.01]}>
                        <sphereGeometry args={[0.08, 12, 12]} />
                        <meshStandardMaterial color={PERCI} roughness={0.6} />
                    </mesh>
                </group>
                <group ref={armR} position={[0.42, 0.04, 0]} rotation={[0.46, 0, 0.62]}>
                    <mesh position={[0, -0.12, 0]}>
                        <capsuleGeometry args={[0.06, 0.13, 4, 8]} />
                        <meshStandardMaterial color={PERCI} roughness={0.6} />
                    </mesh>
                    <mesh position={[0, -0.24, 0.01]}>
                        <sphereGeometry args={[0.08, 12, 12]} />
                        <meshStandardMaterial color={PERCI} roughness={0.6} />
                    </mesh>
                </group>
            </group>

            <Html position={[0, 1.55, 0]} center distanceFactor={10} zIndexRange={[80, 0]}
                style={{ pointerEvents: 'none' }}>
                <div className="o-bubble">{bubble}</div>
            </Html>
        </group>
    );
}

// ── Desk pods ────────────────────────────────────────────────────────────

function FloatGlyph({ mood, innerRef }) {
    if (mood === 'attention') {
        return (
            <group ref={innerRef} position={[0, 2, -0.1]} scale={1.5}>
                <mesh position={[0, 0.07, 0]}>
                    <boxGeometry args={[0.06, 0.2, 0.06]} />
                    <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
                </mesh>
                <mesh position={[0, -0.1, 0]}>
                    <boxGeometry args={[0.06, 0.06, 0.06]} />
                    <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
                </mesh>
            </group>
        );
    }
    if (mood === 'done') {
        return (
            <group ref={innerRef} position={[0, 2, -0.1]} scale={1.5}>
                <mesh position={[-0.07, -0.04, 0]} rotation={[0, 0, -0.8]}>
                    <boxGeometry args={[0.06, 0.18, 0.06]} />
                    <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={2} />
                </mesh>
                <mesh position={[0.05, 0.02, 0]} rotation={[0, 0, 0.65]}>
                    <boxGeometry args={[0.06, 0.32, 0.06]} />
                    <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={2} />
                </mesh>
            </group>
        );
    }
    return null;
}

function DeskPod({ x, z, color, label, mood, agentId, onClick, reduce }) {
    const bot = useRef();
    const head = useRef();
    const eyes = useRef();
    const armTL = useRef();
    const armTR = useRef();
    const screenMat = useRef();
    const glyph = useRef();
    const [hovered, setHovered] = useState(false);
    useCursor(hovered);

    const glow = mood === 'working' ? color : MOOD_GLOW[mood];
    const eyeColor = mood === 'attention' ? '#f87171' : '#ffd9a0';
    const labelWidth = Math.max(0.82, label.length * 0.095 + 0.42);

    useFrame((s, dt) => {
        if (reduce) return;
        const t = s.clock.elapsedTime;
        if (bot.current) {
            bot.current.position.y =
                mood === 'done' ? Math.abs(Math.sin(t * 4)) * 0.12
                : mood === 'working' ? Math.abs(Math.sin(t * 7)) * 0.02
                : Math.sin(t * 1.5 + x) * 0.015 + 0.015;
        }
        if (head.current) head.current.rotation.z = mood === 'attention' ? Math.sin(t * 18) * 0.06 : 0;
        const typing = mood === 'working';
        if (armTL.current) armTL.current.position.y = 0.86 + (typing ? Math.max(0, Math.sin(t * 13)) * 0.05 : 0);
        if (armTR.current) armTR.current.position.y = 0.86 + (typing ? Math.max(0, Math.sin(t * 13 + Math.PI)) * 0.05 : 0);
        if (eyes.current) eyes.current.scale.y = (t + x * 0.7) % 4 > 3.86 ? 0.15 : 1;
        if (screenMat.current) {
            screenMat.current.emissiveIntensity =
                mood === 'working' ? 1.1 + Math.sin(t * 9 + x) * 0.5
                : mood === 'attention' ? 1.2 + Math.sin(t * 10) * 0.8
                : mood === 'done' ? 1.4
                : 0.35;
        }
        if (glyph.current) {
            glyph.current.position.y = 2 + Math.sin(t * 3) * 0.07;
            glyph.current.rotation.y += dt * 1.5;
        }
    });

    return (
        <group
            position={[x, 0, z]}
            scale={hovered ? 1.04 : 1}
            onClick={(e) => { e.stopPropagation(); onClick(agentId); }}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
            onPointerOut={() => setHovered(false)}
        >
            {/* desk */}
            <mesh position={[0, 0.82, 0]}>
                <boxGeometry args={[1.7, 0.08, 0.9]} />
                <meshStandardMaterial color="#6b4a30" roughness={0.8} />
            </mesh>
            <mesh position={[-0.76, 0.39, 0]}>
                <boxGeometry args={[0.08, 0.78, 0.82]} />
                <meshStandardMaterial color="#3c2919" roughness={0.9} />
            </mesh>
            <mesh position={[0.76, 0.39, 0]}>
                <boxGeometry args={[0.08, 0.78, 0.82]} />
                <meshStandardMaterial color="#3c2919" roughness={0.9} />
            </mesh>

            {/* monitor (screen cheated toward the camera, like the 2D scene) */}
            <mesh position={[0, 0.9, -0.12]}>
                <boxGeometry args={[0.07, 0.18, 0.05]} />
                <meshStandardMaterial color="#211826" />
            </mesh>
            <mesh position={[0, 1.12, -0.12]}>
                <boxGeometry args={[0.85, 0.55, 0.07]} />
                <meshStandardMaterial color="#211826" roughness={0.6} />
            </mesh>
            <mesh position={[0, 1.12, -0.078]}>
                <planeGeometry args={[0.72, 0.44]} />
                <meshStandardMaterial ref={screenMat} color="#0d1117" emissive={glow} emissiveIntensity={0.35} />
            </mesh>
            <mesh position={[0, 1.12, -0.165]}>
                <planeGeometry args={[1, 0.68]} />
                <meshBasicMaterial color={glow} transparent opacity={mood === 'idle' ? 0.06 : 0.22} />
            </mesh>

            {/* coffee mug */}
            <mesh position={[0.58, 0.91, 0.18]}>
                <cylinderGeometry args={[0.045, 0.045, 0.09, 10]} />
                <meshStandardMaterial color="#e7e3db" roughness={0.5} />
            </mesh>

            {/* robot coworker behind the desk */}
            <group ref={bot} position={[0, 0, -0.55]}>
                <mesh position={[0, 0.5, 0]}>
                    <cylinderGeometry args={[0.2, 0.24, 0.1, 12]} />
                    <meshStandardMaterial color="#1c1522" roughness={0.8} />
                </mesh>
                <mesh position={[0, 0.85, 0]}>
                    <boxGeometry args={[0.5, 0.45, 0.3]} />
                    <meshStandardMaterial color={color} roughness={0.5} />
                </mesh>
                <group ref={head} position={[0, 1.36, 0]}>
                    <mesh>
                        <boxGeometry args={[0.54, 0.42, 0.36]} />
                        <meshStandardMaterial color={color} roughness={0.5} />
                    </mesh>
                    <mesh position={[0, 0, 0.185]}>
                        <planeGeometry args={[0.42, 0.28]} />
                        <meshStandardMaterial color="#120d16" roughness={0.4} />
                    </mesh>
                    <group ref={eyes} position={[0, 0.02, 0.2]}>
                        <mesh position={[-0.09, 0, 0]}>
                            <sphereGeometry args={[0.045, 10, 10]} />
                            <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} />
                        </mesh>
                        <mesh position={[0.09, 0, 0]}>
                            <sphereGeometry args={[0.045, 10, 10]} />
                            <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} />
                        </mesh>
                    </group>
                    <mesh position={[0, 0.3, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.18, 6]} />
                        <meshStandardMaterial color={color} />
                    </mesh>
                    <mesh position={[0, 0.42, 0]}>
                        <sphereGeometry args={[0.05, 10, 10]} />
                        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
                    </mesh>
                </group>
                {/* forearms on the desk; they hammer the keyboard when working */}
                <mesh ref={armTL} position={[-0.2, 0.86, 0.28]}>
                    <boxGeometry args={[0.1, 0.08, 0.4]} />
                    <meshStandardMaterial color={color} roughness={0.5} />
                </mesh>
                <mesh ref={armTR} position={[0.2, 0.86, 0.28]}>
                    <boxGeometry args={[0.1, 0.08, 0.4]} />
                    <meshStandardMaterial color={color} roughness={0.5} />
                </mesh>
            </group>

            <FloatGlyph mood={mood} innerRef={glyph} />

            <Billboard position={[0, 0.55, 0.5]} follow lockX={false} lockY={false} lockZ={false}>
                <mesh position={[0, 0, -0.01]}>
                    <planeGeometry args={[labelWidth, 0.23]} />
                    <meshBasicMaterial color="#050505" transparent opacity={0.52} depthTest depthWrite={false} />
                </mesh>
                <mesh position={[-labelWidth / 2 + 0.14, 0, 0.01]}>
                    <circleGeometry args={[0.035, 14]} />
                    <meshBasicMaterial color={mood === 'working' ? '#38bdf8' : mood === 'done' ? '#4ade80' : mood === 'attention' ? '#ef4444' : '#6b7280'} depthTest />
                </mesh>
                <Text
                    position={[0.06, -0.002, 0.02]}
                    fontSize={0.105}
                    color="#f5e6c8"
                    anchorX="center"
                    anchorY="middle"
                    maxWidth={labelWidth - 0.22}
                >
                    {label}
                </Text>
            </Billboard>
        </group>
    );
}

// ── Room dressing ────────────────────────────────────────────────────────

/* Aged brick texture drawn once to a canvas: staggered bricks with tone
   jitter, a few sooty/recessed ones, water streaks and grime at the floor. */
function useAgedBrickTexture() {
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // mortar
        ctx.fillStyle = '#392d31';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const tones = ['#6b3a2e', '#5d332a', '#75453a', '#52302a', '#7d5043', '#643d33'];
        const bw = 76, bh = 25, gap = 5;
        for (let row = 0; row * (bh + gap) < canvas.height + bh; row++) {
            const y = row * (bh + gap);
            const offset = row % 2 ? -(bw + gap) / 2 : 0;
            for (let col = 0; offset + col * (bw + gap) < canvas.width; col++) {
                const x = offset + col * (bw + gap);
                const r = Math.random();
                // the odd brick is soot-blackened or crumbled back to mortar depth
                ctx.fillStyle = r > 0.96 ? '#2e2024' : r > 0.92 ? '#3c2624' : tones[(Math.random() * tones.length) | 0];
                ctx.fillRect(x, y + (Math.random() * 2 - 1), bw - Math.random() * 4, bh);
                // worn edge shading for a little relief
                ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
                ctx.fillRect(x, y + bh - 3, bw, 3);
                ctx.fillStyle = 'rgba(255, 235, 210, 0.05)';
                ctx.fillRect(x, y, bw, 2);
                // occasional pale efflorescence blotch
                if (Math.random() > 0.85) {
                    ctx.fillStyle = `rgba(214, 200, 178, ${0.04 + Math.random() * 0.07})`;
                    ctx.beginPath();
                    ctx.ellipse(x + Math.random() * bw, y + Math.random() * bh, 14 + Math.random() * 18, 6 + Math.random() * 8, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // long water stains bleeding down from random spots near the top
        for (let i = 0; i < 7; i++) {
            const x = Math.random() * canvas.width;
            const w = 16 + Math.random() * 30;
            const h = 120 + Math.random() * 260;
            const streak = ctx.createLinearGradient(0, 0, 0, h);
            streak.addColorStop(0, 'rgba(16, 10, 14, 0.34)');
            streak.addColorStop(1, 'rgba(16, 10, 14, 0)');
            ctx.fillStyle = streak;
            ctx.fillRect(x, 0, w, h);
        }

        // grime rising from the floor
        const grime = ctx.createLinearGradient(0, canvas.height, 0, canvas.height * 0.55);
        grime.addColorStop(0, 'rgba(14, 9, 12, 0.5)');
        grime.addColorStop(1, 'rgba(14, 9, 12, 0)');
        ctx.fillStyle = grime;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
    }, []);
    useEffect(() => () => texture.dispose(), [texture]);
    return texture;
}

function Room() {
    const brick = useAgedBrickTexture();
    const strips = useMemo(() => Array.from({ length: 9 }, (_, i) => (i - 4) * 2.4), []);
    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1]}>
                <planeGeometry args={[22, 13]} />
                <meshStandardMaterial color="#4a3328" roughness={0.95} />
            </mesh>
            {strips.map((x) => (
                <mesh key={x} position={[x, 0.006, 1]}>
                    <boxGeometry args={[0.045, 0.012, 13]} />
                    <meshStandardMaterial color="#3a2820" roughness={1} />
                </mesh>
            ))}
            {/* aisle rug for Perci's patrol */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, AISLE_Z]}>
                <planeGeometry args={[13.2, 2]} />
                <meshStandardMaterial color="#5c1f1a" roughness={0.95} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, AISLE_Z]}>
                <planeGeometry args={[12.6, 1.6]} />
                <meshStandardMaterial color="#7c2d24" roughness={0.95} />
            </mesh>
            {/* walls */}
            <mesh position={[0, 3.25, -5]}>
                <planeGeometry args={[22, 6.5]} />
                <meshStandardMaterial color="#2c1f31" roughness={0.95} />
            </mesh>
            {/* left wall: aged brick */}
            <mesh position={[-11, 3.25, 0.5]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[13, 6.5]} />
                <meshStandardMaterial map={brick} roughness={0.95} />
            </mesh>
            <mesh position={[11, 3.25, 0.5]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[13, 6.5]} />
                <meshStandardMaterial color="#241a2b" roughness={0.95} />
            </mesh>
            {/* baseboard */}
            <mesh position={[0, 0.12, -4.96]}>
                <boxGeometry args={[22, 0.24, 0.08]} />
                <meshStandardMaterial color="#1b1220" />
            </mesh>
        </group>
    );
}

function OfficeWindow({ scene, position = [-5.6, 3.4, -4.94], rotation = [0, 0, 0], scale = 1, showCelestial = true }) {
    const stars = useMemo(
        () => Array.from({ length: 8 }, () => [
            (Math.random() - 0.5) * 2.4,
            0.2 + Math.random() * 0.6,
            0.04,
        ]),
        []
    );
    const skyline = useMemo(() => [0.5, 0.9, 0.4, 0.75, 0.55], []);
    const isNight = scene.body === 'night';
    const sunPosition = scene.body === 'dawn'
        ? [-0.92, -0.08, 0.04]
        : scene.body === 'dusk'
            ? [0.95, -0.02, 0.04]
            : [0.62, 0.5, 0.04];

    return (
        <group position={position} rotation={rotation} scale={scale}>
            <mesh>
                <planeGeometry args={[3, 1.9]} />
                <meshStandardMaterial color={scene.sky} emissive={scene.sky} emissiveIntensity={isNight ? 0.08 : 0.18} roughness={0.6} />
            </mesh>
            <mesh position={[0, -0.52, 0.025]}>
                <planeGeometry args={[2.85, 0.72]} />
                <meshStandardMaterial color={scene.horizon} emissive={scene.horizon} emissiveIntensity={isNight ? 0.04 : 0.28} transparent opacity={0.9} />
            </mesh>
            {showCelestial && (
                <mesh position={isNight ? [0.95, 0.55, 0.04] : sunPosition}>
                    <sphereGeometry args={isNight ? [0.16, 14, 14] : [0.24, 18, 18]} />
                    <meshStandardMaterial color={scene.outsideGlow} emissive={scene.outsideGlow} emissiveIntensity={isNight ? 1.6 : 2.2} />
                </mesh>
            )}
            {stars.map((p, i) => (
                <mesh key={i} position={p}>
                    <sphereGeometry args={[0.02, 6, 6]} />
                    <meshStandardMaterial color="#f5e6c8" emissive="#f5e6c8" emissiveIntensity={2} transparent opacity={scene.starOpacity} />
                </mesh>
            ))}
            {skyline.map((h, i) => (
                <mesh key={i} position={[-1.2 + i * 0.6, -0.95 + h / 2, 0.03]}>
                    <boxGeometry args={[0.45, h, 0.04]} />
                    <meshStandardMaterial color={isNight ? '#0a0f1d' : '#263244'} />
                </mesh>
            ))}
            {/* frame */}
            {[[0, 1.02, 3.3, 0.14], [0, -1.02, 3.3, 0.14]].map(([fx, fy, fw, fh], i) => (
                <mesh key={`h${i}`} position={[fx, fy, 0.05]}>
                    <boxGeometry args={[fw, fh, 0.12]} />
                    <meshStandardMaterial color="#4a3526" roughness={0.8} />
                </mesh>
            ))}
            {[[-1.58, 0], [1.58, 0], [0, 0]].map(([fx, fy], i) => (
                <mesh key={`v${i}`} position={[fx, fy, 0.05]}>
                    <boxGeometry args={[0.14, 2.1, 0.12]} />
                    <meshStandardMaterial color="#4a3526" roughness={0.8} />
                </mesh>
            ))}
        </group>
    );
}

function Door3D() {
    return (
        <group position={[10.96, 1.38, -0.3]} rotation={[0, -Math.PI / 2, 0]}>
            <mesh position={[0, 0.05, 0]}>
                <boxGeometry args={[1.42, 2.85, 0.08]} />
                <meshStandardMaterial color="#2b1b17" roughness={0.72} />
            </mesh>
            <mesh position={[0, 0.07, 0.05]}>
                <boxGeometry args={[1.14, 2.48, 0.06]} />
                <meshStandardMaterial color="#5a351f" roughness={0.86} />
            </mesh>
            <mesh position={[0, 0.66, 0.09]}>
                <boxGeometry args={[0.82, 0.34, 0.035]} />
                <meshStandardMaterial color="#6f4326" roughness={0.78} />
            </mesh>
            <mesh position={[0.42, -0.05, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.055, 0.055, 0.07, 16]} />
                <meshStandardMaterial color={GOLD} metalness={0.5} roughness={0.35} />
            </mesh>
            <mesh position={[0, -1.38, 0.08]}>
                <boxGeometry args={[1.42, 0.08, 0.12]} />
                <meshStandardMaterial color="#1b1220" roughness={0.8} />
            </mesh>
        </group>
    );
}

function WallClock3D({ position = [5.6, 3.6, -4.9], rotation = [0, 0, 0] }) {
    const hour = useRef();
    const minute = useRef();
    useFrame(() => {
        const now = new Date();
        if (hour.current) hour.current.rotation.z = -((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6);
        if (minute.current) minute.current.rotation.z = -now.getMinutes() * (Math.PI / 30);
    });
    return (
        <group position={position} rotation={rotation}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.5, 0.5, 0.07, 24]} />
                <meshStandardMaterial color="#1a1320" roughness={0.6} />
            </mesh>
            <mesh>
                <torusGeometry args={[0.5, 0.045, 8, 24]} />
                <meshStandardMaterial color={GOLD} roughness={0.4} metalness={0.4} />
            </mesh>
            <group ref={hour}>
                <mesh position={[0, 0.13, 0.05]}>
                    <boxGeometry args={[0.05, 0.26, 0.02]} />
                    <meshStandardMaterial color="#f5e6c8" />
                </mesh>
            </group>
            <group ref={minute}>
                <mesh position={[0, 0.19, 0.06]}>
                    <boxGeometry args={[0.035, 0.38, 0.02]} />
                    <meshStandardMaterial color="#fbbf24" />
                </mesh>
            </group>
            <mesh position={[0, 0, 0.07]}>
                <sphereGeometry args={[0.04, 10, 10]} />
                <meshStandardMaterial color="#fbbf24" />
            </mesh>
        </group>
    );
}

/* The TV alternates Orbit's and Perci's looping splash clips with a crossfade,
   falling back to the canvas starfield below if the videos can't load or motion
   is reduced. */
const TV_VIDEO_SOURCES = [
    '/videos/Character_space_walk_animation_202605131326.mp4', // Orbit
    '/videos/perci-splash.mp4', // Perci
];
const TV_FADE_SPEED = 2.2; // higher = quicker crossfade

function LiveTvScreen({ reduce }) {
    const [videoReady, setVideoReady] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const matRefs = [useRef(null), useRef(null)];
    const fadeRef = useRef(0); // eased toward activeIndex (0 → clip 0, 1 → clip 1)

    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 288;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
    }, []);

    const videoTextures = useMemo(() => {
        if (reduce || typeof document === 'undefined') return null;
        return TV_VIDEO_SOURCES.map((src) => {
            const video = document.createElement('video');
            video.src = src;
            video.loop = false; // play once, then hand off to the other clip
            video.muted = true;
            video.playsInline = true;
            video.crossOrigin = 'anonymous';
            const tex = new THREE.VideoTexture(video);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            return tex;
        });
    }, [reduce]);

    useEffect(() => () => texture.dispose(), [texture]);

    useEffect(() => {
        if (!videoTextures) return undefined;
        let readyCount = 0;
        const cleanups = videoTextures.map((tex) => {
            const video = tex.image;
            const onReady = () => {
                readyCount += 1;
                if (readyCount >= videoTextures.length) setVideoReady(true);
            };
            const onError = () => setVideoReady(false);
            video.addEventListener('canplay', onReady);
            video.addEventListener('error', onError);
            return () => {
                video.removeEventListener('canplay', onReady);
                video.removeEventListener('error', onError);
                video.pause();
                video.removeAttribute('src');
                video.load();
                tex.dispose();
            };
        });
        return () => cleanups.forEach((fn) => fn());
    }, [videoTextures]);

    // Play the active clip from the start; when it ends, hand off to the other.
    useEffect(() => {
        if (!videoReady || !videoTextures) return undefined;
        const video = videoTextures[activeIndex].image;
        video.currentTime = 0;
        video.play().catch(() => {});
        const onEnded = () => setActiveIndex((i) => (i === 0 ? 1 : 0));
        video.addEventListener('ended', onEnded);
        return () => {
            video.removeEventListener('ended', onEnded);
            video.pause();
        };
    }, [videoReady, activeIndex, videoTextures]);

    const useVideo = videoReady && videoTextures;

    useFrame((state, delta) => {
        if (useVideo) {
            // Ease the crossfade toward the active clip; VideoTextures self-refresh.
            fadeRef.current += (activeIndex - fadeRef.current) * Math.min(1, delta * TV_FADE_SPEED);
            const f = fadeRef.current;
            if (matRefs[0].current) matRefs[0].current.opacity = 1 - f;
            if (matRefs[1].current) matRefs[1].current.opacity = f;
            return;
        }
        const canvas = texture.image;
        const ctx = canvas.getContext('2d');
        const t = reduce ? 0 : state.clock.elapsedTime;

        ctx.fillStyle = '#06111f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#09234a');
        gradient.addColorStop(0.58, '#071624');
        gradient.addColorStop(1, '#133c36');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(-(t * 18) % 96, (t * 7) % 48);
        for (let y = -48; y < canvas.height + 48; y += 48) {
            for (let x = -96; x < canvas.width + 96; x += 96) {
                const twinkle = 0.42 + Math.sin(t * 1.7 + x * 0.04 + y * 0.03) * 0.22;
                ctx.fillStyle = `rgba(245, 230, 200, ${twinkle})`;
                ctx.beginPath();
                ctx.arc(x + 22, y + 16, 1.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(152, 206, 255, ${twinkle * 0.8})`;
                ctx.beginPath();
                ctx.arc(x + 68, y + 34, 1.1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();

        ctx.fillStyle = '#9ad2ff';
        ctx.beginPath();
        ctx.arc(382, 96 + Math.sin(t * 0.6) * 5, 42, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(245, 230, 200, 0.42)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(374, 108, 98, 28, -0.45 + Math.sin(t * 0.3) * 0.08, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#b7d8c6';
        ctx.beginPath();
        ctx.ellipse(250, 300, 390, 122, -0.08 + Math.sin(t * 0.2) * 0.02, Math.PI, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(30, 82, 86, 0.72)';
        ctx.beginPath();
        ctx.ellipse(250 + Math.sin(t * 0.25) * 16, 298, 300, 72, -0.1, Math.PI, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(245, 230, 200, 0.88)';
        ctx.font = '700 20px Outfit, system-ui, sans-serif';
        ctx.letterSpacing = '2px';
        ctx.fillText('LIVE FEED', 24, 254);

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(144 + Math.sin(t * 5) * 2, 248, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let y = 0; y < canvas.height; y += 6) {
            ctx.fillRect(0, y, canvas.width, 2);
        }

        texture.needsUpdate = true;
    });

    return (
        <group position={[0, 0, 0.045]}>
            {!useVideo && (
                <mesh>
                    <planeGeometry args={[2.22, 1.2]} />
                    <meshBasicMaterial map={texture} toneMapped={false} />
                </mesh>
            )}
            {useVideo && videoTextures.map((tex, i) => (
                <mesh key={i} position={[0, 0, i * 0.001]}>
                    <planeGeometry args={[2.22, 1.2]} />
                    <meshBasicMaterial
                        ref={matRefs[i]}
                        map={tex}
                        toneMapped={false}
                        transparent
                        depthWrite={false}
                        opacity={i === 0 ? 1 : 0}
                    />
                </mesh>
            ))}
        </group>
    );
}

function WallTv3D({ reduce }) {
    /* Keep the TV screen in WebGL, not a DOM iframe, so desks and agents depth-sort over it. */
    return (
        <group position={[5.25, 3.08, -4.94]}>
            {/* back casing — sits right against the wall */}
            <mesh position={[0, 0, -0.02]}>
                <boxGeometry args={[2.55, 1.55, 0.08]} />
                <meshStandardMaterial color="#151019" roughness={0.72} metalness={0.08} />
            </mesh>
            {/* screen face */}
            <mesh position={[0, 0, 0.03]}>
                <planeGeometry args={[2.42, 1.42]} />
                <meshStandardMaterial color="#07070a" emissive="#101622" emissiveIntensity={0.35} />
            </mesh>
            <LiveTvScreen reduce={reduce} />
            <mesh position={[0, -0.64, 0.07]}>
                <boxGeometry args={[2.2, 0.2, 0.05]} />
                <meshStandardMaterial color="#0e0c12" roughness={0.8} />
            </mesh>
            <Text position={[-0.58, -0.64, 0.105]} fontSize={0.06} color="#f5e6c8" anchorX="center" anchorY="middle" letterSpacing={0.12}>
                LIVE FEED
            </Text>
            <Text position={[0.35, -0.64, 0.105]} fontSize={0.055} color="#f5e6c8" anchorX="center" anchorY="middle">
                STREAMING
            </Text>
        </group>
    );
}

function HangingLamp({ x, z, offset, reduce, intensity }) {
    const swing = useRef();
    useFrame((s) => {
        if (reduce || !swing.current) return;
        swing.current.rotation.z = Math.sin(s.clock.elapsedTime * 0.7 + offset) * 0.06;
    });
    return (
        <group ref={swing} position={[x, 4.8, z]}>
            <mesh position={[0, -0.45, 0]}>
                <cylinderGeometry args={[0.015, 0.015, 0.9, 6]} />
                <meshStandardMaterial color="#120d18" />
            </mesh>
            <mesh position={[0, -1, 0]}>
                <coneGeometry args={[0.34, 0.28, 16, 1, true]} />
                <meshStandardMaterial color="#3b2a18" roughness={0.8} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, -1.08, 0]}>
                <sphereGeometry args={[0.07, 10, 10]} />
                <meshStandardMaterial color="#ffd9a0" emissive="#ffd9a0" emissiveIntensity={2.4} />
            </mesh>
            <pointLight position={[0, -1.2, 0]} color="#ffc97a" intensity={intensity} distance={8} decay={2} />
        </group>
    );
}

function NeonSign3D({ reduce }) {
    const textMat = useRef();
    const sharedBorderMat = useMemo(() => new THREE.MeshBasicMaterial({
        color: '#fbbf24',
        transparent: true,
        toneMapped: false,
        opacity: 0.7
    }), []);

    useFrame((s) => {
        if (reduce) return;
        const t = s.clock.elapsedTime;
        const cycle = t % 7;
        let opacity = 1;
        if (cycle > 1.3 && cycle < 1.5) {
            opacity = 0.4 + Math.random() * 0.5;
        } else if (cycle > 4.5 && cycle < 4.62) {
            opacity = 0.75;
        }
        if (textMat.current) textMat.current.opacity = opacity;
        sharedBorderMat.opacity = opacity * 0.7;
    });

    return (
        <group position={[0, 4.05, -4.96]}>
            {/* The Text */}
            <Text
                fontSize={0.48}
                color="#fbbf24"
                letterSpacing={0.36}
                anchorX="center"
                anchorY="middle"
            >
                PERCI HQ
                <meshBasicMaterial
                    ref={textMat}
                    attach="material"
                    color="#fbbf24"
                    transparent
                    toneMapped={false}
                />
            </Text>

            {/* The Border Frame Tubes */}
            <group>
                <mesh position={[0, 0.36, -0.01]} material={sharedBorderMat}>
                    <boxGeometry args={[3.2, 0.02, 0.02]} />
                </mesh>
                <mesh position={[0, -0.36, -0.01]} material={sharedBorderMat}>
                    <boxGeometry args={[3.2, 0.02, 0.02]} />
                </mesh>
                <mesh position={[-1.6, 0, -0.01]} material={sharedBorderMat}>
                    <boxGeometry args={[0.02, 0.74, 0.02]} />
                </mesh>
                <mesh position={[1.6, 0, -0.01]} material={sharedBorderMat}>
                    <boxGeometry args={[0.02, 0.74, 0.02]} />
                </mesh>
            </group>
        </group>
    );
}

function CeramicPot({ color = '#a85b32', accent = '#f4c27a' }) {
    return (
        <group>
            <mesh position={[0, 0.24, 0]}>
                <cylinderGeometry args={[0.26, 0.34, 0.48, 18]} />
                <meshStandardMaterial color={color} roughness={0.58} metalness={0.08} />
            </mesh>
            <mesh position={[0, 0.5, 0]}>
                <torusGeometry args={[0.27, 0.035, 8, 20]} />
                <meshStandardMaterial color={accent} roughness={0.46} />
            </mesh>
            <mesh position={[0, 0.505, 0]}>
                <cylinderGeometry args={[0.24, 0.24, 0.025, 18]} />
                <meshStandardMaterial color="#2a1b14" roughness={1} />
            </mesh>
        </group>
    );
}

function PottedTree({ position, scale = 1, reduce }) {
    const crown = useRef();
    useFrame((s) => {
        if (reduce || !crown.current) return;
        crown.current.rotation.z = Math.sin(s.clock.elapsedTime * 0.65) * 0.025;
    });

    return (
        <group position={position} scale={scale}>
            <CeramicPot color="#c5793e" accent="#f4d28d" />
            <mesh position={[0, 1.04, 0]}>
                <cylinderGeometry args={[0.075, 0.11, 1.16, 10]} />
                <meshStandardMaterial color="#68411f" roughness={0.86} />
            </mesh>
            <group ref={crown} position={[0, 1.72, 0]}>
                {[
                    [0, 0.18, 0, 0.5, '#3f8f5a'],
                    [-0.38, 0, 0.08, 0.42, '#2f7347'],
                    [0.38, 0.03, -0.04, 0.44, '#4ea86c'],
                    [-0.1, 0.42, -0.05, 0.38, '#56b978'],
                    [0.12, -0.18, 0.05, 0.36, '#357a4c'],
                ].map(([x, y, z, radius, color], i) => (
                    <mesh key={i} position={[x, y, z]}>
                        <sphereGeometry args={[radius, 18, 14]} />
                        <meshStandardMaterial color={color} roughness={0.82} />
                    </mesh>
                ))}
            </group>
        </group>
    );
}

function Plant3D({
    position = [8.8, 0, 2.4],
    scale = 1,
    reduce,
    potColor = '#a85b32',
    accent = '#f4c27a',
    leafColor = '#3f8f5a',
    leafDark = '#276d47',
    variant = 'round',
    swayOffset = 0,
}) {
    const leaves = useRef();
    useFrame((s) => {
        if (reduce || !leaves.current) return;
        leaves.current.rotation.z = Math.sin(s.clock.elapsedTime * 0.9 + swayOffset) * 0.05;
    });

    const isPalm = variant === 'palm';
    const isFan = variant === 'fan';
    const isTall = variant === 'tall';
    const leafShape = useMemo(() => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.34);
        shape.bezierCurveTo(0.2, 0.24, 0.24, -0.12, 0, -0.34);
        shape.bezierCurveTo(-0.24, -0.12, -0.2, 0.24, 0, 0.34);
        return shape;
    }, []);

    return (
        <group position={position} scale={scale}>
            <CeramicPot color={potColor} accent={accent} />
            {(isTall || isPalm || isFan) && (
                <mesh position={[0, 0.92, 0]}>
                    <cylinderGeometry args={(isPalm || isFan) ? [0.035, 0.06, 0.72, 8] : [0.045, 0.065, 0.82, 8]} />
                    <meshStandardMaterial color="#5b3a21" roughness={0.8} />
                </mesh>
            )}
            <group ref={leaves} position={[0, 0.44, 0]}>
                {isFan ? (
                    [-0.72, -0.42, -0.14, 0.14, 0.42, 0.72].map((tilt, i) => (
                        <group key={tilt} position={[tilt * 0.18, 0.76 + Math.abs(tilt) * 0.08, 0.05]} rotation={[0, 0, tilt]}>
                            <mesh scale={[0.7, 1.05, 1]}>
                                <shapeGeometry args={[leafShape]} />
                                <meshStandardMaterial color={i % 2 ? leafColor : leafDark} roughness={0.78} side={THREE.DoubleSide} />
                            </mesh>
                            <mesh position={[0, -0.03, 0.01]} scale={[0.08, 0.82, 1]}>
                                <shapeGeometry args={[leafShape]} />
                                <meshStandardMaterial color="#86d99a" roughness={0.82} side={THREE.DoubleSide} />
                            </mesh>
                        </group>
                    ))
                ) : isPalm ? (
                    Array.from({ length: 7 }, (_, i) => {
                        const angle = (i / 7) * Math.PI * 2;
                        const reach = 0.28 + (i % 2) * 0.08;
                        return (
                            <group key={i} position={[Math.cos(angle) * reach, 0.82, Math.sin(angle) * reach]} rotation={[0.78, angle, (i % 2 ? 0.16 : -0.12)]}>
                                <mesh scale={[0.82, 0.92, 1]}>
                                    <shapeGeometry args={[leafShape]} />
                                    <meshStandardMaterial color={i % 2 ? leafColor : leafDark} roughness={0.78} side={THREE.DoubleSide} />
                                </mesh>
                                <mesh position={[0, -0.02, 0.01]} scale={[0.13, 0.72, 1]}>
                                    <shapeGeometry args={[leafShape]} />
                                    <meshStandardMaterial color="#74c98b" roughness={0.82} side={THREE.DoubleSide} />
                                </mesh>
                            </group>
                        );
                    })
                ) : isTall ? (
                    Array.from({ length: 8 }, (_, i) => {
                        const angle = (i / 8) * Math.PI * 2;
                        const y = 0.44 + (i % 3) * 0.16;
                        return (
                            <mesh key={i} position={[Math.cos(angle) * 0.2, y, Math.sin(angle) * 0.16]} rotation={[0.7, angle, 0]}>
                                <sphereGeometry args={[0.2, 14, 10]} />
                                <meshStandardMaterial color={i % 2 ? leafColor : leafDark} roughness={0.78} />
                            </mesh>
                        );
                    })
                ) : (
                    <>
                        <mesh position={[0, 0.34, 0]}>
                            <sphereGeometry args={[0.31, 14, 12]} />
                            <meshStandardMaterial color={leafColor} roughness={0.8} />
                        </mesh>
                        <mesh position={[-0.24, 0.16, 0.05]}>
                            <sphereGeometry args={[0.2, 12, 12]} />
                            <meshStandardMaterial color={leafDark} roughness={0.8} />
                        </mesh>
                        <mesh position={[0.24, 0.2, -0.05]}>
                            <sphereGeometry args={[0.22, 12, 12]} />
                            <meshStandardMaterial color="#56b978" roughness={0.8} />
                        </mesh>
                    </>
                )}
            </group>
        </group>
    );
}

function WallShelf3D({ position, rotation = [0, 0, 0], reduce }) {
    return (
        <group position={position} rotation={rotation}>
            <mesh>
                <boxGeometry args={[2.8, 0.09, 0.28]} />
                <meshStandardMaterial color="#5a3c25" roughness={0.8} />
            </mesh>
            {[-1.05, -0.55, -0.05, 0.45].map((x, i) => (
                <mesh key={x} position={[x, 0.2 + (i % 2) * 0.08, 0.15]}>
                    <boxGeometry args={[0.28, 0.38, 0.16]} />
                    <meshStandardMaterial color={['#d99b54', '#5f7f96', '#b9553c', '#d8b06a'][i]} roughness={0.75} />
                </mesh>
            ))}
            <Plant3D position={[1.3, 0.04, 0.16]} scale={0.42} reduce={reduce} potColor="#f0d6aa" accent="#ffffff" leafColor="#66bb7a" leafDark="#3e8650" variant="round" swayOffset={3.3} />
        </group>
    );
}

function FloorRadio3D({ position, rotation = [0, 0, 0] }) {
    return (
        <group position={position} rotation={rotation}>
            <mesh position={[0, 0.82, 0]}>
                <boxGeometry args={[1.18, 1.64, 0.42]} />
                <meshStandardMaterial color="#5a3c25" roughness={0.82} />
            </mesh>
            <mesh position={[0, 0.82, 0.13]}>
                <boxGeometry args={[1, 1.48, 0.08]} />
                <meshStandardMaterial color="#3b281d" roughness={0.9} />
            </mesh>
            <mesh position={[0, 1.52, 0.14]}>
                <boxGeometry args={[0.9, 0.12, 0.06]} />
                <meshStandardMaterial color="#7a5436" roughness={0.78} />
            </mesh>
            <mesh position={[0, 0.14, 0.18]}>
                <boxGeometry args={[0.96, 0.12, 0.06]} />
                <meshStandardMaterial color="#3a2619" roughness={0.9} />
            </mesh>
            {[-0.46, 0.46].map((x) => (
                <mesh key={x} position={[x, 0.18, 0]}>
                    <boxGeometry args={[0.1, 0.36, 0.36]} />
                    <meshStandardMaterial color="#4a311f" roughness={0.84} />
                </mesh>
            ))}
            <mesh position={[0, 0.86, 0.19]}>
                <boxGeometry args={[0.82, 0.86, 0.03]} />
                <meshStandardMaterial color="#9a7a50" roughness={0.96} />
            </mesh>
            {[-0.24, -0.08, 0.08, 0.24].map((x) => (
                <mesh key={x} position={[x, 0.86, 0.205]}>
                    <boxGeometry args={[0.035, 0.82, 0.02]} />
                    <meshStandardMaterial color="#6f4f2f" roughness={0.84} />
                </mesh>
            ))}
            <mesh position={[0, 1.22, 0.19]}>
                <boxGeometry args={[0.54, 0.3, 0.035]} />
                <meshStandardMaterial color="#2b1d16" roughness={0.78} />
            </mesh>
            <mesh position={[0, 1.22, 0.215]}>
                <circleGeometry args={[0.11, 20]} />
                <meshStandardMaterial color="#c6a46b" roughness={0.5} metalness={0.25} />
            </mesh>
            <mesh position={[0, 0.44, 0.21]}>
                <boxGeometry args={[0.42, 0.16, 0.03]} />
                <meshStandardMaterial color="#c6a46b" roughness={0.55} metalness={0.2} />
            </mesh>
            {[-0.18, 0, 0.18].map((x) => (
                <mesh key={x} position={[x, 0.44, 0.235]}>
                    <cylinderGeometry args={[0.03, 0.03, 0.03, 16]} />
                    <meshStandardMaterial color="#d7bf8a" roughness={0.4} metalness={0.35} />
                </mesh>
            ))}

            <group position={[0.26, 1.62, 0.02]} scale={0.36}>
                <CeramicPot color="#6e8a58" accent="#d9d2b4" />
                {[
                    [0, 0.68, 0.02, 0.52, 0.38, 0.44, '#5f8b57'],
                    [-0.24, 0.52, 0.08, 0.34, 0.28, 0.3, '#4d7748'],
                    [0.26, 0.56, -0.04, 0.36, 0.3, 0.32, '#6e9c65'],
                    [-0.08, 0.86, -0.02, 0.3, 0.24, 0.28, '#7fb173'],
                    [0.12, 0.94, 0.06, 0.28, 0.22, 0.24, '#567f4d'],
                    [0.02, 0.42, 0.16, 0.24, 0.18, 0.2, '#6b995f'],
                ].map(([x, y, z, sx, sy, sz, color], i) => (
                    <mesh key={i} position={[x, y, z]} scale={[sx, sy, sz]}>
                        <sphereGeometry args={[0.34, 14, 14]} />
                        <meshStandardMaterial color={color} roughness={0.82} />
                    </mesh>
                ))}
            </group>

        </group>
    );
}

/* A warm wooden side table laden with treats. Built with its long axis along Z
   so it sits flush against the left wall beneath the window. */
function SnackTable3D({ position, rotation = [0, 0, 0], scale = 1 }) {
    const TOP = 0.795; // tabletop surface height in local space
    return (
        <group position={position} rotation={rotation} scale={scale}>
            {/* tabletop */}
            <mesh position={[0, 0.76, 0]} castShadow>
                <boxGeometry args={[0.6, 0.07, 1.8]} />
                <meshStandardMaterial color="#6b4a2f" roughness={0.78} />
            </mesh>
            {/* apron */}
            <mesh position={[0, 0.7, 0]}>
                <boxGeometry args={[0.5, 0.06, 1.7]} />
                <meshStandardMaterial color="#543a24" roughness={0.85} />
            </mesh>
            {/* legs */}
            {[[-0.24, -0.82], [0.24, -0.82], [-0.24, 0.82], [0.24, 0.82]].map(([x, z]) => (
                <mesh key={`${x},${z}`} position={[x, 0.36, z]}>
                    <boxGeometry args={[0.06, 0.72, 0.06]} />
                    <meshStandardMaterial color="#543a24" roughness={0.85} />
                </mesh>
            ))}
            {/* cream runner cloth */}
            <mesh position={[0, TOP + 0.012, 0]}>
                <boxGeometry args={[0.46, 0.02, 1.62]} />
                <meshStandardMaterial color="#f3ead6" roughness={0.95} />
            </mesh>

            {/* microchips with thermal paste dip */}
            <group position={[-0.11, TOP, -0.64]}>
                <mesh position={[0, 0.018, 0]}>
                    <boxGeometry args={[0.22, 0.016, 0.3]} />
                    <meshStandardMaterial color="#182e24" roughness={0.62} />
                </mesh>
                {[-0.07, 0.02, 0.1].map((z, i) => (
                    <mesh key={i} position={[i % 2 ? 0.025 : -0.025, 0.035, z]} rotation={[0, 0.12 * i, 0]}>
                        <boxGeometry args={[0.09, 0.012, 0.055]} />
                        <meshStandardMaterial color="#263238" roughness={0.5} metalness={0.18} />
                    </mesh>
                ))}
                {[-0.075, -0.025, 0.025, 0.075].map((x) => (
                    <mesh key={x} position={[x, 0.045, -0.15]}>
                        <boxGeometry args={[0.012, 0.01, 0.03]} />
                        <meshStandardMaterial color="#d6b35a" roughness={0.34} metalness={0.65} />
                    </mesh>
                ))}
                <mesh position={[0.14, 0.025, 0.08]}>
                    <cylinderGeometry args={[0.052, 0.052, 0.022, 18]} />
                    <meshStandardMaterial color="#d8dde2" roughness={0.35} metalness={0.25} />
                </mesh>
                <mesh position={[0.14, 0.041, 0.08]}>
                    <sphereGeometry args={[0.038, 12, 8]} />
                    <meshStandardMaterial color="#c7cbd1" roughness={0.88} />
                </mesh>
            </group>

            {/* data crunch trail mix */}
            <group position={[0.12, TOP, -0.31]}>
                <mesh position={[0, 0.055, 0]}>
                    <cylinderGeometry args={[0.13, 0.08, 0.11, 20]} />
                    <meshStandardMaterial color="#b9854e" roughness={0.54} metalness={0.08} />
                </mesh>
                {[
                    [-0.045, 0.12, -0.025, '#5fb6d8'],
                    [0.02, 0.13, 0.03, '#e0c15d'],
                    [0.06, 0.115, -0.02, '#ec6f48'],
                    [-0.01, 0.155, -0.055, '#a36bd4'],
                ].map(([x, y, z, color], i) => (
                    <mesh key={i} position={[x, y, z]} rotation={[0.3 * i, 0.4 * i, 0]}>
                        <boxGeometry args={[0.045, 0.045, 0.045]} />
                        <meshStandardMaterial color={color} roughness={0.58} />
                    </mesh>
                ))}
                {['0', '1'].map((label, i) => (
                    <Text
                        key={label}
                        position={[i ? 0.038 : -0.052, 0.18, i ? 0.008 : -0.035]}
                        rotation={[-Math.PI / 2, 0, i ? 0.4 : -0.2]}
                        fontSize={0.055}
                        color="#17202a"
                        anchorX="center"
                        anchorY="middle"
                    >
                        {label}
                    </Text>
                ))}
            </group>

            {/* HTTP cookies */}
            <group position={[-0.12, TOP, 0.02]}>
                <mesh position={[0, 0.008, 0]}>
                    <cylinderGeometry args={[0.14, 0.14, 0.016, 24]} />
                    <meshStandardMaterial color="#f0f0ee" roughness={0.35} metalness={0.1} />
                </mesh>
                {[
                    [-0.045, 0.045],
                    [0.055, 0.035],
                    [0, -0.055],
                ].map(([x, z], i) => (
                    <group key={i} position={[x, 0.031, z]}>
                        <mesh rotation={[Math.PI / 2, 0, 0]}>
                            <cylinderGeometry args={[0.044, 0.044, 0.018, 18]} />
                            <meshStandardMaterial color="#bc7a39" roughness={0.72} />
                        </mesh>
                        {[-0.016, 0.014, 0.004].map((dot, j) => (
                            <mesh key={j} position={[dot, 0.012, j === 1 ? 0.012 : -0.014]}>
                                <sphereGeometry args={[0.006, 8, 8]} />
                                <meshStandardMaterial color="#44291a" roughness={0.45} />
                            </mesh>
                        ))}
                    </group>
                ))}
            </group>

            {/* SPAM queue filler */}
            <group position={[0.13, TOP, 0.18]} rotation={[0, -0.2, 0]}>
                <mesh position={[0, 0.045, 0]}>
                    <boxGeometry args={[0.14, 0.09, 0.09]} />
                    <meshStandardMaterial color="#d95b54" roughness={0.42} metalness={0.15} />
                </mesh>
                <Text position={[0, 0.062, 0.048]} fontSize={0.034} color="#fff3d0" anchorX="center" anchorY="middle">
                    SPAM
                </Text>
            </group>

            {/* Raspberry Pi bite */}
            <group position={[-0.11, TOP, 0.41]}>
                <mesh position={[0, 0.018, 0]}>
                    <boxGeometry args={[0.17, 0.016, 0.12]} />
                    <meshStandardMaterial color="#237446" roughness={0.52} />
                </mesh>
                <mesh position={[0.015, 0.044, -0.002]}>
                    <sphereGeometry args={[0.034, 12, 10]} />
                    <meshStandardMaterial color="#d0283b" roughness={0.48} />
                </mesh>
                {[-0.052, 0.054].map((x) => (
                    <mesh key={x} position={[x, 0.036, 0.04]}>
                        <boxGeometry args={[0.035, 0.022, 0.03]} />
                        <meshStandardMaterial color="#d7d8d6" roughness={0.3} metalness={0.45} />
                    </mesh>
                ))}
            </group>

            {/* Java and liquid nitrogen */}
            <group position={[0.12, TOP, 0.55]}>
                <mesh position={[-0.055, 0.008, 0.01]}>
                    <cylinderGeometry args={[0.06, 0.06, 0.012, 18]} />
                    <meshStandardMaterial color="#f0f0ee" roughness={0.35} metalness={0.1} />
                </mesh>
                <mesh position={[-0.055, 0.06, 0.01]}>
                    <cylinderGeometry args={[0.043, 0.036, 0.09, 18]} />
                    <meshStandardMaterial color="#efe7d5" roughness={0.36} />
                </mesh>
                <mesh position={[-0.003, 0.062, 0.01]} rotation={[0, 0, Math.PI / 2]}>
                    <torusGeometry args={[0.019, 0.006, 8, 14]} />
                    <meshStandardMaterial color="#efe7d5" roughness={0.36} />
                </mesh>
                <mesh position={[-0.055, 0.108, 0.01]}>
                    <cylinderGeometry args={[0.038, 0.038, 0.008, 18]} />
                    <meshStandardMaterial color="#3b2414" roughness={0.72} />
                </mesh>
                <Text position={[-0.055, 0.062, 0.054]} fontSize={0.028} color="#5b321f" anchorX="center" anchorY="middle">
                    JAVA
                </Text>
                {[0, 1, 2].map((i) => (
                    <mesh key={i} position={[-0.085 + i * 0.03, 0.16 + i * 0.02, 0.012]}>
                        <sphereGeometry args={[0.012, 8, 8]} />
                        <meshStandardMaterial color="#d8d2c4" transparent opacity={0.55} roughness={0.2} />
                    </mesh>
                ))}

                <mesh position={[0.08, 0.075, -0.01]}>
                    <cylinderGeometry args={[0.045, 0.05, 0.15, 18]} />
                    <meshStandardMaterial color="#bac9d8" roughness={0.22} metalness={0.65} />
                </mesh>
                <mesh position={[0.08, 0.155, -0.01]}>
                    <cylinderGeometry args={[0.04, 0.04, 0.018, 18]} />
                    <meshStandardMaterial color="#e7f6ff" roughness={0.18} metalness={0.35} />
                </mesh>
                {[0, 1, 2].map((i) => (
                    <mesh key={i} position={[0.06 + i * 0.02, 0.19 + i * 0.018, -0.01]}>
                        <sphereGeometry args={[0.015 + i * 0.004, 10, 8]} />
                        <meshStandardMaterial color="#aee7ff" transparent opacity={0.45} roughness={0.08} />
                    </mesh>
                ))}
            </group>

            <group position={[0, TOP + 0.16, 0.78]}>
                <mesh>
                    <boxGeometry args={[0.38, 0.2, 0.02]} />
                    <meshStandardMaterial color="#1f2933" roughness={0.58} metalness={0.08} />
                </mesh>
                <Text position={[0, 0.02, 0.014]} fontSize={0.048} color="#f6c45f" anchorX="center" anchorY="middle">
                    AI SNACKS
                </Text>
            </group>
        </group>
    );
}

function WallArt3D({ position, rotation = [0, 0, 0], image, frameColor = '#4a3526', width = 0.62, height = 0.78, depth = 0.04 }) {
    const texture = useTexture(`/artwork/${image}`);
    const border = 0.07;
    const innerW = width - border * 2;
    const innerH = height - border * 2;
    return (
        <group position={position} rotation={rotation}>
            {/* frame backing */}
            <mesh>
                <boxGeometry args={[width, height, depth]} />
                <meshStandardMaterial color={frameColor} roughness={0.75} />
            </mesh>
            {/* inner frame bevel */}
            <mesh position={[0, 0, depth / 2 + 0.001]}>
                <boxGeometry args={[innerW + 0.02, innerH + 0.02, 0.01]} />
                <meshStandardMaterial color="#2a1f14" roughness={0.85} />
            </mesh>
            {/* canvas / image */}
            <mesh position={[0, 0, depth / 2 + 0.008]}>
                <planeGeometry args={[innerW, innerH]} />
                <meshStandardMaterial map={texture} roughness={0.65} />
            </mesh>
        </group>
    );
}

/* Comic cover in a thick wall-mounted glass display case. Sizes are real-world
 * comic dimensions (room scale is 1 unit = 1 m), so the slabs read true-to-life. */
function ComicCase3D({ position, rotation = [0, 0, 0], image, comicWidth = 0.2, comicHeight = 0.265, scale = 1 }) {
    const texture = useTexture(`/artwork/${image}`);
    const caseW = comicWidth + 0.07;
    const caseH = comicHeight + 0.08;
    const caseD = 0.07;
    return (
        <group position={position} rotation={rotation} scale={scale}>
            {/* wall-mount back plate */}
            <mesh position={[0, 0, 0.012]}>
                <boxGeometry args={[caseW + 0.025, caseH + 0.025, 0.024]} />
                <meshStandardMaterial color="#1d242c" roughness={0.55} metalness={0.35} />
            </mesh>
            {/* archival mat behind the comic */}
            <mesh position={[0, 0, 0.032]}>
                <boxGeometry args={[caseW - 0.018, caseH - 0.018, 0.016]} />
                <meshStandardMaterial color="#efeadd" roughness={0.6} />
            </mesh>
            {/* the comic itself */}
            <mesh position={[0, 0, 0.042]}>
                <planeGeometry args={[comicWidth, comicHeight]} />
                <meshStandardMaterial map={texture} roughness={0.5} />
            </mesh>
            {/* thick glass enclosure */}
            <mesh position={[0, 0, 0.024 + caseD / 2]}>
                <boxGeometry args={[caseW, caseH, caseD]} />
                <meshPhysicalMaterial
                    color="#cfe6f2"
                    transparent
                    opacity={0.16}
                    roughness={0.05}
                    metalness={0}
                    clearcoat={1}
                    clearcoatRoughness={0.06}
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
}

function OliveTree3D({ position = [0, 0, -4.05], rotation = [0, 0, 0], reduce }) {
    const crown = useRef();
    useFrame((s) => {
        if (reduce || !crown.current) return;
        crown.current.rotation.z = Math.sin(s.clock.elapsedTime * 0.55 + position[0] * 0.2) * 0.02;
    });

    return (
        <group position={position} rotation={rotation}>
            <CeramicPot color="#7a8a68" accent="#d9d2b4" />
            <mesh position={[0, 1.14, 0]}>
                <cylinderGeometry args={[0.065, 0.11, 1.48, 12]} />
                <meshStandardMaterial color="#6c563f" roughness={0.92} />
            </mesh>
            <mesh position={[0.02, 1.92, 0.01]} rotation={[0.06, 0, -0.08]}>
                <cylinderGeometry args={[0.04, 0.07, 0.52, 12]} />
                <meshStandardMaterial color="#705b43" roughness={0.92} />
            </mesh>
            <mesh position={[0, 1.82, 0]}>
                <sphereGeometry args={[0.085, 12, 12]} />
                <meshStandardMaterial color="#6f5942" roughness={0.92} />
            </mesh>
            <mesh position={[0.02, 2.17, 0.01]}>
                <sphereGeometry args={[0.06, 12, 12]} />
                <meshStandardMaterial color="#735d45" roughness={0.92} />
            </mesh>
            <mesh position={[-0.12, 2.28, 0.01]} rotation={[0.18, 0, -0.42]}>
                <cylinderGeometry args={[0.018, 0.03, 0.42, 10]} />
                <meshStandardMaterial color="#705b43" roughness={0.92} />
            </mesh>
            <mesh position={[0.12, 2.32, -0.02]} rotation={[-0.12, 0.06, 0.3]}>
                <cylinderGeometry args={[0.016, 0.028, 0.38, 10]} />
                <meshStandardMaterial color="#765f46" roughness={0.92} />
            </mesh>

            <group ref={crown} position={[0, 2.28, 0]}>
                {[
                    [0, 0.48, 0.02, 0.56, 0.4, 0.44, '#7f9365'],
                    [-0.36, 0.24, 0.06, 0.42, 0.3, 0.36, '#708458'],
                    [0.4, 0.28, -0.04, 0.46, 0.32, 0.38, '#87986d'],
                    [-0.16, 0.82, -0.02, 0.36, 0.26, 0.3, '#93a57a'],
                    [0.22, 0.94, 0.04, 0.34, 0.24, 0.28, '#6e8157'],
                    [-0.02, 1.18, 0, 0.28, 0.2, 0.24, '#9aaa83'],
                    [0.08, 0.16, 0.16, 0.32, 0.24, 0.26, '#778c60'],
                ].map(([x, y, z, sx, sy, sz, color], i) => (
                    <mesh key={i} position={[x, y, z]} scale={[sx, sy, sz]}>
                        <sphereGeometry args={[1, 18, 14]} />
                        <meshStandardMaterial color={color} roughness={0.86} />
                    </mesh>
                ))}
                {[
                    [-0.18, 0.68, 0.18],
                    [0.28, 0.62, 0.14],
                    [0.06, 1.02, 0.12],
                    [-0.08, 0.38, -0.16],
                    [0.18, 0.24, -0.12],
                ].map(([x, y, z], i) => (
                    <mesh key={`olive-${i}`} position={[x, y, z]}>
                        <sphereGeometry args={[0.035, 10, 10]} />
                        <meshStandardMaterial color="#3f4630" roughness={0.7} />
                    </mesh>
                ))}
            </group>
        </group>
    );
}

function WarmOfficeDressing({ reduce }) {
    return (
        <group>
            <PottedTree position={[-7.35, 0, 1.05]} scale={1.08} reduce={reduce} />
            <Plant3D position={[8.6, 0, 2.7]} scale={1.25} reduce={reduce} potColor="#46637f" accent="#b9d2df" leafColor="#4ea86c" leafDark="#276d47" variant="round" swayOffset={1.5} />
            <Plant3D position={[-10.2, 0, -4.15]} scale={1.05} reduce={reduce} potColor="#b9553c" accent="#f1b77a" leafColor="#5abf82" leafDark="#2f7a53" variant="tall" swayOffset={2.1} />
            <Plant3D position={[8.95, 0, -4.15]} scale={1.05} reduce={reduce} potColor="#7c5b96" accent="#d8c3ec" leafColor="#6bbf72" leafDark="#386d44" variant="tall" swayOffset={2.8} />

            {/* low lounge seating keeps the room human without blocking desk sightlines */}
            <mesh position={[-6.7, 0.24, 4.85]}>
                <boxGeometry args={[2.2, 0.48, 0.72]} />
                <meshStandardMaterial color="#283848" roughness={0.82} />
            </mesh>
            <mesh position={[-6.7, 0.68, 5.18]}>
                <boxGeometry args={[2.18, 0.72, 0.16]} />
                <meshStandardMaterial color="#22303d" roughness={0.85} />
            </mesh>
            <mesh position={[-7.25, 0.74, 4.55]} rotation={[0.1, 0, -0.08]}>
                <boxGeometry args={[0.46, 0.16, 0.42]} />
                <meshStandardMaterial color="#d99b54" roughness={0.8} />
            </mesh>
            <mesh position={[-6.58, 0.76, 4.52]} rotation={[0.08, 0, 0.07]}>
                <boxGeometry args={[0.5, 0.16, 0.4]} />
                <meshStandardMaterial color="#5fb083" roughness={0.8} />
            </mesh>

            {/* moved from under the sign to the empty stretch of right wall behind the door */}
            <WallArt3D
                position={[10.94, 3.12, -3.1]}
                rotation={[0, -Math.PI / 2, 0]}
                image="FullSizeRender.JPEG"
                frameColor="#4a3526"
                width={0.92}
                height={1.16}
            />
            <FloorRadio3D position={[10.8, 0, -3.1]} rotation={[0, -Math.PI / 2, 0]} />
            {/* artwork on the right wall, facing inward */}
            <WallArt3D
                position={[10.94, 3.12, 3.45]}
                rotation={[0, -Math.PI / 2, 0]}
                image="FullSizeRender (7).JPEG"
                frameColor="#5a3c25"
                width={3.75}
                height={3.75}
            />
            {/* restored artwork on the back wall, left section */}
            <WallArt3D
                position={[-9.5, 3.0, -4.91]}
                image="artwork-2.jpg"
                frameColor="#3a2a1c"
                width={2.2}
                height={2.2}
            />
            {/* large framed image on the left wall, opposite side of the side window */}
            <WallArt3D
                position={[-10.94, 3.05, 4.15]}
                rotation={[0, Math.PI / 2, 0]}
                image="FullSizeRender (2).JPEG"
                frameColor="#3a2a1c"
                width={2.0}
                height={2.0}
            />
            <WallShelf3D position={[-10.72, 2.55, -1]} rotation={[0, Math.PI / 2, 0]} reduce={reduce} />
            {/* snack table near the left-wall window */}
            <SnackTable3D position={[-9.35, 0, 3.05]} scale={1.35} />
            {/* comic covers in glass cases on the back wall, beneath the PERCI HQ sign */}
            <ComicCase3D
                position={[-0.55, 3.0, -4.96]}
                image="marv-amazing.webp"
                comicWidth={0.199}
                comicHeight={0.264}
                scale={2.8}
            />
            <ComicCase3D
                position={[0.55, 3.0, -4.96]}
                image="dc-action.png"
                comicWidth={0.2}
                comicHeight={0.267}
                scale={2.8}
            />
            {/* small shelf with plant between the painting and the window */}
            <group position={[-7.75, 2.4, -4.92]}>
                <mesh>
                    <boxGeometry args={[0.8, 0.06, 0.2]} />
                    <meshStandardMaterial color="#5a3c25" roughness={0.8} />
                </mesh>
                <Plant3D position={[0, 0.03, 0.02]} scale={0.35} reduce={reduce} potColor="#c5793e" accent="#f4d28d" leafColor="#3f8f5a" leafDark="#2f7347" variant="round" swayOffset={4.2} />
            </group>

            <OliveTree3D position={[-2.85, 0, -4.12]} rotation={[0, Math.PI, 0]} reduce={reduce} />
        </group>
    );
}

// ── Scene root ───────────────────────────────────────────────────────────

const BACK_ROW = { z: -1.8, count: 7 };
const FRONT_ROW = { z: 1, count: 6 };

export default function OfficeScene({ desks, perciState, bubble, onDeskClick }) {
    const [now, setNow] = useState(() => new Date());
    const reduce = useMemo(
        () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        []
    );
    const timeScene = useMemo(() => getTimeScene(now), [now]);

    const placed = useMemo(() => desks.map((desk, i) => {
        const inBack = i < BACK_ROW.count;
        const row = inBack ? BACK_ROW : FRONT_ROW;
        const col = inBack ? i : i - BACK_ROW.count;
        return { ...desk, x: (col - (row.count - 1) / 2) * 2.35, z: row.z };
    }), [desks]);

    useEffect(() => {
        const tick = () => setNow(new Date());
        const id = window.setInterval(tick, 60 * 1000);
        return () => window.clearInterval(id);
    }, []);

    return (
        <Canvas dpr={[1, 2]} camera={{ position: [0, 6.8, 11.4], fov: 42 }}>
            <fog attach="fog" args={[timeScene.fog, 18, 36]} />
            <color attach="background" args={[timeScene.background]} />

            <ambientLight color={timeScene.ambient} intensity={timeScene.ambientIntensity} />
            <directionalLight position={[5, 9, 7]} color={timeScene.sunColor} intensity={timeScene.sunIntensity} />
            <pointLight position={[0, 4, -4.2]} color="#fbbf24" intensity={timeScene.pointIntensity} distance={10} decay={2} />

            <Room />
            <OfficeWindow scene={timeScene} />
            <OfficeWindow scene={timeScene} position={[-10.94, 3.0, 1.35]} rotation={[0, Math.PI / 2, 0]} scale={0.7} showCelestial={false} />
            <Door3D />
            <WallClock3D position={[-10.72, 3.55, -1]} rotation={[0, Math.PI / 2, 0]} />
            <WallTv3D reduce={reduce} />
            <WarmOfficeDressing reduce={reduce} />
            <HangingLamp x={-5.2} z={0.4} offset={0} reduce={reduce} intensity={timeScene.lampIntensity} />
            <HangingLamp x={0} z={0.4} offset={1.8} reduce={reduce} intensity={timeScene.lampIntensity} />
            <HangingLamp x={5.2} z={0.4} offset={3.1} reduce={reduce} intensity={timeScene.lampIntensity} />

            {/* 3D Neon sign sorted perfectly in WebGL depth, resolving lighting occlusion issues */}
            <NeonSign3D reduce={reduce} />

            {placed.map(({ agent, mood, color, x, z }) => (
                <DeskPod
                    key={agent.id}
                    x={x}
                    z={z}
                    color={color}
                    label={agent.shortLabel}
                    mood={mood}
                    agentId={agent.id}
                    onClick={onDeskClick}
                    reduce={reduce}
                />
            ))}

            <Perci3D state={perciState} bubble={bubble} reduce={reduce} />

            <ContactShadows position={[0, 0.02, 1]} scale={[24, 14]} opacity={0.55} blur={2.2} far={4.5} resolution={512} />

            <OrbitControls
                makeDefault
                target={[0, 0.9, 0]}
                enablePan={false}
                enableDamping
                dampingFactor={0.08}
                minDistance={5}
                maxDistance={15}
                minPolarAngle={0.6}
                maxPolarAngle={1.48}
                minAzimuthAngle={-0.75}
                maxAzimuthAngle={0.75}
            />
        </Canvas>
    );
}
