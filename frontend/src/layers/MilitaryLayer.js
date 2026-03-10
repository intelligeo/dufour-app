/**
 * Military Layer for OpenLayers
 * Renders military symbols (APP-6/MIL-STD-2525) on the map
 * 
 * Uses milsymbol.js for client-side rendering (fast, interactive)
 * with server-side fallback via symbolService for export/print.
 */

import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Style, Icon, Text, Fill, Stroke, Circle } from 'ol/style';
import { Point } from 'ol/geom';
import { Feature } from 'ol';
import { fromLonLat } from 'ol/proj';
import { 
  MilitaryUnit, 
  MilitaryScenario,
  getAffiliationColor,
  getUnitLabel 
} from '../services/militarySymbols';
import { getMapSymbol, preloadSymbols } from '../services/symbolService';
import appConfig from '../config/appConfig';

/** Default symbol size from config */
const SYMBOL_SIZE = appConfig.milsymbol?.defaultSize || 48;

/**
 * Create military symbol style using milsymbol.js (real NATO symbols)
 * Replaces the old Canvas-based simplified rendering.
 */
function createMilitarySymbolStyle(unit) {
  const label = getUnitLabel(unit);
  
  // Generate SIDC code from unit
  const sidc = (unit.generateSIDC && typeof unit.generateSIDC === 'function')
    ? unit.generateSIDC()
    : unit.sidc || buildSIDCFromUnit(unit);

  // Render via milsymbol.js (synchronous, client-side, cached)
  const { dataUrl, anchor, size: symbolSize } = getMapSymbol(sidc, {
    size: SYMBOL_SIZE,
    uniqueDesignation: unit.designation || undefined,
    staffComments: unit.name || undefined
  });

  return new Style({
    image: new Icon({
      src: dataUrl,
      anchor: [anchor.x / symbolSize.width, anchor.y / symbolSize.height],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      imgSize: [symbolSize.width, symbolSize.height]
    }),
    text: new Text({
      text: label,
      offsetY: (symbolSize.height / 2) + 12,
      font: 'bold 11px "Segoe UI", Arial, sans-serif',
      fill: new Fill({ color: '#1a1a2e' }),
      stroke: new Stroke({ color: '#ffffff', width: 3 }),
      textAlign: 'center'
    })
  });
}

/**
 * Build SIDC from unit properties when generateSIDC() is not available
 * (e.g., for plain objects, not MilitaryUnit instances)
 */
function buildSIDCFromUnit(unit) {
  const version = '10';
  const context = 'R';
  
  const affiliationMap = { friend: '3', hostile: '6', neutral: '4', unknown: '1' };
  const affiliation = affiliationMap[unit.affiliation] || '0';
  
  const dimension = 'G'; // Ground
  
  const statusMap = { present: '0', anticipated: '1', assumed_friend: '2' };
  const status = statusMap[unit.status] || '0';
  
  const typeMap = {
    infantry: '110100', armor: '110200', mechanized: '110300',
    artillery: '110500', engineer: '110800', headquarters: '110000',
    reconnaissance: '110400', signal: '111800', logistics: '150000',
    medical: '150700', aviation: '110600', special_forces: '111800',
    maintenance: '150600', transport: '150300', supply: '150500'
  };
  const functionId = typeMap[unit.type] || '110100';
  
  const echelonMap = {
    team: '11', squad: '12', section: '13', platoon: '14',
    company: '15', battalion: '16', regiment: '17', brigade: '18',
    division: '21', corps: '22', army: '23'
  };
  const echelon = echelonMap[unit.echelon] || '00';
  
  return `${version}${context}${affiliation}${dimension}${status}${functionId}${echelon}00`;
}

/**
 * Create feature from military unit
 */
function createFeatureFromUnit(unit) {
  const feature = new Feature({
    geometry: new Point(fromLonLat(unit.position)),
    unit: unit
  });
  
  feature.setId(unit.id);
  feature.setStyle(createMilitarySymbolStyle(unit));
  
  return feature;
}

/**
 * Military Layer Class
 */
export class MilitaryLayer {
  constructor(options = {}) {
    this.scenario = options.scenario || new MilitaryScenario();
    
    // Create vector source
    this.source = new VectorSource();
    
    // Create vector layer
    this.layer = new VectorLayer({
      source: this.source,
      zIndex: options.zIndex || 100,
      properties: {
        name: options.name || 'Military Units',
        type: 'military'
      }
    });
    
    // Initialize features
    this.updateFeatures();
  }

  /**
   * Get OpenLayers layer
   */
  getLayer() {
    return this.layer;
  }

  /**
   * Add unit to scenario
   */
  addUnit(unit) {
    this.scenario.addUnit(unit);
    const feature = createFeatureFromUnit(unit);
    this.source.addFeature(feature);
    return feature;
  }

  /**
   * Remove unit from scenario
   */
  removeUnit(unitId) {
    this.scenario.removeUnit(unitId);
    const feature = this.source.getFeatureById(unitId);
    if (feature) {
      this.source.removeFeature(feature);
    }
  }

  /**
   * Update unit
   */
  updateUnit(unitId, updates) {
    const unit = this.scenario.getUnit(unitId);
    if (!unit) return;
    
    Object.assign(unit, updates);
    
    // Update feature
    const feature = this.source.getFeatureById(unitId);
    if (feature) {
      if (updates.position) {
        feature.getGeometry().setCoordinates(fromLonLat(updates.position));
      }
      feature.setStyle(createMilitarySymbolStyle(unit));
    }
  }

  /**
   * Get unit by ID
   */
  getUnit(unitId) {
    return this.scenario.getUnit(unitId);
  }

  /**
   * Get all units
   */
  getAllUnits() {
    return this.scenario.units;
  }

  /**
   * Clear all units
   */
  clear() {
    this.scenario.units = [];
    this.source.clear();
  }

  /**
   * Update all features from scenario
   */
  updateFeatures() {
    this.source.clear();
    this.scenario.units.forEach(unit => {
      const feature = createFeatureFromUnit(unit);
      this.source.addFeature(feature);
    });
  }

  /**
   * Load scenario (with symbol preloading)
   */
  loadScenario(scenario) {
    this.scenario = scenario;
    
    // Preload all SIDC symbols into client cache
    const sidcList = scenario.units
      .map(u => (u.generateSIDC ? u.generateSIDC() : u.sidc))
      .filter(Boolean);
    preloadSymbols(sidcList, { size: SYMBOL_SIZE });
    
    this.updateFeatures();
  }

  /**
   * Export scenario to GeoJSON
   */
  exportGeoJSON() {
    return this.scenario.toGeoJSON();
  }

  /**
   * Import from GeoJSON
   */
  importGeoJSON(geojson) {
    this.scenario = MilitaryScenario.fromGeoJSON(geojson);
    this.updateFeatures();
  }

  /**
   * Export scenario to JSON
   */
  exportJSON() {
    return this.scenario.toJSON();
  }

  /**
   * Import from JSON
   */
  importJSON(json) {
    this.scenario = MilitaryScenario.fromJSON(json);
    this.updateFeatures();
  }

  /**
   * Get feature at pixel (for selection)
   */
  getFeatureAtPixel(map, pixel) {
    let feature = null;
    map.forEachFeatureAtPixel(pixel, (f, layer) => {
      if (layer === this.layer) {
        feature = f;
        return true;
      }
    });
    return feature;
  }

  /**
   * Select unit
   */
  selectUnit(unitId) {
    const feature = this.source.getFeatureById(unitId);
    if (feature) {
      const unit = feature.get('unit');
      // Add selection style (larger, highlighted)
      const style = createMilitarySymbolStyle(unit);
      const image = style.getImage();
      image.setScale(1.3);
      feature.setStyle(style);
    }
  }

  /**
   * Deselect unit
   */
  deselectUnit(unitId) {
    const feature = this.source.getFeatureById(unitId);
    if (feature) {
      const unit = feature.get('unit');
      feature.setStyle(createMilitarySymbolStyle(unit));
    }
  }

  /**
   * Set unit visibility
   */
  setUnitVisibility(unitId, visible) {
    const feature = this.source.getFeatureById(unitId);
    if (feature) {
      feature.setStyle(visible ? createMilitarySymbolStyle(feature.get('unit')) : null);
    }
  }

  /**
   * Filter units by affiliation
   */
  filterByAffiliation(affiliations) {
    this.scenario.units.forEach(unit => {
      const visible = affiliations.includes(unit.affiliation);
      this.setUnitVisibility(unit.id, visible);
    });
  }

  /**
   * Get layer extent
   */
  getExtent() {
    return this.source.getExtent();
  }

  /**
   * Fit map to units
   */
  fitToUnits(map, options = {}) {
    const extent = this.getExtent();
    if (extent && !isNaN(extent[0])) {
      map.getView().fit(extent, {
        padding: options.padding || [50, 50, 50, 50],
        duration: options.duration || 500,
        maxZoom: options.maxZoom || 15
      });
    }
  }

  /**
   * ORBAT INTEGRATION METHODS
   */

  /**
   * Load ORBAT tree and render all units
   */
  loadOrbatTree(orbatTree, options = {}) {
    if (!orbatTree || !orbatTree.root) {
      console.warn('Cannot load empty ORBAT tree');
      return;
    }

    // Clear existing units
    this.clear();

    // Extract all units from tree
    const allUnits = orbatTree.getAllUnits();
    
    // Preload all symbols into client cache for fast rendering
    const sidcList = allUnits
      .map(u => (u.generateSIDC ? u.generateSIDC() : u.sidc))
      .filter(Boolean);
    preloadSymbols(sidcList, { size: SYMBOL_SIZE });
    
    // Add units to scenario
    this.scenario.name = orbatTree.name;
    this.scenario.description = orbatTree.description;
    this.scenario.units = allUnits;

    // Store ORBAT tree reference
    this.orbatTree = orbatTree;
    this.showCommandLines = options.showCommandLines !== false; // Default true

    // Render all units
    allUnits.forEach(unit => this.addUnit(unit));

    // Render command lines if enabled
    if (this.showCommandLines) {
      this.renderCommandLines();
    }

    console.log(`Loaded ORBAT: ${orbatTree.getTotalUnits()} units`);
  }

  /**
   * Render command lines (parent-child relationships)
   */
  renderCommandLines() {
    if (!this.orbatTree) return;

    // Remove existing command lines
    this.clearCommandLines();

    const commandLinesLayer = new VectorLayer({
      source: new VectorSource(),
      style: this.createCommandLineStyle(),
      zIndex: this.layer.getZIndex() - 1 // Below symbols
    });

    this.orbatTree.traverseDFS(unit => {
      if (unit.children.length > 0) {
        unit.children.forEach(child => {
          const line = this.createCommandLine(unit, child);
          if (line) {
            commandLinesLayer.getSource().addFeature(line);
          }
        });
      }
    });

    this.commandLinesLayer = commandLinesLayer;
    
    // Add to map (assuming map reference is available)
    if (this.layer.getMap()) {
      this.layer.getMap().addLayer(commandLinesLayer);
    }
  }

  /**
   * Create command line feature between parent and child
   */
  createCommandLine(parent, child) {
    if (!parent.position || !child.position) return null;

    const { LineString } = require('ol/geom');
    
    const coords = [
      fromLonLat(parent.position),
      fromLonLat(child.position)
    ];

    const line = new Feature({
      geometry: new LineString(coords),
      parent: parent,
      child: child,
      type: 'command-line'
    });

    return line;
  }

  /**
   * Create style for command lines
   */
  createCommandLineStyle() {
    return new Style({
      stroke: new Stroke({
        color: 'rgba(52, 152, 219, 0.6)',
        width: 2,
        lineDash: [4, 4]
      })
    });
  }

  /**
   * Toggle command lines visibility
   */
  toggleCommandLines(visible) {
    if (visible === undefined) {
      this.showCommandLines = !this.showCommandLines;
    } else {
      this.showCommandLines = visible;
    }

    if (this.commandLinesLayer) {
      this.commandLinesLayer.setVisible(this.showCommandLines);
    } else if (this.showCommandLines) {
      this.renderCommandLines();
    }
  }

  /**
   * Clear command lines
   */
  clearCommandLines() {
    if (this.commandLinesLayer) {
      const map = this.commandLinesLayer.getMap();
      if (map) {
        map.removeLayer(this.commandLinesLayer);
      }
      this.commandLinesLayer = null;
    }
  }

  /**
   * Filter units by echelon level
   */
  filterByEchelon(minLevel, maxLevel) {
    if (!this.orbatTree) {
      console.warn('No ORBAT tree loaded');
      return;
    }

    this.orbatTree.getAllUnits().forEach(unit => {
      const visible = unit.level >= minLevel && unit.level <= maxLevel;
      this.setUnitVisibility(unit.id, visible);
    });

    // Update command lines
    if (this.showCommandLines) {
      this.renderCommandLines();
    }
  }

  /**
   * Highlight unit and its relationships
   */
  highlightUnitHierarchy(unitId) {
    if (!this.orbatTree) return;

    const unit = this.orbatTree.findUnitById(unitId);
    if (!unit) return;

    // Get ancestors and descendants
    const ancestors = unit.getAncestors();
    const descendants = unit.getDescendants();
    const related = [unit, ...ancestors, ...descendants];

    // Dim all units
    this.scenario.units.forEach(u => {
      const isRelated = related.includes(u);
      const feature = this.source.getFeatureById(u.id);
      if (feature) {
        const style = createMilitarySymbolStyle(u);
        if (!isRelated) {
          style.setOpacity(0.3);
        }
        feature.setStyle(style);
      }
    });

    // Select the target unit
    this.selectUnit(unitId);
  }

  /**
   * Clear hierarchy highlight
   */
  clearHierarchyHighlight() {
    this.scenario.units.forEach(unit => {
      const feature = this.source.getFeatureById(unit.id);
      if (feature) {
        feature.setStyle(createMilitarySymbolStyle(unit));
      }
    });
  }

  /**
   * Update unit positions from ORBAT tree at specific timestamp
   * (for timeline support)
   */
  updatePositionsAtTime(timestamp) {
    if (!this.orbatTree) return;

    const allUnits = this.orbatTree.getAllUnits();
    
    allUnits.forEach(unit => {
      const position = unit.getPositionAtTime(timestamp);
      if (position) {
        const feature = this.source.getFeatureById(unit.id);
        if (feature) {
          feature.getGeometry().setCoordinates(fromLonLat(position));
        }
        unit.position = position; // Update unit position
      }
    });

    // Update command lines
    if (this.showCommandLines) {
      this.renderCommandLines();
    }
  }
}

export default MilitaryLayer;
