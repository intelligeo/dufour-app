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
      
      case 'measure-distance':
      case 'measure-area':
      case 'measure-angle':
        setActiveTool(toolId);
        setRightPanelContent('measurement');
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
      
      case 'draw-point':
      case 'draw-line':
      case 'draw-polygon':
      case 'draw-circle':
      case 'draw-rectangle':
      case 'draw-text':
        setActiveTool(toolId);
        setRightPanelContent('redlining');
        setRightPanelOpen(true);
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
