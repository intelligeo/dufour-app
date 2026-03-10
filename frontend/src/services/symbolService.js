/**
 * Symbol Service — Centralized Military Symbol Rendering
 * 
 * Hybrid approach:
 *  - Client-side: milsymbol.js for interactive map (fast, no network)
 *  - Server-side: /api/symbols/{sidc} for export, print, ORBAT icons
 * 
 * Includes:
 *  - LRU in-memory cache for data URLs
 *  - Automatic fallback: server → client-side
 *  - Batch fetching for scenarios with many units
 *  - SIDC validation
 * 
 * @module symbolService
 */

import ms from 'milsymbol';
import appConfig from '../config/appConfig.js';

// ─── Configuration ──────────────────────────────────────────────
const DEFAULT_SYMBOL_SIZE = 48;
const CLIENT_CACHE_MAX = 1024;
const SERVER_FETCH_TIMEOUT = 5000; // ms

/**
 * Get the symbol server base URL from config or env
 */
function getServerBaseUrl() {
  const cfg = appConfig.milsymbol || {};
  return cfg.serverUrl
    || import.meta.env.VITE_SYMBOL_SERVER_URL
    || '/api/symbols';
}

// ─── LRU Cache ──────────────────────────────────────────────────

class LRUCache {
  constructor(maxSize = CLIENT_CACHE_MAX) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

// ─── Caches ─────────────────────────────────────────────────────

/** Cache for client-side rendered data URLs */
const clientCache = new LRUCache(CLIENT_CACHE_MAX);

/** Cache for server-fetched data URLs */
const serverCache = new LRUCache(CLIENT_CACHE_MAX);

// ─── Client-Side Rendering (milsymbol.js) ───────────────────────

/**
 * Build cache key from SIDC + options
 */
function buildCacheKey(sidc, options = {}) {
  const size = options.size || DEFAULT_SYMBOL_SIZE;
  const mods = [];
  if (options.uniqueDesignation) mods.push(`ud:${options.uniqueDesignation}`);
  if (options.higherFormation) mods.push(`hf:${options.higherFormation}`);
  if (options.staffComments) mods.push(`sc:${options.staffComments}`);
  if (options.quantity) mods.push(`q:${options.quantity}`);
  if (options.direction) mods.push(`dir:${options.direction}`);
  return `${sidc}|${size}|${mods.join(',')}`;
}

/**
 * Render symbol client-side using milsymbol.js
 * Returns a milsymbol Symbol instance
 * 
 * @param {string} sidc - Symbol Identification Code (APP-6D 20-char or 2525C 15-char)
 * @param {object} options - Rendering options
 * @returns {ms.Symbol} milsymbol Symbol instance
 */
export function renderSymbolClient(sidc, options = {}) {
  const symbolOptions = {
    size: options.size || DEFAULT_SYMBOL_SIZE,
    ...options
  };

  // Remove non-milsymbol options
  delete symbolOptions.format;

  return new ms.Symbol(sidc, symbolOptions);
}

/**
 * Get symbol as data URL (client-side, cached)
 * Fastest option for interactive map rendering
 * 
 * @param {string} sidc 
 * @param {object} options 
 * @param {'svg'|'png'} format 
 * @returns {string} Data URL (data:image/svg+xml or data:image/png)
 */
export function getSymbolDataURL(sidc, options = {}, format = 'svg') {
  const key = buildCacheKey(sidc, options) + `|${format}`;

  const cached = clientCache.get(key);
  if (cached) return cached;

  const symbol = renderSymbolClient(sidc, options);
  let dataUrl;

  if (format === 'png') {
    // Use canvas for PNG
    const canvas = symbol.asCanvas();
    dataUrl = canvas.toDataURL('image/png');
  } else {
    // SVG (default, lighter)
    dataUrl = symbol.toDataURL();
  }

  clientCache.set(key, dataUrl);
  return dataUrl;
}

/**
 * Get symbol anchor point (center offset for OpenLayers Icon)
 * milsymbol provides anchor info in the symbol instance
 * 
 * @param {string} sidc 
 * @param {object} options 
 * @returns {{ anchor: [number, number], size: [number, number] }}
 */
export function getSymbolAnchor(sidc, options = {}) {
  const symbol = renderSymbolClient(sidc, options);
  const anchor = symbol.getAnchor();
  const size = symbol.getSize();

  return {
    anchor: [anchor.x, anchor.y],
    size: [size.width, size.height]
  };
}

// ─── Server-Side Rendering ──────────────────────────────────────

/**
 * Fetch symbol from server as blob/data URL
 * Used for export, print, ORBAT icons (higher quality)
 * 
 * @param {string} sidc 
 * @param {object} options - { size, format, uniqueDesignation, ... }
 * @returns {Promise<string>} Data URL or object URL
 */
export async function fetchSymbolFromServer(sidc, options = {}) {
  const format = options.format || 'svg';
  const key = buildCacheKey(sidc, options) + `|server|${format}`;

  const cached = serverCache.get(key);
  if (cached) return cached;

  const baseUrl = getServerBaseUrl();
  const params = new URLSearchParams();
  if (options.size) params.set('size', options.size);
  if (options.uniqueDesignation) params.set('uniqueDesignation', options.uniqueDesignation);
  if (options.higherFormation) params.set('higherFormation', options.higherFormation);
  if (options.staffComments) params.set('staffComments', options.staffComments);

  const url = `${baseUrl}/${sidc}.${format}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERVER_FETCH_TIMEOUT);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    let dataUrl;
    if (format === 'svg') {
      const svgText = await response.text();
      dataUrl = `data:image/svg+xml;base64,${btoa(svgText)}`;
    } else {
      const blob = await response.blob();
      dataUrl = await blobToDataURL(blob);
    }

    serverCache.set(key, dataUrl);
    return dataUrl;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[SymbolService] Server fetch failed for ${sidc}, falling back to client:`, err.message);
    // Fallback to client-side rendering
    return getSymbolDataURL(sidc, options, format);
  }
}

/**
 * Fetch batch of symbols from server
 * Uses POST /api/symbols/batch
 * 
 * @param {Array<{sidc: string, options?: object}>} symbols 
 * @returns {Promise<Map<string, string>>} Map of sidc → dataUrl
 */
export async function fetchSymbolBatch(symbols) {
  const baseUrl = getServerBaseUrl();
  const results = new Map();

  try {
    const response = await fetch(`${baseUrl}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: symbols.map(s => ({
          sidc: s.sidc,
          format: s.options?.format || 'svg',
          size: s.options?.size || DEFAULT_SYMBOL_SIZE,
          ...(s.options || {})
        }))
      })
    });

    if (!response.ok) {
      throw new Error(`Batch request failed: ${response.status}`);
    }

    const data = await response.json();

    // data.results is an array of { sidc, svg?, png?, error? }
    for (const result of (data.results || [])) {
      if (result.error) {
        console.warn(`[SymbolService] Batch error for ${result.sidc}: ${result.error}`);
        // Fallback to client
        const fallback = getSymbolDataURL(result.sidc, {}, 'svg');
        results.set(result.sidc, fallback);
      } else if (result.svg) {
        const dataUrl = `data:image/svg+xml;base64,${btoa(result.svg)}`;
        results.set(result.sidc, dataUrl);
        serverCache.set(buildCacheKey(result.sidc, {}) + '|server|svg', dataUrl);
      }
    }
  } catch (err) {
    console.warn('[SymbolService] Batch fetch failed, falling back to client:', err.message);
    // Client-side fallback for all
    for (const s of symbols) {
      const fallback = getSymbolDataURL(s.sidc, s.options || {}, 'svg');
      results.set(s.sidc, fallback);
    }
  }

  return results;
}

// ─── SIDC Validation ────────────────────────────────────────────

/**
 * Validate a SIDC code client-side (basic structural check)
 * 
 * @param {string} sidc 
 * @returns {{ valid: boolean, format: string|null, message: string }}
 */
export function validateSIDC(sidc) {
  if (!sidc || typeof sidc !== 'string') {
    return { valid: false, format: null, message: 'SIDC is required' };
  }

  const clean = sidc.replace(/[\s\-*]/g, '');

  // APP-6D: exactly 20 alphanumeric characters
  if (/^[A-Z0-9]{20}$/i.test(clean)) {
    return { valid: true, format: 'app6d', message: 'Valid APP-6D SIDC' };
  }

  // 2525C: 10-15 characters (letters, digits, dashes, asterisks)
  if (/^[A-Z0-9\-\*]{10,15}$/i.test(sidc)) {
    return { valid: true, format: '2525c', message: 'Valid MIL-STD-2525C SIDC' };
  }

  return { valid: false, format: null, message: `Invalid SIDC format: "${sidc}"` };
}

/**
 * Validate SIDC via server (more thorough)
 * 
 * @param {string} sidc 
 * @returns {Promise<object>} Server validation response
 */
export async function validateSIDCServer(sidc) {
  const baseUrl = getServerBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/validate/${sidc}`);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    return await response.json();
  } catch (err) {
    console.warn('[SymbolService] Server validation failed, using client:', err.message);
    return validateSIDC(sidc);
  }
}

// ─── Hybrid Rendering Strategy ──────────────────────────────────

/**
 * Get symbol for map display (client-side, fast)
 * This is the primary method for MilitaryLayer
 * 
 * @param {string} sidc 
 * @param {object} options 
 * @returns {{ dataUrl: string, anchor: {x: number, y: number}, size: {width: number, height: number} }}
 */
export function getMapSymbol(sidc, options = {}) {
  const symbol = renderSymbolClient(sidc, {
    size: options.size || DEFAULT_SYMBOL_SIZE,
    ...options
  });

  return {
    dataUrl: symbol.toDataURL(),
    anchor: symbol.getAnchor(),
    size: symbol.getSize()
  };
}

/**
 * Get symbol for export/print (server-side, high quality)
 * Falls back to client-side if server unavailable
 * 
 * @param {string} sidc 
 * @param {object} options 
 * @returns {Promise<string>} Data URL
 */
export async function getExportSymbol(sidc, options = {}) {
  return fetchSymbolFromServer(sidc, {
    size: options.size || 96,
    format: options.format || 'png',
    ...options
  });
}

/**
 * Get symbol for UI thumbnail (small, SVG, cached)
 * Used in ORBAT tree, editors, lists
 * 
 * @param {string} sidc 
 * @param {number} size 
 * @returns {string} Data URL
 */
export function getThumbnailSymbol(sidc, size = 32) {
  return getSymbolDataURL(sidc, { size }, 'svg');
}

// ─── Cache Management ───────────────────────────────────────────

/**
 * Clear all caches
 */
export function clearSymbolCaches() {
  clientCache.clear();
  serverCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    clientCacheSize: clientCache.size,
    serverCacheSize: serverCache.size,
    maxSize: CLIENT_CACHE_MAX
  };
}

/**
 * Preload symbols for a scenario (batch fill cache)
 * Call this when loading a scenario with many units
 * 
 * @param {Array<string>} sidcList - Array of SIDC codes
 * @param {object} options 
 */
export async function preloadSymbols(sidcList, options = {}) {
  // Deduplicate
  const unique = [...new Set(sidcList)];
  
  // Fill client cache first (synchronous, fast)
  for (const sidc of unique) {
    getSymbolDataURL(sidc, options, 'svg');
  }

  // Optionally preload server cache too (async)
  if (options.preloadServer) {
    const uncached = unique.filter(sidc => {
      const key = buildCacheKey(sidc, options) + '|server|svg';
      return !serverCache.has(key);
    });

    if (uncached.length > 0) {
      await fetchSymbolBatch(uncached.map(sidc => ({ sidc, options })));
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────

/**
 * Convert Blob to data URL
 */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Check if milsymbol server is available
 * @returns {Promise<boolean>}
 */
export async function isServerAvailable() {
  const baseUrl = getServerBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default {
  // Client-side (fast, for map)
  renderSymbolClient,
  getSymbolDataURL,
  getMapSymbol,
  getSymbolAnchor,
  getThumbnailSymbol,
  
  // Server-side (quality, for export)
  fetchSymbolFromServer,
  fetchSymbolBatch,
  getExportSymbol,
  
  // Hybrid
  preloadSymbols,
  isServerAvailable,
  
  // Validation
  validateSIDC,
  validateSIDCServer,
  
  // Cache
  clearSymbolCaches,
  getCacheStats
};
