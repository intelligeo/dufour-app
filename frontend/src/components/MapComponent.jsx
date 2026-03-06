/**
 * MapComponent
 * OpenLayers map with Swiss geospatial services integration
 */
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls } from 'ol/control';
import { fromLonLat, transform, transformExtent } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import TileLayer from 'ol/layer/Tile';
import WMTS from 'ol/source/WMTS';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { getTopLeft } from 'ol/extent';
import { qwcApiService } from '../services/qwcApiService';
import { setLayers } from '../store/store';

// Define Swiss projection (EPSG:2056 - LV95)
proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');
register(proj4);

const MapComponent = ({ activeTool, onMapReady }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const dispatch = useDispatch();
  const themeConfig = useSelector((state) => state.app.themeConfig);

  useEffect(() => {
    if (!mapRef.current) return;

    // Swiss WMTS tile grid configuration
    const resolutions = [
      4000, 3750, 3500, 3250, 3000, 2750, 2500, 2250, 2000, 1750, 1500, 1250,
      1000, 750, 650, 500, 250, 100, 50, 20, 10, 5, 2.5, 2, 1.5, 1, 0.5, 0.25
    ];

    const matrixIds = resolutions.map((_, i) => i.toString());

    const tileGrid = new WMTSTileGrid({
      origin: getTopLeft([-20037508.34, -20037508.34, 20037508.34, 20037508.34]),
      resolutions: resolutions,
      matrixIds: matrixIds
    });

    // SwissTopo National Map Layer (WMTS)
    const swisstopoLayer = new TileLayer({
      source: new WMTS({
        url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{TileMatrix}/{TileRow}/{TileCol}.jpeg',
        layer: 'ch.swisstopo.pixelkarte-farbe',
        matrixSet: '3857',
        format: 'image/jpeg',
        projection: 'EPSG:3857',
        tileGrid: tileGrid,
        style: 'default',
        wrapX: true,
        attributions: '<a href="https://www.swisstopo.admin.ch/" target="_blank">© swisstopo</a>'
      }),
      name: 'SwissTopo National Map',
      visible: true
    });

    // Initialize map centered on Switzerland
    const map = new Map({
      target: mapRef.current,
      layers: [swisstopoLayer],
      view: new View({
        center: fromLonLat([8.2275, 46.8182]), // Bern, Switzerland
        zoom: 8,
        minZoom: 2,
        maxZoom: 20,
        projection: 'EPSG:3857'
      }),
      controls: defaultControls({
        attribution: true,
        zoom: false,
        rotate: false
      })
    });

    // Store map instance
    mapInstanceRef.current = map;

    // Notifica parent component che la mappa è pronta
    if (onMapReady) {
      onMapReady(map);
    }

    // Update Redux store with map state
    map.on('moveend', () => {
      const view = map.getView();
      const center = view.getCenter();
      const zoom = view.getZoom();
      const resolution = view.getResolution();
      
      // Calculate scale (approximate)
      const scale = Math.round(resolution * 96 / 0.0254);

      // Dispatch to Redux store (placeholder - will be connected later)
      console.log('Map moved:', { center, zoom, scale });
    });

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(null);
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Load layers from theme config
  useEffect(() => {
    if (!mapInstanceRef.current || !themeConfig) return;

    console.log('Loading layers from theme:', themeConfig.title);

    try {
      // Rimuovi tutti i layer esistenti tranne il primo (background)
      const map = mapInstanceRef.current;
      const currentLayers = map.getLayers().getArray();
      
      // Mantieni solo il background layer (primo layer)
      while (currentLayers.length > 1) {
        map.removeLayer(currentLayers[currentLayers.length - 1]);
      }

      // Crea e aggiungi nuovi layer dal theme
      const newLayers = qwcApiService.createLayersFromTheme(themeConfig);
      
      // Aggiungi layer alla mappa (salta background layers già presenti)
      newLayers.forEach(layer => {
        const isBackground = layer.get('background');
        if (!isBackground) {
          map.addLayer(layer);
        }
      });

      // Aggiorna store Redux
      dispatch(setLayers(newLayers.map(l => ({
        name: l.get('name'),
        title: l.get('title'),
        visible: l.getVisible(),
        type: l.get('type')
      }))));

      // Adatta vista all'extent del tema
      const themeExtent = qwcApiService.getThemeExtent(themeConfig);
      if (themeExtent) {
        // Converti extent da WGS84 a EPSG:3857
        const transformedExtent = transformExtent(
          themeExtent,
          'EPSG:4326',
          'EPSG:3857'
        );
        map.getView().fit(transformedExtent, {
          padding: [50, 50, 50, 50],
          duration: 1000
        });
      }

      console.log(`Loaded ${newLayers.length} layers from theme`);

    } catch (error) {
      console.error('Error loading layers from theme:', error);
    }
  }, [themeConfig, dispatch]);

  // Handle active tool changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    console.log('Active tool changed:', activeTool);

    // Add tool-specific interactions here
    // e.g., drawing, measuring, identify, etc.
    
  }, [activeTool]);

  return (
    <div
      ref={mapRef}
      id="map"
      style={{
        width: '100%',
        height: '100%',
        cursor: activeTool ? 'crosshair' : 'default'
      }}
    />
  );
};

export default MapComponent;
