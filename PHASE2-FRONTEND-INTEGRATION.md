# Fase 2: Frontend Integration - Completata ✅

## Componenti Implementati

### Services (API Clients)

#### 1. **projectManager.js**
Client per gestione progetti QGIS:
- `listProjects()` - Lista progetti disponibili
- `getProject(name)` - Dettagli progetto specifico
- `uploadProject(data)` - Upload nuovo progetto da QGIS Desktop
- `deleteProject(name)` - Elimina progetto
- `checkStatus()` - Verifica stato API
- `getCapabilitiesUrl(name)` - URL WMS GetCapabilities
- `getWmsUrl(name)` - URL base WMS

#### 2. **qwcApiService.js**
Service per QWC2 Theme API:
- `listThemes()` - Lista temi disponibili
- `getTheme(name)` - Carica configurazione tema
- `createLayerFromConfig(config, url)` - Converte QWC layer → OpenLayers
- `createLayersFromTheme(theme)` - Crea tutti i layer da tema
- `getThemeExtent(theme)` - Estrae extent del tema
- `getThemeScales(theme)` - Estrae scale disponibili

Supporta layer types:
- WMS (ImageWMS per QGIS Server)
- WMTS (TileWMS per SwissTopo background)

### Components

#### 3. **ProjectSelector.jsx**
Dropdown per selezione progetto attivo:
- Lista progetti da API all'avvio
- Cambio progetto carica theme config automaticamente
- Carica layer dinamicamente sulla mappa
- Adatta vista all'extent del progetto
- Bottone refresh per ricaricare lista
- Gestione errori e loading states
- Responsive (label nascosta su mobile)

**Integrato in**: StatusBar (prima delle coordinate)

#### 4. **MapComponent.jsx** (modificato)
Caricamento dinamico layer da theme:
- Ascolta cambiamenti `themeConfig` da Redux
- Rimuove layer esistenti (tranne background)
- Crea nuovi layer da `qwcApiService.createLayersFromTheme()`
- Aggiunge layer alla mappa OpenLayers
- Adatta vista all'extent del tema con animazione
- Aggiorna store Redux con lista layer
- Callback `onMapReady()` per passare instance a DufourApp

#### 5. **LayerTreePanel.jsx** (aggiornato)
Layer tree dinamico da mappa:
- Legge layer da OpenLayers map instance
- Converte in formato UI (nome, visibilità, tipo)
- Toggle visibilità agisce direttamente su layer OpenLayers
- Supporta base maps (radio) e overlay layers (checkbox)
- Auto-refresh quando cambia theme config

#### 6. **SidePanel.jsx** (modificato)
- Riceve `map` prop da DufourApp
- Passa map instance a LayerTreePanel

#### 7. **DufourApp.jsx** (modificato)
- State `mapInstance` per tenere reference OpenLayers Map
- Callback `setMapInstance` passato a MapComponent
- Map instance propagato a SidePanel → LayerTreePanel

### Store (Redux)

#### 8. **store.js** (aggiornato)
Nuovo slice `app` per gestione progetti:
```javascript
{
  projects: [],           // Lista progetti disponibili
  currentProject: null,   // Nome progetto corrente
  themeConfig: null,      // Configurazione QWC tema attuale
  layers: []              // Layer metadata (per UI)
}
```

Actions:
- `setProjects(projects)` - Imposta lista progetti
- `setCurrentProject(name)` - Imposta progetto corrente
- `setThemeConfig(config)` - Imposta theme config
- `setLayers(layers)` - Imposta layer metadata

### Styles

#### 9. **project-selector.css**
Styling per ProjectSelector component:
- Container flex con gap
- Select dropdown con hover/focus states
- Refresh button con rotate animation
- Error indicator (⚠️)
- Loading indicator
- Empty state styling
- Responsive (label hidden su mobile, select compatto)

#### 10. **index.css** (modificato)
Import project-selector.css

## Workflow Utente

1. **Avvio app**:
   - ProjectSelector carica lista progetti da API
   - Se ci sono progetti, carica automaticamente il primo
   
2. **Caricamento progetto**:
   - ProjectSelector chiama `projectManager.getProject(name)`
   - Carica `qwcApiService.getTheme(name)`
   - Aggiorna Redux: `setCurrentProject()` + `setThemeConfig()`
   
3. **Update mappa**:
   - MapComponent rileva cambio `themeConfig` (useEffect)
   - Rimuove layer esistenti
   - Crea nuovi layer con `qwcApiService.createLayersFromTheme()`
   - Aggiunge layer alla mappa OpenLayers
   - Adatta vista all'extent del progetto
   
4. **Update LayerTree**:
   - LayerTreePanel rileva cambio `themeConfig` (useEffect)
   - Legge layer da OpenLayers map instance
   - Aggiorna UI con nomi e stati di visibilità
   - Toggle layer agisce su `olLayer.setVisible()`

## Test Plan

### 1. Test API Connection
```bash
# Avvia backend
cd backend/api
docker-compose up dufour-api

# Verifica endpoints
curl http://localhost:3000/api/projects
curl http://localhost:3000/api/v1/themes
```

### 2. Test Frontend
```bash
# Avvia frontend
cd frontend
npm run dev

# Verifica:
# - ProjectSelector appare nella StatusBar
# - Dropdown mostra "Nessun progetto" se API vuota
# - Bottone refresh funziona
```

### 3. Test con Progetto
```bash
# Upload progetto di test
curl -X POST http://localhost:3000/api/projects \
  -F "name=test" \
  -F "title=Test Project" \
  -F "file=@test.qgs"

# Frontend:
# - ProjectSelector mostra "Test Project"
# - Selezionare progetto carica layer
# - LayerTreePanel mostra layer del progetto
# - Toggle visibilità funziona
```

## Prossimi Passi

### Fase 0: QGIS Desktop Plugin (opzionale)
- Fork qgis-cloud-plugin
- Modifica per puntare a localhost:3000
- Test upload progetto da QGIS Desktop

### Miglioramenti Frontend
- [ ] Gestione errori più dettagliata (toast notifications)
- [ ] Spinner durante caricamento progetti
- [ ] Conferma eliminazione progetto
- [ ] Anteprima progetto (thumbnail)
- [ ] Filtro/ricerca progetti
- [ ] Ordinamento progetti (data, nome)

### Features Avanzate
- [ ] Upload progetto da UI (file picker)
- [ ] Edit metadata progetto
- [ ] Duplicate progetto
- [ ] Share link al progetto
- [ ] Permalink con progetto e vista corrente

## File Modificati/Creati

**Nuovi files**:
- `frontend/src/services/projectManager.js`
- `frontend/src/services/qwcApiService.js`
- `frontend/src/components/ProjectSelector.jsx`
- `frontend/src/styles/project-selector.css`

**Files modificati**:
- `frontend/src/components/MapComponent.jsx` (caricamento dinamico layer)
- `frontend/src/components/LayerTreePanel.jsx` (lettura da OpenLayers map)
- `frontend/src/components/SidePanel.jsx` (pass map prop)
- `frontend/src/components/DufourApp.jsx` (map instance management)
- `frontend/src/components/StatusBar.jsx` (integra ProjectSelector)
- `frontend/src/store/store.js` (app slice)
- `frontend/src/styles/index.css` (import project-selector.css)

## Architettura

```
┌─────────────────┐
│ QGIS Desktop    │
│ Plugin          │
└────────┬────────┘
         │ POST /api/projects
         ▼
┌─────────────────┐
│ Dufour API      │◄────── GET /api/projects
│ (FastAPI)       │        GET /api/v1/themes/{name}
└────────┬────────┘               │
         │ Salva .qgs             │
         │ Genera theme.json      │
         ▼                        │
┌─────────────────┐               │
│ QGIS Server     │               │
│ (WMS/WFS)       │               │
└─────────────────┘               │
                                  │
         ┌────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Frontend (React)                │
│                                 │
│ ProjectSelector                 │
│   │                             │
│   ├─► projectManager.getProject()
│   ├─► qwcApiService.getTheme()  │
│   └─► Redux: setThemeConfig()   │
│                                 │
│ MapComponent                    │
│   └─► createLayersFromTheme()   │
│       └─► OpenLayers Map        │
│                                 │
│ LayerTreePanel                  │
│   └─► Read from OL Map          │
│       └─► Toggle visibility     │
└─────────────────────────────────┘
```

## Note Tecniche

- **OpenLayers Layer Management**: Layer vengono ricreati ad ogni cambio progetto (non modificati in-place)
- **Redux State**: ThemeConfig è source of truth per progetto corrente
- **Map Instance Propagation**: Passa da DufourApp → MapComponent (onMapReady) → SidePanel → LayerTreePanel
- **QWC2 Compatibility**: createLayerFromConfig() supporta sia WMS che WMTS layer types
- **Swiss Projections**: Supporto EPSG:3857 (Web Mercator) e EPSG:4326 (WGS84) per extent transformation
