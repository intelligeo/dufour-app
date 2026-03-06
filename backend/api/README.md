# Dufour Middleware API

Backend API service per la gestione di progetti QGIS e upload dati in Dufour-app.

## 🎯 Scopo

Il Middleware API funge da **Content Management System** per progetti QGIS:
- Riceve progetti .qgs da QGIS Desktop plugin
- Salva in QGIS Server directory
- Genera configurazioni QWC2 per il frontend
- Gestisce upload dati PostGIS
- Fornisce REST API per il frontend React

## 🏗️ Architettura

```
QGIS Desktop Plugin → Dufour API → QGIS Server + PostGIS
                           ↓
                      QWC Config
                           ↓
                   Dufour Frontend
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

### Documentazione API

Una volta avviato, la documentazione interattiva è disponibile su:
- **Swagger UI**: http://localhost:3000/docs
- **ReDoc**: http://localhost:3000/redoc

## 📡 Endpoints Principali

### Progetti QGIS

#### `GET /api/projects`
Lista tutti i progetti disponibili

**Response:**
```json
[
  {
    "name": "tactical_ops",
    "title": "Tactical Operations",
    "created_at": "2026-03-06T10:30:00",
    "wms_url": "http://qgis-server:80/...",
    "extent": [minx, miny, maxx, maxy]
  }
]
```

#### `POST /api/projects`
Pubblica un nuovo progetto QGIS

**Request (multipart/form-data):**
```
name: tactical_ops
title: Tactical Operations
description: Military tactical planning
file: tactical_ops.qgs (binary)
```

**Response:**
```json
{
  "success": true,
  "message": "Project published successfully",
  "project": {...},
  "wms_url": "http://qgis-server:80/...",
  "wms_capabilities": "http://qgis-server:80/...&REQUEST=GetCapabilities"
}
```

#### `DELETE /api/projects/{name}`
Elimina un progetto

### Upload Dati PostGIS

#### `POST /api/databases/{db}/tables`
Crea una nuova tabella PostGIS

**Request Body:**
```json
{
  "schema_name": "public",
  "table_name": "military_units",
  "columns": [
    {"name": "id", "type": "SERIAL PRIMARY KEY"},
    {"name": "name", "type": "VARCHAR(255)"},
    {"name": "unit_type", "type": "VARCHAR(100)"}
  ],
  "geometry_column": "geom",
  "geometry_type": "POINT",
  "srid": 3857,
  "overwrite": false
}
```

#### `POST /api/databases/{db}/tables/{table}/upload`
Upload features in bulk (COPY format)

**Request (multipart/form-data):**
```
schema: public
file: data.csv (CSV in COPY format)
```

### QWC Themes

#### `GET /api/v1/themes`
Lista tutti i temi QWC2 disponibili

#### `GET /api/v1/themes/{name}`
Ottiene configurazione completa di un tema

## 🔧 Configurazione

### Variabili d'Ambiente

File `.env` (copia da `.env.example`):

```bash
# Database
POSTGIS_HOST=postgis
POSTGIS_PORT=5432
POSTGIS_DB=gisdb
POSTGIS_USER=gisuser
POSTGIS_PASSWORD=gispassword

# QGIS Server
QGIS_SERVER_URL=http://qgis-server:80

# Paths
PROJECTS_DIR=/data/projects
QWC_CONFIG_DIR=/qwc-config
```

### Volumi Docker

```yaml
volumes:
  - ./qgis-server/projects:/data/projects  # Progetti QGIS
  - ./qwc-config:/qwc-config               # Configurazioni QWC
  - ./backend/api:/app                     # Hot reload development
```

## 📁 Struttura del Codice

```
backend/api/
├── main.py                  # FastAPI app e routes
├── requirements.txt         # Python dependencies
├── Dockerfile              # Container image
├── .env.example           # Environment template
├── models/
│   └── schemas.py         # Pydantic models
└── services/
    ├── project_service.py # Gestione progetti QGIS
    ├── data_service.py    # Upload dati PostGIS
    └── qwc_service.py     # Generazione config QWC2
```

## 🔄 Workflow Pubblicazione

1. **QGIS Desktop**: Utente crea progetto `tactical.qgs`
2. **Plugin**: Upload progetto via `POST /api/projects`
3. **API**: Salva in `/data/projects/tactical.qgs`
4. **API**: Genera `/qwc-config/themes/tactical.json`
5. **QGIS Server**: Serve il progetto via WMS
6. **Frontend**: Carica tema via `GET /api/v1/themes/tactical`

## 🧪 Testing

### Test Manuale con cURL

```bash
# Health check
curl http://localhost:3000/

# Lista progetti
curl http://localhost:3000/api/projects

# Pubblica progetto
curl -X POST http://localhost:3000/api/projects \
  -F "name=test" \
  -F "title=Test Project" \
  -F "file=@project.qgs"

# Status sistema
curl http://localhost:3000/api/status
```

### Test con Python

```python
import requests

# Upload progetto
with open('tactical.qgs', 'rb') as f:
    response = requests.post(
        'http://localhost:3000/api/projects',
        data={'name': 'tactical', 'title': 'Tactical Ops'},
        files={'file': f}
    )
    print(response.json())
```

## 🐛 Troubleshooting

### API non raggiungibile
```bash
# Verifica container in esecuzione
docker ps | grep dufour-api

# Logs
docker logs dufour-api
```

### QGIS Server non risponde
```bash
# Test GetCapabilities
curl "http://localhost:8080/cgi-bin/qgis_mapserv.fcgi?SERVICE=WMS&REQUEST=GetCapabilities"
```

### Database connection error
```bash
# Test connessione PostGIS
docker exec dufour-postgis psql -U gisuser -d gisdb -c "SELECT version();"
```

## 📚 Prossimi Passi

Ora che il middleware è pronto:
1. **Fase 0**: Fork/modifica qgis-cloud-plugin per puntare a questa API
2. **Fase 2**: Adatta frontend per caricare progetti dinamicamente
3. **Fase 3**: Test end-to-end QGIS Desktop → WebApp

## 🔗 Link Utili

- FastAPI Docs: https://fastapi.tiangolo.com
- QWC2 Themes: https://github.com/qgis/qwc2
- PostGIS: https://postgis.net
