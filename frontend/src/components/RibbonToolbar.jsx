/**
 * RibbonToolbar Component
 * KADAS-style ribbon interface with grouped tools
 */
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import appConfig from '../config/appConfig';
import '../styles/ribbon.css';

const RibbonToolbar = ({ onToolSelect }) => {
  const [activeTab, setActiveTab] = useState('maps');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const locale = useSelector(state => state.locale?.current || 'en-US');
  const activeTool = useSelector(state => state.task?.id);

  // Check if optional plugins are enabled
  const isPluginEnabled = (pluginKey) => {
    const saved = localStorage.getItem('pluginStates');
    if (saved) {
      const states = JSON.parse(saved);
      return states[pluginKey] !== undefined ? states[pluginKey] : appConfig.plugins.optional?.[pluginKey]?.enabled;
    }
    return appConfig.plugins.optional?.[pluginKey]?.enabled || false;
  };

  // KADAS-style tabs: Maps/View/Analysis/Draw/GPS/Settings
  // Filter tabs based on plugin settings
  const allTabs = [
    { id: 'maps', label: { 'en-US': 'Maps', 'de-CH': 'Karten', 'fr-FR': 'Cartes', 'it-IT': 'Mappe' } },
    { id: 'view', label: { 'en-US': 'View', 'de-CH': 'Ansicht', 'fr-FR': 'Vue', 'it-IT': 'Vista' } },
    { id: 'analysis', label: { 'en-US': 'Analysis', 'de-CH': 'Analyse', 'fr-FR': 'Analyse', 'it-IT': 'Analisi' } },
    { id: 'draw', label: { 'en-US': 'Draw', 'de-CH': 'Zeichnen', 'fr-FR': 'Dessiner', 'it-IT': 'Disegna' } },
    { id: 'orbat', label: { 'en-US': 'ORBAT', 'de-CH': 'ORBAT', 'fr-FR': 'ORBAT', 'it-IT': 'ORBAT' }, plugin: 'orbat' },
    { id: 'gps', label: { 'en-US': 'GPS', 'de-CH': 'GPS', 'fr-FR': 'GPS', 'it-IT': 'GPS' } },
    { id: 'settings', label: { 'en-US': 'Settings', 'de-CH': 'Einstellungen', 'fr-FR': 'Paramètres', 'it-IT': 'Impostazioni' } }
  ];

  const tabs = allTabs.filter(tab => !tab.plugin || isPluginEnabled(tab.plugin));

  const tools = {
    // MAPS TAB - Layers, Background, Search, Identify
    maps: [
      {
        group: { 'en-US': 'Layers', 'de-CH': 'Ebenen', 'fr-FR': 'Couches', 'it-IT': 'Livelli' },
        items: [
          { id: 'layer-tree', icon: '📑', label: { 'en-US': 'Layer Tree', 'de-CH': 'Ebenen', 'fr-FR': 'Arbre', 'it-IT': 'Albero' }, size: 'large' },
          { id: 'layer-catalog', icon: '📚', label: { 'en-US': 'Catalog', 'de-CH': 'Katalog', 'fr-FR': 'Catalogue', 'it-IT': 'Catalogo' }, size: 'large' }
        ]
      },
      {
        group: { 'en-US': 'Projects', 'de-CH': 'Projekte', 'fr-FR': 'Projets', 'it-IT': 'Progetti' },
        items: [
          { id: 'upload-project', icon: '📤', label: { 'en-US': 'Upload', 'de-CH': 'Hochladen', 'fr-FR': 'Télécharger', 'it-IT': 'Carica' }, size: 'large' },
          { id: 'import-layer', icon: '📥', label: { 'en-US': 'Import', 'de-CH': 'Import', 'fr-FR': 'Importer', 'it-IT': 'Importa' } }
        ]
      },
      {
        group: { 'en-US': 'Background', 'de-CH': 'Hintergrund', 'fr-FR': 'Fond', 'it-IT': 'Sfondo' },
        items: [
          { id: 'background-switcher', icon: '🗺️', label: { 'en-US': 'Background', 'de-CH': 'Hintergrund', 'fr-FR': 'Fond', 'it-IT': 'Sfondo' }, size: 'large' }
        ]
      },
      {
        group: { 'en-US': 'Tools', 'de-CH': 'Werkzeuge', 'fr-FR': 'Outils', 'it-IT': 'Strumenti' },
        items: [
          { id: 'search', icon: '🔎', label: { 'en-US': 'Search', 'de-CH': 'Suchen', 'fr-FR': 'Rechercher', 'it-IT': 'Cerca' }, size: 'large' },
          { id: 'identify', icon: 'ℹ️', label: { 'en-US': 'Identify', 'de-CH': 'Abfragen', 'fr-FR': 'Identifier', 'it-IT': 'Identifica' } }
        ]
      }
    ],
    // VIEW TAB - Navigation, Zoom, 3D, Compare
    view: [
      {
        group: { 'en-US': 'Navigation', 'de-CH': 'Navigation', 'fr-FR': 'Navigation', 'it-IT': 'Navigazione' },
        items: [
          { id: 'zoom-in', icon: '🔍+', label: { 'en-US': 'Zoom In', 'de-CH': 'Vergrössern', 'fr-FR': 'Zoom +', 'it-IT': 'Ingrandisci' } },
          { id: 'zoom-out', icon: '🔍−', label: { 'en-US': 'Zoom Out', 'de-CH': 'Verkleinern', 'fr-FR': 'Zoom −', 'it-IT': 'Rimpicciolisci' } },
          { id: 'home', icon: '🏠', label: { 'en-US': 'Home', 'de-CH': 'Start', 'fr-FR': 'Accueil', 'it-IT': 'Inizio' } },
          { id: 'previous-extent', icon: '◀', label: { 'en-US': 'Previous', 'de-CH': 'Zurück', 'fr-FR': 'Précédent', 'it-IT': 'Precedente' } },
          { id: 'next-extent', icon: '▶', label: { 'en-US': 'Next', 'de-CH': 'Weiter', 'fr-FR': 'Suivant', 'it-IT': 'Successivo' } }
        ]
      },
      {
        group: { 'en-US': 'View', 'de-CH': 'Ansicht', 'fr-FR': 'Vue', 'it-IT': 'Vista' },
        items: [
          { id: 'overview-map', icon: '🗺', label: { 'en-US': 'Overview', 'de-CH': 'Übersicht', 'fr-FR': 'Aperçu', 'it-IT': 'Panoramica' } },
          { id: 'map-compare', icon: '⇄', label: { 'en-US': 'Compare', 'de-CH': 'Vergleich', 'fr-FR': 'Comparer', 'it-IT': 'Confronta' } },
          { id: 'view-3d', icon: '🏔️', label: { 'en-US': '3D View', 'de-CH': '3D Ansicht', 'fr-FR': 'Vue 3D', 'it-IT': 'Vista 3D' }, size: 'large' }
        ]
      },
      {
        group: { 'en-US': 'Output', 'de-CH': 'Ausgabe', 'fr-FR': 'Sortie', 'it-IT': 'Output' },
        items: [
          { id: 'print', icon: '🖨️', label: { 'en-US': 'Print', 'de-CH': 'Drucken', 'fr-FR': 'Imprimer', 'it-IT': 'Stampa' }, size: 'large' },
          { id: 'export-map', icon: '💾', label: { 'en-US': 'Export', 'de-CH': 'Export', 'fr-FR': 'Exporter', 'it-IT': 'Esporta' } }
        ]
      }
    ],
    // ANALYSIS TAB - Measure, Terrain, Profile
    analysis: [
      {
        group: { 'en-US': 'Measure', 'de-CH': 'Messen', 'fr-FR': 'Mesurer', 'it-IT': 'Misura' },
        items: [
          { id: 'measure-distance', icon: '📏', label: { 'en-US': 'Distance', 'de-CH': 'Distanz', 'fr-FR': 'Distance', 'it-IT': 'Distanza' }, size: 'large' },
          { id: 'measure-area', icon: '▭', label: { 'en-US': 'Area', 'de-CH': 'Fläche', 'fr-FR': 'Surface', 'it-IT': 'Area' }, size: 'large' },
          { id: 'measure-circle', icon: '⭕', label: { 'en-US': 'Circle', 'de-CH': 'Kreis', 'fr-FR': 'Cercle', 'it-IT': 'Cerchio' } },
          { id: 'measure-angle', icon: '📐', label: { 'en-US': 'Angle', 'de-CH': 'Winkel', 'fr-FR': 'Angle', 'it-IT': 'Angolo' } }
        ]
      },
      {
        group: { 'en-US': 'Terrain', 'de-CH': 'Gelände', 'fr-FR': 'Terrain', 'it-IT': 'Terreno' },
        items: [
          { id: 'height-profile', icon: '📊', label: { 'en-US': 'Profile', 'de-CH': 'Profil', 'fr-FR': 'Profil', 'it-IT': 'Profilo' }, size: 'large' },
          { id: 'slope', icon: '⛰️', label: { 'en-US': 'Slope', 'de-CH': 'Neigung', 'fr-FR': 'Pente', 'it-IT': 'Pendenza' }, size: 'large' },
          { id: 'viewshed', icon: '👁️', label: { 'en-US': 'Viewshed', 'de-CH': 'Sichtbarkeit', 'fr-FR': 'Visibilité', 'it-IT': 'Visibilità' }, size: 'large' }
        ]
      }
    ],
    // DRAW TAB - Redlining, Symbols, Edit
    draw: [
      {
        group: { 'en-US': 'Redlining', 'de-CH': 'Zeichnen', 'fr-FR': 'Redlining', 'it-IT': 'Redlining' },
        items: [
          { id: 'draw-point', icon: '⚫', label: { 'en-US': 'Point', 'de-CH': 'Punkt', 'fr-FR': 'Point', 'it-IT': 'Punto' } },
          { id: 'draw-line', icon: '📏', label: { 'en-US': 'Line', 'de-CH': 'Linie', 'fr-FR': 'Ligne', 'it-IT': 'Linea' } },
          { id: 'draw-polygon', icon: '⬟', label: { 'en-US': 'Polygon', 'de-CH': 'Polygon', 'fr-FR': 'Polygone', 'it-IT': 'Poligono' } },
          { id: 'draw-circle', icon: '⭕', label: { 'en-US': 'Circle', 'de-CH': 'Kreis', 'fr-FR': 'Cercle', 'it-IT': 'Cerchio' } },
          { id: 'draw-rectangle', icon: '▭', label: { 'en-US': 'Rectangle', 'de-CH': 'Rechteck', 'fr-FR': 'Rectangle', 'it-IT': 'Rettangolo' } }
        ]
      },
      {
        group: { 'en-US': 'Text & Symbols', 'de-CH': 'Text & Symbole', 'fr-FR': 'Texte & Symboles', 'it-IT': 'Testo & Simboli' },
        items: [
          { id: 'draw-text', icon: '📝', label: { 'en-US': 'Text', 'de-CH': 'Text', 'fr-FR': 'Texte', 'it-IT': 'Testo' }, size: 'large' },
          { id: 'draw-marker', icon: '📌', label: { 'en-US': 'Marker', 'de-CH': 'Markierung', 'fr-FR': 'Marqueur', 'it-IT': 'Marcatore' } },
          { id: 'draw-symbol', icon: '🔣', label: { 'en-US': 'Symbol', 'de-CH': 'Symbol', 'fr-FR': 'Symbole', 'it-IT': 'Simbolo' } }
        ]
      },
      {
        group: { 'en-US': 'Edit', 'de-CH': 'Bearbeiten', 'fr-FR': 'Éditer', 'it-IT': 'Modifica' },
        items: [
          { id: 'edit-redlining', icon: '✏️', label: { 'en-US': 'Edit', 'de-CH': 'Bearbeiten', 'fr-FR': 'Éditer', 'it-IT': 'Modifica' } },
          { id: 'delete-items', icon: '🗑️', label: { 'en-US': 'Delete', 'de-CH': 'Löschen', 'fr-FR': 'Supprimer', 'it-IT': 'Elimina' } }
        ]
      }
    ],
    // ORBAT TAB - Unit management, Sides, Deploy
    orbat: [
      {
        group: { 'en-US': 'ORBAT', 'de-CH': 'ORBAT', 'fr-FR': 'ORBAT', 'it-IT': 'ORBAT' },
        items: [
          { id: 'orbat-panel', icon: '🗂️', label: { 'en-US': 'ORBAT Panel', 'de-CH': 'ORBAT Panel', 'fr-FR': 'Panneau ORBAT', 'it-IT': 'Pannello ORBAT' }, size: 'large' },
          { id: 'orbat-filter', icon: '🔍', label: { 'en-US': 'Filter', 'de-CH': 'Filter', 'fr-FR': 'Filtre', 'it-IT': 'Filtro' } }
        ]
      },
      {
        group: { 'en-US': 'Units', 'de-CH': 'Einheiten', 'fr-FR': 'Unités', 'it-IT': 'Unità' },
        items: [
          { id: 'add-unit', icon: '➕', label: { 'en-US': 'Add Unit', 'de-CH': 'Einheit hinzufügen', 'fr-FR': 'Ajouter unité', 'it-IT': 'Aggiungi unità' }, size: 'large' },
          { id: 'add-side', icon: '🛡️', label: { 'en-US': 'Add Side', 'de-CH': 'Seite hinzufügen', 'fr-FR': 'Ajouter côté', 'it-IT': 'Aggiungi lato' } },
          { id: 'add-group', icon: '👥', label: { 'en-US': 'Add Group', 'de-CH': 'Gruppe hinzufügen', 'fr-FR': 'Ajouter groupe', 'it-IT': 'Aggiungi gruppo' } }
        ]
      },
      {
        group: { 'en-US': 'Operations', 'de-CH': 'Operationen', 'fr-FR': 'Opérations', 'it-IT': 'Operazioni' },
        items: [
          { id: 'deploy-units', icon: '📍', label: { 'en-US': 'Deploy', 'de-CH': 'Bereitstellen', 'fr-FR': 'Déployer', 'it-IT': 'Schiera' }, size: 'large' },
          { id: 'expand-all', icon: '⬇️', label: { 'en-US': 'Expand All', 'de-CH': 'Alle erweitern', 'fr-FR': 'Tout étendre', 'it-IT': 'Espandi tutto' } },
          { id: 'collapse-all', icon: '⬆️', label: { 'en-US': 'Collapse All', 'de-CH': 'Alle zusammenfassen', 'fr-FR': 'Tout réduire', 'it-IT': 'Riduci tutto' } }
        ]
      },
      {
        group: { 'en-US': 'Import/Export', 'de-CH': 'Import/Export', 'fr-FR': 'Import/Export', 'it-IT': 'Importa/Esporta' },
        items: [
          { id: 'import-orbat', icon: '📥', label: { 'en-US': 'Import', 'de-CH': 'Importieren', 'fr-FR': 'Importer', 'it-IT': 'Importa' }, size: 'large' },
          { id: 'export-orbat', icon: '📤', label: { 'en-US': 'Export', 'de-CH': 'Exportieren', 'fr-FR': 'Exporter', 'it-IT': 'Esporta' } }
        ]
      }
    ],
    // GPS TAB - Position, GPX, Waypoints
    gps: [
      {
        group: { 'en-US': 'Position', 'de-CH': 'Position', 'fr-FR': 'Position', 'it-IT': 'Posizione' },
        items: [
          { id: 'locate-me', icon: '📍', label: { 'en-US': 'Locate Me', 'de-CH': 'Mein Standort', 'fr-FR': 'Me localiser', 'it-IT': 'Localizzami' }, size: 'large' },
          { id: 'gps-tracking', icon: '🎯', label: { 'en-US': 'GPS Track', 'de-CH': 'GPS-Spur', 'fr-FR': 'Trace GPS', 'it-IT': 'Traccia GPS' } }
        ]
      },
      {
        group: { 'en-US': 'GPX', 'de-CH': 'GPX', 'fr-FR': 'GPX', 'it-IT': 'GPX' },
        items: [
          { id: 'import-gpx', icon: '📥', label: { 'en-US': 'Import GPX', 'de-CH': 'GPX Import', 'fr-FR': 'Importer GPX', 'it-IT': 'Importa GPX' }, size: 'large' },
          { id: 'export-gpx', icon: '📤', label: { 'en-US': 'Export GPX', 'de-CH': 'GPX Export', 'fr-FR': 'Exporter GPX', 'it-IT': 'Esporta GPX' } }
        ]
      },
      {
        group: { 'en-US': 'Waypoints', 'de-CH': 'Wegpunkte', 'fr-FR': 'Points', 'it-IT': 'Waypoint' },
        items: [
          { id: 'draw-waypoint', icon: '🚩', label: { 'en-US': 'Waypoint', 'de-CH': 'Wegpunkt', 'fr-FR': 'Point', 'it-IT': 'Waypoint' } },
          { id: 'draw-route', icon: '🛤️', label: { 'en-US': 'Route', 'de-CH': 'Route', 'fr-FR': 'Itinéraire', 'it-IT': 'Percorso' } }
        ]
      }
    ],
    // SETTINGS TAB - Language, Projection, Grid
    settings: [
      {
        group: { 'en-US': 'Display', 'de-CH': 'Anzeige', 'fr-FR': 'Affichage', 'it-IT': 'Visualizzazione' },
        items: [
          { id: 'language', icon: '🌐', label: { 'en-US': 'Language', 'de-CH': 'Sprache', 'fr-FR': 'Langue', 'it-IT': 'Lingua' }, size: 'large' },
          { id: 'grid-settings', icon: '🔲', label: { 'en-US': 'Grid', 'de-CH': 'Gitter', 'fr-FR': 'Grille', 'it-IT': 'Griglia' } }
        ]
      },
      {
        group: { 'en-US': 'Projection', 'de-CH': 'Projektion', 'fr-FR': 'Projection', 'it-IT': 'Proiezione' },
        items: [
          { id: 'projection-settings', icon: '🗺️', label: { 'en-US': 'CRS', 'de-CH': 'KBS', 'fr-FR': 'SCR', 'it-IT': 'SR' }, size: 'large' }
        ]
      },
      {
        group: { 'en-US': 'Help', 'de-CH': 'Hilfe', 'fr-FR': 'Aide', 'it-IT': 'Aiuto' },
        items: [
          { id: 'help', icon: '❓', label: { 'en-US': 'Help', 'de-CH': 'Hilfe', 'fr-FR': 'Aide', 'it-IT': 'Aiuto' }, size: 'large' },
          { id: 'about', icon: 'ℹ️', label: { 'en-US': 'About', 'de-CH': 'Info', 'fr-FR': 'À propos', 'it-IT': 'Info' } }
        ]
      }
    ]
  };

  // Backward compatibility - old tools object
  const legacyTools = {
    data: [
      {
        group: { 'en-US': 'Import', 'de-CH': 'Import', 'fr-FR': 'Importer', 'it-IT': 'Importa' },
        items: [
          { id: 'import-gpx', icon: '📥', label: { 'en-US': 'GPX', 'de-CH': 'GPX', 'fr-FR': 'GPX', 'it-IT': 'GPX' } },
          { id: 'import-kml', icon: '📥', label: { 'en-US': 'KML', 'de-CH': 'KML', 'fr-FR': 'KML', 'it-IT': 'KML' } },
          { id: 'import-geojson', icon: '📥', label: { 'en-US': 'GeoJSON', 'de-CH': 'GeoJSON', 'fr-FR': 'GeoJSON', 'it-IT': 'GeoJSON' } }
        ]
      },
      {
        group: { 'en-US': 'Export', 'de-CH': 'Export', 'fr-FR': 'Exporter', 'it-IT': 'Esporta' },
        items: [
          { id: 'export-map', icon: '📤', label: { 'en-US': 'Export Map', 'de-CH': 'Karte exportieren', 'fr-FR': 'Exporter', 'it-IT': 'Esporta' }, size: 'large' },
          { id: 'print', icon: '🖨️', label: { 'en-US': 'Print', 'de-CH': 'Drucken', 'fr-FR': 'Imprimer', 'it-IT': 'Stampa' }, size: 'large' }
        ]
      }
    ]
  };

  const handleToolClick = (toolId) => {
    // Close mobile menu if open (for small screens)
    if (window.innerWidth <= 768 && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
    
    if (onToolSelect) {
      onToolSelect(toolId);
    }
  };

  const handleTabClick = (tabId) => {
    // Close mobile menu if open (for small screens)
    if (window.innerWidth <= 768 && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
    
    setActiveTab(tabId);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const getLabel = (labelObj) => {
    return labelObj[locale] || labelObj['en-US'];
  };

  return (
    <div className={`ribbon-toolbar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
      {/* Mobile menu button */}
      <button 
        className={`mobile-menu-btn ${mobileMenuOpen ? 'active' : ''}`}
        onClick={toggleMobileMenu}
        aria-label="Toggle Menu"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {/* Top bar with app title and quick actions */}
      <div className="ribbon-top-bar">
        <div className="ribbon-app-title">
          <span className="ribbon-app-logo">🗺️</span>
          <span>dufour.app</span>
        </div>
        <div className="ribbon-quick-actions">
          <button className="ribbon-quick-action" onClick={() => handleToolClick('settings')}>
            ⚙️ {getLabel({ 'en-US': 'Settings', 'de-CH': 'Einstellungen', 'fr-FR': 'Paramètres', 'it-IT': 'Impostazioni' })}
          </button>
          <button className="ribbon-quick-action" onClick={() => handleToolClick('help')}>
            ❓ {getLabel({ 'en-US': 'Help', 'de-CH': 'Hilfe', 'fr-FR': 'Aide', 'it-IT': 'Aiuto' })}
          </button>
        </div>
      </div>

      {/* Ribbon tabs */}
      <div className="ribbon-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`ribbon-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {getLabel(tab.label)}
          </div>
        ))}
      </div>

      {/* Ribbon content with tool groups */}
      <div className="ribbon-content">
        {tools[activeTab]?.map((group, groupIdx) => (
          <div key={groupIdx} className="ribbon-group">
            <div className="ribbon-group-tools">
              {group.items.map(tool => (
                <button
                  key={tool.id}
                  className={`ribbon-tool ${tool.size || ''} ${activeTool === tool.id ? 'active' : ''}`}
                  onClick={() => handleToolClick(tool.id)}
                  title={getLabel(tool.label)}
                >
                  <div className="ribbon-tool-icon">{tool.icon}</div>
                  <div className="ribbon-tool-label">{getLabel(tool.label)}</div>
                </button>
              ))}
            </div>
            <div className="ribbon-group-label">{getLabel(group.group)}</div>
          </div>
        ))}
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div 
          className="mobile-menu-overlay" 
          onClick={() => setMobileMenuOpen(false)}
          style={{ opacity: 1 }}
        />
      )}
    </div>
  );
};

export default RibbonToolbar;
