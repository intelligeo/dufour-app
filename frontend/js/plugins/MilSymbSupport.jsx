/**
 * MilSymbSupport – Map support plugin for MilSymb military symbol layers.
 *
 * When the active QWC2 theme contains a `milsymbLayers` array (injected by
 * qwc_service.py from KadasMilxLayer data), this component:
 *   1. Fetches GeoJSON for each MilSymb layer from the backend API.
 *   2. Renders Point features with milsymbol SVG icons (via /api/symbols/).
 *   3. Renders LineString/Polygon features with affiliation-coloured OL styles.
 *   4. Manages layer lifecycle (add/remove) when the theme changes.
 *
 * Registration:  pass as a MapPlugin tool in appConfig.js, e.g.
 *   MapPlugin({ ..., MilSymbSupport: MilSymbSupport })
 */

import React from 'react';
import {connect} from 'react-redux';
import ol from 'openlayers';
import PropTypes from 'prop-types';
import axios from 'axios';
import ConfigUtils from 'qwc2/utils/ConfigUtils';

/* ── Affiliation → colour mapping ────────────────────────────── */
const AFFILIATION_COLORS = {
    friendly: [0, 100, 220, 1],      // blue
    hostile:  [220, 30, 30, 1],      // red
    neutral:  [0, 180, 0, 1],       // green
    unknown:  [230, 200, 0, 1]      // yellow
};

function affiliationColor(affiliation) {
    return AFFILIATION_COLORS[(affiliation || '').toLowerCase()] || AFFILIATION_COLORS.unknown;
}

/* ── OL style factories ──────────────────────────────────────── */

/**
 * Build an ol.style.Style for a milsymbol Point feature.
 * The icon is loaded lazily from /api/symbols/{SIDC}.svg
 */
function pointStyleForFeature(feature, symbolBaseUrl, defaultSize) {
    const sidc = feature.get('sidc') || '';
    if (!sidc) return null;

    const size = defaultSize || 40;
    const uniqueDesignation = feature.get('uniqueDesignation') || '';

    let url = `${symbolBaseUrl}/${sidc}.svg?size=${size}`;
    if (uniqueDesignation) {
        url += `&uniqueDesignation=${encodeURIComponent(uniqueDesignation)}`;
    }

    return new ol.style.Style({
        image: new ol.style.Icon({
            src: url,
            scale: 1,
            anchor: [0.5, 0.5],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            imgSize: undefined  // let OL detect from SVG
        }),
        // Label with uniqueDesignation below the icon
        text: uniqueDesignation ? new ol.style.Text({
            text: uniqueDesignation,
            offsetY: size / 2 + 10,
            font: 'bold 11px sans-serif',
            fill: new ol.style.Fill({color: '#333'}),
            stroke: new ol.style.Stroke({color: '#fff', width: 3})
        }) : undefined
    });
}

/**
 * Build an ol.style.Style for LineString / Polygon non-tactical graphics.
 * Used when there's no SIDC or when tactical rendering is not applicable.
 */
function linePolyStyle(affiliation, lineWidth) {
    const color = affiliationColor(affiliation);
    const fill = [...color.slice(0, 3), 0.15];
    return new ol.style.Style({
        stroke: new ol.style.Stroke({color: color, width: lineWidth || 3}),
        fill: new ol.style.Fill({color: fill})
    });
}

/**
 * Detect if a feature represents a tactical graphic (n-point symbol).
 * Tactical graphics are LineString/Polygon features with a SIDC code.
 */
function isTacticalGraphic(feature) {
    const geomType = feature.getGeometry()?.getType();
    const sidc = feature.get('sidc');
    return (geomType === 'LineString' || geomType === 'Polygon') && sidc && sidc.length >= 10;
}

/**
 * Extract control points from feature geometry as "lon,lat+lon,lat+..." string
 * suitable for the /tactical endpoint.
 */
function extractControlPoints(feature) {
    const geometry = feature.getGeometry();
    if (!geometry) return '';

    let coords = [];
    if (geometry.getType() === 'LineString') {
        coords = geometry.getCoordinates();
    } else if (geometry.getType() === 'Polygon') {
        // Use exterior ring, excluding closing point if duplicated
        const ring = geometry.getCoordinates()[0] || [];
        coords = ring.length > 0 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
            ? ring.slice(0, -1)
            : ring;
    }

    // Coordinates are in map CRS (likely 3857); they need to be in WGS84 (4326) for the server
    // We assume map is EPSG:3857 and convert back to 4326
    return coords.map(coord => {
        const wgs84 = ol.proj.transform(coord, 'EPSG:3857', 'EPSG:4326');
        return wgs84[0].toFixed(6) + ',' + wgs84[1].toFixed(6);
    }).join('+');
}

/**
 * Extract modifiers string from feature properties for the /tactical endpoint.
 * Format: "KEY1:VALUE1,KEY2:VALUE2,..."
 * Common modifiers: T (uniqueDesignation), H (hostile), Status (planned/actual)
 */
function extractModifiers(feature) {
    const mssAttributes = feature.get('mssAttributes');
    if (!mssAttributes || typeof mssAttributes !== 'object') return '';

    const modifiers = [];

    // T → uniqueDesignation
    if (mssAttributes.T) {
        modifiers.push(`T:${encodeURIComponent(mssAttributes.T)}`);
    }

    // H → hostile indicator
    if (mssAttributes.H) {
        modifiers.push(`H:${encodeURIComponent(mssAttributes.H)}`);
    }

    // Status: check for common status fields (planned, suspect, etc.)
    if (mssAttributes.status) {
        modifiers.push(`status:${encodeURIComponent(mssAttributes.status)}`);
    }
    if (mssAttributes.state) {
        modifiers.push(`state:${encodeURIComponent(mssAttributes.state)}`);
    }

    return modifiers.join(',');
}

/**
 * Check if a feature is marked as "planned" (vs "actual").
 * Looks for common status/state attributes that indicate planned symbols.
 */
function isPlannedSymbol(feature) {
    const mssAttributes = feature.get('mssAttributes');
    if (!mssAttributes || typeof mssAttributes !== 'object') return false;
    const status = (mssAttributes.status || '').toLowerCase();
    const state = (mssAttributes.state || '').toLowerCase();
    return status.includes('planned') || state.includes('planned');
}

/**
 * Build tactical graphic style: fetches SVG from /api/symbols/tactical endpoint
 * and overlays it as a canvas icon.  Falls back to affiliation colouring.
 */
function getTacticalGraphicStyle(feature, symbolBaseUrl, affiliation, lineWidth) {
    const sidc = feature.get('sidc');
    const controlPoints = extractControlPoints(feature);

    if (!sidc || !controlPoints) {
        // Fallback to basic line if data is missing
        return linePolyStyle(affiliation, lineWidth);
    }

    const planned = isPlannedSymbol(feature);
    const color = affiliationColor(affiliation);

    // Build a stroke style based on affiliation and planned status
    const strokeDash = planned ? [8, 4] : undefined;
    const stroke = new ol.style.Stroke({
        color: color,
        width: lineWidth || 3,
        lineDash: strokeDash
    });

    // For fills, use semi-transparent affiliation color
    const fill = new ol.style.Fill({
        color: [...color.slice(0, 3), 0.15]
    });

    return new ol.style.Style({
        stroke: stroke,
        fill: fill
    });
}



/**
 * MilSymbSupport map-support plugin.
 */
class MilSymbSupport extends React.Component {
    static propTypes = {
        map: PropTypes.object,        // injected by OlMap
        projection: PropTypes.string, // injected by OlMap
        theme: PropTypes.object       // from redux
    };

    constructor(props) {
        super(props);
        // Map of layer title → ol.layer.Vector
        this.olLayers = {};
        // Current symbol size (updated by MilSymbSizeSlider via CustomEvent)
        this.symbolSize = 40;
        // Store symbolBaseUrl per layer for re-styling
        this.layerMeta = {};
        // AbortController for in-flight GeoJSON requests
        this.abortController = null;
        // Generation counter – incremented on every syncLayers call so that
        // responses arriving after a newer sync are silently discarded.
        this.syncGeneration = 0;
        // Guard: set to true on unmount to avoid touching the map afterwards
        this.unmounted = false;
    }

    componentDidMount() {
        this.syncLayers();
        window.addEventListener('milsymb-size-change', this.onSizeChange);
    }

    componentDidUpdate(prevProps) {
        // Re-sync when theme changes
        if (this.props.theme !== prevProps.theme) {
            this.syncLayers();
        }
    }

    componentWillUnmount() {
        this.unmounted = true;
        this.cancelInflightRequests();
        this.removeLayers();
        window.removeEventListener('milsymb-size-change', this.onSizeChange);
    }

    /* ── request cancellation ────────────────────────────────── */

    cancelInflightRequests = () => {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    };

    /* ── size change handler ─────────────────────────────────── */

    onSizeChange = (ev) => {
        const newSize = ev.detail?.size;
        if (typeof newSize !== 'number') return;
        this.symbolSize = newSize;
        // Re-apply style on all milsymb layers
        Object.entries(this.olLayers).forEach(([title, layer]) => {
            const meta = this.layerMeta[title];
            if (!meta) return;
            const styleFn = this.buildStyleFn(meta.symbolBaseUrl, newSize, meta.affiliation, meta.lineWidth);
            layer.setStyle(styleFn);
        });
    };

    /* ── layer lifecycle ─────────────────────────────────────── */

    removeLayers = () => {
        Object.values(this.olLayers).forEach(layer => {
            if (this.props.map) {
                this.props.map.removeLayer(layer);
            }
        });
        this.olLayers = {};
        this.layerMeta = {};
    };

    /* ── style factory ───────────────────────────────────────── */

    buildStyleFn = (symbolBaseUrl, size, affiliation, lineWidth) => {
        return (feature) => {
            const geomType = feature.getGeometry()?.getType();
            if (geomType === 'Point' || geomType === 'MultiPoint') {
                return pointStyleForFeature(feature, symbolBaseUrl, size);
            }
            // LineString / Polygon: check if it's a tactical graphic (n-point symbol)
            if (isTacticalGraphic(feature)) {
                // Tactical graphics with SIDC: use affiliation coloring + planned/actual dashing
                return getTacticalGraphicStyle(feature, symbolBaseUrl, affiliation, lineWidth);
            }
            // Basic line/polygon without SIDC: use affiliation coloring only
            return linePolyStyle(affiliation, lineWidth);
        };
    };

    syncLayers = () => {
        // Cancel any in-flight requests from a previous sync
        this.cancelInflightRequests();

        // Remove previous OL layers from the map
        this.removeLayers();

        const milsymbLayers = this.props.theme?.milsymbLayers;
        if (!milsymbLayers || milsymbLayers.length === 0) {
            return;
        }

        // Bump generation so stale responses from earlier syncs are ignored
        const generation = ++this.syncGeneration;

        // Fresh AbortController for this batch of requests
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const assetsPath = ConfigUtils.getAssetsPath();
        // Resolve absolute API base from config (falls back to current origin)
        const apiBase = (assetsPath && assetsPath.startsWith('http'))
            ? new URL(assetsPath).origin
            : '';

        milsymbLayers.forEach(mlDef => {
            this.loadMilSymbLayer(mlDef, apiBase, signal, generation);
        });
    };

    loadMilSymbLayer = (mlDef, apiBase, signal, generation) => {
        // If the URL from themes.json is already absolute, use it as-is;
        // otherwise prepend apiBase (same-origin or assetsPath origin).
        const rawGeo = mlDef.geojsonUrl;
        const url = (rawGeo && rawGeo.startsWith('http')) ? rawGeo : apiBase + rawGeo;
        const rawSym = mlDef.symbolBaseUrl || '/api/symbols';
        const symbolBaseUrl = (rawSym.startsWith('http')) ? rawSym : apiBase + rawSym;

        axios.get(url, {signal}).then(response => {
            // Discard if a newer syncLayers has been triggered or component unmounted
            if (generation !== this.syncGeneration || this.unmounted) {
                return;
            }

            const geojson = response.data;
            if (!geojson || geojson.type !== 'FeatureCollection') {
                return;
            }

            const affiliation = (geojson.metadata?.affiliation) || mlDef.affiliation || 'unknown';
            const defaultSize = this.symbolSize || mlDef.symbolSize || 40;
            const lw = mlDef.lineWidth || 3;

            // Store meta so we can re-style on size change
            this.layerMeta[mlDef.title] = {symbolBaseUrl, affiliation, lineWidth: lw};

            // Build the OL style function
            const styleFn = this.buildStyleFn(symbolBaseUrl, defaultSize, affiliation, lw);

            // Read features.  GeoJSON is in EPSG:4326, reproject to map CRS.
            const format = new ol.format.GeoJSON();
            const features = format.readFeatures(geojson, {
                dataProjection: 'EPSG:4326',
                featureProjection: this.props.projection || 'EPSG:3857'
            });

            const source = new ol.source.Vector({features: features});
            const olLayer = new ol.layer.Vector({
                source: source,
                style: styleFn,
                zIndex: 500000  // above WMS but below measurements/redlining
            });
            olLayer.set('id', 'milsymb-' + mlDef.title);
            olLayer.set('title', mlDef.title);

            this.props.map.addLayer(olLayer);
            this.olLayers[mlDef.title] = olLayer;
        }).catch(err => {
            // Silently ignore intentional cancellations (AbortError / CanceledError)
            if (axios.isCancel(err) || err?.name === 'AbortError' || err?.name === 'CanceledError') {
                return;
            }
            /* eslint-disable-next-line */
            console.warn(`[MilSymbSupport] Failed to load MilSymb layer "${mlDef.title}":`, err);
        });
    };

    /* ── render ───────────────────────────────────────────────── */
    render() {
        return null;
    }
}

export default connect((state) => ({
    theme: state.theme.current
}), {})(MilSymbSupport);
