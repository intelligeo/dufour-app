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
 * Build an ol.style.Style for LineString / Polygon tactical graphics.
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
        this.removeLayers();
        window.removeEventListener('milsymb-size-change', this.onSizeChange);
    }

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
            return linePolyStyle(affiliation, lineWidth);
        };
    };

    syncLayers = () => {
        // Remove previous layers first
        this.removeLayers();

        const milsymbLayers = this.props.theme?.milsymbLayers;
        if (!milsymbLayers || milsymbLayers.length === 0) {
            return;
        }

        const assetsPath = ConfigUtils.getAssetsPath();
        // Resolve absolute API base from config (falls back to current origin)
        const apiBase = (assetsPath && assetsPath.startsWith('http'))
            ? new URL(assetsPath).origin
            : '';

        milsymbLayers.forEach(mlDef => {
            this.loadMilSymbLayer(mlDef, apiBase);
        });
    };

    loadMilSymbLayer = (mlDef, apiBase) => {
        // If the URL from themes.json is already absolute, use it as-is;
        // otherwise prepend apiBase (same-origin or assetsPath origin).
        const rawGeo = mlDef.geojsonUrl;
        const url = (rawGeo && rawGeo.startsWith('http')) ? rawGeo : apiBase + rawGeo;
        const rawSym = mlDef.symbolBaseUrl || '/api/symbols';
        const symbolBaseUrl = (rawSym.startsWith('http')) ? rawSym : apiBase + rawSym;

        axios.get(url).then(response => {
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
