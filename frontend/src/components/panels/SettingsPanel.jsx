/**
 * SettingsPanel - Application settings
 */
import React, { useState } from 'react';
import appConfig from '../../config/appConfig';

const SettingsPanel = ({ onAction }) => {
  // Load plugin states from localStorage or use defaults from config
  const getInitialPluginStates = () => {
    const saved = localStorage.getItem('pluginStates');
    if (saved) {
      return JSON.parse(saved);
    }
    // Initialize from config
    const states = {};
    Object.keys(appConfig.plugins.optional || {}).forEach(key => {
      states[key] = appConfig.plugins.optional[key].enabled;
    });
    return states;
  };

  const [pluginStates, setPluginStates] = useState(getInitialPluginStates());

  const handleLanguageSelect = (langCode) => {
    console.log('Language selected:', langCode);
    // Close panel on mobile after selecting language
    if (onAction) onAction();
  };

  const handleCoordSystemChange = () => {
    // Close panel on mobile after changing coordinate system
    if (onAction) onAction();
  };

  const handlePluginToggle = (pluginKey) => {
    const newStates = {
      ...pluginStates,
      [pluginKey]: !pluginStates[pluginKey]
    };
    setPluginStates(newStates);
    localStorage.setItem('pluginStates', JSON.stringify(newStates));
    
    // Trigger page reload to apply changes
    window.location.reload();
  };

  const languages = [
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
    { code: 'de-CH', name: 'Deutsch', flag: '🇨🇭' },
    { code: 'fr-FR', name: 'Français', flag: '🇫🇷' },
    { code: 'it-IT', name: 'Italiano', flag: '🇮🇹' }
  ];

  return (
    <div style={{ padding: '8px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Language / Sprache / Langue / Lingua</h4>
      
      <div style={{ marginBottom: '20px' }}>
        {languages.map(lang => (
          <div
            key={lang.code}
            onClick={() => handleLanguageSelect(lang.code)}
            style={{
              padding: '10px',
              marginBottom: '6px',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px'
            }}
          >
            <span style={{ fontSize: '20px' }}>{lang.flag}</span>
            <span>{lang.name}</span>
          </div>
        ))}
      </div>
      
      <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Coordinate System</h4>
      
      <select 
        onChange={handleCoordSystemChange}
        style={{ width: '100%', padding: '8px', fontSize: '12px', borderRadius: '4px', marginBottom: '20px' }}>
        <option>WGS84 (EPSG:4326)</option>
        <option>Web Mercator (EPSG:3857)</option>
        <option>Swiss LV95 (EPSG:2056)</option>
      </select>

      <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Plugins</h4>
      
      <div style={{ marginBottom: '20px' }}>
        {appConfig.plugins.optional && Object.keys(appConfig.plugins.optional).map(pluginKey => {
          const plugin = appConfig.plugins.optional[pluginKey];
          const isEnabled = pluginStates[pluginKey] !== undefined ? pluginStates[pluginKey] : plugin.enabled;
          
          return (
            <div
              key={pluginKey}
              style={{
                padding: '12px',
                marginBottom: '8px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '13px'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '18px' }}>{plugin.icon}</span>
                  <strong>{plugin.name}</strong>
                </div>
                <div style={{ fontSize: '11px', color: '#6c757d', marginLeft: '26px' }}>
                  {plugin.description}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: '12px' }}>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => handlePluginToggle(pluginKey)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </label>
            </div>
          );
        })}
        <div style={{ fontSize: '11px', color: '#6c757d', fontStyle: 'italic', marginTop: '8px' }}>
          ℹ️ Changes require page reload to take effect
        </div>
      </div>
      
      <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>About</h4>
      
      <div style={{ padding: '12px', background: '#f8f9fa', borderRadius: '4px', fontSize: '12px' }}>
        <p style={{ margin: '0 0 8px 0' }}><strong>dufour.app</strong></p>
        <p style={{ margin: '0 0 8px 0' }}>Version 0.1.0 (POC)</p>
        <p style={{ margin: 0, color: '#6c757d' }}>KADAS-inspired web GIS platform</p>
      </div>
    </div>
  );
};

export default SettingsPanel;
