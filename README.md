# Dufour.app

**A KADAS-inspired web GIS application for military operations, emergency response, and geospatial analysis**

[![License: BSD-2-Clause](https://img.shields.io/badge/License-BSD%202--Clause-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/mlanini/dufour-app?style=social)](https://github.com/mlanini/dufour-app/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/mlanini/dufour-app)](https://github.com/mlanini/dufour-app/issues)
[![GitHub Release](https://img.shields.io/github/v/release/mlanini/dufour-app)](https://github.com/mlanini/dufour-app/releases)

---

> **⚠️ Project Status**: Active Development (v0.1.0)  
> This is an early-stage project. Features are being actively developed and may change.

---

## 🎯 Project Overview

Dufour.app is a lightweight, OS-independent web application that brings KADAS Albireo's powerful geospatial capabilities to any web browser. Built with React, OpenLayers, QGIS Server, and PostGIS, it provides:

- 🗺️ Swiss federal geospatial services integration (geo.admin.ch)
- 🎖️ Military symbology and scenario planning (APP-6/MIL-STD-2525)
- 📍 Redlining, measuring, and GPS/GPX support
- 🏔️ Terrain analysis and 3D terrain visualization
- 📤 Data import/export (GeoJSON, KML, GPX, Shapefile)
- 🌐 Multilingual interface (EN, DE, FR, IT)
- 📱 Mobile-responsive design
- ⏱️ Temporal data visualization with timeline controls

## 🏗️ Architecture

**Modern containerized application with:**

- **Frontend**: React 18 + OpenLayers + Redux Toolkit
- **Map Server**: QGIS Server (WMS/WFS/WCS)
- **Database**: PostgreSQL 15 + PostGIS 3.4
- **Web Server**: Nginx (reverse proxy + static files)
- **Military Features**: ORBAT Manager, Military Symbol Editor
- **Swiss Integration**: geo.admin.ch API, SwissGrid coordinate system

## 🚀 Quick Start

### Deployment su Render.com (Consigliato)

**Deploy in produzione in 10 minuti:**

Segui la guida: **[DEPLOY-QUICK-START.md](DEPLOY-QUICK-START.md)**

```bash
# 1. Push su GitHub
git push origin main

# 2. Crea servizi su Render.com
# - PostgreSQL + PostGIS
# - Backend API (FastAPI)
# - Frontend (React)

# 3. Accedi all'app
# https://dufour-frontend.onrender.com
```

### Development Setup Locale

**Prerequisiti**:
- Docker Desktop & Docker Compose
- Node.js 18+ and npm 9+
- Git

**Setup**:powershell
# Clone the repository
git clone https://github.com/mlanini/dufour-app.git
cd dufour-app

# Start backend services
docker-compose up -d

# Install frontend dependencies
cd frontend
npm install

# Start development server
npm run dev
```

Access the application:
- **Frontend**: http://localhost:5173
- **QGIS Server**: http://localhost:8080
- **PostGIS**: localhost:5432 (user: gisuser, db: gisdb)

### Production Build

```powershell
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy all services
docker-compose -f docker-compose.prod.yml up -d
```

## 📖 Documentation

### Deployment & Testing
- **[DEPLOY-QUICK-START.md](DEPLOY-QUICK-START.md)** - Deploy su Render.com (10 min)
- **[RENDER-DEPLOYMENT.md](RENDER-DEPLOYMENT.md)** - Guida completa deployment
- **[PHASE3-TESTING.md](PHASE3-TESTING.md)** - Test sistema completo

### Architecture & Development
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Architettura sistema
- **[PHASE2-FRONTEND-INTEGRATION.md](PHASE2-FRONTEND-INTEGRATION.md)** - Frontend integration
- **[backend/api/README.md](backend/api/README.md)** - Backend API documentation

### Setup & Guides
- **[SETUP.md](SETUP.md)** - Setup completo locale
- **[GUIDE.md](GUIDE.md)** - Guida utente
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Come contribuire

- **[GUIDE.md](GUIDE.md)** - Complete user guide with features and usage instructions
- **[DEPLOY.md](DEPLOY.md)** - Deployment guide for local, Docker, and cloud platforms
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical architecture and implementation details
- **[SETUP.md](SETUP.md)** - Detailed development environment setup
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Guidelines for contributing to the project
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes
- **[SECURITY.md](SECURITY.md)** - Security policy and vulnerability reporting

## 📦 Project Structure

```
dufour-app/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/      # UI components (MapComponent, RibbonToolbar, etc.)
│   │   ├── services/        # Business logic (military symbols, file import)
│   │   ├── layers/          # Custom map layers (MilitaryLayer)
│   │   ├── store/           # Redux state management
│   │   ├── i18n/            # Translations (EN, DE, FR, IT)
│   │   ├── config/          # App configuration
│   │   └── styles/          # CSS styles
│   └── package.json
├── qgis-server/             # QGIS Server configuration
│   ├── projects/            # QGIS project files
│   └── plugins/             # QGIS plugins
├── postgis/                 # PostgreSQL/PostGIS initialization
├── nginx/                   # Nginx configuration
├── docker-compose.yml       # Development environment
├── docker-compose.prod.yml  # Production environment
└── render.yaml              # Render.com deployment config
```

## ✨ Key Features

### Map Functionality
- **Swiss Base Maps**: Pixelkarte, Landeskarte, Luftbild, Swissimage
- **Search**: Locations, addresses, coordinates (SwissGrid, WGS84)
- **Measurement**: Distance, area, azimuth
- **Import/Export**: GeoJSON, KML, GPX, local files
- **Print**: PDF export with custom templates

### Military Operations
- **ORBAT Manager**: Order of Battle organization and visualization
- **Military Symbols**: APP-6/MIL-STD-2525 compliant symbology
- **Scenario Planning**: Create and manage operational scenarios
- **Temporal Control**: Timeline-based visualization

### Advanced Tools
- **Redlining**: Draw and annotate features on map
- **Terrain Analysis**: Slope, hillshade, 3D visualization
- **Grid System**: Swiss military grid overlay
- **Layer Management**: Toggle and organize map layers

## 🌍 Localization

The application supports multiple languages:
- **English** (en-US)
- **German** (de-CH)
- **French** (fr-FR)
- **Italian** (it-IT)

Translation files are located in `frontend/src/i18n/`.

## 🔧 Configuration

### Application Settings

Edit `frontend/src/config/appConfig.js`:

```javascript
export const appConfig = {
  defaultLocale: 'en-US',
  defaultCenter: [2660000, 1190000], // Swiss coordinates
  defaultZoom: 8,
  defaultBasemap: 'pixelkarte',
  enableMilitaryFeatures: true
};
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository (https://github.com/mlanini/dufour-app)
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

For major changes, please open an issue first to discuss what you would like to change.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and development process.

## 📄 License

This project is licensed under the BSD 2-Clause License - see the [LICENSE](LICENSE) file for details.

**Copyright (c) 2026 INTELLIGEO.ch**

## 🙏 Acknowledgments

- Inspired by **KADAS Albireo** (Swiss Army GIS)
- Built with **OpenLayers** and **React**
- Swiss geodata from **geo.admin.ch**
- Military symbology based on **MIL-STD-2525** standard

## 📧 Contact

- **Repository**: https://github.com/mlanini/dufour-app
- **Issues**: https://github.com/mlanini/dufour-app/issues
- **Author**: [@mlanini](https://github.com/mlanini)

For questions or support, please open an issue on GitHub.

---

**Status**: Active Development | **Version**: 0.1.0 | **Last Updated**: March 2026
[
  {
    "title": "SwissTopo National Map",
    "name": "ch.swisstopo.pixelkarte-farbe",
    "layerSourceType": "wmts",
    "sourceOptions": {
      "url": "https://wmts.geo.admin.ch/1.0.0/{Layer}/default/current/3857/{TileMatrix}/{TileRow}/{TileCol}.{Format}",
      "layer": "ch.swisstopo.pixelkarte-farbe",
      "format": "jpeg"
    }
  }
]
```

### Plugins

Enable/disable plugins in `frontend/src/config/appConfig.js`:

```javascript
export default {
  plugins: [
    'Map',
    'Redlining',
    'Measure',
    'LayerTree',
    'Search',
    'Print',
    'GPXImport',
    'TerrainAnalysis',
    'MilitarySymbols'
  ]
}
```

## 🌍 Internationalization

Supported languages:
- 🇺🇸 English (en_US)
- 🇨🇭 German (de_CH)
- 🇫🇷 French (fr_FR)
- 🇮🇹 Italian (it_IT)

Add translations in `frontend/src/i18n/`.

## 📚 Documentation

- [User Guide](docs/user-guide.md) - For end users
- [Developer Guide](docs/developer-guide.md) - For contributors
- [Plugin Development](docs/plugin-development.md) - Creating custom plugins
- [Deployment Guide](docs/deployment.md) - Production deployment

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

Built on top of excellent open-source projects:
- [QWC2](https://github.com/qgis/qwc2) - QGIS Web Client
- [QGIS Server](https://qgis.org) - Geospatial server
- [ORBAT Mapper](https://github.com/orbat-mapper/orbat-mapper) - Military symbology
- [OpenLayers](https://openlayers.org) - Web mapping library
- [PostGIS](https://postgis.net) - Spatial database

Inspired by [KADAS Albireo](https://github.com/kadas-albireo/kadas-albireo2) by the Swiss Armed Forces.

## 📧 Contact

For questions and support, please open an issue on GitHub.

---

**Status**: 🚧 Proof of Concept in Development
