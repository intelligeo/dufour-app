/**
 * Dufour.app Identify Extensions
 * Custom attribute handlers for the Identify / Feature-Info dialog.
 *
 * QWC2 calls attributeTransform(name, value, layer, feature) for every
 * attribute of an identified feature.  Return:
 *   null            → hide the attribute entirely
 *   string          → render as plain text
 *   React element   → render as rich HTML (links, badges, …)
 */
import React from 'react';

// ── Attributes that should never be shown to the user ───────────────────────
const HIDDEN_ATTRS = new Set([
    'geometry', 'geom', 'wkb_geometry', 'the_geom', 'shape',
    'wkt', 'ogc_fid', 'rowid',
]);

// ── Regexes ──────────────────────────────────────────────────────────────────
const URL_RE    = /^https?:\/\//i;
const DATE_RE   = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COORD_RE  = /^-?\d{1,3}\.\d{4,}$/;   // suspiciously precise float → coordinate

/**
 * Render a single attribute value.  Called once per attribute per feature by
 * the QWC2 Identify plugin.
 */
export function attributeTransform(name, value, layer, feature) {
    const nameLower = (name || '').toLowerCase().trim();

    // ── Hide geometry / internal fields ──────────────────────────────────────
    if (HIDDEN_ATTRS.has(nameLower)) return null;
    if (nameLower.endsWith('_geom') || nameLower.endsWith('geometry')) return null;

    // ── Hide null / empty ────────────────────────────────────────────────────
    if (value === null || value === undefined) return null;
    const strVal = String(value).trim();
    if (strVal === '' || strVal === 'null' || strVal === 'NULL') return null;

    // ── Clickable hyperlink ──────────────────────────────────────────────────
    if (URL_RE.test(strVal)) {
        const display = strVal.length > 60 ? strVal.slice(0, 57) + '…' : strVal;
        return React.createElement('a', {
            href: strVal,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'fi-attr-link',
        }, '↗ ' + display);
    }

    // ── E-mail link ──────────────────────────────────────────────────────────
    if (EMAIL_RE.test(strVal)) {
        return React.createElement('a', {
            href: 'mailto:' + strVal,
            className: 'fi-attr-link',
        }, strVal);
    }

    // ── Date / datetime ──────────────────────────────────────────────────────
    if (DATE_RE.test(strVal)) {
        const d = new Date(strVal);
        if (!isNaN(d.getTime())) {
            const hasTime = strVal.includes('T') || strVal.includes(' ');
            return hasTime
                ? d.toLocaleString(undefined, {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                  })
                : d.toLocaleDateString(undefined, {
                    year: 'numeric', month: 'long', day: 'numeric'
                  });
        }
    }

    // ── Numeric value ────────────────────────────────────────────────────────
    if (typeof value === 'number') {
        return Number.isInteger(value) ? strVal : value.toFixed(4);
    }
    const numVal = Number(strVal);
    if (!isNaN(numVal) && strVal !== '' && !COORD_RE.test(strVal)) {
        // integer-looking string
        if (!strVal.includes('.')) return strVal;
        // float with many decimals → round
        if (strVal.split('.')[1]?.length > 4) return numVal.toFixed(4);
    }

    return strVal;
}

/**
 * customAttributeCalculator – extra computed attributes appended to the
 * identify result.  Return [] to add nothing.
 */
export function customAttributeCalculator(layer, feature) {
    return [];
}

/**
 * customExporters – additional export formats for the identify result panel.
 * QWC2 built-in CSV export is already enabled via config.json enableExport.
 */
export const customExporters = [];
