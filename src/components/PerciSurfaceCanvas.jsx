import React, { useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import './PerciSurfaceCanvas.css';

export const MAP_WIDTH = 1320;
export const MAP_HEIGHT = 860;
export const MIN_ZOOM = 0.7;
export const MAX_ZOOM = 1.55;
export const ZOOM_STEP = 0.15;

export function useMapZoom(initial = 0.9) {
    const [zoom, setZoom] = useState(initial);
    const setBoundedZoom = (value) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
        setZoom(Number(next.toFixed(2)));
    };
    return {
        zoom,
        setBoundedZoom,
        zoomOut: () => setBoundedZoom(zoom - ZOOM_STEP),
        zoomIn: () => setBoundedZoom(zoom + ZOOM_STEP),
        resetZoom: () => setBoundedZoom(initial),
    };
}

export function MapZoomBar({ zoom, onZoomOut, onZoomIn, onReset, onChange }) {
    return (
        <div className="perci-map-zoombar" aria-label="Map zoom controls">
            <button type="button" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
                <ZoomOut size={14} />
            </button>
            <input
                type="range"
                min={Math.round(MIN_ZOOM * 100)}
                max={Math.round(MAX_ZOOM * 100)}
                step="5"
                value={Math.round(zoom * 100)}
                onChange={(event) => onChange(Number(event.target.value) / 100)}
                aria-label="Map zoom"
            />
            <button type="button" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
                <ZoomIn size={14} />
            </button>
            <button type="button" onClick={onReset} aria-label="Reset zoom">
                <RotateCcw size={14} />
                <span>{Math.round(zoom * 100)}%</span>
            </button>
        </div>
    );
}

function districtStyle(district, heatById) {
    const heat = heatById?.get(district.id) || 0;
    return {
        className: `perci-map-district${heat > 0 ? ' is-active' : ''}`,
        style: {
            ...(district.color ? { '--district': district.color } : null),
            ...(heat > 0 ? { '--heat': Math.min(1, heat) } : null),
        },
    };
}

// District backgrounds paint first (behind the grid, routes, and stations).
// The title text is a separate layer — see DistrictLabels — so route lines
// crossing a district's corner never draw over its name.
export function Districts({ districts, heatById }) {
    return (
        <g className="perci-map-districts" aria-hidden="true">
            {districts.map(district => {
                const { className, style } = districtStyle(district, heatById);
                return (
                    <rect
                        key={district.id}
                        className={className}
                        style={style}
                        x={district.x}
                        y={district.y}
                        width={district.width}
                        height={district.height}
                        rx="12"
                    />
                );
            })}
        </g>
    );
}

export function DistrictLabels({ districts, heatById }) {
    return (
        <g className="perci-map-district-labels" aria-hidden="true">
            {districts.map(district => {
                const { className, style } = districtStyle(district, heatById);
                return (
                    <text key={district.id} className={className} style={style} x={district.x + 14} y={district.y + 22}>
                        {district.label}
                    </text>
                );
            })}
        </g>
    );
}

export function MapGrid() {
    const verticals = [80, 200, 320, 440, 560, 680, 800, 920, 1040, 1160, 1280];
    const horizontals = [80, 160, 240, 320, 400, 480, 560, 640, 720, 800];
    return (
        <g className="perci-map-grid" aria-hidden="true">
            {verticals.flatMap(x =>
                horizontals.map(y => <circle key={`d-${x}-${y}`} cx={x} cy={y} r="1.4" />)
            )}
        </g>
    );
}

// Expands consecutive station points into a Beck-style octilinear polyline:
// each leg travels along one axis first, then finishes on a 45° diagonal.
export function expandOctilinearPoints(points) {
    if (points.length === 0) return [];
    const expanded = [{ x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length; i++) {
        const a = expanded[expanded.length - 1];
        const b = points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx > 1 && ady > 1 && Math.abs(adx - ady) > 1) {
            if (adx > ady) {
                expanded.push({ x: b.x - Math.sign(dx) * ady, y: a.y });
            } else {
                expanded.push({ x: a.x, y: b.y - Math.sign(dy) * adx });
            }
        }
        if (Math.hypot(b.x - a.x, b.y - a.y) > 1) {
            expanded.push({ x: b.x, y: b.y });
        }
    }
    return expanded;
}

export function buildOctilinearPath(points, radius = 15) {
    const pts = expandOctilinearPoints(points);
    if (pts.length < 2) return '';
    const fmt = value => Math.round(value * 10) / 10;
    let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
    for (let i = 1; i < pts.length - 1; i++) {
        const prev = pts[i - 1];
        const v = pts[i];
        const next = pts[i + 1];
        const inLen = Math.hypot(v.x - prev.x, v.y - prev.y);
        const outLen = Math.hypot(next.x - v.x, next.y - v.y);
        const r = Math.min(radius, inLen / 2, outLen / 2);
        const p1 = { x: v.x - ((v.x - prev.x) / inLen) * r, y: v.y - ((v.y - prev.y) / inLen) * r };
        const p2 = { x: v.x + ((next.x - v.x) / outLen) * r, y: v.y + ((next.y - v.y) / outLen) * r };
        d += ` L ${fmt(p1.x)} ${fmt(p1.y)} Q ${fmt(v.x)} ${fmt(v.y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
    return d;
}

const BADGE_HEIGHT = 18;
const BADGE_MARGIN = 8;
// Generous footprint around a station's dot + label, in any anchor direction —
// approximate rather than exact text metrics, but wide enough that a badge
// clearing it reads as clearly "off" the station, not just technically not touching it.
const STATION_FOOTPRINT = { width: 92, height: 56 };

function rectsOverlap(a, b) {
    return !(
        a.x + a.width / 2 <= b.x - b.width / 2 ||
        a.x - a.width / 2 >= b.x + b.width / 2 ||
        a.y + a.height / 2 <= b.y - b.height / 2 ||
        a.y - a.height / 2 >= b.y + b.height / 2
    );
}

// Places one label badge per route the way a hand-drawn transit map would:
// on the longest straight run of the line (naturally the open space between
// stations, since stations sit at the polyline's vertices), nudged sideways
// off that run's centerline until it clears every station's footprint and
// every badge already placed for an earlier route.
export function placeRouteBadges(routeCandidates, stations) {
    const stationRects = stations.map(station => ({ x: station.x, y: station.y, ...STATION_FOOTPRINT }));
    const placedRects = [];
    const positions = new Map();

    routeCandidates.forEach(({ id, points, width }) => {
        const polyline = expandOctilinearPoints(points);
        if (polyline.length < 2) return;

        const segments = [];
        for (let i = 1; i < polyline.length; i++) {
            const a = polyline[i - 1];
            const b = polyline[i];
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            if (length < 1) continue;
            segments.push({
                mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                normal: { x: -(b.y - a.y) / length, y: (b.x - a.x) / length },
                length,
            });
        }
        segments.sort((a, b) => b.length - a.length);

        const rectAt = (point) => ({ x: point.x, y: point.y, width: width + BADGE_MARGIN, height: BADGE_HEIGHT + BADGE_MARGIN });
        const clears = (rect) =>
            stationRects.every(station => !rectsOverlap(rect, station)) &&
            placedRects.every(other => !rectsOverlap(rect, other));

        const candidates = segments.slice(0, 4).flatMap(segment =>
            [0, 14, -14, 26, -26].map(nudge => ({
                x: segment.mid.x + segment.normal.x * nudge,
                y: segment.mid.y + segment.normal.y * nudge,
            }))
        );

        const chosen = candidates.find(point => clears(rectAt(point))) || candidates[0] || polyline[0];
        positions.set(id, chosen);
        placedRects.push(rectAt(chosen));
    });

    return positions;
}

export function Station({ station, extraClassNames = [], selected, onOpen }) {
    const label = station.label;
    const labelProps = getLabelProps(station);
    const className = [
        'perci-map-station',
        ...extraClassNames,
        selected ? 'is-selected' : '',
        `is-${station.kind}`,
    ].filter(Boolean).join(' ');

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
        }
    };

    return (
        <g
            className={className}
            transform={`translate(${station.x} ${station.y})`}
            role="button"
            tabIndex={0}
            aria-label={`Open ${station.label}`}
            onClick={onOpen}
            onKeyDown={handleKeyDown}
        >
            <circle className="perci-station-hit" r="18" />
            <circle className="perci-station-halo" r="17" />
            <circle className="perci-station-ring" r={station.kind === 'home' ? 11 : 9} />
            <circle className="perci-station-dot" r={station.kind === 'home' ? 4.5 : 3.5} />
            <text
                x={labelProps.x}
                y={labelProps.y}
                textAnchor={labelProps.anchor}
                className="perci-station-label"
            >
                {label}
            </text>
        </g>
    );
}

export function getLabelProps(station) {
    if (station.icon) return { x: 0, y: 26, anchor: 'middle' };
    if (station.x < 135) return { x: 18, y: 4, anchor: 'start' };
    if (station.x > 1160) return { x: -18, y: 4, anchor: 'end' };
    if (station.y > 720) return { x: 0, y: -18, anchor: 'middle' };
    if (station.y < 120) return { x: 0, y: 24, anchor: 'middle' };
    return { x: 0, y: 24, anchor: 'middle' };
}
