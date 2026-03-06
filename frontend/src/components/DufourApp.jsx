/**
 * DufourApp Component
 * Main application container with KADAS-style layout
 */
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import RibbonToolbar from './RibbonToolbar';
import MapComponent from './MapComponent';
import StatusBar from './StatusBar';
import SidePanel from './SidePanel';
import MapEditPanel from './MapEditPanel';
import GridEditPanel from './GridEditPanel';
import ChartEditPanel from './ChartEditPanel';
import MeasurePlugin, { MeasureMode } from '../plugins/Measure';
import RedliningPlugin, { DrawMode } from '../plugins/Redlining';
import '../styles/ribbon.css';

const DufourApp = () => {
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [leftPanelContent, setLeftPanelContent] = useState(null);
  const [rightPanelContent, setRightPanelContent] = useState(null);
  const [activeTool, setActiveTool] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  
  // Edit mode state: 'map', 'grid', 'chart'
  const [editMode, setEditMode] = useState('map');
  const [mapEditPanelOpen, setMapEditPanelOpen] = useState(false);
  
  // Plugin states
  const [measureActive, setMeasureActive] = useState(false);
  const [measureMode, setMeasureMode] = useState(null);
  const [redliningActive, setRedliningActive] = useState(false);
  const [redliningMode, setRedliningMode] = useState(null);

  const dispatch = useDispatch();
  const locale = useSelector(state => state.locale?.current || 'en-US');
  const mapPosition = useSelector(state => state.map?.center);
  const mapZoom = useSelector(state => state.map?.zoom);
  const mapScale = useSelector(state => state.map?.scale);

  const handleToolSelect = (toolId) => {
    console.log('Tool selected:', toolId);
    setActiveTool(toolId);

    // Handle different tools
    switch (toolId) {
      case 'layer-tree':
        setLeftPanelContent('layers');
        setLeftPanelOpen(true);
        break;
      
      case 'search':
        setLeftPanelContent('search');
        setLeftPanelOpen(true);
        break;
      
      case 'identify':
        setActiveTool('identify');
        break;
      
      // Measurement tools
      case 'measure-distance':
        setMeasureMode(MeasureMode.DISTANCE);
        setMeasureActive(true);
        setRedliningActive(false);
        setActiveTool(toolId);
        break;
      
      case 'measure-area':
        setMeasureMode(MeasureMode.AREA);
        setMeasureActive(true);
        setRedliningActive(false);
        setActiveTool(toolId);
        break;
      
      case 'measure-circle':
        setMeasureMode(MeasureMode.CIRCLE);
        setMeasureActive(true);
        setRedliningActive(false);
        setActiveTool(toolId);
        break;
      
      case 'measure-angle':
        setMeasureMode(MeasureMode.ANGLE);
        setMeasureActive(true);
        setRedliningActive(false);
        setActiveTool(toolId);
        break;
      
      // Map editing tools
      case 'draw':
      case 'edit-geometry':
        setMapEditPanelOpen(true);
        setEditMode('map');
        break;
      
      // Grid edit mode
      case 'grid-edit':
        setEditMode('grid');
        setMapEditPanelOpen(false);
        break;
      
      // Chart edit mode
      case 'chart-edit':
        setEditMode('chart');
        setMapEditPanelOpen(false);
        break;
        setRightPanelOpen(true);
        break;
      
      // Redlining/Drawing tools
      case 'draw-point':
        setRedliningMode(DrawMode.POINT);
        setRedliningActive(true);
        setMeasureActive(false);
        setActiveTool(toolId);
        break;
      
      case 'draw-line':
        setRedliningMode(DrawMode.LINE);
        setRedliningActive(true);
        setMeasureActive(false);
        setActiveTool(toolId);
        break;
      
      case 'draw-polygon':
        setRedliningMode(DrawMode.POLYGON);
        setRedliningActive(true);
        setMeasureActive(false);
        setActiveTool(toolId);
        break;
      
      case 'draw-circle':
        setRedliningMode(DrawMode.CIRCLE);
        setRedliningActive(true);
        setMeasureActive(false);
        setActiveTool(toolId);
        break;
      
      case 'draw-rectangle':
        setRedliningMode(DrawMode.RECTANGLE);
        setRedliningActive(true);
        setMeasureActive(false);
        setActiveTool(toolId);
        break;
      
      case 'draw-text':
        setRedliningMode(DrawMode.TEXT);
        setRedliningActive(true);
        setMeasureActive(false);
        setActiveTool(toolId);
        break;
      
      case 'draw-marker':
        setRedliningMode(DrawMode.MARKER);
        setRedliningActive(true);
        setMeasureActive(false);
        setActiveTool(toolId);
        break;
      
      case 'slope':
      case 'viewshed':
        setActiveTool(toolId);
        setRightPanelContent('terrain');
        setRightPanelOpen(true);
        break;
      
      case 'import-gpx':
      case 'import-kml':
      case 'import-geojson':
        setLeftPanelContent('import');
        setLeftPanelOpen(true);
        break;
      
      case 'print':
        setRightPanelContent('print');
        setRightPanelOpen(true);
        break;
      
      case 'settings':
        setRightPanelContent('settings');
        setRightPanelOpen(true);
        break;
      
      default:
        console.log('Tool not yet implemented:', toolId);
    }
  };

  const closePanels = () => {
    setLeftPanelOpen(false);
    setRightPanelOpen(false);
  };

  const handleMapEditTool = (toolData) => {
    console.log('Map edit tool selected:', toolData);
    // TODO: Implementare logica per strumenti di disegno/modifica
  };

  const handleUnitUpdate = (unitId, updates) => {
    console.log('Update unit:', unitId, updates);
    // TODO: Aggiornare unità nello store Redux
  };

  const handleUnitDelete = (unitId) => {
    console.log('Delete unit:', unitId);
    // TODO: Eliminare unità dallo store Redux
  };

  const handleAddUnit = () => {
    console.log('Add new unit');
    // TODO: Creare nuova unità
  };

  return (
    <div className="app-container">
      {/* KADAS-style Ribbon Toolbar with integrated Edit Mode Switcher */}
      <RibbonToolbar 
        onToolSelect={handleToolSelect}
        editMode={editMode}
        onEditModeChange={setEditMode}
      />

      {/* Main content area with map and panels */}
      <div className="app-main">
        {/* Left side panel */}
        {leftPanelOpen && (
          <SidePanel
            side="left"
            content={leftPanelContent}
            onClose={() => setLeftPanelOpen(false)}
            onAction={() => setLeftPanelOpen(false)}
            map={mapInstance}
          />
        )}

        {/* Main content area - changes based on edit mode */}
        <div className="map-container">
          {editMode === 'map' && (
            <>
              <MapComponent activeTool={activeTool} onMapReady={setMapInstance} />
              
              {/* Measurement Plugin */}
              {measureActive && (
                <MeasurePlugin
                  map={mapInstance}
                  mode={measureMode}
                  active={measureActive}
                  onMeasurement={(measurement) => console.log('Measurement:', measurement)}
                  onClose={() => {
                    setMeasureActive(false);
                    setActiveTool(null);
                  }}
                />
              )}
              
              {/* Redlining Plugin */}
              {redliningActive && (
                <RedliningPlugin
                  map={mapInstance}
                  mode={redliningMode}
                  active={redliningActive}
                  onFeatureDrawn={(feature) => console.log('Feature drawn:', feature)}
                  onClose={() => {
                    setRedliningActive(false);
                    setActiveTool(null);
                  }}
                />
              )}
              
              {mapEditPanelOpen && (
                <MapEditPanel
                  onClose={() => setMapEditPanelOpen(false)}
                  onToolSelect={handleMapEditTool}
                  activeTool={activeTool}
                />
              )}
            </>
          )}

          {editMode === 'grid' && (
            <GridEditPanel
              units={[]} // TODO: Ottenere unità dallo store
              onUpdateUnit={handleUnitUpdate}
              onDeleteUnit={handleUnitDelete}
              onAddUnit={handleAddUnit}
            />
          )}

          {editMode === 'chart' && (
            <ChartEditPanel
              orbatTree={null} // TODO: Ottenere ORBAT tree dallo store
              onUnitSelect={(unitId) => console.log('Unit selected:', unitId)}
              onUnitEdit={(unitId) => console.log('Edit unit:', unitId)}
              selectedUnitId={null}
            />
          )}
        </div>

        {/* Right side panel */}
        {rightPanelOpen && (
          <SidePanel
            side="right"
            content={rightPanelContent}
            onClose={() => setRightPanelOpen(false)}
            onAction={() => setRightPanelOpen(false)}
            map={mapInstance}
          />
        )}
      </div>

      {/* Status bar at bottom */}
      <StatusBar
        position={mapPosition}
        zoom={mapZoom}
        scale={mapScale}
        locale={locale}
      />
    </div>
  );
};

export default DufourApp;
