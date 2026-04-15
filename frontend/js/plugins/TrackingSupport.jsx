/**
 * TrackingSupport – Map support plugin that renders live GNSS positions
 * coming from the Dufour Tracking API (Traccar backend) on the OL map.
 *
 * How it works
 * ------------
 * 1. On mount: opens a WebSocket to /api/tracking/ws and receives a
 *    snapshot of current positions plus incremental position/device updates.
 * 2. Maintains one OL Vector layer ("tracking") with one Feature per device.
 * 3. Each feature is styled as a filled circle with a direction arrow
 *    and a label below it.
 * 4. Listens for window events from FleetManager:
 *      "tracking-visibility-change" – {deviceId, visible} – show/hide a point
 *      "tracking-focus-device"      – {deviceId}          – pan/zoom to point
 *
 * Registration
 * ------------
 * In appConfig.js add TrackingSupport as a map support inside MapPlugin:
 *   MapPlugin({ ..., TrackingSupport: TrackingSupport })
 *
 * The plugin renders nothing visible itself (returns null from render()).
 */

import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import ol from 'openlayers';

import ConfigUtils from 'qwc2/utils/ConfigUtils';

// Traccar category → unicode icon label
const CATEGORY_ICON = {
    car: '🚗',
    bus: '🚌',
    truck: '🚛',
    van: '🚐',
    motorcycle: '🏍',
    bicycle: '🚲',
    pedestrian: '🚶',
    animal: '🐾',
    helicopter: '🚁',
    ship: '🚢',
    train: '🚆',
    tractor: '🚜',
    arrow: '➤',
    default: '●'
};

const LAYER_ID = 'dufour-tracking';
const RECONNECT_DELAY_MS = 5000;
const WGS84 = 'EPSG:4326';

// ── Style factory ─────────────────────────────────────────────────────────────

function makeDeviceStyle(pos, device, selected) {
    const speed = typeof pos.speed === 'number' ? pos.speed : 0;
    const course = typeof pos.course === 'number' ? pos.course : 0;
    const category = (device && device.category) || 'default';
    const label = (device && device.name) || ('Device ' + pos.deviceId);
    const icon = CATEGORY_ICON[category] || CATEGORY_ICON.default;

    // Colour by speed range (km/h from knots)
    const kmh = speed * 1.852;
    const dotColor = kmh > 60 ? '#e53935'
        : kmh > 20  ? '#ef6c00'
            : kmh > 0   ? '#2e7d32'
                : '#1565c0';

    const outerColor = selected ? '#ffd600' : dotColor;

    return [
        // Outer ring (selection highlight or status)
        new ol.style.Style({
            image: new ol.style.Circle({
                radius: selected ? 14 : 11,
                stroke: new ol.style.Stroke({color: outerColor, width: selected ? 3 : 2}),
                fill: new ol.style.Fill({color: 'rgba(255,255,255,0.85)'})
            })
        }),
        // Direction arrow (rotated)
        new ol.style.Style({
            image: new ol.style.RegularShape({
                points: 3,
                radius: 7,
                rotation: (course * Math.PI) / 180,
                fill: new ol.style.Fill({color: dotColor}),
                stroke: new ol.style.Stroke({color: '#fff', width: 1})
            })
        }),
        // Label below the point
        new ol.style.Style({
            text: new ol.style.Text({
                text: `${icon} ${label}`,
                offsetY: 18,
                font: 'bold 11px sans-serif',
                fill: new ol.style.Fill({color: '#1a237e'}),
                stroke: new ol.style.Stroke({color: '#fff', width: 3}),
                overflow: true
            })
        })
    ];
}

// ── Component ─────────────────────────────────────────────────────────────────

class TrackingSupport extends React.Component {
    static propTypes = {
        map: PropTypes.object,
        projection: PropTypes.string,
        currentProject: PropTypes.string
    };

    constructor(props) {
        super(props);
        this._layer = null;
        this._ws = null;
        this._reconnectTimer = null;
        this._unmounted = false;
        // { deviceId: {pos, device} }
        this._data = {};
        this._hiddenDevices = new Set();
        this._selectedDevice = null;
        // device IDs linked to the active project (null = show all)
        this._projectDeviceIds = null;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    componentDidMount() {
        this._initLayer();
        this._connect();
        window.addEventListener('tracking-visibility-change', this._onVisibilityChange);
        window.addEventListener('tracking-focus-device', this._onFocusDevice);
        if (this.props.currentProject) {
            this._loadProjectAssoc(this.props.currentProject);
        }
    }

    componentDidUpdate(prevProps) {
        if (this.props.currentProject !== prevProps.currentProject) {
            if (this.props.currentProject) {
                this._loadProjectAssoc(this.props.currentProject);
            } else {
                this._projectDeviceIds = null;
                this._refreshAllFeatures();
            }
        }
    }

    componentWillUnmount() {
        this._unmounted = true;
        this._disconnect();
        this._removeLayer();
        window.removeEventListener('tracking-visibility-change', this._onVisibilityChange);
        window.removeEventListener('tracking-focus-device', this._onFocusDevice);
    }

    // ── Project-device association loader ─────────────────────────────────────

    _loadProjectAssoc = async (projectName) => {
        const base = (ConfigUtils.getConfigProp('dufourApiUrl') || window.location.origin)
            .replace(/\/$/, '');
        const token = window.__dufourJwt || localStorage.getItem('dufour_jwt') || '';
        const headers = token ? {Authorization: `Bearer ${token}`} : {};
        try {
            const resp = await fetch(
                `${base}/api/tracking/projects/${encodeURIComponent(projectName)}/devices`,
                {headers}
            );
            if (!resp.ok) throw new Error('fetch failed');
            const assocs = await resp.json();
            if (this._unmounted || this.props.currentProject !== projectName) return;
            // device_id entries are directly linked
            // group-based associations: we can expand later via available data
            const ids = new Set(
                assocs.filter(a => a.device_id != null).map(a => a.device_id)
            );
            // also add devices whose group is linked
            const linkedGroupIds = new Set(
                assocs.filter(a => a.group_id != null).map(a => a.group_id)
            );
            if (linkedGroupIds.size > 0) {
                Object.values(this._data).forEach(({device}) => {
                    if (device && linkedGroupIds.has(device.groupId)) ids.add(device.id);
                });
            }
            this._projectDeviceIds = ids.size > 0 ? ids : null;
        } catch {
            this._projectDeviceIds = null;
        }
        this._refreshAllFeatures();
    };

    // ── OL layer ──────────────────────────────────────────────────────────────

    _initLayer() {
        if (!this.props.map) return;
        this._source = new ol.source.Vector();
        this._layer = new ol.layer.Vector({
            source: this._source,
            zIndex: 1000,
            updateWhileAnimating: true,
            updateWhileInteracting: true,
            properties: {id: LAYER_ID}
        });
        this.props.map.addLayer(this._layer);
    }

    _removeLayer() {
        if (this._layer && this.props.map) {
            this.props.map.removeLayer(this._layer);
            this._layer = null;
            this._source = null;
        }
    }

    // ── WebSocket ─────────────────────────────────────────────────────────────

    _wsUrl() {
        const base = (ConfigUtils.getConfigProp('dufourApiUrl') || window.location.origin)
            .replace(/\/$/, '');
        // Convert http(s) to ws(s)
        const wsBase = base.replace(/^http/, 'ws');
        return `${wsBase}/api/tracking/ws`;
    }

    _connect() {
        if (this._unmounted) return;
        const url = this._wsUrl();

        // Append JWT if available
        const token = window.__dufourJwt || localStorage.getItem('dufour_jwt');
        const fullUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url;

        try {
            this._ws = new WebSocket(fullUrl);
        } catch {
            this._scheduleReconnect();
            return;
        }

        this._ws.onopen = () => {
            console.info('[TrackingSupport] WebSocket connected');
        };

        this._ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                this._handleMessage(msg);
            } catch {
                // ignore parse errors
            }
        };

        this._ws.onclose = () => {
            if (!this._unmounted) {
                console.info('[TrackingSupport] WebSocket closed, reconnecting…');
                this._scheduleReconnect();
            }
        };

        this._ws.onerror = () => {
            console.warn('[TrackingSupport] WebSocket error');
        };
    }

    _disconnect() {
        if (this._ws) {
            this._ws.onclose = null;
            this._ws.close();
            this._ws = null;
        }
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    _scheduleReconnect() {
        if (this._unmounted) return;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this._connect();
        }, RECONNECT_DELAY_MS);
    }

    // ── Message handling ──────────────────────────────────────────────────────

    _handleMessage(msg) {
        switch (msg.type) {
            case 'snapshot': {
                // msg.data is { [deviceId]: positionObject }
                Object.entries(msg.data || {}).forEach(([, pos]) => {
                    this._upsertPosition(pos);
                });
                break;
            }
            case 'position': {
                this._upsertPosition(msg.data);
                break;
            }
            case 'device': {
                this._upsertDevice(msg.data);
                break;
            }
            case 'ping':
            default:
                break;
        }
    }

    _upsertPosition(pos) {
        if (!pos || !pos.deviceId) return;
        const id = pos.deviceId;
        if (!this._data[id]) this._data[id] = {pos: null, device: null};
        this._data[id].pos = pos;
        this._renderFeature(id);
    }

    _upsertDevice(dev) {
        if (!dev || !dev.id) return;
        const id = dev.id;
        if (!this._data[id]) this._data[id] = {pos: null, device: null};
        this._data[id].device = dev;
        this._renderFeature(id);
    }

    // ── Feature management ────────────────────────────────────────────────────

    _getOrCreateFeature(deviceId) {
        if (!this._source) return null;
        let feat = this._source.getFeatureById(String(deviceId));
        if (!feat) {
            feat = new ol.Feature();
            feat.setId(String(deviceId));
            this._source.addFeature(feat);
        }
        return feat;
    }

    _renderFeature(deviceId) {
        if (!this._source || this._unmounted) return;
        const entry = this._data[deviceId];
        if (!entry || !entry.pos) return;

        const {pos, device} = entry;
        if (!pos.latitude || !pos.longitude) return;

        // Project from WGS84 to map projection
        const mapProj = this.props.projection || 'EPSG:3857';
        const coord = ol.proj.transform(
            [pos.longitude, pos.latitude], WGS84, mapProj
        );

        const feat = this._getOrCreateFeature(deviceId);
        if (!feat) return;

        feat.setGeometry(new ol.geom.Point(coord));
        feat.set('pos', pos);
        feat.set('device', device);

        // Hide if explicitly hidden by user or filtered out by project
        const hidden = this._hiddenDevices.has(deviceId)
            || (this._projectDeviceIds !== null && !this._projectDeviceIds.has(deviceId));
        const selected = this._selectedDevice === deviceId;

        if (hidden) {
            feat.setStyle(new ol.style.Style({})); // invisible
        } else {
            feat.setStyle(makeDeviceStyle(pos, device, selected));
        }
    }

    _refreshAllFeatures() {
        Object.keys(this._data).forEach(id => this._renderFeature(parseInt(id, 10)));
    }

    // ── Event handlers (from FleetManager) ───────────────────────────────────

    _onVisibilityChange = (evt) => {
        const {deviceId, visible} = evt.detail || {};
        if (deviceId === undefined) return;
        if (visible) {
            this._hiddenDevices.delete(deviceId);
        } else {
            this._hiddenDevices.add(deviceId);
        }
        this._renderFeature(deviceId);
    };

    _onFocusDevice = (evt) => {
        const {deviceId} = evt.detail || {};
        if (!deviceId || !this.props.map) return;

        const entry = this._data[deviceId];
        if (!entry || !entry.pos) return;

        const mapProj = this.props.projection || 'EPSG:3857';
        const coord = ol.proj.transform(
            [entry.pos.longitude, entry.pos.latitude], WGS84, mapProj
        );

        this._selectedDevice = deviceId;
        this._refreshAllFeatures();

        this.props.map.getView().animate({
            center: coord,
            zoom: Math.max(this.props.map.getView().getZoom() || 14, 14),
            duration: 400
        });
    };

    render() {
        return null; // no DOM output – purely OL side effects
    }
}

export default connect(
    state => ({
        currentProject: state.theme?.current?.name || null
    })
)(TrackingSupport);
