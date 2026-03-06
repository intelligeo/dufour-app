/**
 * SidePanel Component
 * Collapsible side panels for layers, search, tools, etc.
 */
import React from 'react';
import LayerTreePanel from './panels/LayerTreePanel';
import SearchPanel from './panels/SearchPanel';
import MeasurementPanel from './panels/MeasurementPanel';
import RedliningPanel from './panels/RedliningPanel';
import TerrainPanel from './panels/TerrainPanel';
import ImportPanel from './panels/ImportPanel';
import PrintPanel from './panels/PrintPanel';
import SettingsPanel from './panels/SettingsPanel';

const SidePanel = ({ side, content, onClose, onAction, map }) => {
  // Auto-close on mobile when action is performed
  const handleAction = () => {
    if (window.innerWidth <= 768 && onAction) {
      onAction();
    }
  };

  const panelTitles = {
    layers: {
      'en-US': 'Layers',
      'de-CH': 'Ebenen',
      'fr-FR': 'Couches',
      'it-IT': 'Livelli'
    },
    search: {
      'en-US': 'Search',
      'de-CH': 'Suchen',
      'fr-FR': 'Rechercher',
      'it-IT': 'Cercare'
    },
    measurement: {
      'en-US': 'Measurement',
      'de-CH': 'Messung',
      'fr-FR': 'Mesure',
      'it-IT': 'Misurazione'
    },
    redlining: {
      'en-US': 'Drawing',
      'de-CH': 'Zeichnen',
      'fr-FR': 'Dessin',
      'it-IT': 'Disegno'
    },
    terrain: {
      'en-US': 'Terrain Analysis',
      'de-CH': 'Geländeanalyse',
      'fr-FR': 'Analyse du terrain',
      'it-IT': 'Analisi del terreno'
    },
    import: {
      'en-US': 'Import Data',
      'de-CH': 'Daten importieren',
      'fr-FR': 'Importer des données',
      'it-IT': 'Importa dati'
    },
    print: {
      'en-US': 'Print',
      'de-CH': 'Drucken',
      'fr-FR': 'Imprimer',
      'it-IT': 'Stampa'
    },
    settings: {
      'en-US': 'Settings',
      'de-CH': 'Einstellungen',
      'fr-FR': 'Paramètres',
      'it-IT': 'Impostazioni'
    }
  };

  const renderPanelContent = () => {
    switch (content) {
      case 'layers':
        return <LayerTreePanel onAction={handleAction} map={map} />;
      case 'search':
        return <SearchPanel onAction={handleAction} />;
      case 'measurement':
        return <MeasurementPanel onAction={handleAction} />;
      case 'redlining':
        return <RedliningPanel onAction={handleAction} />;
      case 'terrain':
        return <TerrainPanel onAction={handleAction} />;
      case 'import':
        return <ImportPanel onAction={handleAction} />;
      case 'print':
        return <PrintPanel onAction={handleAction} />;
      case 'settings':
        return <SettingsPanel onAction={handleAction} />;
      default:
        return <div>Panel content: {content}</div>;
    }
  };

  const getTitle = () => {
    const titles = panelTitles[content] || {};
    return titles['en-US'] || content;
  };

  return (
    <div className={`side-panel ${side}`}>
      <div className="side-panel-header">
        <div className="side-panel-title">{getTitle()}</div>
        <button className="side-panel-close" onClick={onClose}>×</button>
      </div>
      <div className="side-panel-content">
        {renderPanelContent()}
      </div>
    </div>
  );
};

export default SidePanel;
