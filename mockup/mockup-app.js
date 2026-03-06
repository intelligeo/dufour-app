// dufour.app - Mockup JavaScript
// Pure HTML/JS mockup without build tools

// SVG Icons (from svgrepo.com - monochromatic)
const icons = {
    zoomIn: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/></svg>',
    zoomOut: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M7 9h5v1H7z"/></svg>',
    home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    locate: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>',
    layers: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/></svg>',
    map: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>',
    search: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
    info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
    point: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>',
    line: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    polygon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>',
    circle: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>',
    rectangle: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>',
    text: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4v3h5.5v12h3V7H19V4z"/></svg>',
    marker: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
    ruler: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h2v4h2V8h2v4h2V8h2v4h2V8h2v4h2V8h2v8z"/></svg>',
    area: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>',
    angle: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 20h16v2H4v-2zM4 4h2v14H4V4zm4 0h2v8H8V4zm4 0h2v12h-2V4zm4 0h2v16h-2V4z"/></svg>',
    mountain: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="m14 6-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6z"/></svg>',
    eye: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>',
    upload: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>',
    download: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
    printer: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>',
    settings: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
    help: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>'
};

// State
let currentTab = 'map';
let currentLocale = 'en_US';
let activeTool = null;
let map = null;
let currentProject = 'tactical_ops';
let projects = [
    { name: 'tactical_ops', title: 'Tactical Operations' },
    { name: 'training_area', title: 'Training Area Map' },
    { name: 'surveillance', title: 'Surveillance Zone' }
];

// Translations
const translations = {
    en_US: {
        map: 'Map',
        draw: 'Draw',
        measure: 'Measure',
        analysis: 'Analysis',
        data: 'Data',
        zoomIn: 'Zoom In',
        zoomOut: 'Zoom Out',
        home: 'Home',
        locate: 'My Location',
        layers: 'Layers',
        basemap: 'Base Map',
        search: 'Search',
        info: 'Info',
        point: 'Point',
        line: 'Line',
        polygon: 'Polygon',
        circle: 'Circle',
        rectangle: 'Rectangle',
        text: 'Text',
        marker: 'Marker',
        distance: 'Distance',
        area: 'Area',
        angle: 'Angle',
        terrain: 'Terrain',
        viewshed: 'Viewshed',
        import: 'Import',
        export: 'Export',
        print: 'Print',
        settings: 'Settings'
    },
    de_CH: {
        map: 'Karte',
        draw: 'Zeichnen',
        measure: 'Messen',
        analysis: 'Analyse',
        data: 'Daten',
        zoomIn: 'Vergrössern',
        zoomOut: 'Verkleinern',
        home: 'Start',
        locate: 'Standort',
        layers: 'Ebenen',
        basemap: 'Basiskarte',
        search: 'Suchen',
        info: 'Info',
        point: 'Punkt',
        line: 'Linie',
        polygon: 'Polygon',
        circle: 'Kreis',
        rectangle: 'Rechteck',
        text: 'Text',
        marker: 'Markierung',
        distance: 'Distanz',
        area: 'Fläche',
        angle: 'Winkel',
        terrain: 'Gelände',
        viewshed: 'Sichtfeld',
        import: 'Importieren',
        export: 'Exportieren',
        print: 'Drucken',
        settings: 'Einstellungen'
    },
    fr_FR: {
        map: 'Carte',
        draw: 'Dessiner',
        measure: 'Mesurer',
        analysis: 'Analyse',
        data: 'Données',
        zoomIn: 'Agrandir',
        zoomOut: 'Réduire',
        home: 'Accueil',
        locate: 'Position',
        layers: 'Couches',
        basemap: 'Fond de carte',
        search: 'Rechercher',
        info: 'Info',
        point: 'Point',
        line: 'Ligne',
        polygon: 'Polygone',
        circle: 'Cercle',
        rectangle: 'Rectangle',
        text: 'Texte',
        marker: 'Marqueur',
        distance: 'Distance',
        area: 'Surface',
        angle: 'Angle',
        terrain: 'Terrain',
        viewshed: 'Champ de vision',
        import: 'Importer',
        export: 'Exporter',
        print: 'Imprimer',
        settings: 'Paramètres'
    },
    it_IT: {
        map: 'Mappa',
        draw: 'Disegna',
        measure: 'Misura',
        analysis: 'Analisi',
        data: 'Dati',
        zoomIn: 'Ingrandisci',
        zoomOut: 'Riduci',
        home: 'Home',
        locate: 'Posizione',
        layers: 'Livelli',
        basemap: 'Mappa base',
        search: 'Cerca',
        info: 'Info',
        point: 'Punto',
        line: 'Linea',
        polygon: 'Poligono',
        circle: 'Cerchio',
        rectangle: 'Rettangolo',
        text: 'Testo',
        marker: 'Marcatore',
        distance: 'Distanza',
        area: 'Area',
        angle: 'Angolo',
        terrain: 'Terreno',
        viewshed: 'Campo visivo',
        import: 'Importa',
        export: 'Esporta',
        print: 'Stampa',
        settings: 'Impostazioni'
    }
};

// Get translated text
function t(key) {
    return translations[currentLocale][key] || key;
}

// Ribbon Tabs Content
const ribbonContent = {
    map: [
        {
            label: 'Navigation',
            tools: [
                { id: 'zoom-in', icon: 'zoomIn', label: 'zoomIn', size: 'normal' },
                { id: 'zoom-out', icon: 'zoomOut', label: 'zoomOut', size: 'normal' },
                { id: 'home', icon: 'home', label: 'home', size: 'large' }
            ]
        },
        {
            label: 'Tools',
            tools: [
                { id: 'locate', icon: 'locate', label: 'locate', size: 'normal' },
                { id: 'layers', icon: 'layers', label: 'layers', size: 'large', panel: 'left' },
                { id: 'basemap', icon: 'map', label: 'basemap', size: 'normal', panel: 'left' }
            ]
        },
        {
            label: 'Information',
            tools: [
                { id: 'search', icon: 'search', label: 'search', size: 'large', panel: 'left' },
                { id: 'info', icon: 'info', label: 'info', size: 'normal' }
            ]
        }
    ],
    draw: [
        {
            label: 'Editing',
            tools: [
                { id: 'map-edit', icon: 'polygon', label: 'Map Edit', size: 'large', action: 'openMapEditPanel' },
                { id: 'grid-edit', icon: 'area', label: 'Grid Edit', size: 'large', action: 'switchEditMode:grid' },
                { id: 'chart-edit', icon: 'info', label: 'Chart Edit', size: 'large', action: 'switchEditMode:chart' }
            ]
        },
        {
            label: 'Shapes',
            tools: [
                { id: 'draw-point', icon: 'point', label: 'point', size: 'normal', panel: 'right' },
                { id: 'draw-line', icon: 'line', label: 'line', size: 'normal', panel: 'right' },
                { id: 'draw-polygon', icon: 'polygon', label: 'polygon', size: 'normal', panel: 'right' },
                { id: 'draw-circle', icon: 'circle', label: 'circle', size: 'normal', panel: 'right' },
                { id: 'draw-rectangle', icon: 'rectangle', label: 'rectangle', size: 'normal', panel: 'right' }
            ]
        },
        {
            label: 'Annotations',
            tools: [
                { id: 'draw-text', icon: 'text', label: 'text', size: 'normal', panel: 'right' },
                { id: 'draw-marker', icon: 'marker', label: 'marker', size: 'large', panel: 'right' }
            ]
        }
    ],
    measure: [
        {
            label: 'Measurements',
            tools: [
                { id: 'measure-distance', icon: 'ruler', label: 'distance', size: 'large', panel: 'right' },
                { id: 'measure-area', icon: 'area', label: 'area', size: 'large', panel: 'right' },
                { id: 'measure-angle', icon: 'angle', label: 'angle', size: 'normal', panel: 'right' }
            ]
        }
    ],
    analysis: [
        {
            label: 'Terrain',
            tools: [
                { id: 'terrain-slope', icon: 'mountain', label: 'terrain', size: 'large', panel: 'right' },
                { id: 'terrain-viewshed', icon: 'eye', label: 'viewshed', size: 'large', panel: 'right' }
            ]
        }
    ],
    data: [
        {
            label: 'File Operations',
            tools: [
                { id: 'import', icon: 'upload', label: 'import', size: 'large', panel: 'right' },
                { id: 'export', icon: 'download', label: 'export', size: 'large', panel: 'right' }
            ]
        },
        {
            label: 'Output',
            tools: [
                { id: 'print', icon: 'printer', label: 'print', size: 'large', panel: 'right' }
            ]
        }
    ]
};

// Panel Content Templates
const panelTemplates = {
    layers: {
        title: 'Layer Manager',
        content: `
            <div class="panel-section">
                <h4>Base Maps</h4>
                <div class="layer-item active">
                    <input type="radio" name="basemap" id="basemap-color" checked>
                    <label for="basemap-color">SwissTopo Color</label>
                </div>
                <div class="layer-item">
                    <input type="radio" name="basemap" id="basemap-grey">
                    <label for="basemap-grey">SwissTopo Grey</label>
                </div>
                <div class="layer-item">
                    <input type="radio" name="basemap" id="basemap-aerial">
                    <label for="basemap-aerial">SwissImage Aerial</label>
                </div>
                <div class="layer-item">
                    <input type="radio" name="basemap" id="basemap-osm">
                    <label for="basemap-osm">OpenStreetMap</label>
                </div>
            </div>
            <div class="panel-section">
                <h4>Overlays</h4>
                <div class="layer-item">
                    <input type="checkbox" id="layer-boundaries">
                    <label for="layer-boundaries">Administrative Boundaries</label>
                </div>
                <div class="layer-item">
                    <input type="checkbox" id="layer-terrain">
                    <label for="layer-terrain">Terrain Contours</label>
                </div>
                <div class="layer-item">
                    <input type="checkbox" id="layer-military">
                    <label for="layer-military">Military Symbols (ORBAT)</label>
                </div>
            </div>
        `
    },
    basemap: {
        title: 'Base Map Selection',
        content: `
            <div class="panel-section">
                <h4>Available Base Maps</h4>
                <div class="layer-item active" onclick="changeBasemap('ch.swisstopo.pixelkarte-farbe', this)">
                    <img src="https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/8/134/181.jpeg" class="basemap-thumb">
                    <label>SwissTopo Color (Current)</label>
                </div>
                <div class="layer-item" onclick="changeBasemap('ch.swisstopo.pixelkarte-grau', this)">
                    <img src="https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/8/134/181.jpeg" class="basemap-thumb">
                    <label>SwissTopo Grey</label>
                </div>
                <div class="layer-item" onclick="changeBasemap('ch.swisstopo.swissimage', this)">
                    <img src="https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/8/134/181.jpeg" class="basemap-thumb">
                    <label>SwissImage 10cm Aerial</label>
                </div>
                <div class="layer-item" onclick="changeBasemap('ch.swisstopo.pixelkarte-farbe-winter', this)">
                    <img src="https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe-winter/default/current/3857/8/134/181.jpeg" class="basemap-thumb">
                    <label>SwissTopo Winter</label>
                </div>
            </div>
            <style>
                .basemap-thumb {
                    width: 60px;
                    height: 60px;
                    border-radius: 4px;
                    margin-right: 10px;
                    border: 2px solid #dee2e6;
                }
                .layer-item {
                    display: flex;
                    align-items: center;
                    padding: 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    margin-bottom: 8px;
                    border: 2px solid transparent;
                }
                .layer-item:hover {
                    background-color: #f8f9fa;
                }
                .layer-item.active {
                    background-color: #e7f1ff;
                    border-color: var(--secondary-color);
                }
                .layer-item label {
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                }
            </style>
            <script>
                function changeBasemap(layerId, element) {
                    // Update active state
                    document.querySelectorAll('.layer-item').forEach(item => item.classList.remove('active'));
                    element.classList.add('active');
                    
                    // Change map base layer
                    const baseLayer = map.getLayers().item(0);
                    const newSource = new ol.source.XYZ({
                        url: 'https://wmts.geo.admin.ch/1.0.0/' + layerId + '/default/current/3857/{z}/{x}/{y}.jpeg',
                        attributions: '© swisstopo',
                        maxZoom: 19
                    });
                    baseLayer.setSource(newSource);
                    
                    console.log('Changed basemap to:', layerId);
                }
            </script>
        `
    },
    search: {
        title: 'Location Search',
        content: `
            <div class="panel-section">
                <input type="text" id="search-input" class="search-input" placeholder="Search places, addresses, coordinates...">
                <div id="search-results" class="search-results-container"></div>
                <div id="search-help" class="search-help">
                    <small>Try: Bern, Bahnhofstrasse Zürich, 2600000 1200000</small>
                </div>
            </div>
            <div class="panel-section">
                <h4>Recent Searches</h4>
                <div id="recent-searches" class="recent-searches-list"></div>
            </div>
            <script>
                // Search functionality
                const searchInput = document.getElementById('search-input');
                const searchResults = document.getElementById('search-results');
                let searchTimeout;
                
                searchInput.addEventListener('input', (e) => {
                    clearTimeout(searchTimeout);
                    const query = e.target.value.trim();
                    
                    if (query.length < 2) {
                        searchResults.innerHTML = '';
                        return;
                    }
                    
                    searchTimeout = setTimeout(() => performSearch(query), 300);
                });
                
                async function performSearch(query) {
                    searchResults.innerHTML = '<div class="search-loading">Searching...</div>';
                    
                    try {
                        const url = 'https://api3.geo.admin.ch/rest/services/api/SearchServer?' + 
                            new URLSearchParams({
                                searchText: query,
                                type: 'locations',
                                origins: 'address,gazetteer,parcel',
                                limit: '5',
                                sr: '2056'
                            });
                        
                        const response = await fetch(url);
                        const data = await response.json();
                        
                        if (data.results && data.results.length > 0) {
                            displayResults(data.results);
                        } else {
                            searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
                        }
                    } catch (error) {
                        console.error('Search error:', error);
                        searchResults.innerHTML = '<div class="search-error">Search failed. Please try again.</div>';
                    }
                }
                
                function displayResults(results) {
                    searchResults.innerHTML = results.map(result => {
                        const label = result.attrs?.label || 'Unknown';
                        const detail = result.attrs?.detail || '';
                        return '<div class="search-result-item" onclick="zoomToResult(' + 
                            result.attrs.x + ',' + result.attrs.y + ',\\"' + label + '\\")">' +
                            '<strong>' + label + '</strong><br>' +
                            '<small>' + detail + '</small></div>';
                    }).join('');
                }
                
                function zoomToResult(x, y, label) {
                    // Transform from LV95 to Web Mercator
                    const coords = ol.proj.transform([x, y], 'EPSG:2056', 'EPSG:3857');
                    map.getView().animate({
                        center: coords,
                        zoom: 16,
                        duration: 500
                    });
                    
                    // Save to recent
                    const recent = JSON.parse(localStorage.getItem('mockup_recent_searches') || '[]');
                    recent.unshift({label, date: new Date().toLocaleDateString()});
                    localStorage.setItem('mockup_recent_searches', JSON.stringify(recent.slice(0, 5)));
                    
                    // Clear search
                    document.getElementById('search-input').value = '';
                    searchResults.innerHTML = '';
                    
                    alert('Zoomed to: ' + label);
                }
                
                // Load recent searches
                function loadRecentSearches() {
                    const recent = JSON.parse(localStorage.getItem('mockup_recent_searches') || '[]');
                    const container = document.getElementById('recent-searches');
                    if (recent.length > 0) {
                        container.innerHTML = recent.map(item => 
                            '<div class="recent-item">' + item.label + '</div>'
                        ).join('');
                    } else {
                        container.innerHTML = '<small style="color:#999">No recent searches</small>';
                    }
                }
                
                loadRecentSearches();
            </script>
        `
    },
    'draw-point': { title: 'Draw Point', content: '<p>Click on the map to place a point.</p><div class="panel-section"><h4>Style Options</h4><p>Color: <input type="color" value="#e74c3c"></p><p>Size: <input type="range" min="5" max="30" value="10"></p></div>' },
    'draw-line': { title: 'Draw Line', content: '<p>Click on the map to draw a line. Double-click to finish.</p><div class="panel-section"><h4>Style Options</h4><p>Color: <input type="color" value="#3498db"></p><p>Width: <input type="range" min="1" max="10" value="2"></p></div>' },
    'draw-polygon': { title: 'Draw Polygon', content: '<p>Click on the map to draw a polygon. Double-click to finish.</p><div class="panel-section"><h4>Style Options</h4><p>Fill Color: <input type="color" value="#27ae60"></p><p>Border Color: <input type="color" value="#2c3e50"></p></div>' },
    'draw-circle': { title: 'Draw Circle', content: '<p>Click and drag on the map to draw a circle.</p>' },
    'draw-rectangle': { title: 'Draw Rectangle', content: '<p>Click and drag on the map to draw a rectangle.</p>' },
    'draw-text': { title: 'Add Text', content: '<p>Click on the map to place text.</p><div class="panel-section"><input type="text" class="search-input" placeholder="Enter text..."><p>Font Size: <input type="range" min="10" max="40" value="14"></p></div>' },
    'draw-marker': { title: 'Place Marker', content: '<p>Click on the map to place a marker.</p><div class="panel-section"><h4>Marker Types</h4><div class="layer-item"><input type="radio" name="marker" checked><label>📍 Pin</label></div><div class="layer-item"><input type="radio" name="marker"><label>⚠️ Warning</label></div><div class="layer-item"><input type="radio" name="marker"><label>🚩 Flag</label></div></div>' },
    'measure-distance': { title: 'Measure Distance', content: '<p>Click points on the map to measure distance.</p><div class="panel-section"><h4>Results</h4><p><strong>Distance:</strong> <span id="measure-result">0 m</span></p><button class="btn">Clear Measurement</button></div>' },
    'measure-area': { title: 'Measure Area', content: '<p>Click points on the map to measure area.</p><div class="panel-section"><h4>Results</h4><p><strong>Area:</strong> <span id="measure-result">0 m²</span></p><button class="btn">Clear Measurement</button></div>' },
    'measure-angle': { title: 'Measure Angle', content: '<p>Click three points to measure angle.</p>' },
    'terrain-slope': { title: 'Terrain Analysis', content: '<div class="panel-section"><h4>Slope Analysis</h4><button class="btn">Calculate Slope</button></div><div class="panel-section"><h4>Elevation Profile</h4><button class="btn">Draw Profile Line</button></div>' },
    'terrain-viewshed': { title: 'Viewshed Analysis', content: '<p>Click on the map to calculate viewshed.</p><div class="panel-section"><h4>Parameters</h4><p>Observer Height: <input type="number" value="1.7"> m</p><p>Radius: <input type="number" value="5000"> m</p><button class="btn">Calculate Viewshed</button></div>' },
    import: { 
        title: 'Import Data', 
        content: `
            <div class="panel-section">
                <h4>Upload File</h4>
                <p><input type="file" id="file-input" accept=".gpx,.kml,.geojson,.json"></p>
                <button class="btn" onclick="handleFileImport()">Import File</button>
                <div id="import-status" style="margin-top: 10px; font-size: 12px;"></div>
            </div>
            <div class="panel-section">
                <h4>Add WMS Layer</h4>
                <input type="text" id="wms-url" class="search-input" placeholder="WMS URL...">
                <button class="btn" onclick="addWMSLayer()">Add Layer</button>
            </div>
            <script>
                async function handleFileImport() {
                    const input = document.getElementById('file-input');
                    const status = document.getElementById('import-status');
                    const file = input.files[0];
                    
                    if (!file) {
                        status.innerHTML = '<span style="color:#e74c3c">Please select a file</span>';
                        return;
                    }
                    
                    status.innerHTML = '<span style="color:#3498db">Importing...</span>';
                    
                    try {
                        const text = await file.text();
                        const ext = file.name.split('.').pop().toLowerCase();
                        let format;
                        
                        if (ext === 'geojson' || ext === 'json') {
                            format = new ol.format.GeoJSON();
                        } else if (ext === 'gpx') {
                            format = new ol.format.GPX();
                        } else if (ext === 'kml') {
                            format = new ol.format.KML();
                        } else {
                            throw new Error('Unsupported format');
                        }
                        
                        const features = format.readFeatures(text, {
                            dataProjection: 'EPSG:4326',
                            featureProjection: 'EPSG:3857'
                        });
                        
                        // Create vector layer
                        const vectorSource = new ol.source.Vector({ features });
                        const vectorLayer = new ol.layer.Vector({
                            source: vectorSource,
                            style: new ol.style.Style({
                                stroke: new ol.style.Stroke({ color: '#e74c3c', width: 2 }),
                                fill: new ol.style.Fill({ color: 'rgba(231,76,60,0.1)' }),
                                image: new ol.style.Circle({
                                    radius: 6,
                                    fill: new ol.style.Fill({ color: '#e74c3c' })
                                })
                            })
                        });
                        
                        map.addLayer(vectorLayer);
                        
                        // Zoom to extent
                        if (features.length > 0) {
                            const extent = vectorSource.getExtent();
                            map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 500 });
                        }
                        
                        status.innerHTML = '<span style="color:#27ae60">✓ Imported ' + features.length + ' features</span>';
                    } catch (error) {
                        console.error('Import error:', error);
                        status.innerHTML = '<span style="color:#e74c3c">Import failed: ' + error.message + '</span>';
                    }
                }
                
                function addWMSLayer() {
                    const url = document.getElementById('wms-url').value.trim();
                    if (!url) {
                        alert('Please enter a WMS URL');
                        return;
                    }
                    alert('WMS layer support coming soon!\\nURL: ' + url);
                }
            </script>
        ` 
    },
    export: { 
        title: 'Export Data', 
        content: `
            <div class="panel-section">
                <h4>Export Current View</h4>
                <button class="btn" onclick="exportData('kml')">Export as KML</button>
                <button class="btn" style="margin-top:8px" onclick="exportData('geojson')">Export as GeoJSON</button>
                <button class="btn" style="margin-top:8px" onclick="exportData('gpx')">Export as GPX</button>
            </div>
            <script>
                function exportData(format) {
                    // Collect all vector layers
                    const layers = [];
                    map.getLayers().forEach(layer => {
                        if (layer instanceof ol.layer.Vector) {
                            layers.push(layer);
                        }
                    });
                    
                    if (layers.length === 0) {
                        alert('No data to export. Import some data first!');
                        return;
                    }
                    
                    // Collect all features
                    const allFeatures = [];
                    layers.forEach(layer => {
                        const features = layer.getSource().getFeatures();
                        allFeatures.push(...features);
                    });
                    
                    if (allFeatures.length === 0) {
                        alert('No features to export');
                        return;
                    }
                    
                    // Export based on format
                    let content, mimeType, extension;
                    
                    if (format === 'kml') {
                        const kmlFormat = new ol.format.KML();
                        content = kmlFormat.writeFeatures(allFeatures, {
                            featureProjection: 'EPSG:3857',
                            dataProjection: 'EPSG:4326'
                        });
                        mimeType = 'application/vnd.google-earth.kml+xml';
                        extension = 'kml';
                    } else if (format === 'geojson') {
                        const geojsonFormat = new ol.format.GeoJSON();
                        content = geojsonFormat.writeFeatures(allFeatures, {
                            featureProjection: 'EPSG:3857',
                            dataProjection: 'EPSG:4326'
                        });
                        mimeType = 'application/json';
                        extension = 'geojson';
                    } else if (format === 'gpx') {
                        const gpxFormat = new ol.format.GPX();
                        content = gpxFormat.writeFeatures(allFeatures, {
                            featureProjection: 'EPSG:3857',
                            dataProjection: 'EPSG:4326'
                        });
                        mimeType = 'application/gpx+xml';
                        extension = 'gpx';
                    }
                    
                    // Download file
                    const blob = new Blob([content], { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'dufour_export_' + new Date().toISOString().split('T')[0] + '.' + extension;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }
            </script>
        ` 
    },
    print: { title: 'Print Map', content: '<div class="panel-section"><h4>Layout</h4><select class="search-input"><option>A4 Portrait</option><option>A4 Landscape</option><option>A3 Portrait</option><option>A3 Landscape</option></select></div><div class="panel-section"><h4>Options</h4><p><input type="checkbox" id="print-legend"> <label for="print-legend">Include Legend</label></p><p><input type="checkbox" id="print-scale"> <label for="print-scale">Include Scale Bar</label></p><button class="btn">Generate PDF</button></div>' },
    settings: {
        title: 'Settings',
        content: `
            <div class="panel-section">
                <h4>Language / Langue / Lingua / Sprache</h4>
                <div class="language-option ${currentLocale === 'en_US' ? 'active' : ''}" onclick="changeLanguage('en_US')">
                    <svg width="20" height="20" viewBox="0 0 32 32" style="margin-right: 8px;"><rect width="32" height="32" fill="#012169"/><path d="M0 0 L32 21.33 M32 0 L0 21.33 M0 32 L32 10.67 M32 32 L0 10.67" stroke="#fff" stroke-width="4"/><path d="M16 0 L16 32 M0 16 L32 16" stroke="#fff" stroke-width="5.33"/><path d="M16 0 L16 32 M0 16 L32 16" stroke="#C8102E" stroke-width="3.2"/></svg>
                    English (US)
                </div>
                <div class="language-option ${currentLocale === 'de_CH' ? 'active' : ''}" onclick="changeLanguage('de_CH')">
                    <svg width="20" height="20" viewBox="0 0 32 32" style="margin-right: 8px;"><rect width="32" height="32" fill="#D52B1E"/><rect x="12" y="6" width="8" height="20" fill="#fff"/><rect x="6" y="12" width="20" height="8" fill="#fff"/></svg>
                    Deutsch (CH)
                </div>
                <div class="language-option ${currentLocale === 'fr_FR' ? 'active' : ''}" onclick="changeLanguage('fr_FR')">
                    <svg width="20" height="20" viewBox="0 0 32 32" style="margin-right: 8px;"><rect width="10.67" height="32" fill="#002395"/><rect x="10.67" width="10.67" height="32" fill="#fff"/><rect x="21.33" width="10.67" height="32" fill="#ED2939"/></svg>
                    Français (FR)
                </div>
                <div class="language-option ${currentLocale === 'it_IT' ? 'active' : ''}" onclick="changeLanguage('it_IT')">
                    <svg width="20" height="20" viewBox="0 0 32 32" style="margin-right: 8px;"><rect width="10.67" height="32" fill="#009246"/><rect x="10.67" width="10.67" height="32" fill="#fff"/><rect x="21.33" width="10.67" height="32" fill="#CE2B37"/></svg>
                    Italiano (IT)
                </div>
            </div>
            <div class="panel-section">
                <h4>About dufour.app</h4>
                <p style="font-size: 12px; line-height: 1.6;">
                    <strong>dufour.app</strong> is a lightweight geospatial web application inspired by KADAS Albireo 2.3.<br><br>
                    Built with OpenLayers, QGIS Server, and PostgreSQL/PostGIS.<br><br>
                    © 2026 - Open Source (GPL-2.0)
                </p>
            </div>
        `
    }
};

// Switch Ribbon Tab
function switchTab(tabId) {
    currentTab = tabId;
    
    // Update active tab
    document.querySelectorAll('.ribbon-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Close mobile menu if open (for small screens)
    if (window.innerWidth <= 768) {
        closeMobileMenu();
    }
    
    // Render ribbon content
    renderRibbonContent(tabId);
}

// Render Ribbon Content
function renderRibbonContent(tabId) {
    const container = document.getElementById('ribbon-content');
    const groups = ribbonContent[tabId];
    
    let html = '';
    groups.forEach(group => {
        html += `
            <div class="ribbon-group">
                <div class="ribbon-group-tools">
                    ${group.tools.map(tool => {
                        const action = tool.action ? `onclick="${handleToolAction('${tool.action}')}"` : `onclick="selectTool('${tool.id}', '${tool.panel || 'none'}')"`;
                        return `
                            <div class="ribbon-tool ${tool.size}" ${action}>
                                <div class="ribbon-tool-icon">${icons[tool.icon]}</div>
                                <div class="ribbon-tool-label">${t(tool.label)}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="ribbon-group-label">${group.label}</div>
            </div>
        `;
    });
    
    // Add Edit Mode Switcher at the end
    html += `
        <div class="ribbon-group ribbon-mode-switcher-group">
            <div class="ribbon-group-tools edit-mode-switcher">
                <button class="mode-btn ${currentEditMode === 'map' ? 'active' : ''}" onclick="switchEditMode('map')" title="Map Edit Mode">
                    <div class="ribbon-tool-icon">🗺️</div>
                    <div class="ribbon-tool-label">Mappa</div>
                </button>
                <button class="mode-btn ${currentEditMode === 'grid' ? 'active' : ''}" onclick="switchEditMode('grid')" title="Grid Edit Mode">
                    <div class="ribbon-tool-icon">📋</div>
                    <div class="ribbon-tool-label">Griglia</div>
                </button>
                <button class="mode-btn ${currentEditMode === 'chart' ? 'active' : ''}" onclick="switchEditMode('chart')" title="Chart Edit Mode">
                    <div class="ribbon-tool-icon">📊</div>
                    <div class="ribbon-tool-label">Organigramma</div>
                </button>
            </div>
            <div class="ribbon-group-label">Edit Mode</div>
        </div>
    `;
    
    container.innerHTML = html;
}

// Handle tool actions (for custom actions like opening panels or switching modes)
function handleToolAction(action) {
    if (action === 'openMapEditPanel') {
        return 'openMapEditPanel()';
    } else if (action.startsWith('switchEditMode:')) {
        const mode = action.split(':')[1];
        return `switchEditMode('${mode}')`;
    }
    return '';
}

// Select Tool
function selectTool(toolId, panelSide) {
    activeTool = toolId;
    
    // Update active tool visual state
    document.querySelectorAll('.ribbon-tool').forEach(tool => {
        tool.classList.remove('active');
    });
    if (event && event.target) {
        const toolEl = event.target.closest('.ribbon-tool');
        if (toolEl) toolEl.classList.add('active');
    }
    
    // Close mobile menu if open (for small screens)
    if (window.innerWidth <= 768) {
        closeMobileMenu();
    }
    
    // Open panel if needed
    if (panelSide !== 'none') {
        openPanel(panelSide, toolId);
    }
    
    // Simulate tool activation
    console.log('Tool activated:', toolId);
}

// Open Panel
function openPanel(side, contentType) {
    const panel = document.getElementById(`${side}-panel`);
    const titleEl = document.getElementById(`${side}-panel-title`);
    const contentEl = document.getElementById(`${side}-panel-content`);
    
    const template = panelTemplates[contentType];
    if (template) {
        titleEl.textContent = template.title;
        contentEl.innerHTML = template.content;
        panel.classList.remove('hidden');
    }
}

// Close Panel
function closePanel(side) {
    const panel = document.getElementById(`${side}-panel`);
    panel.classList.add('hidden');
    
    // Deactivate tool
    document.querySelectorAll('.ribbon-tool').forEach(tool => {
        tool.classList.remove('active');
    });
}

// Change Language
function changeLanguage(locale) {
    currentLocale = locale;
    renderRibbonContent(currentTab);
    
    // Update ribbon tabs
    document.querySelectorAll('.ribbon-tab').forEach((tab, idx) => {
        const keys = ['map', 'draw', 'measure', 'analysis', 'data'];
        tab.textContent = t(keys[idx]);
    });
    
    // Refresh settings panel if open
    const rightPanel = document.getElementById('right-panel');
    if (!rightPanel.classList.contains('hidden') && document.getElementById('right-panel-title').textContent === 'Settings') {
        openPanel('right', 'settings');
    }
}

// Initialize Map
function initMap() {
    // Swiss bounds
    const swissExtent = [5.96, 45.82, 10.49, 47.81];
    const swissCenter = ol.proj.fromLonLat([8.23, 46.80]);
    
    // SwissTopo WMTS Layer
    const swisstopoLayer = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
            attributions: '© swisstopo',
            maxZoom: 19
        })
    });
    
    // Create map
    map = new ol.Map({
        target: 'map',
        layers: [swisstopoLayer],
        view: new ol.View({
            center: swissCenter,
            zoom: 8,
            minZoom: 7,
            maxZoom: 19
        })
    });
    
    // Update status bar on map move
    map.on('moveend', updateStatusBar);
    map.on('pointermove', function(evt) {
        const coords = ol.proj.toLonLat(evt.coordinate);
        document.getElementById('coordinates').textContent = 
            `${coords[1].toFixed(5)}°N, ${coords[0].toFixed(5)}°E`;
    });
    
    updateStatusBar();
}

// Update Status Bar
function updateStatusBar() {
    const view = map.getView();
    const zoom = view.getZoom();
    const resolution = view.getResolution();
    const scale = resolution * 96 / 0.0254; // Approximate scale
    
    document.getElementById('zoom').textContent = Math.round(zoom);
    document.getElementById('scale').textContent = `1:${Math.round(scale).toLocaleString()}`;
}

// Initialize on load
window.onload = function() {
    // Hide splash screen after 2 seconds
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        splash.classList.add('fade-out');
        setTimeout(() => {
            splash.style.display = 'none';
        }, 500);
    }, 2000);
    
    initMap();
    renderRibbonContent('map');
    initMobileMenu();
    initProjectSelector();
    
    console.log('🗺️ dufour.app mockup loaded successfully!');
    console.log('Switch tabs to see different tools');
    console.log('Click tools to open side panels');
    console.log('💡 ProjectSelector: Select different projects in the status bar');
};

// ============================================================================
// MOBILE MENU
// ============================================================================

function initMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const ribbon = document.getElementById('ribbon-toolbar');
    const mapContainer = document.getElementById('map');
    
    if (!menuBtn || !ribbon) return;
    
    // Toggle menu on button click
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileMenu();
    });
    
    // Close menu when clicking on map
    if (mapContainer) {
        mapContainer.addEventListener('click', () => {
            closeMobileMenu();
        });
    }
    
    // Close menu when clicking on a ribbon tool
    const ribbonTools = document.querySelectorAll('.ribbon-tool');
    ribbonTools.forEach(tool => {
        tool.addEventListener('click', () => {
            // Delay to allow panel to open
            setTimeout(() => {
                if (window.innerWidth <= 768) {
                    closeMobileMenu();
                }
            }, 100);
        });
    });
    
    // Handle window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (window.innerWidth > 768) {
                closeMobileMenu();
            }
        }, 250);
    });
    
    // Touch gesture: swipe left to close
    let touchStartX = 0;
    let touchEndX = 0;
    
    ribbon.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    ribbon.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });
    
    function handleSwipe() {
        const swipeDistance = touchStartX - touchEndX;
        const minSwipeDistance = 50;
        
        // Swipe left to close
        if (swipeDistance > minSwipeDistance) {
            closeMobileMenu();
        }
    }
}

function toggleMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const ribbon = document.getElementById('ribbon-toolbar');
    
    if (!menuBtn || !ribbon) return;
    
    const isOpen = ribbon.classList.contains('mobile-open');
    
    if (isOpen) {
        closeMobileMenu();
    } else {
        openMobileMenu();
    }
}

function openMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const ribbon = document.getElementById('ribbon-toolbar');
    
    if (!menuBtn || !ribbon) return;
    
    ribbon.classList.add('mobile-open');
    menuBtn.classList.add('active');
    
    // Add overlay to close menu when clicking outside
    let overlay = document.getElementById('mobile-menu-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'mobile-menu-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1040;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(overlay);
        
        // Trigger animation
        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 10);
        
        overlay.addEventListener('click', closeMobileMenu);
    }
}

function closeMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const ribbon = document.getElementById('ribbon-toolbar');
    const overlay = document.getElementById('mobile-menu-overlay');
    
    if (ribbon) {
        ribbon.classList.remove('mobile-open');
    }
    
    if (menuBtn) {
        menuBtn.classList.remove('active');
    }
    
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
}

// Close side panels on mobile with swipe or click
function initMobilePanelGestures() {
    const panels = document.querySelectorAll('.side-panel');
    
    panels.forEach(panel => {
        // Touch gestures for swiping down to close
        let touchStartY = 0;
        let touchEndY = 0;
        
        const header = panel.querySelector('.side-panel-header');
        if (header) {
            header.addEventListener('touchstart', (e) => {
                touchStartY = e.changedTouches[0].screenY;
            }, { passive: true });
            
            header.addEventListener('touchend', (e) => {
                touchEndY = e.changedTouches[0].screenY;
                const swipeDistance = touchEndY - touchStartY;
                
                // Swipe down to close (min 100px)
                if (swipeDistance > 100 && window.innerWidth <= 768) {
                    const closeBtn = panel.querySelector('.side-panel-close');
                    if (closeBtn) closeBtn.click();
                }
            }, { passive: true });
        }
    });
}

// Call after panels are created
setTimeout(initMobilePanelGestures, 1000);

// ============================================
// EDIT MODE MANAGEMENT
// ============================================

let currentEditMode = 'map'; // 'map', 'grid', 'chart'
let currentZoomLevel = 100;
let selectedChartNode = null;

function switchEditMode(mode) {
    currentEditMode = mode;
    
    // Update button states in edit-mode-switcher
    document.querySelectorAll('.edit-mode-switcher .mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find and activate the correct button
    document.querySelectorAll('.edit-mode-switcher .mode-btn').forEach(btn => {
        const label = btn.querySelector('.ribbon-tool-label')?.textContent.toLowerCase();
        if ((mode === 'map' && label === 'mappa') ||
            (mode === 'grid' && label === 'griglia') ||
            (mode === 'chart' && label === 'organigramma')) {
            btn.classList.add('active');
        }
    });
    
    // Show/hide appropriate views
    const mapView = document.getElementById('map-view');
    const gridView = document.getElementById('grid-view');
    const chartView = document.getElementById('chart-view');
    
    mapView.classList.toggle('hidden', mode !== 'map');
    gridView.classList.toggle('hidden', mode !== 'grid');
    chartView.classList.toggle('hidden', mode !== 'chart');
    
    // Close all panels when switching modes
    closePanel('left');
    closePanel('right');
    
    // Log mode change
    console.log(`Switched to ${mode} edit mode`);
}

// ============================================
// MAP EDIT PANEL
// ============================================

let activeDrawTool = null;
let snapEnabled = false;

function openMapEditPanel() {
    const panel = document.getElementById('map-edit-panel');
    if (panel) {
        panel.classList.remove('hidden');
        console.log('Map Edit Panel opened');
    }
}

function closeMapEditPanel() {
    const panel = document.getElementById('map-edit-panel');
    if (panel) {
        panel.classList.add('hidden');
        // Deactivate all tools
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        activeDrawTool = null;
        console.log('Map Edit Panel closed');
    }
}

function selectDrawTool(tool) {
    // Deactivate previous tool
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Activate new tool
    event.currentTarget.classList.add('active');
    activeDrawTool = tool;
    
    console.log(`Selected draw tool: ${tool}`);
    
    // In a real implementation, this would activate OpenLayers interactions
    if (tool === 'point') {
        console.log('🎯 Draw point mode activated');
    } else if (tool === 'line') {
        console.log('📏 Draw line mode activated');
    } else if (tool === 'polygon') {
        console.log('⬟ Draw polygon mode activated');
    } else if (tool === 'circle') {
        console.log('⭕ Draw circle mode activated');
    } else if (tool === 'rectangle') {
        console.log('▭ Draw rectangle mode activated');
    } else if (tool === 'select') {
        console.log('👆 Select mode activated');
    } else if (tool === 'modify') {
        console.log('✏️ Modify mode activated');
    } else if (tool === 'move') {
        console.log('↔️ Move mode activated');
    } else if (tool === 'rotate') {
        console.log('↻ Rotate mode activated');
    } else if (tool === 'delete') {
        console.log('🗑️ Delete mode activated');
    }
}

function toggleSnap(enabled) {
    snapEnabled = enabled;
    console.log(`Snap to grid: ${enabled ? 'enabled' : 'disabled'}`);
}

// ============================================
// GRID EDIT PANEL
// ============================================

function filterGridUnits(searchTerm) {
    const rows = document.querySelectorAll('#grid-table-body tr');
    const term = searchTerm.toLowerCase();
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
    
    console.log(`Filtering units by: ${searchTerm}`);
}

function toggleSelectAll(checked) {
    const checkboxes = document.querySelectorAll('.row-select');
    checkboxes.forEach(cb => {
        cb.checked = checked;
        cb.closest('tr').classList.toggle('selected', checked);
    });
    console.log(`Select all: ${checked}`);
}

function addGridUnit() {
    const tbody = document.getElementById('grid-table-body');
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
        <td><input type="checkbox" class="row-select"></td>
        <td>🪖</td>
        <td contenteditable="true">Nuova Unità</td>
        <td contenteditable="true">Battalion</td>
        <td contenteditable="true">Friend</td>
        <td contenteditable="true">1000</td>
        <td contenteditable="true">---</td>
        <td contenteditable="true">---</td>
    `;
    tbody.appendChild(newRow);
    console.log('Added new unit row');
}

function deleteSelectedUnits() {
    const checkboxes = document.querySelectorAll('.row-select:checked');
    if (checkboxes.length === 0) {
        alert('Nessuna unità selezionata');
        return;
    }
    
    if (confirm(`Eliminare ${checkboxes.length} unità selezionate?`)) {
        checkboxes.forEach(cb => {
            cb.closest('tr').remove();
        });
        console.log(`Deleted ${checkboxes.length} units`);
    }
}

// ============================================
// CHART EDIT PANEL
// ============================================

const chartSettings = {
    showStrength: true,
    showEquipment: false,
    compactMode: false,
    colorByAffiliation: true
};

function zoomChart(direction) {
    if (direction === 'in' && currentZoomLevel < 200) {
        currentZoomLevel += 10;
    } else if (direction === 'out' && currentZoomLevel > 50) {
        currentZoomLevel -= 10;
    }
    
    document.getElementById('zoom-level').textContent = `${currentZoomLevel}%`;
    
    const canvas = document.getElementById('chart-canvas');
    canvas.style.transform = `scale(${currentZoomLevel / 100})`;
    canvas.style.transformOrigin = 'top left';
    
    console.log(`Chart zoom: ${currentZoomLevel}%`);
}

function toggleChartSetting(setting, enabled) {
    chartSettings[setting] = enabled;
    console.log(`Chart setting ${setting}: ${enabled ? 'enabled' : 'disabled'}`);
    
    // In real implementation, would re-render chart with new settings
    if (setting === 'strength') {
        console.log('Toggle unit strength visibility');
    } else if (setting === 'equipment') {
        console.log('Toggle equipment visibility');
    } else if (setting === 'compact') {
        console.log('Toggle compact mode');
    } else if (setting === 'colors') {
        console.log('Toggle affiliation colors');
    }
}

function exportChart(format) {
    console.log(`Exporting chart as ${format.toUpperCase()}`);
    
    if (format === 'svg') {
        alert('📄 SVG export coming soon!\n\nIn real implementation, would export org chart as SVG file.');
    } else if (format === 'png') {
        alert('🖼️ PNG export coming soon!\n\nIn real implementation, would export org chart as PNG image.');
    }
}

// Add click handlers to chart nodes
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const chartNodes = document.querySelectorAll('.chart-node');
        chartNodes.forEach(node => {
            node.addEventListener('click', function() {
                // Deselect all
                chartNodes.forEach(n => n.classList.remove('selected'));
                // Select clicked
                this.classList.add('selected');
                console.log('Selected chart node:', this.querySelector('.chart-node-header').textContent);
            });
        });
    }, 500);
});

// ============================================
// AUTO-CLOSE PANELS ON MOBILE
// ============================================

// Close panels automatically on mobile when user takes action
function handleMobileAction() {
    if (window.innerWidth <= 768) {
        closePanel('left');
        closePanel('right');
        console.log('Auto-closed panels on mobile action');
    }
}

// Add to existing tool selection handlers
const originalSelectTool = window.selectTool;
window.selectTool = function(tool) {
    if (originalSelectTool) originalSelectTool(tool);
    handleMobileAction();
    
    // Open map edit panel for draw/edit tools
    if (['draw', 'edit-geometry'].includes(tool)) {
        openMapEditPanel();
    }
};

// Keyboard shortcuts for edit modes
document.addEventListener('keydown', (e) => {
    // Only if no input is focused
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
    }
    
    if (e.key === 'm' || e.key === 'M') {
        switchEditMode('map');
    } else if (e.key === 'g' || e.key === 'G') {
        switchEditMode('grid');
    } else if (e.key === 'c' || e.key === 'C') {
        switchEditMode('chart');
    } else if (e.key === 'Escape') {
        closeMapEditPanel();
    }
});

// Project Management Functions
function refreshProjects() {
    console.log('Refreshing projects list...');
    // Simulate API call
    alert('Projects refreshed! In produzione questo caricherebbe da /api/projects');
}

// Initialize project selector
function initProjectSelector() {
    const selector = document.getElementById('projectSelector');
    if (selector) {
        selector.value = currentProject;
        selector.addEventListener('change', function() {
            const newProject = this.value;
            console.log(`Switching project from ${currentProject} to ${newProject}`);
            currentProject = newProject;
            // In produzione: carica theme e layer da API
            alert(`Progetto cambiato: ${projects.find(p => p.name === newProject).title}\n\nIn produzione caricherà:\n- Theme config da /api/v1/themes/${newProject}\n- Layer dinamici sulla mappa`);
        });
    }
}

console.log('✅ Edit mode system initialized');
console.log('📌 Keyboard shortcuts: M = Map, G = Grid, C = Chart, ESC = Close panels');
