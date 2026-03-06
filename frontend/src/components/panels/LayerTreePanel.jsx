/**
 * LayerTreePanel
 * Panel for managing map layers
 */
import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';

const LayerTreePanel = ({ onAction, map }) => {
  const themeConfig = useSelector((state) => state.app.themeConfig);
  const [layers, setLayers] = useState([]);

  // Carica layer dal theme config
  useEffect(() => {
    if (!themeConfig || !map) return;

    console.log('LayerTreePanel: Loading layers from theme');

    try {
      // Ottieni layer dalla mappa OpenLayers
      const olLayers = map.getLayers().getArray();
      
      // Converti in formato per UI
      const layerList = olLayers.map((olLayer, index) => {
        const name = olLayer.get('name') || `Layer ${index}`;
        const title = olLayer.get('title') || name;
        const type = olLayer.get('background') ? 'base' : 'overlay';
        const visible = olLayer.getVisible();

        return {
          id: index,
          name: title,
          visible: visible,
          type: type,
          olLayer: olLayer // Riferimento al layer OpenLayers
        };
      });

      setLayers(layerList);
      console.log(`LayerTreePanel: Loaded ${layerList.length} layers`);

    } catch (error) {
      console.error('Error loading layers in LayerTreePanel:', error);
    }
  }, [themeConfig, map]);

  const toggleLayer = (id) => {
    const layer = layers.find(l => l.id === id);
    if (!layer || !layer.olLayer) return;

    // Toggle visibilità sul layer OpenLayers
    const newVisibility = !layer.olLayer.getVisible();
    layer.olLayer.setVisible(newVisibility);

    // Aggiorna stato locale
    setLayers(layers.map(l => 
      l.id === id ? { ...l, visible: newVisibility } : l
    ));

    // Chiudi panel su mobile dopo toggle
    if (onAction) onAction();
  };

  const baseMapLayers = layers.filter(l => l.type === 'base');
  const overlayLayers = layers.filter(l => l.type === 'overlay');

  return (
    <div style={{ padding: '8px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>Base Maps</h4>
        {baseMapLayers.map(layer => (
          <div
            key={layer.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: layer.visible ? '#e7f1ff' : 'transparent'
            }}
            onClick={() => toggleLayer(layer.id)}
          >
            <input
              type="radio"
              checked={layer.visible}
              onChange={() => {}}
              style={{ marginRight: '8px' }}
            />
            <span style={{ fontSize: '13px' }}>{layer.name}</span>
          </div>
        ))}
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>Overlay Layers</h4>
        {overlayLayers.map(layer => (
          <div
            key={layer.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            onClick={() => toggleLayer(layer.id)}
          >
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={() => {}}
              style={{ marginRight: '8px' }}
            />
            <span style={{ fontSize: '13px' }}>{layer.name}</span>
          </div>
        ))}
      </div>

      <button
        style={{
          marginTop: '16px',
          width: '100%',
          padding: '8px',
          backgroundColor: 'var(--secondary-color)',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '13px'
        }}
      >
        + Add Layer
      </button>
    </div>
  );
};

export default LayerTreePanel;
