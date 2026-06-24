/**
 * Custom duotone mode icons for Perci's ModeSwitcher and dashboard tiles.
 *
 * Outline-forward duotone: every silhouette shape carries the primary
 * stroke (like a lucide glyph, so it stays legible at ~15px) and is
 * filled with a softer translucent secondary tint for brand color.
 *
 * Layers:
 *   - shell : silhouette shape — primary outline + secondary tint fill
 *   - tint  : fill-only wash that sits inside an already-stroked outline
 *   - ink   : solid primary marks (eyes, dots, windows)
 * All fall back to currentColor, so the icons still work as plain
 * monochrome glyphs anywhere lucide-react icons are used.
 *
 * Consumers drive the duotone via two CSS vars:
 *   ModeSwitcher resting → --mi-primary: var(--accent),
 *                          --mi-secondary: translucent accent-cyan
 *   ModeSwitcher active  → --mi-primary: #fff, --mi-secondary: white 35%
 *   Dashboard tiles      → --mi-primary: var(--tile),
 *                          --mi-secondary: translucent tile hue
 */

const STROKE = 1.9;

// Silhouette: primary outline (inherited stroke) + secondary tint fill.
const shell = { fill: 'var(--mi-secondary, currentColor)' };
// Wash that lives inside a separately-stroked outline (no own outline).
const tint = { fill: 'var(--mi-secondary, currentColor)', stroke: 'none' };
// Solid mark painted in the primary tone.
const ink = { fill: 'var(--mi-primary, currentColor)', stroke: 'none' };

function Svg({ size = 24, children, ...props }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--mi-primary, currentColor)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            {...props}
        >
            {children}
        </svg>
    );
}

/* Dashboard — panel grid, one cell tinted. */
export function DashboardIcon(props) {
    return (
        <Svg {...props}>
            <rect x="3" y="3" width="8" height="8" rx="2" {...shell} />
            <rect x="13" y="3" width="8" height="8" rx="2" />
            <rect x="13" y="13" width="8" height="8" rx="2" />
            <rect x="3" y="13" width="8" height="8" rx="2" />
        </Svg>
    );
}

/* Chat — speech bubble with a tail and dots. */
export function ChatIcon(props) {
    return (
        <Svg {...props}>
            <path
                d="M6 4h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-4 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"
                {...shell}
            />
            <circle cx="8.5" cy="10" r="1.05" {...ink} />
            <circle cx="12" cy="10" r="1.05" {...ink} />
            <circle cx="15.5" cy="10" r="1.05" {...ink} />
        </Svg>
    );
}

/* Cowork — two people, back one tinted. */
export function CoworkIcon(props) {
    return (
        <Svg {...props}>
            <circle cx="16" cy="8.5" r="2.6" {...shell} />
            <path d="M12 21v-1a4.5 4.5 0 0 1 9 0v1z" {...shell} />
            <circle cx="9" cy="9" r="3" />
            <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        </Svg>
    );
}

/* Ensemble — a panel of voices converging into one synthesis. */
export function EnsembleIcon(props) {
    return (
        <Svg {...props}>
            {/* synthesis / output node */}
            <circle cx="16.8" cy="12" r="3.4" {...shell} />
            {/* panel inputs */}
            <circle cx="5" cy="6" r="1.7" {...ink} />
            <circle cx="5" cy="12" r="1.7" {...ink} />
            <circle cx="5" cy="18" r="1.7" {...ink} />
            {/* connectors converging to the output */}
            <path d="M6.6 6.7 13.5 10.5" />
            <path d="M6.7 12 13.4 12" />
            <path d="M6.6 17.3 13.5 13.5" />
        </Svg>
    );
}

/* Code — editor window with chevrons and slash. */
export function CodeIcon(props) {
    return (
        <Svg {...props}>
            <rect x="2.5" y="4" width="19" height="16" rx="3" {...shell} />
            <path d="M2.5 8h19" />
            <path d="M9 11l-2.5 2.5L9 16" />
            <path d="M15 11l2.5 2.5L15 16" />
            <path d="M13 10.5l-2 6.5" />
        </Svg>
    );
}

/* Notes — page with folded corner and lines. */
export function NotesIcon(props) {
    return (
        <Svg {...props}>
            <path
                d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                {...shell}
            />
            <path d="M14 3v5h5" />
            <path d="M8.5 13h7" />
            <path d="M8.5 16.5h7" />
        </Svg>
    );
}

/* Research — conical flask with liquid and bubbles. */
export function ResearchIcon(props) {
    return (
        <Svg {...props}>
            <path
                d="M7 14.5h10l1.9 3.1a2 2 0 0 1-1.7 3H6.8a2 2 0 0 1-1.7-3L7 14.5z"
                {...tint}
            />
            <path d="M9.5 3h5" />
            <path d="M10 3v6l-5 8.3a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9V3" />
            <circle cx="11" cy="17.8" r="0.85" {...ink} />
            <circle cx="13.8" cy="19" r="0.7" {...ink} />
        </Svg>
    );
}

/* Agents — robot head with antenna and eyes. */
export function AgentsIcon(props) {
    return (
        <Svg {...props}>
            <rect x="4" y="8" width="16" height="12" rx="3.5" {...shell} />
            <path d="M12 8V4.6" />
            <circle cx="12" cy="3.2" r="1.4" {...ink} />
            <path d="M2.6 13v3" />
            <path d="M21.4 13v3" />
            <circle cx="9" cy="14" r="1.4" {...ink} />
            <circle cx="15" cy="14" r="1.4" {...ink} />
        </Svg>
    );
}

/* Office — twin towers with windows and a door (Perci HQ). */
export function OfficeIcon(props) {
    return (
        <Svg {...props}>
            <rect x="4" y="3" width="9.5" height="18" rx="1.5" {...shell} />
            <rect x="13" y="9" width="7" height="12" rx="1.5" {...shell} />
            <rect x="6.2" y="6" width="1.8" height="1.8" rx="0.4" {...ink} />
            <rect x="9.5" y="6" width="1.8" height="1.8" rx="0.4" {...ink} />
            <rect x="6.2" y="9.5" width="1.8" height="1.8" rx="0.4" {...ink} />
            <rect x="9.5" y="9.5" width="1.8" height="1.8" rx="0.4" {...ink} />
            <rect x="15" y="12" width="1.6" height="1.6" rx="0.4" {...ink} />
            <rect x="17.4" y="12" width="1.6" height="1.6" rx="0.4" {...ink} />
            <rect x="7" y="16.5" width="3.5" height="4.5" rx="0.6" {...ink} />
        </Svg>
    );
}

/* Build — hammer (rotated head + handle). */
export function BuildIcon(props) {
    return (
        <Svg {...props}>
            <g transform="rotate(45 12 12)">
                <rect x="6" y="3.5" width="12" height="4.6" rx="2" {...shell} />
                <path d="M12 8.1V20.5" strokeWidth="2.4" />
            </g>
        </Svg>
    );
}

/* Mission — monitor panel with an activity pulse. */
export function MissionIcon(props) {
    return (
        <Svg {...props}>
            <rect x="3" y="3" width="18" height="18" rx="4" {...shell} />
            <path d="M6 13h3l2-5 3 9 2-5h3" />
        </Svg>
    );
}

/* Perci Map — route lines and station dots. */
export function SurfaceMapIcon(props) {
    return (
        <Svg {...props}>
            <path d="M5 17 9 9l5 5 5-8" {...shell} />
            <path d="M5 17h7l7-7" />
            <circle cx="5" cy="17" r="1.5" {...ink} />
            <circle cx="9" cy="9" r="1.5" {...ink} />
            <circle cx="14" cy="14" r="1.5" {...ink} />
            <circle cx="19" cy="6" r="1.5" {...ink} />
        </Svg>
    );
}

/* Ports — radar with sweep wedge and a blip. */
export function PortsIcon(props) {
    return (
        <Svg {...props}>
            <path d="M12 12V3a9 9 0 0 1 8.5 11.8z" {...tint} />
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="1.4" {...ink} />
            <circle cx="16" cy="8.5" r="1.1" {...ink} />
        </Svg>
    );
}

/* Projects — folder containing a terminal prompt symbols. */
export function ProjectsIcon(props) {
    return (
        <Svg {...props}>
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8L10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" {...shell} />
            <path d="M8 11h2L8 14" {...ink} />
            <path d="M11 14h4" />
        </Svg>
    );
}

/* Skills — puzzle piece with a check badge. */
export function SkillsIcon(props) {
    return (
        <Svg {...props}>
            <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.974-.924a2.501 2.501 0 1 0-3.171 3.234c.456.181.901.514.978.998a.928.928 0 0 1-.281.823l-1.609 1.61c-.47.47-1.087.705-1.704.705s-1.233-.235-1.704-.706l-1.567-1.567a1.073 1.073 0 0 0-.878-.289c-.948.144-1.514 1.094-1.514 2.054 0 .47-.235 1.233-.705 1.704s-1.087.706-1.704.706h-2.272c-.55 0-1.062-.234-1.421-.624A2.115 2.115 0 0 1 0 19.917v-2.273c0-.617.235-1.234.706-1.704.471-.47 1.234-.705 1.704-.705.96 0 1.91-.566 2.054-1.514.07-.32-.04-.65-.27-.88L2.625 11.272c-.47-.47-.706-1.087-.706-1.704s.235-1.234.706-1.704l1.61-1.61a.95.95 0 0 1 .79-.275c.484.077.817.522.998.978a2.501 2.501 0 0 0 3.234-3.171c-.444-.172-.855-.504-.924-.974a.98.98 0 0 1 .276-.837L10.22.07c.47-.47 1.087-.706 1.704-.706s1.234.235 1.704.706l1.567 1.567c.23.23.557.337.879.288.948-.144 1.513-1.094 1.513-2.054 0-.47.235-1.233.706-1.704h2.272a2.116 2.116 0 0 1 2.114 2.114v2.273c-.001.96-.566 1.91-1.514 2.054z" {...shell} />
            <path d="M9 12l2 2 4-4" {...ink} strokeWidth="2.5" />
        </Svg>
    );
}
