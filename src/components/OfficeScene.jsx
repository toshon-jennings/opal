import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, ContactShadows, useCursor } from '@react-three/drei';

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
    if (hour >= 7 && hour < 17) return TIME_SCENES.day;
    if (hour >= 17 && hour < 20.5) return TIME_SCENES.dusk;
    return TIME_SCENES.night;
}

// ── Sir Perci ────────────────────────────────────────────────────────────

function PerciSword() {
    return (
        <group position={[0, -0.26, 0.03]}>
            <mesh position={[0, 0.34, 0]}>
                <boxGeometry args={[0.05, 0.52, 0.018]} />
                <meshStandardMaterial color={BLADE} roughness={0.3} metalness={0.6} />
            </mesh>
            <mesh position={[0, 0.06, 0]}>
                <boxGeometry args={[0.2, 0.045, 0.05]} />
                <meshStandardMaterial color={GOLD} roughness={0.4} metalness={0.5} />
            </mesh>
            <mesh position={[0, -0.02, 0]}>
                <cylinderGeometry args={[0.026, 0.026, 0.12, 8]} />
                <meshStandardMaterial color={PERCI_DARK} />
            </mesh>
            <mesh position={[0, -0.1, 0]}>
                <sphereGeometry args={[0.04, 12, 12]} />
                <meshStandardMaterial color={GOLD} metalness={0.5} roughness={0.4} />
            </mesh>
        </group>
    );
}

function PerciShield() {
    return (
        <group position={[0, -0.26, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh>
                <cylinderGeometry args={[0.2, 0.2, 0.04, 20]} />
                <meshStandardMaterial color={GOLD} roughness={0.45} metalness={0.4} />
            </mesh>
            <mesh position={[0, 0.03, 0]}>
                <cylinderGeometry args={[0.07, 0.07, 0.03, 14]} />
                <meshStandardMaterial color={PERCI} />
            </mesh>
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
        if (antL.current) antL.current.rotation.z = -0.5 + Math.sin(t * antSpeed) * 0.18;
        if (antR.current) antR.current.rotation.z = 0.5 + Math.sin(t * antSpeed + 1) * 0.18;

        // arms: walking swing, then mood overrides (sword chop / raise, shield guard)
        const swing = speed === 0 ? 0 : Math.sin(w.phase) * 0.45;
        if (armL.current) armL.current.rotation.set(swing, 0, 0.45);
        if (armR.current) armR.current.rotation.set(-swing, 0, -0.45);
        if (state === 'error' && armL.current) armL.current.rotation.set(-1.15, 0, 0.9);
        if (state === 'working' && armR.current) armR.current.rotation.x = -0.5 + Math.sin(t * 6) * 0.5;
        if (state === 'happy' && armR.current) armR.current.rotation.set(0, 0, -2.4);
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
                {[[antL, -0.15, -0.5], [antR, 0.15, 0.5]].map(([ref, x, tilt]) => (
                    <group key={x} ref={ref} position={[x, 0.34, 0]} rotation={[0, 0, tilt]}>
                        <mesh position={[0, 0.12, 0]}>
                            <cylinderGeometry args={[0.028, 0.028, 0.22, 8]} />
                            <meshStandardMaterial color={PERCI} roughness={0.6} />
                        </mesh>
                        <mesh position={[0, 0.27, 0]}>
                            <sphereGeometry args={[0.07, 12, 12]} />
                            <meshStandardMaterial color={PERCI} roughness={0.6} />
                        </mesh>
                    </group>
                ))}

                {/* arms: left bears the shield, right the sword */}
                <group ref={armL} position={[-0.4, 0.02, 0]}>
                    <mesh position={[0, -0.14, 0]}>
                        <capsuleGeometry args={[0.06, 0.18, 4, 8]} />
                        <meshStandardMaterial color={PERCI} roughness={0.6} />
                    </mesh>
                    <PerciShield />
                </group>
                <group ref={armR} position={[0.4, 0.02, 0]}>
                    <mesh position={[0, -0.14, 0]}>
                        <capsuleGeometry args={[0.06, 0.18, 4, 8]} />
                        <meshStandardMaterial color={PERCI} roughness={0.6} />
                    </mesh>
                    <PerciSword />
                </group>
            </group>

            <Html position={[0, 1.55, 0]} center distanceFactor={10} zIndexRange={[30, 0]}
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

function DeskPod({ x, z, color, label, tip, mood, onClick, reduce }) {
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
            onClick={(e) => { e.stopPropagation(); onClick(); }}
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

            <Html position={[0, 0.55, 0.5]} center distanceFactor={11} zIndexRange={[30, 0]}
                style={{ pointerEvents: 'none' }}>
                <span className="o-nameplate" data-status={mood} title={tip}>
                    <span className="o-led" />
                    {label}
                </span>
            </Html>
        </group>
    );
}

// ── Room dressing ────────────────────────────────────────────────────────

function Room() {
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
            <mesh position={[-11, 3.25, 0.5]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[13, 6.5]} />
                <meshStandardMaterial color="#241a2b" roughness={0.95} />
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

function OfficeWindow({ scene }) {
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
        <group position={[-5.6, 3.4, -4.94]}>
            <mesh>
                <planeGeometry args={[3, 1.9]} />
                <meshStandardMaterial color={scene.sky} emissive={scene.sky} emissiveIntensity={isNight ? 0.08 : 0.18} roughness={0.6} />
            </mesh>
            <mesh position={[0, -0.52, 0.025]}>
                <planeGeometry args={[2.85, 0.72]} />
                <meshStandardMaterial color={scene.horizon} emissive={scene.horizon} emissiveIntensity={isNight ? 0.04 : 0.28} transparent opacity={0.9} />
            </mesh>
            <mesh position={isNight ? [0.95, 0.55, 0.04] : sunPosition}>
                <sphereGeometry args={isNight ? [0.16, 14, 14] : [0.24, 18, 18]} />
                <meshStandardMaterial color={scene.outsideGlow} emissive={scene.outsideGlow} emissiveIntensity={isNight ? 1.6 : 2.2} />
            </mesh>
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

function WallClock3D() {
    const hour = useRef();
    const minute = useRef();
    useFrame(() => {
        const now = new Date();
        if (hour.current) hour.current.rotation.z = -((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6);
        if (minute.current) minute.current.rotation.z = -now.getMinutes() * (Math.PI / 30);
    });
    return (
        <group position={[5.6, 3.6, -4.9]}>
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

function Plant3D({ reduce }) {
    const leaves = useRef();
    useFrame((s) => {
        if (reduce || !leaves.current) return;
        leaves.current.rotation.z = Math.sin(s.clock.elapsedTime * 0.9) * 0.05;
    });
    return (
        <group position={[8.8, 0, 2.4]}>
            <mesh position={[0, 0.22, 0]}>
                <cylinderGeometry args={[0.2, 0.26, 0.44, 12]} />
                <meshStandardMaterial color="#a85b32" roughness={0.85} />
            </mesh>
            <group ref={leaves} position={[0, 0.44, 0]}>
                <mesh position={[0, 0.34, 0]}>
                    <sphereGeometry args={[0.27, 12, 12]} />
                    <meshStandardMaterial color="#3f8f5a" roughness={0.8} />
                </mesh>
                <mesh position={[-0.2, 0.16, 0.05]}>
                    <sphereGeometry args={[0.18, 12, 12]} />
                    <meshStandardMaterial color="#357a4c" roughness={0.8} />
                </mesh>
                <mesh position={[0.2, 0.2, -0.05]}>
                    <sphereGeometry args={[0.2, 12, 12]} />
                    <meshStandardMaterial color="#46a065" roughness={0.8} />
                </mesh>
            </group>
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
            <WallClock3D />
            <Plant3D reduce={reduce} />
            <HangingLamp x={-4.5} z={0.4} offset={0} reduce={reduce} intensity={timeScene.lampIntensity} />
            <HangingLamp x={0} z={0.4} offset={1.8} reduce={reduce} intensity={timeScene.lampIntensity} />
            <HangingLamp x={4.5} z={0.4} offset={3.1} reduce={reduce} intensity={timeScene.lampIntensity} />

            {/* neon sign reuses the 2D CSS (flicker included), pinned to the wall */}
            <Html transform position={[0, 4, -4.88]} distanceFactor={5} zIndexRange={[30, 0]}
                style={{ pointerEvents: 'none' }}>
                <div className="o-neon">PERCI&nbsp;HQ</div>
            </Html>

            {placed.map(({ agent, mood, color, tip, x, z }) => (
                <DeskPod
                    key={agent.id}
                    x={x}
                    z={z}
                    color={color}
                    label={agent.shortLabel}
                    tip={tip}
                    mood={mood}
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
