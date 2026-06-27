import React, { useMemo, useState } from 'react';
import {
    ArrowUpRight,
    Bot,
    CircleDollarSign,
    Hammer,
    Map as MapIcon,
    Route,
    Search,
    Server,
    Share2,
    ShieldCheck,
} from 'lucide-react';
import { useMode, MODES } from '../context/ModeContext';
import {
    PERCI_SURFACE_STATIONS,
    SURFACE_MAP_DISTRICTS,
    SURFACE_ROUTE_TYPES,
    filterSurfaceMapRoutes,
    getSurfaceDistrict,
    getSurfaceMapSummary,
    getVisibleSurfaceStationIds,
} from '../lib/perciSurfaceMap';
import {
    MAP_HEIGHT,
    MAP_WIDTH,
    Districts,
    MapGrid,
    MapZoomBar,
    Station,
    useMapZoom,
} from './PerciSurfaceCanvas';
import './PerciMapMode.css';

const ROUTE_ICONS = {
    movement: Route,
    context: Share2,
    automation: Bot,
    creation: Hammer,
    research: Search,
    runtime: Server,
    governance: ShieldCheck,
    expenses: CircleDollarSign,
};

const KIND_LABELS = {
    home: 'Home',
    native: 'Native surface',
    system: 'System surface',
    utility: 'Utility window',
};

export default function PerciMapMode() {
    const { openWindow, setCurrentMode } = useMode();
    const [activeTypes, setActiveTypes] = useState(() => Object.keys(SURFACE_ROUTE_TYPES));
    const [selectedStationId, setSelectedStationId] = useState('workspace');
    const { zoom, setBoundedZoom, zoomOut, zoomIn, resetZoom } = useMapZoom(0.9);

    const stationById = useMemo(
        () => new Map(PERCI_SURFACE_STATIONS.map(station => [station.id, station])),
        []
    );
    const visibleRoutes = useMemo(
        () => filterSurfaceMapRoutes(activeTypes),
        [activeTypes]
    );
    const visibleStationIds = useMemo(
        () => getVisibleSurfaceStationIds(visibleRoutes),
        [visibleRoutes]
    );
    const summary = useMemo(
        () => getSurfaceMapSummary(visibleRoutes),
        [visibleRoutes]
    );
    const selectedStation = stationById.get(selectedStationId) || PERCI_SURFACE_STATIONS[0];
    const selectedDistrict = getSurfaceDistrict(selectedStation);
    const selectedRoutes = visibleRoutes.filter(route => route.stationIds.includes(selectedStation.id));

    const toggleRouteType = (routeTypeId) => {
        setActiveTypes(current => {
            if (current.includes(routeTypeId)) {
                return current.length === 1 ? current : current.filter(id => id !== routeTypeId);
            }
            return [...current, routeTypeId];
        });
    };

    const showAllRoutes = () => setActiveTypes(Object.keys(SURFACE_ROUTE_TYPES));
    const hideAllRoutes = () => setActiveTypes([]);

    const openStation = (station) => {
        setSelectedStationId(station.id);
        if (station.targetId === MODES.DASHBOARD) {
            setCurrentMode(MODES.DASHBOARD);
        } else {
            openWindow(station.targetId);
        }
    };

    return (
        <div className="perci-map-mode">
            <header className="perci-map-header">
                <div>
                    <p className="perci-map-kicker">
                        <MapIcon size={15} />
                        Perci system map
                    </p>
                    <h1>Perci Map</h1>
                    <p>
                        A stable Beck-inspired map of how Perci surfaces relate, move context, run agents,
                        create outputs, and depend on local systems, grouped into real workspace districts.
                    </p>
                </div>
                <div className="perci-map-stats" aria-label="Visible map summary">
                    <Metric label="Routes" value={summary.routeCount} />
                    <Metric label="Stations" value={summary.stationCount} />
                    <Metric label="Types" value={summary.routeTypes.length} />
                </div>
            </header>

            <section className="perci-map-filters" aria-label="Route filters">
                {Object.values(SURFACE_ROUTE_TYPES).map(routeType => {
                    const Icon = ROUTE_ICONS[routeType.id] || Route;
                    const active = activeTypes.includes(routeType.id);
                    return (
                        <button
                            key={routeType.id}
                            type="button"
                            aria-pressed={active}
                            className="perci-route-filter"
                            style={{ '--route': routeType.color }}
                            onClick={() => toggleRouteType(routeType.id)}
                        >
                            <Icon size={14} />
                            <LineSample routeType={routeType} />
                            <span>{routeType.label}</span>
                        </button>
                    );
                })}
                <button type="button" className="perci-route-reset" onClick={hideAllRoutes}>
                    Clear all
                </button>
                <button type="button" className="perci-route-reset" onClick={showAllRoutes}>
                    Show all
                </button>
            </section>

            <div className="perci-map-content">
                <section className="perci-map-canvas" aria-label="Perci surface transit map">
                    <MapZoomBar
                        zoom={zoom}
                        onZoomOut={zoomOut}
                        onZoomIn={zoomIn}
                        onReset={resetZoom}
                        onChange={setBoundedZoom}
                    />
                    <svg
                        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                        role="img"
                        aria-labelledby="perci-map-title perci-map-desc"
                        style={{
                            '--map-width': `${Math.round(MAP_WIDTH * zoom)}px`,
                            '--map-height': `${Math.round(MAP_HEIGHT * zoom)}px`,
                        }}
                    >
                        <title id="perci-map-title">Perci surface relationship map</title>
                        <desc id="perci-map-desc">Stations represent Perci surfaces grouped into districts. Colored routes represent movement, shared context, agent work, build output, research, local runtime, governance, and expenses.</desc>
                        <Districts districts={SURFACE_MAP_DISTRICTS} />
                        <MapGrid />
                        {visibleRoutes.map((route, index) => (
                            <RoutePath
                                key={route.id}
                                route={route}
                                routeIndex={index}
                                stationById={stationById}
                                selectedStationId={selectedStation.id}
                            />
                        ))}
                        {PERCI_SURFACE_STATIONS.map(station => (
                            <Station
                                key={station.id}
                                station={station}
                                extraClassNames={[
                                    visibleStationIds.has(station.id) ? 'is-visible' : 'is-muted',
                                    selectedRoutes.some(route => route.stationIds.includes(station.id)) ? 'is-related' : '',
                                ]}
                                selected={selectedStation.id === station.id}
                                onOpen={() => openStation(station)}
                            />
                        ))}
                    </svg>
                </section>

                <aside className="perci-map-inspector" aria-label="Selected station details">
                    <div className="perci-station-detail">
                        <span className="perci-station-kind">{KIND_LABELS[selectedStation.kind] || selectedStation.kind}</span>
                        <h2>{selectedStation.label}</h2>
                        {selectedDistrict && (
                            <span className="perci-station-district">{selectedDistrict.label}</span>
                        )}
                        <p>{selectedStation.description}</p>
                        <button type="button" className="perci-open-station" onClick={() => openStation(selectedStation)}>
                            <ArrowUpRight size={15} />
                            Open surface
                        </button>
                    </div>

                    <div className="perci-route-list">
                        <h3>Routes through this station</h3>
                        {selectedRoutes.length === 0 ? (
                            <p className="perci-map-empty">Hidden by the current filters.</p>
                        ) : selectedRoutes.map(route => {
                            const routeType = SURFACE_ROUTE_TYPES[route.type];
                            const Icon = ROUTE_ICONS[route.type] || Route;
                            return (
                                <button
                                    key={route.id}
                                    type="button"
                                    className="perci-route-row"
                                    style={{ '--route': routeType.color }}
                                    onClick={() => setActiveTypes([route.type])}
                                >
                                    <span className="perci-route-row-icon">
                                        <Icon size={14} />
                                    </span>
                                    <span>
                                        <strong>{route.label}</strong>
                                        <LineSample routeType={routeType} />
                                        <small>{routeType.description}</small>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function LineSample({ routeType }) {
    return (
        <svg
            className="perci-line-sample"
            viewBox="0 0 44 8"
            aria-label={`${routeType.linePattern?.label || 'Solid'} line`}
        >
            <line
                x1="2"
                y1="4"
                x2="42"
                y2="4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={routeType.linePattern?.dasharray || undefined}
            />
        </svg>
    );
}

function Metric({ label, value }) {
    return (
        <div className="perci-map-metric">
            <strong>{value}</strong>
            <span>{label}</span>
        </div>
    );
}

function RoutePath({ route, routeIndex, stationById, selectedStationId }) {
    const routeType = SURFACE_ROUTE_TYPES[route.type];
    const points = route.stationIds
        .map(id => stationById.get(id))
        .filter(Boolean);
    if (points.length < 2) return null;

    const d = points.map((station, index) => `${index === 0 ? 'M' : 'L'} ${station.x} ${station.y}`).join(' ');
    const selectedOnRoute = route.stationIds.includes(selectedStationId);
    const offset = (routeIndex % 3 - 1) * 2;

    return (
        <g className={selectedOnRoute ? 'perci-map-route is-related' : 'perci-map-route'}>
            <path d={d} transform={`translate(${offset} ${-offset})`} className="perci-route-underlay" />
            <path
                d={d}
                transform={`translate(${offset} ${-offset})`}
                className="perci-route-line"
                style={{ '--route': routeType.color }}
                strokeDasharray={routeType.linePattern?.dasharray || undefined}
            />
            <text
                x={points[1].x}
                y={points[1].y - 14}
                className="perci-route-label"
                style={{ '--route': routeType.color }}
            >
                {routeType.shortLabel}
            </text>
        </g>
    );
}

