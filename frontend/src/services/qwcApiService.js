/**
 * QWC API Service
 * 
 * Service per interagire con QWC2 Theme API:
 * - Carica lista temi disponibili
 * - Carica configurazione completa di un tema
 * - Converte theme config in layer OpenLayers
 */

import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import TileWMS from 'ol/source/TileWMS';
import ImageWMS from 'ol/source/ImageWMS';
import WMTS from 'ol/source/WMTS';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { get as getProjection } from 'ol/proj';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class QwcApiService {
  /**
   * Ottiene lista di tutti i temi disponibili
   * @returns {Promise<Array>} Array di temi
   */
  async listThemes() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/themes`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch themes: ${response.statusText}`);
      }
      
      const themes = await response.json();
      return themes;
    } catch (error) {
      console.error('Error listing themes:', error);
      throw error;
    }
  }

  /**
   * Carica configurazione completa di un tema
   * @param {string} themeName - Nome del tema
   * @returns {Promise<Object>} Configurazione tema QWC2
   */
  async getTheme(themeName) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/themes/${themeName}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Theme "${themeName}" not found`);
        }
        throw new Error(`Failed to fetch theme: ${response.statusText}`);
      }
      
      const theme = await response.json();
      return theme;
    } catch (error) {
      console.error(`Error fetching theme ${themeName}:`, error);
      throw error;
    }
  }

  /**
   * Converte QWC theme layer in OpenLayers Layer
   * @param {Object} layerConfig - Configurazione layer da QWC theme
   * @param {string} wmsUrl - URL base WMS del progetto
   * @returns {ol.layer.Layer} Layer OpenLayers
   */
  createLayerFromConfig(layerConfig, wmsUrl) {
    const { name, title, visibility, type, sublayers } = layerConfig;

    // Se ha sublayers, è un gruppo (gestito separatamente)
    if (sublayers && sublayers.length > 0) {
      return null; // Groups handled by LayerTree component
    }

    // WMS Layer
    if (type === 'wms' || !type) {
      const source = new ImageWMS({
        url: wmsUrl,
        params: {
          'LAYERS': name,
          'VERSION': '1.3.0',
          'FORMAT': 'image/png',
          'TRANSPARENT': true,
        },
        serverType: 'qgis',
        crossOrigin: 'anonymous',
      });

      const layer = new ImageLayer({
        source: source,
        visible: visibility !== false,
        opacity: layerConfig.opacity || 1.0,
      });

      layer.set('name', name);
      layer.set('title', title || name);
      layer.set('type', 'wms');
      
      return layer;
    }

    // WMTS Layer (per background layers SwissTopo)
    if (type === 'wmts') {
      const wmtsConfig = layerConfig.wmtsConfig || {};
      const projection = getProjection('EPSG:3857');
      const resolutions = wmtsConfig.resolutions || this._getSwissTopoResolutions();
      const matrixIds = wmtsConfig.matrixIds || resolutions.map((_, i) => i);

      const tileGrid = new WMTSTileGrid({
        origin: wmtsConfig.origin || [-20037508.34, 20037508.34],
        resolutions: resolutions,
        matrixIds: matrixIds,
      });

      const source = new WMTS({
        url: wmtsConfig.url || layerConfig.url,
        layer: name,
        matrixSet: wmtsConfig.matrixSet || 'EPSG:3857',
        format: wmtsConfig.format || 'image/png',
        projection: projection,
        tileGrid: tileGrid,
        style: wmtsConfig.style || 'default',
        crossOrigin: 'anonymous',
      });

      const layer = new TileLayer({
        source: source,
        visible: visibility !== false,
        opacity: layerConfig.opacity || 1.0,
      });

      layer.set('name', name);
      layer.set('title', title || name);
      layer.set('type', 'wmts');
      layer.set('background', layerConfig.background || false);

      return layer;
    }

    console.warn(`Unsupported layer type: ${type} for layer ${name}`);
    return null;
  }

  /**
   * Crea tutti i layer da un theme config
   * @param {Object} themeConfig - Configurazione completa del tema
   * @returns {Array<ol.layer.Layer>} Array di layer OpenLayers
   */
  createLayersFromTheme(themeConfig) {
    const layers = [];
    const wmsUrl = themeConfig.url;

    // Background layers
    if (themeConfig.backgroundLayers) {
      themeConfig.backgroundLayers.forEach(bgLayer => {
        const layer = this.createLayerFromConfig(bgLayer, wmsUrl);
        if (layer) {
          layers.push(layer);
        }
      });
    }

    // Theme layers (recursive per groups)
    if (themeConfig.themeLayers) {
      this._addLayersRecursive(themeConfig.themeLayers, layers, wmsUrl);
    }

    return layers;
  }

  /**
   * Aggiunge layer ricorsivamente (gestisce groups)
   * @private
   */
  _addLayersRecursive(layerConfigs, layersArray, wmsUrl) {
    layerConfigs.forEach(layerConfig => {
      if (layerConfig.sublayers && layerConfig.sublayers.length > 0) {
        // È un gruppo, processa ricorsivamente
        this._addLayersRecursive(layerConfig.sublayers, layersArray, wmsUrl);
      } else {
        // È un layer singolo
        const layer = this.createLayerFromConfig(layerConfig, wmsUrl);
        if (layer) {
          layersArray.push(layer);
        }
      }
    });
  }

  /**
   * Resolutions standard per SwissTopo WMTS
   * @private
   */
  _getSwissTopoResolutions() {
    return [
      4000, 3750, 3500, 3250, 3000, 2750, 2500, 2250, 2000, 1750, 1500, 1250,
      1000, 750, 650, 500, 250, 100, 50, 20, 10, 5, 2.5, 2, 1.5, 1, 0.5
    ];
  }

  /**
   * Estrae extent da theme config
   * @param {Object} themeConfig - Configurazione tema
   * @returns {Array<number>} Extent [minx, miny, maxx, maxy]
   */
  getThemeExtent(themeConfig) {
    if (themeConfig.extent) {
      return themeConfig.extent;
    }
    
    if (themeConfig.initialBbox) {
      return themeConfig.initialBbox.bounds;
    }

    // Default: extent della Svizzera
    return [5.96, 45.82, 10.49, 47.81]; // WGS84
  }

  /**
   * Estrae scales da theme config
   * @param {Object} themeConfig - Configurazione tema
   * @returns {Array<number>} Array di scale disponibili
   */
  getThemeScales(themeConfig) {
    return themeConfig.scales || [
      500000, 250000, 100000, 50000, 25000, 10000, 5000, 2500, 1000, 500
    ];
  }
}

// Export singleton instance
export const qwcApiService = new QwcApiService();
export default qwcApiService;
