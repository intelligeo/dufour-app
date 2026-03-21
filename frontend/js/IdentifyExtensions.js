/**
 * Dufour.app Identify Extensions
 * Custom attribute handlers for the Identify / Feature-Info dialog.
 *
 * QWC2 calls:
 *   attributeTransform(name, value, layer, feature)
 *     → null            : hide the row entirely
 *     → string          : plain text
 *     → React element   : rendered as rich HTML
 *
 *   customAttributeCalculator(layer, feature)
 *     → [{name, value}, ...]  : extra computed rows appended to the table
 */
import React from 'react';

// ── Attributes always hidden from the identify panel ────────────────────────
const HIDDEN_ATTRS = new Set([
    'geometry', 'geom', 'wkb_geometry', 'the_geom', 'shape',
    'wkt', 'ogc_fid', 'rowid',
]);

// ── Regexes ──────────────────────────────────────────────────────────────────
const URL_RE    = /^https?:\/\//i;
const IMG_URL_RE = /\.(png|jpg|jpeg|gif|svg|webp)(\?.*)?$/i;
const DATE_RE   = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
// MIL-STD-2525 SIDC: 15-char code  (letters and digits, pos 2 is affiliation)
const SIDC_RE   = /^[A-Z][FHAMDPUNGWSLJK][A-Z0-9]{13}$/i;

// ── Military affiliation mapping (SIDC char 2) ───────────────────────────────
const AFFIL_MAP = {
    F: {label: 'Friendly',  bg: '#1565c0', fg: '#fff'},
    A: {label: 'Assumed Friendly', bg: '#1976d2', fg: '#fff'},
    D: {label: 'Friendly (Pending)', bg: '#1976d2', fg: '#fff'},
    M: {label: 'Assumed Hostile', bg: '#b71c1c', fg: '#fff'},
    H: {label: 'Hostile',    bg: '#c62828', fg: '#fff'},
    S: {label: 'Suspect',    bg: '#d32f2f', fg: '#fff'},
    N: {label: 'Neutral',    bg: '#2e7d32', fg: '#fff'},
    L: {label: 'Neutral (Pending)', bg: '#388e3c', fg: '#fff'},
    U: {label: 'Unknown',    bg: '#e65100', fg: '#fff'},
    P: {label: 'Pending',    bg: '#f57c00', fg: '#fff'},
    G: {label: 'Exercise Pending', bg: '#6a1b9a', fg: '#fff'},
    W: {label: 'Exercise Unknown', bg: '#7b1fa2', fg: '#fff'},
    J: {label: 'Exercise Friendly', bg: '#0288d1', fg: '#fff'},
    K: {label: 'Exercise Neutral',  bg: '#00796b', fg: '#fff'},
};

// ── Status/affiliation keyword → badge color ─────────────────────────────────
const KEYWORD_BADGES = {
    friendly:  {bg: '#1565c0', fg: '#fff'},
    hostile:   {bg: '#c62828', fg: '#fff'},
    neutral:   {bg: '#2e7d32', fg: '#fff'},
    unknown:   {bg: '#e65100', fg: '#fff'},
    active:    {bg: '#1b5e20', fg: '#fff'},
    inactive:  {bg: '#616161', fg: '#fff'},
    pending:   {bg: '#f57c00', fg: '#fff'},
    confirmed: {bg: '#1b5e20', fg: '#fff'},
    destroyed: {bg: '#b71c1c', fg: '#fff'},
    damaged:   {bg: '#e53935', fg: '#fff'},
    yes:       {bg: '#1b5e20', fg: '#fff'},
    no:        {bg: '#616161', fg: '#fff'},
    true:      {bg: '#1b5e20', fg: '#fff'},
    false:     {bg: '#616161', fg: '#fff'},
};

// ── Shared inline styles ─────────────────────────────────────────────────────
const BADGE_BASE = {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '10px',
    fontSize: '0.78em',
    fontWeight: 600,
    letterSpacing: '0.02em',
};

function Badge({bg, fg, children}) {
    return React.createElement('span', {
        style: {...BADGE_BASE, background: bg, color: fg},
    }, children);
}

function Link({href, children}) {
    return React.createElement('a', {
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: {color: '#1976d2'},
    }, children);
}

// ── JSON sub-table renderer ──────────────────────────────────────────────────
function renderJsonObject(obj, depth) {
    if (depth > 3) return React.createElement('span', null, JSON.stringify(obj));

    if (Array.isArray(obj)) {
        return React.createElement('ul', {
            style: {margin: '2px 0 2px 10px', padding: 0, listStyle: 'disc'},
        }, obj.map((item, i) => React.createElement('li', {key: i},
            typeof item === 'object' && item !== null
                ? renderJsonObject(item, depth + 1)
                : String(item)
        )));
    }

    return React.createElement('table', {
        style: {fontSize: '0.82em', borderCollapse: 'collapse', marginTop: '2px'},
    }, React.createElement('tbody', null,
        Object.entries(obj).map(([k, v]) =>
            React.createElement('tr', {key: k},
                React.createElement('td', {
                    style: {
                        padding: '1px 6px 1px 0',
                        fontWeight: 600,
                        verticalAlign: 'top',
                        color: '#666',
                        whiteSpace: 'nowrap',
                    },
                }, k + ':'),
                React.createElement('td', {style: {padding: '1px 0'}},
                    typeof v === 'object' && v !== null
                        ? renderJsonObject(v, depth + 1)
                        : String(v)
                )
            )
        )
    ));
}

// ── Core value renderer ──────────────────────────────────────────────────────
function renderValue(name, value) {
    if (value === null || value === undefined) return null;
    const raw   = String(value).trim();
    if (raw === '' || raw === 'null' || raw === 'NULL') return null;

    const lower = raw.toLowerCase();

    // ── SIDC military code ───────────────────────────────────────────────────
    if (SIDC_RE.test(raw)) {
        const affil = AFFIL_MAP[raw[1].toUpperCase()];
        return React.createElement('span', null,
            React.createElement('code', {
                style: {
                    fontFamily: 'monospace',
                    backgroundColor: '#f5f5f5',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    marginRight: '6px',
                },
            }, raw),
            affil && React.createElement(Badge, {bg: affil.bg, fg: affil.fg}, affil.label)
        );
    }

    // ── Keyword badge ────────────────────────────────────────────────────────
    if (Object.prototype.hasOwnProperty.call(KEYWORD_BADGES, lower)) {
        const {bg, fg} = KEYWORD_BADGES[lower];
        return React.createElement(Badge, {bg, fg}, raw);
    }

    // ── Hex color swatch ─────────────────────────────────────────────────────
    if (HEX_COLOR_RE.test(raw)) {
        return React.createElement('span', {style: {display: 'inline-flex', alignItems: 'center', gap: '4px'}},
            React.createElement('span', {
                style: {
                    display: 'inline-block',
                    width: '14px', height: '14px',
                    borderRadius: '2px',
                    background: raw,
                    border: '1px solid rgba(0,0,0,0.2)',
                    verticalAlign: 'middle',
                },
            }),
            React.createElement('code', null, raw)
        );
    }

    // ── Image URL → thumbnail ────────────────────────────────────────────────
    if (URL_RE.test(raw) && IMG_URL_RE.test(raw)) {
        return React.createElement('span', null,
            React.createElement('a', {href: raw, target: '_blank', rel: 'noopener noreferrer'},
                React.createElement('img', {
                    src: raw,
                    alt: name,
                    style: {
                        maxWidth: '120px',
                        maxHeight: '80px',
                        borderRadius: '3px',
                        display: 'block',
                        marginTop: '2px',
                    },
                    onError: (e) => { e.target.style.display = 'none'; },
                })
            )
        );
    }

    // ── Generic URL ──────────────────────────────────────────────────────────
    if (URL_RE.test(raw)) {
        const label = raw.length > 55 ? raw.slice(0, 52) + '…' : raw;
        return React.createElement(Link, {href: raw}, '↗\u00a0' + label);
    }

    // ── E-mail ───────────────────────────────────────────────────────────────
    if (EMAIL_RE.test(raw)) {
        return React.createElement('a', {href: 'mailto:' + raw, style: {color: '#1976d2'}}, raw);
    }

    // ── Date / datetime ──────────────────────────────────────────────────────
    if (DATE_RE.test(raw)) {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
            const hasTime = raw.includes('T') || raw.includes(' ');
            const formatted = hasTime
                ? d.toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                })
                : d.toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric'});
            return React.createElement('span', {style: {color: '#37474f'}}, formatted);
        }
    }

    // ── Boolean ──────────────────────────────────────────────────────────────
    if (typeof value === 'boolean' || lower === 'true' || lower === 'false') {
        const isTrue = value === true || lower === 'true';
        return React.createElement(Badge,
            {bg: isTrue ? '#1b5e20' : '#616161', fg: '#fff'},
            isTrue ? '✓ Yes' : '✗ No'
        );
    }

    // ── JSON string ──────────────────────────────────────────────────────────
    if ((raw.startsWith('{') && raw.endsWith('}')) ||
        (raw.startsWith('[') && raw.endsWith(']'))) {
        try {
            const parsed = JSON.parse(raw);
            return renderJsonObject(parsed, 0);
        } catch (e) { /* fall through */ }
    }

    // ── Long text ────────────────────────────────────────────────────────────
    if (raw.length > 200) {
        const preview = raw.slice(0, 180) + '…';
        return React.createElement('details', {style: {display: 'inline'}},
            React.createElement('summary', {style: {cursor: 'pointer', display: 'inline'}}, preview),
            React.createElement('span', null, raw.slice(180))
        );
    }

    // ── Number ───────────────────────────────────────────────────────────────
    if (typeof value === 'number') {
        return Number.isInteger(value) ? raw : value.toFixed(6);
    }
    const numVal = Number(raw);
    if (!isNaN(numVal) && raw !== '') {
        if (!raw.includes('.')) return raw;
        if ((raw.split('.')[1] || '').length > 6) return numVal.toFixed(6);
    }

    return raw;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Transform a single attribute value into a React element (or string/null).
 * Called by QWC2's IdentifyPlugin for every attribute of every identified feature.
 */
export function attributeTransform(name, value, layer, feature) {
    const nameLower = (name || '').toLowerCase().trim();

    // Hide internal / geometry fields
    if (HIDDEN_ATTRS.has(nameLower)) return null;
    if (nameLower.endsWith('_geom') || nameLower.endsWith('geometry')) return null;
    if (nameLower === '__version__') return null;

    // Hide truly empty values
    if (value === null || value === undefined) return null;
    const strVal = String(value).trim();
    if (strVal === '' || strVal === 'null' || strVal === 'NULL') return null;

    return renderValue(name, value) ?? strVal;
}

/**
 * Compute extra attributes to append to the identify result for a feature.
 * Returns an array of {name, value} objects (can be empty).
 */
export function customAttributeCalculator(layer, feature) {
    const extras = [];

    // Append geometry type for situational awareness
    const geom = feature && feature.geometry;
    if (geom && geom.type) {
        const coordStr = _formatFirstCoord(geom);
        if (coordStr) {
            extras.push({name: 'Location', value: coordStr});
        }
    }

    return extras;
}

/** Format the first coordinate of a geometry as "lat, lon" in WGS84. */
function _formatFirstCoord(geom) {
    try {
        let coord = null;
        if (geom.type === 'Point') {
            coord = geom.coordinates;
        } else if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
            coord = geom.coordinates[0];
        } else if (geom.type === 'Polygon' || geom.type === 'MultiLineString') {
            coord = geom.coordinates[0][0];
        } else if (geom.type === 'MultiPolygon') {
            coord = geom.coordinates[0][0][0];
        }
        if (!coord || coord.length < 2) return null;
        const [lon, lat] = coord;
        // Only format if values are plausible WGS84 coordinates
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
        return `${lat >= 0 ? lat.toFixed(5) + '°N' : Math.abs(lat).toFixed(5) + '°S'}, ${lon >= 0 ? lon.toFixed(5) + '°E' : Math.abs(lon).toFixed(5) + '°W'}`;
    } catch (e) {
        return null;
    }
}

/**
 * Custom export formats for the identify results panel.
 */
export const customExporters = [];

