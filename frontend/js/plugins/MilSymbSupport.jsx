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

/**
 * milsymbol modifier option names that can be forwarded as query
 * parameters to the milsymbol-server.  These must match the
 * SymbolOptions interface from milsymbol (index.d.ts).
 */
const MILSYMBOL_MODIFIER_KEYS = new Set([
    'uniqueDesignation', 'additionalInformation', 'staffComments',
    'higherFormation', 'hostile', 'iffSif', 'type', 'dtg',
    'altitudeDepth', 'location', 'speed', 'direction',
    'quantity', 'reinforcedReduced', 'evaluationRating',
    'combatEffectiveness', 'signatureEquipment', 'country',
    'platformType', 'equipmentTeardownTime', 'commonIdentifier',
    'headquartersElement', 'installationComposition',
    'specialHeadquarters', 'engagementBar', 'guardedUnit',
    'specialDesignator', 'auxiliaryEquipmentIndicator', 'sigint'
]);

/* ── OL style factories ──────────────────────────────────────── */

/**
 * Build an ol.style.Style for a milsymbol Point feature.
 * The icon is loaded lazily from /api/symbols/{SIDC}.svg
 *
 * All milsymbol-compatible modifiers found in the feature's properties
 * are forwarded as query parameters so the milsymbol-server renders
 * the full symbol with labels (uniqueDesignation, speed, etc.).
 */
function pointStyleForFeature(feature, symbolBaseUrl, defaultSize) {
    const sidc = feature.get('sidc') || '';
    if (!sidc) return null;

    const size = defaultSize || 40;

    // Build query string with size + all milsymbol modifiers
    const params = new URLSearchParams();
    params.set('size', String(size));

    // Forward all milsymbol modifier properties from the GeoJSON feature
    const featureProps = feature.getProperties();
    for (const key of Object.keys(featureProps)) {
        if (MILSYMBOL_MODIFIER_KEYS.has(key) && featureProps[key] != null && featureProps[key] !== '') {
            params.set(key, String(featureProps[key]));
        }
    }

    const url = `${symbolBaseUrl}/${sidc}.svg?${params.toString()}`;
    const uniqueDesignation = feature.get('uniqueDesignation') || '';

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
 * Build an ol.style.Style for LineString / Polygon tactical graphics.
 * Uses the per-feature ``affiliation`` property when available.
 */
function linePolyStyle(feature, fallbackAffiliation, lineWidth) {
    const aff = feature.get('affiliation') || fallbackAffiliation;
    const color = affiliationColor(aff);
    const fill = [...color.slice(0, 3), 0.15];
    return new ol.style.Style({
        stroke: new ol.style.Stroke({color: color, width: lineWidth || 3}),
        fill: new ol.style.Fill({color: fill})
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
            return linePolyStyle(feature, affiliation, lineWidth);
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
