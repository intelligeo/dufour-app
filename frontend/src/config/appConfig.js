/**
 * dufour.app Configuration
 * Based on QWC2 with KADAS-inspired customizations
 */

export default {
  // Application metadata
  appName: 'dufour.app',
  appVersion: '0.1.0',
  
  // Initial map view (Switzerland center)
  initialView: {
    center: [830000, 5933000], // Swiss coordinates in EPSG:3857
    zoom: 8,
    crs: 'EPSG:3857'
  },

  // Map configuration
  map: {
    projection: 'EPSG:3857',
    extent: [664577, 5753148, 1167741, 6075303], // Switzerland bounds
    constrainExtent: false,
    scales: [
      1000000, 750000, 500000, 250000, 100000, 50000, 25000, 
      10000, 7500, 5000, 2500, 1000, 500, 250, 100
    ],
    defaultFeatureStyle: {
      strokeColor: [0, 0, 255, 1],
      strokeWidth: 2,
      fillColor: [0, 0, 255, 0.2],
      circleRadius: 5
    }
  },

  // Theme configuration
  themes: {
    title: 'root',
    subdirs: [],
    items: [
      {
        id: 'dufour',
        title: 'dufour.app',
        description: 'Main map theme',
        attribution: {
          Title: 'dufour.app',
          OnlineResource: 'https://dufour.app'
        },
        bbox: {
          crs: 'EPSG:3857',
          bounds: [664577, 5753148, 1167741, 6075303]
        },
        initialBbox: {
          crs: 'EPSG:3857',
          bounds: [664577, 5753148, 1167741, 6075303]
        },
        mapCrs: 'EPSG:3857',
        availableCRS: ['EPSG:3857', 'EPSG:4326', 'EPSG:2056'],
        scales: [1000000, 750000, 500000, 250000, 100000, 50000, 25000, 10000, 7500, 5000, 2500, 1000, 500, 250, 100],
        backgroundLayers: [
          {
            name: 'swisstopo_national_map',
            title: 'SwissTopo National Map',
            type: 'wmts',
            url: '/wmts/1.0.0/{Layer}/default/current/3857/{z}/{y}/{x}.jpeg',
            capabilitiesUrl: '/wmts/1.0.0/WMTSCapabilities.xml',
            tileMatrixSet: '3857',
            originX: -20037508.34,
            originY: 20037508.34,
            projection: 'EPSG:3857',
            tileSize: [256, 256],
            resolutions: [
              4000, 3750, 3500, 3250, 3000, 2750, 2500, 2250, 2000, 1750, 1500, 1250, 
              1000, 750, 650, 500, 250, 100, 50, 20, 10, 5, 2.5, 2, 1.5, 1, 0.5
            ],
            visibility: true,
            thumbnail: 'swisstopo_thumbnail.png'
          },
          {
            name: 'swissimage',
            title: 'SwissImage Aerial',
            type: 'wmts',
            url: '/wmts/1.0.0/{Layer}/default/current/3857/{z}/{y}/{x}.jpeg',
            capabilitiesUrl: '/wmts/1.0.0/WMTSCapabilities.xml',
            tileMatrixSet: '3857',
            originX: -20037508.34,
            originY: 20037508.34,
            projection: 'EPSG:3857',
            tileSize: [256, 256],
            resolutions: [
              4000, 3750, 3500, 3250, 3000, 2750, 2500, 2250, 2000, 1750, 1500, 1250, 
              1000, 750, 650, 500, 250, 100, 50, 20, 10, 5, 2.5, 2, 1.5, 1, 0.5
            ],
            visibility: false,
            thumbnail: 'swissimage_thumbnail.png'
          }
        ],
        drawingOrder: ['background', 'layer', 'redlining', 'selection']
      }
    ],
    defaultTheme: 'dufour'
  },

  // Locale configuration
  locale: {
    supportedLocales: ['en-US', 'de-CH', 'fr-FR', 'it-IT'],
    fallbackLocale: 'en-US',
    defaultLocale: 'en-US'
  },

  // Plugin configuration
  plugins: {
    common: [],
    mobile: [],
    desktop: [
      'Map',
      'HomeButton',
      'LocateButton',
      'ZoomIn',
      'ZoomOut',
      'BackgroundSwitcher',
      'TopBar',
      'BottomBar',
      'LayerTree',
      'Identify',
      'MapTip',
      'Share',
      'MapCopyright',
      'Print',
      'ThemeSwitcher',
      'Measure',
      'RedliningSupport',
      'Editing',
      'MapExport',
      'ImportLayer',
      'Search',
      'Settings'
    ],
    // Optional plugins (can be enabled/disabled by users)
    optional: {
      orbat: {
        enabled: true,
        name: 'ORBAT Manager',
        description: 'Military unit organization and battle order management',
        category: 'military',
        icon: '🎖️'
      }
    }
  },

  // Service URLs
  services: {
    qgisServer: import.meta.env.VITE_QGIS_SERVER_URL || '/qgis',
    searchService: '/api3-geo/rest/services/api/SearchServer',
    elevationService: '/api3-geo/rest/services/height',
    featureInfoService: '/qgis'
  },

  // Search providers
  searchProviders: {
    coordinates: {
      enabled: true,
      labelmsgid: 'search.coordinates'
    },
    nominatim: {
      enabled: false
    },
    geoadmin: {
      enabled: true,
      url: '/api3-geo/rest/services/api/SearchServer',
      params: {
        origins: 'address,parcel',
        limit: 20
      }
    }
  },

  // Redlining configuration
  redlining: {
    allowGeometryLabels: true,
    snapping: true,
    snappingActive: false
  },

  // Measurement configuration
  measurement: {
    geodesic: true
  },

  // Print configuration
  print: {
    scaleFactor: 1.0,
    dpis: [96, 150, 300],
    defaultDpi: 300
  },

  // Import/Export
  importExport: {
    allowedFormats: ['geojson', 'kml', 'gpx', 'json'],
    maxFileSize: 10485760 // 10 MB
  },

  // Military Symbol Server (milsymbol-server integration)
  milsymbol: {
    // Server URL for symbol rendering (proxied through Vite/nginx)
    serverUrl: import.meta.env.VITE_SYMBOL_SERVER_URL || '/api/symbols',
    
    // Default SIDC format: 'app6d' (20-char) or '2525c' (15-char)
    defaultFormat: 'app6d',
    
    // Default symbol size in pixels (for map rendering)
    defaultSize: 48,
    
    // Export size (higher quality for print/PDF)
    exportSize: 96,
    
    // Thumbnail size (ORBAT tree, editors)
    thumbnailSize: 32,
    
    // Client-side LRU cache max entries
    cacheMaxSize: 1024,
    
    // Server fetch timeout in milliseconds
    serverTimeout: 5000,
    
    // Rendering strategy: 'hybrid' | 'client-only' | 'server-only'
    //  - hybrid: client for map, server for export (recommended)
    //  - client-only: milsymbol.js only, no server needed
    //  - server-only: all rendering via server API
    renderingStrategy: 'hybrid',
    
    // Custom color mode (KADAS-inspired)
    colorMode: {
      Friend: 'rgb(170, 176, 116)',
      Hostile: 'rgb(255, 50, 50)',
      Neutral: 'rgb(0, 226, 0)',
      Unknown: 'rgb(255, 255, 0)'
    }
  }
};
