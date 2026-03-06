/**
 * StatusBar Component
 * Bottom status bar showing map coordinates, scale, and other info
 */
import React from 'react';
import { transform } from 'ol/proj';
import ProjectSelector from './ProjectSelector';

const StatusBar = ({ position, zoom, scale, locale }) => {
  const formatCoordinate = (coord, projection = 'EPSG:4326') => {
    if (!coord) return '---';
    
    try {
      const transformed = transform(coord, 'EPSG:3857', projection);
      
      if (projection === 'EPSG:4326') {
        // WGS84 (Lat/Lon)
        const lat = transformed[1].toFixed(5);
        const lon = transformed[0].toFixed(5);
        return `${lat}°N, ${lon}°E`;
      } else if (projection === 'EPSG:2056') {
        // Swiss LV95
        const e = Math.round(transformed[0]);
        const n = Math.round(transformed[1]);
        return `E: ${e}m, N: ${n}m`;
      }
    } catch (e) {
      return '---';
    }
  };

  const formatScale = (scale) => {
    if (!scale) return '---';
    return `1:${scale.toLocaleString()}`;
  };

  const labels = {
    'en-US': {
      coordinates: 'Coordinates',
      scale: 'Scale',
      zoom: 'Zoom',
      projection: 'Projection'
    },
    'de-CH': {
      coordinates: 'Koordinaten',
      scale: 'Massstab',
      zoom: 'Zoom',
      projection: 'Projektion'
    },
    'fr-FR': {
      coordinates: 'Coordonnées',
      scale: 'Échelle',
      zoom: 'Zoom',
      projection: 'Projection'
    },
    'it-IT': {
      coordinates: 'Coordinate',
      scale: 'Scala',
      zoom: 'Zoom',
      projection: 'Proiezione'
    }
  };

  const t = labels[locale] || labels['en-US'];

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <ProjectSelector />
        <div className="status-item">
          <span className="status-item-label">{t.coordinates}:</span>
          <span className="status-item-value">{formatCoordinate(position)}</span>
        </div>
        <div className="status-item">
          <span className="status-item-label">{t.projection}:</span>
          <span className="status-item-value">WGS84</span>
        </div>
      </div>
      
      <div className="status-bar-center">
        <div className="status-item">
          <span className="status-item-label">{t.scale}:</span>
          <span className="status-item-value">{formatScale(scale)}</span>
        </div>
      </div>
      
      <div className="status-bar-right">
        <div className="status-item">
          <span className="status-item-label">{t.zoom}:</span>
          <span className="status-item-value">{zoom ? zoom.toFixed(1) : '---'}</span>
        </div>
        <div className="status-item">
          <span className="status-item-value">🟢 Online</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
