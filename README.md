# Dufour.app

[![License: BSD-2-Clause](https://img.shields.io/badge/License-BSD%202--Clause-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/mlanini/dufour-app?style=social)](https://github.com/mlanini/dufour-app/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/mlanini/dufour-app)](https://github.com/mlanini/dufour-app/issues)
[![GitHub Release](https://img.shields.io/github/v/release/mlanini/dufour-app)](https://github.com/mlanini/dufour-app/releases)

---

> **⚠️ Project Status**: Active Development (v0.1.0)  
> This is an early-stage project. Features are being actively developed and may change.

**Dufour.app** is a web-based military mapping and planning platform inspired by [KADAS Albireo](https://github.com/kadas-albireo). It combines QGIS Server cartography with NATO military symbology (APP-6D / MIL-STD-2525C) for situational awareness, ORBAT management, and tactical planning.

## ✨ Features

### 🗺️ Mapping
- **QGIS Server** base maps (SwissTopo, aerial, custom projects)
- **OpenLayers** interactive map with Swiss coordinate support (EPSG:2056, EPSG:3857)
- Multiple CRS support with live CRS switcher
- Measurement tools (distance, area, heading)
- Redlining / annotation tools

### 🎖️ Military Symbology
- **Real NATO symbols** rendered via [milsymbol.js](https://www.npmjs.com/package/milsymbol) (APP-6D + MIL-STD-2525C)
- All dimensions: Ground, Air, Sea Surface, Subsurface, Space, Cyberspace, SOF
- Full modifier support (designation, echelon, higher formation, direction, etc.)
- Hybrid rendering: client-side for interactive map, server-side for print/export
- Symbol caching (LRU, 1024 client / 512 server)

### 📋 ORBAT Manager
- Hierarchical unit tree with drag & drop reordering
- Real milsymbol thumbnails for each unit in the tree
- Add/edit/delete subordinate units
- Deploy ORBAT units to the map
- **Export** ORBAT as:
  - 🖼️ PNG (tree diagram with NATO symbols)
  - 📄 JSON (reimportable)
  - 📊 CSV (summary table)

### 🖨️ Print Composition
- Overlay military symbols on QGIS Server WMS base maps
- Configurable extent, DPI, and layers
- Text labels with shadow rendering
- Symbol positioning via WGS84 coordinates

### 📦 Project Management
- Upload .qgz QGIS projects via API
- Automatic migration of local layers to PostGIS
- PostgreSQL BYTEA storage for projects
- WMS proxy for QGIS Server

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                              │
│  OpenLayers │ milsymbol.js │ ORBAT Manager            │
│  symbolService.js (LRU cache, hybrid rendering)       │
└─────────────────────┬────────────────────────────────┘
                      │ HTTPS (/api/*)
                      ↓
┌──────────────────────────────────────────────────────┐
│  Docker Container (Render.com — starter plan)         │
│                                                       │
│  FastAPI (:3000)                                      │
│  ├── /api/projects/*      → QGIS project CRUD + WMS  │
│  ├── /api/symbols/*       → Milsymbol proxy + cache   │
│  ├── /api/print/compose   → Print overlay composition │
│  ├── /api/databases/*     → PostGIS bulk operations   │
│  └── /api/v1/themes/*     → QWC2 theme config         │
│                                                       │
│  milsymbol-server (:2525) │ QGIS Server (:8080)      │
│  Node.js 18 + milsymbol   │ WMS/WFS + supervisord    │
└─────────────────────┬────────────────────────────────┘
                      │ SQL
                      ↓
┌──────────────────────────────────────────────────────┐
│  PostgreSQL 16 + PostGIS (alwaysdata.net)             │
│  Projects (BYTEA) + Spatial Data                      │
└──────────────────────────────────────────────────────┘
```

## 📂 Project Structure

```
dufour-app/
├── frontend/                  # React + Vite + OpenLayers
│   ├── src/
│   │   ├── components/        # React components (Map, ORBAT, Editor, etc.)
│   │   ├── layers/            # MilitaryLayer.js (milsymbol rendering)
│   │   ├── services/          # symbolService.js, fileImport.js, etc.
│   │   ├── config/            # appConfig.js (map, milsymbol settings)
│   │   ├── i18n/              # Translations (en, de, fr, it)
│   │   └── styles/            # CSS modules
│   └── tests/                 # Playwright e2e tests
│
├── backend/api/               # FastAPI middleware
│   ├── main.py                # All API routes
│   ├── services/              # Business logic
│   │   ├── symbol_service.py  # 🎖️ Milsymbol proxy + LRU cache
│   │   ├── print_service.py   # 🖨️ Print composition with Pillow
│   │   ├── project_service.py # QGIS project management
│   │   └── ...
│   ├── config/                # milsymbol_config.json
│   ├── tests/                 # pytest unit + integration tests
│   └── API_GUIDE.md           # Comprehensive API documentation
│
├── milsymbol-server/          # NATO symbol rendering sidecar
│   ├── index.js               # HTTP server (Node.js 18)
│   ├── package.json           # milsymbol ^2.2.0 + canvas
│   ├── test.js                # Functional tests
│   ├── Dockerfile             # node:18-slim + cairo
│   └── README.md              # Usage & API examples
│
├── qgis-server/               # QGIS Server config + projects
├── nginx/                     # Reverse proxy config
├── render.yaml                # Render.com deployment blueprint
└── Dockerfile                 # Frontend container (Vite build + Nginx)
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local frontend dev)
- Python 3.11+ (for local backend dev)

### Run with Docker

```bash
# Clone
git clone https://github.com/mlanini/dufour-app.git
cd dufour-app

# Build and start all services
docker-compose up -d

# Frontend:  http://localhost:5173
# API:       http://localhost:3000
# Swagger:   http://localhost:3000/docs
# Symbols:   http://localhost:3000/api/symbols/SFG-UCI---.svg
```

### Run Frontend (dev)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Run Backend (dev)

```bash
cd backend/api
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 3000
# → http://localhost:3000
```

### Run Milsymbol Server (standalone)

```bash
cd milsymbol-server
npm install
node index.js
# → http://localhost:2525/SFG-UCI---.svg
```

## 🎖️ Military Symbol Examples

```bash
# SVG — Friendly infantry company (APP-6D)
curl http://localhost:3000/api/symbols/10031000001101001500.svg

# PNG — Hostile armor (2525C, 120px)
curl -o hostile.png "http://localhost:3000/api/symbols/SHG-UCF---.png?size=120"

# Validate SIDC
curl http://localhost:3000/api/symbols/validate/10031000001101001500
# → {"valid":true,"format":"APP-6D","dimension":"Ground"}

# Batch render
curl -X POST http://localhost:3000/api/symbols/batch \
  -H "Content-Type: application/json" \
  -d '{"symbols":[{"sidc":"10031000001101001500"},{"sidc":"SFG-UCI---"}]}'

# Health check
curl http://localhost:3000/api/symbols/health
```

## 🌍 Deployment (Render.com)

The project deploys via `render.yaml` blueprint:

| Service | Type | Plan | Description |
|---------|------|------|-------------|
| `dufour-api` | Docker | Starter | Backend + QGIS Server + milsymbol-server |
| `dufour-app` | Docker | Free | Frontend (Vite build + Nginx) |

```bash
# Push to GitHub → auto-deploy via Render
git push origin main
```

## 🧪 Testing

```bash
# Backend unit tests
cd backend/api && pytest tests/ -v

# Symbol service tests (no server needed)
pytest tests/test_symbol_service.py -v -m "not integration"

# Milsymbol server tests (requires running server)
cd milsymbol-server && node test.js

# Frontend e2e (Playwright)
cd frontend && npx playwright test
```

## 🌐 Supported Languages

- 🇬🇧 English (en-US)
- 🇨🇭 German (de-CH)
- 🇫🇷 French (fr-FR)
- 🇮🇹 Italian (it-IT)

## 📄 License

BSD-2-Clause — see [LICENSE](LICENSE) file for details.

## 🔗 References

- [milsymbol](https://www.npmjs.com/package/milsymbol) — NATO symbol library by Måns Beckman
- [KADAS Albireo](https://github.com/kadas-albireo) — Swiss military GIS (inspiration)
- [QGIS Server](https://docs.qgis.org/latest/en/docs/server_manual/) — OGC WMS/WFS server
- [FastAPI](https://fastapi.tiangolo.com/) — Python web framework
- [OpenLayers](https://openlayers.org/) — JavaScript mapping library

