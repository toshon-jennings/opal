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

export function Districts({ districts, heatById }) {
    return (
        <g className="perci-map-districts" aria-hidden="true">
            {districts.map(district => {
                const heat = heatById?.get(district.id) || 0;
                return (
                    <g
                        key={district.id}
                        className={`perci-map-district${heat > 0 ? ' is-active' : ''}`}
                        style={heat > 0 ? { '--heat': Math.min(1, heat) } : undefined}
                    >
                        <rect
                            x={district.x}
                            y={district.y}
                            width={district.width}
                            height={district.height}
                            rx="12"
                        />
                        <text x={district.x + 14} y={district.y + 22}>
                            {district.label}
                        </text>
                    </g>
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
            {verticals.map(x => <line key={`v-${x}`} x1={x} y1="28" x2={x} y2="832" />)}
            {horizontals.map(y => <line key={`h-${y}`} x1="36" y1={y} x2="1284" y2={y} />)}
        </g>
    );
}

export function Station({ station, extraClassNames = [], selected, onOpen }) {
    const label = station.label.length > 12 ? `${station.label.slice(0, 11)}…` : station.label;
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
            <circle className="perci-station-ring" r="15" />
            <circle className="perci-station-dot" r={station.kind === 'home' ? 8 : 6.5} />
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
