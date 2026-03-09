/**
 * Swiss Federal Geoportal (geo.admin.ch) Search API Service
 * Documentation: https://api3.geo.admin.ch/services/sdiservices.html#search
 */

const GEO_ADMIN_SEARCH_URL = '/api3-geo/rest/services/api/SearchServer';
const GEO_ADMIN_LOCATIONS_URL = '/api3-geo/rest/services/api/MapServer/find';

/**
 * Search for locations, addresses, and places in Switzerland
 * @param {string} searchText - Text to search for
 * @param {Object} options - Search options
 * @param {string} options.type - Type of search: 'locations', 'layers', or 'featuresearch'
 * @param {Array} options.origins - Origins to search (e.g., 'address', 'parcel', 'gazetteer')
 * @param {number} options.limit - Maximum number of results (default: 10)
 * @param {string} options.bbox - Bounding box to limit search (format: minX,minY,maxX,maxY)
 * @param {number} options.sr - Spatial reference (default: 2056 for LV95, use 3857 for Web Mercator)
 * @returns {Promise<Array>} Array of search results
 */
export async function searchLocations(searchText, options = {}) {
  const {
    type = 'locations',
    origins = ['address', 'parcel', 'gazetteer', 'district', 'kantone', 'zipcode'],
    limit = 10,
    bbox = null,
    sr = 2056 // Swiss LV95 by default
  } = options;

  if (!searchText || searchText.trim().length < 2) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      searchText: searchText.trim(),
      type,
      origins: origins.join(','),
      limit: limit.toString(),
      sr: sr.toString()
    });

    if (bbox) {
      params.append('bbox', bbox);
    }

    const response = await fetch(`${GEO_ADMIN_SEARCH_URL}?${params}`);
    
    if (!response.ok) {
      throw new Error(`geo.admin.ch search failed: ${response.status}`);
    }

    const data = await response.json();
    return parseSearchResults(data.results || []);
  } catch (error) {
    console.error('Error searching locations:', error);
    return [];
  }
}

/**
 * Parse search results into a normalized format
 * @param {Array} results - Raw results from API
 * @returns {Array} Normalized results
 */
function parseSearchResults(results) {
  return results.map(result => ({
    id: result.id,
    label: result.attrs?.label || result.attrs?.name || 'Unknown',
    detail: result.attrs?.detail || '',
    type: result.attrs?.origin || 'location',
    weight: result.weight || 1,
    // Coordinates in LV95 (EPSG:2056)
    x: result.attrs?.x || result.attrs?.lon,
    y: result.attrs?.y || result.attrs?.lat,
    // Bounding box if available
    bbox: result.attrs?.geom_st_box2d ? parseBBox(result.attrs.geom_st_box2d) : null,
    // Additional attributes
    zipcode: result.attrs?.zipcode,
    municipality: result.attrs?.municipality || result.attrs?.gemeinde,
    canton: result.attrs?.canton || result.attrs?.kanton,
    rank: result.attrs?.rank || 1,
    // Raw data for reference
    raw: result
  }));
}

/**
 * Parse bounding box from geo.admin.ch format
 * @param {string} bbox - Format: "BOX(minX minY,maxX maxY)"
 * @returns {Array|null} [minX, minY, maxX, maxY]
 */
function parseBBox(bbox) {
  if (!bbox) return null;
  
  try {
    const match = bbox.match(/BOX\(([\d.]+)\s+([\d.]+),([\d.]+)\s+([\d.]+)\)/);
    if (match) {
      return [
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3]),
        parseFloat(match[4])
      ];
    }
  } catch (error) {
    console.warn('Failed to parse bbox:', bbox);
  }
  
  return null;
}

/**
 * Reverse geocoding: get location info from coordinates
 * @param {number} lon - Longitude (EPSG:4326)
 * @param {number} lat - Latitude (EPSG:4326)
 * @param {number} sr - Spatial reference for input coordinates (default: 4326)
 * @returns {Promise<Object|null>} Location information
 */
export async function reverseGeocode(lon, lat, sr = 4326) {
  try {
    const params = new URLSearchParams({
      geometryType: 'esriGeometryPoint',
      geometry: `${lon},${lat}`,
      geometryFormat: 'geojson',
      sr: sr.toString(),
      layers: 'all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill',
      returnGeometry: 'false'
    });

    const response = await fetch(`${GEO_ADMIN_LOCATIONS_URL}?${params}`);
    
    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        municipality: result.attributes?.gemname,
        canton: result.attributes?.ktname,
        coordinates: { lon, lat }
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error in reverse geocoding:', error);
    return null;
  }
}

/**
 * Search for Swiss coordinates (LV95 or LV03)
 * @param {string} coordString - Coordinate string (e.g., "2600000 1200000" or "600000 200000")
 * @returns {Object|null} Parsed coordinates or null
 */
export function parseSwissCoordinates(coordString) {
  if (!coordString) return null;

  // Remove common separators and extra spaces
  const cleaned = coordString.trim().replace(/[,;]/g, ' ').replace(/\s+/g, ' ');
  const parts = cleaned.split(' ');

  if (parts.length !== 2) return null;

  const x = parseFloat(parts[0]);
  const y = parseFloat(parts[1]);

  if (isNaN(x) || isNaN(y)) return null;

  // Detect coordinate system
  // LV95: X ~2.6M, Y ~1.2M
  // LV03: X ~600k, Y ~200k
  let epsg;
  if (x > 2000000 && x < 3000000 && y > 1000000 && y < 1500000) {
    epsg = 2056; // LV95
  } else if (x > 400000 && x < 900000 && y > 50000 && y < 400000) {
    epsg = 21781; // LV03
  } else {
    return null;
  }

  return { x, y, epsg };
}

/**
 * Search with autocomplete suggestions
 * @param {string} searchText - Partial search text
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Autocomplete suggestions
 */
export async function autocomplete(searchText, options = {}) {
  if (!searchText || searchText.length < 2) {
    return [];
  }

  // Use a shorter timeout for autocomplete
  const results = await searchLocations(searchText, {
    ...options,
    limit: 5 // Fewer results for autocomplete
  });

  return results.map(result => ({
    value: result.label,
    label: result.label,
    detail: result.detail,
    type: result.type,
    result: result
  }));
}

/**
 * Get height at a specific location using Swiss elevation API
 * @param {number} easting - Easting coordinate (LV95)
 * @param {number} northing - Northing coordinate (LV95)
 * @returns {Promise<number|null>} Height in meters or null
 */
export async function getHeightAtLocation(easting, northing) {
  try {
    const params = new URLSearchParams({
      easting: easting.toString(),
      northing: northing.toString(),
      sr: '2056' // LV95
    });

    const response = await fetch(`/api3-geo/rest/services/height?${params}`);
    
    if (!response.ok) {
      throw new Error(`Height query failed: ${response.status}`);
    }

    const data = await response.json();
    return data.height || null;
  } catch (error) {
    console.error('Error getting height:', error);
    return null;
  }
}

export default {
  searchLocations,
  reverseGeocode,
  parseSwissCoordinates,
  autocomplete,
  getHeightAtLocation
};
