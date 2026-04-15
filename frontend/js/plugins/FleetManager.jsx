/**
 * FleetManager – QWC2 sidebar plugin for Traccar fleet & GNSS device management.
 *
 * Features
 * --------
 * - List groups (fleets) and devices from the Dufour tracking API
 * - Create / edit / delete groups and devices
 * - Toggle per-device visibility on the map
 * - Display last-known position, speed and fix time
 * - Auto-refresh device list every 30 s
 *
 * Communication with the map
 * --------------------------
 * The plugin fires CustomEvents on `window`:
 *   "tracking-visibility-change"  { detail: { deviceId, visible } }
 *   "tracking-focus-device"       { detail: { deviceId } }          – pan to device
 *
 * Registration
 * ------------
 * In appConfig.js:
 *   import FleetManager from './plugins/FleetManager';
 *   plugins: { ..., FleetManagerPlugin: FleetManager }
 *   cfg:     { FleetManagerPlugin: { side: 'right' } }
 *
 * The toolbar entry is added automatically via the SideBar icon.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {setCurrentTask} from 'qwc2/actions/task';
import SideBar from 'qwc2/components/SideBar';
import ConfigUtils from 'qwc2/utils/ConfigUtils';

import './style/FleetManager.css';

const REFRESH_INTERVAL_MS = 30000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function apiBase() {
    return (ConfigUtils.getConfigProp('dufourApiUrl') || '').replace(/\/$/, '');
}

function authHeaders() {
    const token = window.__dufourJwt || localStorage.getItem('dufour_jwt') || '';
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {})
    };
}

async function apiFetch(path, options = {}) {
    const url = `${apiBase()}${path}`;
    const resp = await fetch(url, {headers: authHeaders(), ...options});
    if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(`${resp.status} ${msg}`);
    }
    if (resp.status === 204) return null;
    return resp.json();
}

function formatSpeed(knots) {
    if (typeof knots !== 'number') return '—';
    return (knots * 1.852).toFixed(1) + ' km/h';
}

function formatFixTime(ts) {
    if (!ts) return '—';
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return ts;
    }
}

// ── Component ─────────────────────────────────────────────────────────────────

class FleetManager extends React.Component {
    static propTypes = {
        active: PropTypes.bool,
        setCurrentTask: PropTypes.func,
        side: PropTypes.string,
        currentProject: PropTypes.string
    };

    static defaultProps = {
        side: 'right'
    };

    constructor(props) {
        super(props);
        this.state = {
            groups: [],
            devices: [],
            positions: {},           // { [deviceId]: positionObject }
            hiddenDevices: new Set(),
            selectedGroup: null,     // filter by group
            loading: false,
            error: null,
            // Project filter
            projectDeviceIds: null,  // Set<number> | null – IDs linked to current project
            filterProject: false,    // when true, show only project-linked devices
            // Modal state
            modal: null,             // null | 'new-group' | 'edit-group' | 'new-device' | 'edit-device'
            modalData: {},
            saving: false,
            saveError: null
        };
        this._refreshTimer = null;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────────

    componentDidUpdate(prevProps) {
        if (this.props.active && !prevProps.active) {
            this._startRefresh();
        } else if (!this.props.active && prevProps.active) {
            this._stopRefresh();
        }
    }

    componentWillUnmount() {
        this._stopRefresh();
    }

    // ── Data loading ─────────────────────────────────────────────────────────────

    _startRefresh() {
        this._load();
        this._refreshTimer = setInterval(this._load, REFRESH_INTERVAL_MS);
    }

    _stopRefresh() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    _load = async () => {
        this.setState({loading: true, error: null});
        try {
            const [groups, devices, positions] = await Promise.all([
                apiFetch('/api/tracking/groups'),
                apiFetch('/api/tracking/devices'),
                apiFetch('/api/tracking/positions')
            ]);
            const posMap = {};
            (positions || []).forEach(p => { posMap[p.deviceId] = p; });
            this.setState({groups: groups || [], devices: devices || [], positions: posMap, loading: false});
        } catch (err) {
            this.setState({error: err.message, loading: false});
        }
        // Load project associations if a project is active
        await this._loadProjectAssoc();
    };

    _loadProjectAssoc = async () => {
        const proj = this.props.currentProject;
        if (!proj) { this.setState({projectDeviceIds: null}); return; }
        try {
            const assocs = await apiFetch(
                `/api/tracking/projects/${encodeURIComponent(proj)}/devices`
            );
            const ids = new Set(assocs.map(a => a.device_id).filter(Boolean));
            // expand group associations
            const groupIds = new Set(assocs.map(a => a.group_id).filter(Boolean));
            if (groupIds.size > 0) {
                this.state.devices.forEach(d => {
                    if (groupIds.has(d.groupId)) ids.add(d.id);
                });
            }
            this.setState({projectDeviceIds: ids});
        } catch {
            this.setState({projectDeviceIds: null});
        }
    };

    // ── Visibility ───────────────────────────────────────────────────────────────

    _toggleDevice = (deviceId) => {
        this.setState(prev => {
            const next = new Set(prev.hiddenDevices);
            const visible = next.has(deviceId);
            if (visible) {
                next.delete(deviceId);
            } else {
                next.add(deviceId);
            }
            window.dispatchEvent(new CustomEvent('tracking-visibility-change', {
                detail: {deviceId, visible: !visible}
            }));
            return {hiddenDevices: next};
        });
    };

    _focusDevice = (deviceId) => {
        window.dispatchEvent(new CustomEvent('tracking-focus-device', {detail: {deviceId}}));
    };

    // ── Modal helpers ────────────────────────────────────────────────────────────

    _openModal = (modal, modalData = {}) => this.setState({modal, modalData, saveError: null});
    _closeModal = () => this.setState({modal: null, modalData: {}, saveError: null});

    _onModalField = (key, value) => {
        this.setState(prev => ({modalData: {...prev.modalData, [key]: value}}));
    };

    // ── CRUD: groups ─────────────────────────────────────────────────────────────

    _saveGroup = async () => {
        const {modal, modalData} = this.state;
        if (!modalData.name?.trim()) return;
        this.setState({saving: true, saveError: null});
        try {
            if (modal === 'new-group') {
                await apiFetch('/api/tracking/groups', {
                    method: 'POST',
                    body: JSON.stringify({name: modalData.name.trim()})
                });
            } else {
                await apiFetch(`/api/tracking/groups/${modalData.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({name: modalData.name.trim()})
                });
            }
            this._closeModal();
            this._load();
        } catch (err) {
            this.setState({saveError: err.message, saving: false});
        }
    };

    _deleteGroup = async (id) => {
        if (!window.confirm('Delete this fleet group?')) return;
        try {
            await apiFetch(`/api/tracking/groups/${id}`, {method: 'DELETE'});
            this._load();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    };

    // ── CRUD: devices ─────────────────────────────────────────────────────────────

    _saveDevice = async () => {
        const {modal, modalData} = this.state;
        if (!modalData.name?.trim() || !modalData.uniqueId?.trim()) return;
        this.setState({saving: true, saveError: null});
        const payload = {
            name: modalData.name.trim(),
            uniqueId: modalData.uniqueId.trim(),
            groupId: modalData.groupId ? parseInt(modalData.groupId, 10) : undefined,
            phone: modalData.phone || '',
            model: modalData.model || '',
            contact: modalData.contact || '',
            category: modalData.category || ''
        };
        try {
            if (modal === 'new-device') {
                await apiFetch('/api/tracking/devices', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            } else {
                await apiFetch(`/api/tracking/devices/${modalData.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
            }
            this._closeModal();
            this._load();
        } catch (err) {
            this.setState({saveError: err.message, saving: false});
        }
    };

    _deleteDevice = async (id) => {
        if (!window.confirm('Remove this tracking device?')) return;
        try {
            await apiFetch(`/api/tracking/devices/${id}`, {method: 'DELETE'});
            this._load();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    };

    // ── Render helpers ────────────────────────────────────────────────────────────

    _renderError() {
        if (!this.state.error) return null;
        return (
            <div className="fm-error">
                ⚠ {this.state.error}
                <button className="fm-btn fm-btn-sm" onClick={this._load}>Retry</button>
            </div>
        );
    }

    _renderGroupFilter() {
        const {groups, selectedGroup} = this.state;
        return (
            <div className="fm-filter-bar">
                <button
                    className={`fm-chip ${selectedGroup === null ? 'active' : ''}`}
                    onClick={() => this.setState({selectedGroup: null})}>
                    All fleets
                </button>
                {groups.map(g => (
                    <button
                        key={g.id}
                        className={`fm-chip ${selectedGroup === g.id ? 'active' : ''}`}
                        onClick={() => this.setState({selectedGroup: g.id})}>
                        {g.name}
                    </button>
                ))}
            </div>
        );
    }

    _renderDeviceList() {
        const {devices, positions, hiddenDevices, selectedGroup,
               projectDeviceIds, filterProject} = this.state;
        let visible = devices.filter(d =>
            selectedGroup === null || d.groupId === selectedGroup
        );
        if (filterProject && projectDeviceIds) {
            visible = visible.filter(d => projectDeviceIds.has(d.id));
        }

        if (!visible.length) {
            return <p className="fm-empty">No devices in this fleet.</p>;
        }

        return (
            <div className="fm-device-list">
                {visible.map(d => {
                    const pos = positions[d.id];
                    const isHidden = hiddenDevices.has(d.id);
                    const isLinked = projectDeviceIds && projectDeviceIds.has(d.id);
                    const statusCls = d.status === 'online' ? 'fm-status-online'
                        : d.status === 'unknown' ? 'fm-status-unknown'
                            : 'fm-status-offline';

                    return (
                        <div key={d.id} className={`fm-device-card ${isHidden ? 'fm-hidden' : ''}`}>
                            <div className="fm-device-header">
                                <span className={`fm-dot ${statusCls}`} title={d.status || 'unknown'} />
                                <span className="fm-device-name">{d.name}</span>
                                {isLinked && (
                                    <span title="Linked to active project"
                                          style={{fontSize:10, background:'#1e3a5f', color:'#7cb9e8',
                                                  borderRadius:4, padding:'1px 5px', marginLeft:4}}>
                                        📌
                                    </span>
                                )}
                                <span className="fm-device-id">#{d.uniqueId}</span>
                                <div className="fm-device-actions">
                                    <button
                                        className="fm-icon-btn"
                                        title={isHidden ? 'Show on map' : 'Hide from map'}
                                        onClick={() => this._toggleDevice(d.id)}>
                                        {isHidden ? '👁‍🗨' : '👁'}
                                    </button>
                                    <button
                                        className="fm-icon-btn"
                                        title="Pan to device"
                                        disabled={!pos}
                                        onClick={() => this._focusDevice(d.id)}>
                                        📍
                                    </button>
                                    <button
                                        className="fm-icon-btn"
                                        title="Edit device"
                                        onClick={() => this._openModal('edit-device', {...d})}>
                                        ✏️
                                    </button>
                                    <button
                                        className="fm-icon-btn fm-icon-danger"
                                        title="Delete device"
                                        onClick={() => this._deleteDevice(d.id)}>
                                        🗑
                                    </button>
                                </div>
                            </div>
                            {pos && (
                                <div className="fm-device-meta">
                                    <span>🕑 {formatFixTime(pos.fixTime)}</span>
                                    <span>📡 {formatSpeed(pos.speed)}</span>
                                    {pos.altitude ? <span>⛰ {pos.altitude.toFixed(0)} m</span> : null}
                                    <span>
                                        {pos.latitude?.toFixed(5)}, {pos.longitude?.toFixed(5)}
                                    </span>
                                </div>
                            )}
                            {!pos && <div className="fm-device-meta"><em>No position data</em></div>}
                        </div>
                    );
                })}
            </div>
        );
    }

    _renderModal() {
        const {modal, modalData, saving, saveError} = this.state;
        if (!modal) return null;

        const isGroup = modal.includes('group');
        const isNew = modal.startsWith('new');

        return (
            <div className="fm-modal-overlay" onClick={(e) => {
                if (e.target === e.currentTarget) this._closeModal();
            }}>
                <div className="fm-modal">
                    <div className="fm-modal-header">
                        <h3>{isNew ? 'New' : 'Edit'} {isGroup ? 'fleet group' : 'device'}</h3>
                        <button className="fm-icon-btn" onClick={this._closeModal}>✕</button>
                    </div>
                    <div className="fm-modal-body">
                        {saveError && <div className="fm-error">{saveError}</div>}

                        {isGroup ? (
                            <label className="fm-field">
                                <span>Fleet name</span>
                                <input
                                    autoFocus
                                    className="fm-input"
                                    placeholder="e.g. Alpine Task Force"
                                    value={modalData.name || ''}
                                    onChange={e => this._onModalField('name', e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && this._saveGroup()}
                                />
                            </label>
                        ) : (
                            <>
                                <label className="fm-field">
                                    <span>Device name *</span>
                                    <input autoFocus className="fm-input"
                                        placeholder="e.g. Vehicle Alpha-1"
                                        value={modalData.name || ''}
                                        onChange={e => this._onModalField('name', e.target.value)} />
                                </label>
                                <label className="fm-field">
                                    <span>IMEI / Unique ID *</span>
                                    <input className="fm-input"
                                        placeholder="Device unique identifier"
                                        value={modalData.uniqueId || ''}
                                        onChange={e => this._onModalField('uniqueId', e.target.value)} />
                                </label>
                                <label className="fm-field">
                                    <span>Fleet group</span>
                                    <select className="fm-input"
                                        value={modalData.groupId || ''}
                                        onChange={e => this._onModalField('groupId', e.target.value)}>
                                        <option value="">— no group —</option>
                                        {this.state.groups.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="fm-field">
                                    <span>Category</span>
                                    <select className="fm-input"
                                        value={modalData.category || ''}
                                        onChange={e => this._onModalField('category', e.target.value)}>
                                        {['', 'default', 'arrow', 'car', 'bus', 'truck', 'van',
                                            'motorcycle', 'bicycle', 'pedestrian',
                                            'animal', 'helicopter', 'ship',
                                            'train', 'tractor'].map(c => (
                                            <option key={c} value={c}>{c || '— default —'}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="fm-field">
                                    <span>Phone</span>
                                    <input className="fm-input"
                                        placeholder="+41 79 000 00 00"
                                        value={modalData.phone || ''}
                                        onChange={e => this._onModalField('phone', e.target.value)} />
                                </label>
                                <label className="fm-field">
                                    <span>Model</span>
                                    <input className="fm-input"
                                        placeholder="e.g. Queclink GV55"
                                        value={modalData.model || ''}
                                        onChange={e => this._onModalField('model', e.target.value)} />
                                </label>
                                <label className="fm-field">
                                    <span>Contact</span>
                                    <input className="fm-input"
                                        placeholder="Responsible person / unit"
                                        value={modalData.contact || ''}
                                        onChange={e => this._onModalField('contact', e.target.value)} />
                                </label>
                            </>
                        )}
                    </div>
                    <div className="fm-modal-footer">
                        <button className="fm-btn fm-btn-secondary" onClick={this._closeModal}>
                            Cancel
                        </button>
                        <button
                            className="fm-btn fm-btn-primary"
                            disabled={saving}
                            onClick={isGroup ? this._saveGroup : this._saveDevice}>
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    renderBody = () => {
        const {groups, loading} = this.state;
        return (
            <div className="fm-body">
                {this._renderError()}

                {/* ── Fleets section ── */}
                <div className="fm-section-header">
                    <span>Fleets</span>
                    <button className="fm-btn fm-btn-xs"
                        onClick={() => this._openModal('new-group')}>+ New fleet</button>
                </div>
                <div className="fm-group-list">
                    {groups.map(g => (
                        <div key={g.id} className="fm-group-row">
                            <span className="fm-group-name">{g.name}</span>
                            <button className="fm-icon-btn"
                                onClick={() => this._openModal('edit-group', {...g})}>✏️</button>
                            <button className="fm-icon-btn fm-icon-danger"
                                onClick={() => this._deleteGroup(g.id)}>🗑</button>
                        </div>
                    ))}
                    {!groups.length && <p className="fm-empty">No fleets yet.</p>}
                </div>

                {/* ── Devices section ── */}
                <div className="fm-section-header">
                    <span>Devices</span>
                    <div style={{display: 'flex', gap: '4px', alignItems: 'center'}}>
                        {this.props.currentProject && (
                            <button
                                className={`fm-chip ${this.state.filterProject ? 'active' : ''}`}
                                title={this.state.filterProject
                                    ? 'Show all devices'
                                    : `Show only "${this.props.currentProject}" devices`}
                                onClick={() => this.setState(s => ({filterProject: !s.filterProject}))}>
                                📌 {this.props.currentProject}
                            </button>
                        )}
                        {loading && <span className="fm-spinner" />}
                        <button className="fm-btn fm-btn-xs fm-btn-secondary"
                            onClick={this._load} title="Refresh now">↻</button>
                        <button className="fm-btn fm-btn-xs"
                            onClick={() => this._openModal('new-device')}>+ New device</button>
                    </div>
                </div>

                {this._renderGroupFilter()}
                {this._renderDeviceList()}

                {this._renderModal()}
            </div>
        );
    };

    render() {
        return (
            <SideBar icon="location" id="FleetManager"
                side={this.props.side}
                title="Fleet Manager"
                width="22em">
                {() => ({body: this.renderBody()})}
            </SideBar>
        );
    }
}

export default connect(
    state => ({
        active: state.task?.id === 'FleetManager',
        currentProject: state.theme?.current?.name || null
    }),
    {setCurrentTask}
)(FleetManager);
