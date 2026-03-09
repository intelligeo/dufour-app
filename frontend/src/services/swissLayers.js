/**
 * Swiss Layer Catalog - SwissTopo base layers and overlays
 * All layers from geo.admin.ch WMTS service
 */

import TileLayer from 'ol/layer/Tile';
import WMTS from 'ol/source/WMTS';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { get as getProjection } from 'ol/proj';
import { getWidth, getTopLeft } from 'ol/extent';

// SwissTopo WMTS configuration
// Always use proxy to avoid CORS issues (both dev and production)
const WMTS_BASE = '/wmts';
const SWISSTOPO_WMTS_URL = `${WMTS_BASE}/1.0.0/{Layer}/default/current/3857/{TileMatrix}/{TileRow}/{TileCol}.{Format}`;

// Web Mercator projection extent
const projection = getProjection('EPSG:3857');
const projectionExtent = projection.getExtent();
const size = getWidth(projectionExtent) / 256;
const resolutions = new Array(19);
const matrixIds = new Array(19);

for (let z = 0; z < 19; ++z) {
  resolutions[z] = size / Math.pow(2, z);
  matrixIds[z] = z;
}

/**
 * Create Swiss WMTS tile grid
 */
function createSwissTileGrid() {
  return new WMTSTileGrid({
    origin: getTopLeft(projectionExtent),
    resolutions: resolutions,
    matrixIds: matrixIds
  });
}

/**
 * Swiss Base Layer Catalog
 */
export const swissBaseLayers = [
  {
    id: 'ch.swisstopo.pixelkarte-farbe',
    name: {
      en_US: 'SwissTopo Color Map',
      de_CH: 'SwissTopo Farbkarte',
      fr_FR: 'Carte SwissTopo Couleur',
      it_IT: 'Mappa SwissTopo Colore'
    },
    description: {
      en_US: 'Swiss national map in color',
      de_CH: 'Schweizerische Landeskarte in Farbe',
      fr_FR: 'Carte nationale suisse en couleur',
      it_IT: 'Carta nazionale svizzera a colori'
    },
    thumbnail: `${WMTS_BASE}/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/8/134/181.jpeg`,
    type: 'base',
    format: 'jpeg',
    maxZoom: 19,
    attribution: '© swisstopo'
  },
  {
    id: 'ch.swisstopo.pixelkarte-grau',
    name: {
      en_US: 'SwissTopo Grey Map',
      de_CH: 'SwissTopo Graukarte',
      fr_FR: 'Carte SwissTopo Grise',
      it_IT: 'Mappa SwissTopo Grigia'
    },
    description: {
      en_US: 'Swiss national map in greyscale',
      de_CH: 'Schweizerische Landeskarte in Graustufen',
      fr_FR: 'Carte nationale suisse en gris',
      it_IT: 'Carta nazionale svizzera in scala di grigi'
    },
    thumbnail: `${WMTS_BASE}/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/8/134/181.jpeg`,
    type: 'base',
    format: 'jpeg',
    maxZoom: 19,
    attribution: '© swisstopo'
  },
  {
    id: 'ch.swisstopo.swissimage',
    name: {
      en_US: 'SwissImage Aerial',
      de_CH: 'SwissImage Luftbild',
      fr_FR: 'SwissImage Orthophoto',
      it_IT: 'SwissImage Ortofoto'
    },
    description: {
      en_US: 'High-resolution aerial imagery (10cm resolution)',
      de_CH: 'Hochauflösende Luftbilder (10cm Auflösung)',
      fr_FR: 'Imagerie aérienne haute résolution (résolution 10cm)',
      it_IT: 'Immagini aeree ad alta risoluzione (risoluzione 10cm)'
    },
    thumbnail: `${WMTS_BASE}/1.0.0/ch.swisstopo.swissimage/default/current/3857/8/134/181.jpeg`,
    type: 'base',
    format: 'jpeg',
    maxZoom: 19,
    attribution: '© swisstopo'
  },
  {
    id: 'ch.swisstopo.pixelkarte-farbe-winter',
    name: {
      en_US: 'SwissTopo Winter Map',
      de_CH: 'SwissTopo Winterkarte',
      fr_FR: 'Carte SwissTopo Hiver',
      it_IT: 'Mappa SwissTopo Inverno'
    },
    description: {
      en_US: 'Swiss national map optimized for winter sports',
      de_CH: 'Schweizerische Landeskarte für Wintersport optimiert',
      fr_FR: 'Carte nationale suisse optimisée pour les sports d\'hiver',
      it_IT: 'Carta nazionale svizzera ottimizzata per gli sport invernali'
    },
    thumbnail: `${WMTS_BASE}/1.0.0/ch.swisstopo.pixelkarte-farbe-winter/default/current/3857/8/134/181.jpeg`,
    type: 'base',
    format: 'jpeg',
    maxZoom: 17,
    attribution: '© swisstopo'
  }
];

/**
 * Swiss Overlay Layers Catalog
 */
export const swissOverlayLayers = [
  {
    id: 'ch.swisstopo-vd.ortschaftenverzeichnis_plz',
    name: {
      en_US: 'Postal Codes',
      de_CH: 'Postleitzahlen',
      fr_FR: 'Codes Postaux',
      it_IT: 'Codici Postali'
    },
    type: 'overlay',
    format: 'png',
    maxZoom: 19,
    attribution: '© swisstopo'
  },
  {
    id: 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill',
    name: {
      en_US: 'Municipality Boundaries',
      de_CH: 'Gemeindegrenzen',
      fr_FR: 'Limites Communales',
      it_IT: 'Confini Comunali'
    },
    type: 'overlay',
    format: 'png',
    maxZoom: 19,
    attribution: '© swisstopo',
    opacity: 0.6
  },
  {
    id: 'ch.swisstopo.swissboundaries3d-kanton-flaeche.fill',
    name: {
      en_US: 'Canton Boundaries',
      de_CH: 'Kantonsgrenzen',
      fr_FR: 'Limites Cantonales',
      it_IT: 'Confini Cantonali'
    },
    type: 'overlay',
    format: 'png',
    maxZoom: 19,
    attribution: '© swisstopo',
    opacity: 0.6
  },
  {
    id: 'ch.swisstopo.hangneigung-ueber_30',
    name: {
      en_US: 'Slope > 30°',
      de_CH: 'Hangneigung > 30°',
      fr_FR: 'Pente > 30°',
      it_IT: 'Pendenza > 30°'
    },
    description: {
      en_US: 'Areas with slope greater than 30 degrees (avalanche risk)',
      de_CH: 'Gebiete mit Hangneigung über 30 Grad (Lawinengefahr)',
      fr_FR: 'Zones avec pente supérieure à 30 degrés (risque d\'avalanche)',
      it_IT: 'Aree con pendenza superiore a 30 gradi (rischio valanghe)'
    },
    type: 'overlay',
    format: 'png',
    maxZoom: 17,
    attribution: '© swisstopo',
    opacity: 0.7
  },
  {
    id: 'ch.swisstopo.vec25-gebaeudeadressen',
    name: {
      en_US: 'Building Addresses',
      de_CH: 'Gebäudeadressen',
      fr_FR: 'Adresses de Bâtiments',
      it_IT: 'Indirizzi degli Edifici'
    },
    type: 'overlay',
    format: 'png',
    maxZoom: 19,
    attribution: '© swisstopo'
  },
  {
    id: 'ch.swisstopo.vec200-transportation-oeffentliche-verkehr',
    name: {
      en_US: 'Public Transport',
      de_CH: 'Öffentlicher Verkehr',
      fr_FR: 'Transports Publics',
      it_IT: 'Trasporti Pubblici'
    },
    type: 'overlay',
    format: 'png',
    maxZoom: 17,
    attribution: '© swisstopo'
  }
];

/**
 * Create OpenLayers layer from Swiss layer configuration
 * @param {Object} layerConfig - Layer configuration object
 * @param {Object} options - Additional options (visible, opacity)
 * @returns {TileLayer} OpenLayers tile layer
 */
export function createSwissLayer(layerConfig, options = {}) {
  const {
    visible = layerConfig.type === 'base',
    opacity = layerConfig.opacity || 1
  } = options;

  const tileGrid = createSwissTileGrid();
  
  // Create custom tile URL function following geo.admin.ch REST API format
  // Format: {WMTS_BASE}/1.0.0/{Layer}/default/{Time}/{TileMatrixSet}/{TileMatrix}/{TileCol}/{TileRow}.{Format}
  // Note: For EPSG:3857, use standard col/row order (not row/col like EPSG:21781)
  const tileUrlFunction = (tileCoord) => {
    if (!tileCoord) return undefined;
    
    const z = tileCoord[0];      // TileMatrix (zoom level)
    const x = tileCoord[1];      // TileCol
    const y = tileCoord[2];      // TileRow
    
    // SwissTopo WMTS REST API: TileMatrix/TileCol/TileRow order for EPSG:3857
    return `${WMTS_BASE}/1.0.0/${layerConfig.id}/default/current/3857/${z}/${x}/${y}.${layerConfig.format}`;
  };

  const source = new WMTS({
    tileUrlFunction: tileUrlFunction,
    projection: projection,
    tileGrid: tileGrid,
    wrapX: false,
    attributions: layerConfig.attribution
  });

  const layer = new TileLayer({
    source: source,
    visible: visible,
    opacity: opacity,
    maxZoom: layerConfig.maxZoom || 19,
    preload: layerConfig.type === 'base' ? Infinity : 0
  });

  // Attach metadata
  layer.set('id', layerConfig.id);
  layer.set('name', layerConfig.name);
  layer.set('type', layerConfig.type);
  layer.set('description', layerConfig.description);
  layer.set('thumbnail', layerConfig.thumbnail);

  return layer;
}

/**
 * Get all available Swiss layers
 * @returns {Array} Combined array of base and overlay layers
 */
export function getAllSwissLayers() {
  return [...swissBaseLayers, ...swissOverlayLayers];
}

/**
 * Get layer by ID
 * @param {string} layerId - Layer ID
 * @returns {Object|null} Layer configuration or null
 */
export function getSwissLayerById(layerId) {
  return getAllSwissLayers().find(layer => layer.id === layerId) || null;
}

/**
 * Get localized layer name
 * @param {Object} layerConfig - Layer configuration
 * @param {string} locale - Locale code (e.g., 'en_US', 'de_CH')
 * @returns {string} Localized name
 */
export function getLayerName(layerConfig, locale = 'en_US') {
  if (typeof layerConfig.name === 'string') {
    return layerConfig.name;
  }
  return layerConfig.name[locale] || layerConfig.name.en_US || layerConfig.id;
}

/**
 * Get localized layer description
 * @param {Object} layerConfig - Layer configuration
 * @param {string} locale - Locale code
 * @returns {string} Localized description
 */
export function getLayerDescription(layerConfig, locale = 'en_US') {
  if (!layerConfig.description) return '';
  if (typeof layerConfig.description === 'string') {
    return layerConfig.description;
  }
  return layerConfig.description[locale] || layerConfig.description.en_US || '';
}

export default {
  swissBaseLayers,
  swissOverlayLayers,
  createSwissLayer,
  getAllSwissLayers,
  getSwissLayerById,
  getLayerName,
  getLayerDescription
};
