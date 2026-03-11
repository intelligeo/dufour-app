# Dufour Middleware API

Backend API service per la gestione di progetti QGIS, upload dati PostGIS e **rendering simboli militari NATO** in Dufour-app.

## 📚 Documentazione Completa

### 🔥 Swagger UI Interattivo (Consigliato)
**URL:** `http://localhost:3000/docs` (dev) | `https://dufour-api.onrender.com/docs` (prod)

- ✅ Esplora tutti gli endpoints
- ✅ Prova le richieste direttamente nel browser
- ✅ Vedi esempi di request/response
- ✅ Valida schemi automaticamente

### 📖 ReDoc (Documentazione Leggibile)
**URL:** `http://localhost:3000/redoc` (dev) | `https://dufour-api.onrender.com/redoc` (prod)

- Layout pulito a tre pannelli
- Ottimo per leggere la documentazione
- Formato stampabile

### 📄 Guida Completa
Vedi [API_GUIDE.md](./API_GUIDE.md) per:
- Esempi di codice (Python, JavaScript, cURL)
- Guida all'integrazione OpenLayers
- Schema database
- **Military Symbols API (APP-6D / MIL-STD-2525C)**
- **Print Composition API (overlay simboli su mappe)**
- Configurazione environment variables
- Troubleshooting

## 🎯 Scopo

Il Middleware API funge da **Content Management System** per progetti QGIS e da **piattaforma di rendering simboli militari**:
- Riceve progetti .qgz da QGIS Desktop o upload manuale
- Migra automaticamente layer locali a PostGIS
- Salva progetti in PostgreSQL BYTEA
- Fornisce WMS proxy per QGIS Server
- Genera configurazioni QWC2 per il frontend
- Gestisce upload dati PostGIS bulk
- **Rendering simboli NATO** (APP-6D + MIL-STD-2525C) via milsymbol-server
- **Composizione print** con overlay simboli su base map QGIS

## 🏗️ Architettura

```
┌─────────────────────────────────────────────────────┐
│  Docker Container (single process: supervisord)      │
│                                                      │
│  ┌───────────────────────────────────────────┐      │
│  │  FastAPI Middleware (:3000)                │      │
│  │                                           │      │
│  │  /api/projects/*     → CRUD + WMS proxy   │      │
│  │  /api/databases/*    → PostGIS bulk ops   │      │
│  │  /api/symbols/*      → Milsymbol proxy    │      │
│  │  /api/print/compose  → Print + overlay    │      │
│  │  /api/v1/themes/*    → QWC2 config        │      │
│  └──────┬─────────────────────┬──────────────┘      │
│         │                     │                      │
│  ┌──────▼──────┐  ┌──────────▼──────────┐          │
│  │ milsymbol   │  │ QGIS Server         │          │
│  │ server      │  │ (:8080)             │          │
│  │ Node.js 18  │  │ WMS/WFS/WMTS        │          │
│  │ (:2525)     │  │ + supervisord       │          │
│  └─────────────┘  └─────────────────────┘          │
└──────────────────────┼───────────────────────────────┘
                       │ SQL
                       ↓
┌─────────────────────────────────────────────────────┐
│  PostgreSQL 16 + PostGIS (alwaysdata.net)            │
└─────────────────────────────────────────────────────┘
```

## 🚀 Avvio Rapido

### Development

```bash
# Avvia tutti i servizi
docker-compose up -d

# Solo il middleware API
docker-compose up dufour-api

# Logs
docker-compose logs -f dufour-api
```

L'API sarà disponibile su http://localhost:3000

### Test Health Check

```bash
# Verifica che l'API sia online
curl http://localhost:3000/

# Status dettagliato
curl http://localhost:3000/api/status

# Milsymbol server health
curl http://localhost:3000/api/symbols/health
```

## 📡 Endpoints Principali

### Progetti QGIS

| Method | Endpoint | Descrizione |
|--------|----------|-------------|
| `GET` | `/api/projects` | Lista tutti i progetti |
| `GET` | `/api/projects/{name}` | Dettagli progetto |
| `POST` | `/api/projects` | Upload e migra progetto .qgz |
| `DELETE` | `/api/projects/{name}` | Elimina progetto |

### Upload Dati PostGIS

| Method | Endpoint | Descrizione |
|--------|----------|-------------|
| `POST` | `/api/databases/{db}/tables` | Crea tabella PostGIS |
| `POST` | `/api/databases/{db}/tables/{table}/upload` | Upload features in bulk |
| `GET` | `/api/databases/{db}/tables` | Lista tabelle |

### Simboli Militari 🎖️

| Method | Endpoint | Descrizione |
|--------|----------|-------------|
| `GET` | `/api/symbols/health` | Health check milsymbol-server |
| `GET` | `/api/symbols/{SIDC}.svg` | Rendering SVG di un simbolo |
| `GET` | `/api/symbols/{SIDC}.png` | Rendering PNG di un simbolo |
| `POST` | `/api/symbols/batch` | Rendering batch (max 100) |
| `GET` | `/api/symbols/validate/{SIDC}` | Validazione codice SIDC |
| `DELETE` | `/api/symbols/cache` | Svuota cache simboli |

### Print Composition 🖨️

| Method | Endpoint | Descrizione |
|--------|----------|-------------|
| `POST` | `/api/print/compose` | Mappa stampabile con overlay simboli militari |

### QWC Themes

| Method | Endpoint | Descrizione |
|--------|----------|-------------|
| `GET` | `/api/v1/themes` | Lista temi QWC2 |
| `GET` | `/api/v1/themes/{name}` | Configurazione tema |

## 🎖️ Esempi Simboli Militari

```bash
# Fanteria amica, compagnia (APP-6D, SVG)
curl http://localhost:3000/api/symbols/10031000001101001500.svg

# Corazzato ostile (2525C, PNG, 120px)
curl -o symbol.png "http://localhost:3000/api/symbols/SHG-UCF---.png?size=120"

# Validazione SIDC
curl http://localhost:3000/api/symbols/validate/10031000001101001500
# → {"sidc":"10031000001101001500","valid":true,"format":"APP-6D","dimension":"Ground"}

# Batch rendering (3 simboli)
curl -X POST http://localhost:3000/api/symbols/batch \
  -H "Content-Type: application/json" \
  -d '{"symbols":[{"sidc":"10031000001101001500"},{"sidc":"SFG-UCI---"}],"format":"svg"}'
```

## 🔧 Configurazione

### Variabili d'Ambiente

```bash
# Database
POSTGIS_HOST=postgis
POSTGIS_PORT=5432
POSTGIS_DB=gisdb
POSTGIS_USER=gisuser
POSTGIS_PASSWORD=gispassword

# QGIS Server
QGIS_SERVER_URL=http://localhost:8080

# Milsymbol Server (embedded sidecar)
MILSYMBOL_SERVER_URL=http://localhost:2525
MILSYMBOL_PORT=2525
MILSYMBOL_DEFAULT_SIZE=100
DEFAULT_SIDC_FORMAT=APP-6D     # APP-6D or 2525C
SYMBOL_CACHE_SIZE=512
```

## 📁 Struttura del Codice

```
backend/api/
├── main.py                    # FastAPI app e routes (tutti gli endpoints)
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Container image (Ubuntu 22.04 + QGIS Server + Node.js)
├── API_GUIDE.md              # Documentazione API completa
├── config/
│   └── milsymbol_config.json # Configurazione rendering simboli
├── models/
│   └── schemas.py            # Pydantic models
├── services/
│   ├── project_service.py    # Gestione progetti QGIS
│   ├── data_service.py       # Upload dati PostGIS
│   ├── qwc_service.py        # Generazione config QWC2
│   ├── symbol_service.py     # 🎖️ Proxy milsymbol-server + cache LRU
│   ├── print_service.py      # 🖨️ Composizione print con overlay simboli
│   ├── qgis_storage_service.py # Storage progetti in PostgreSQL
│   ├── project_migrator.py   # Migrazione layer locali → PostGIS
│   ├── layer_extractor.py    # Estrazione layer da .qgz
│   └── qgz_parser.py        # Parser file QGIS
└── tests/
    ├── test_symbol_service.py # Test validazione SIDC, cache, service
    ├── test_api_upload.py
    ├── test_layer_extractor.py
    ├── test_project_migrator.py
    └── ...
```

## 🧪 Testing

### Test Manuale con cURL

```bash
# Health check
curl http://localhost:3000/

# Lista progetti
curl http://localhost:3000/api/projects

# Milsymbol health
curl http://localhost:3000/api/symbols/health

# Render simbolo NATO
curl http://localhost:3000/api/symbols/10031000001101001500.svg

# Status sistema
curl http://localhost:3000/api/status
```

### Test con pytest

```bash
cd backend/api
pip install -r requirements.txt
pytest tests/ -v

# Solo test simboli (senza server milsymbol)
pytest tests/test_symbol_service.py -v -m "not integration"

# Test integrazione (richiede milsymbol-server attivo)
pytest tests/test_symbol_service.py -v -m integration
```

## 🐛 Troubleshooting

### API non raggiungibile
```bash
docker ps | grep dufour-api
docker logs dufour-api
```

### QGIS Server non risponde
```bash
curl "http://localhost:8080/cgi-bin/qgis_mapserv.fcgi?SERVICE=WMS&REQUEST=GetCapabilities"
```

### Milsymbol server offline
```bash
# Test diretto sidecar
curl http://localhost:2525/health

# Test via proxy API
curl http://localhost:3000/api/symbols/health

# Verifica processo Node.js nel container
docker exec dufour-api ps aux | grep node
```

### Database connection error
```bash
docker exec dufour-postgis psql -U gisuser -d gisdb -c "SELECT version();"
```

## 🔗 Link Utili

- [API_GUIDE.md](./API_GUIDE.md) — Guida API completa con esempi
- [milsymbol-server/README.md](../../milsymbol-server/README.md) — Documentazione server simboli
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [milsymbol.js](https://www.npmjs.com/package/milsymbol) — Libreria simboli NATO
- [QGIS Server Guide](https://docs.qgis.org/latest/en/docs/server_manual/)
- [PostGIS Documentation](https://postgis.net/documentation/)
