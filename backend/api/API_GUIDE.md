# 🗺️ Dufour API Documentation

## Overview

The Dufour Middleware API is a FastAPI-based service for managing QGIS projects and PostGIS spatial data. It provides endpoints for uploading projects, migrating layers, and serving maps via OGC WMS.

## 📚 Interactive Documentation

### Swagger UI (Recommended)
**URL:** `https://dufour-api.onrender.com/docs`

- Interactive API explorer
- Try endpoints directly in browser
- Request/response examples
- Schema validation

### ReDoc (Alternative)
**URL:** `https://dufour-api.onrender.com/redoc`

- Clean, three-panel layout
- Better for reading documentation
- Printable format

### OpenAPI Specification
**URL:** `https://dufour-api.onrender.com/openapi.json`

- Machine-readable API spec
- Import into Postman/Insomnia
- Generate client SDKs

---

## 🚀 Quick Start

### 1. Check API Health

```bash
curl https://dufour-api.onrender.com/
```

**Response:**
```json
{
  "status": "online",
  "service": "Dufour Middleware API",
  "version": "1.0.0"
}
```

### 2. List Projects

```bash
curl https://dufour-api.onrender.com/api/projects
```

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "swiss_municipalities",
    "title": "Swiss Municipalities",
    "description": "Administrative boundaries",
    "is_public": true,
    "crs": "EPSG:2056",
    "extent": [2485000, 1075000, 2834000, 1295000],
    "created_at": "2024-03-09T10:30:00Z"
  }
]
```

### 3. Upload QGIS Project

```bash
curl -X POST "https://dufour-api.onrender.com/api/projects" \
  -F "name=my_project" \
  -F "title=My Awesome Project" \
  -F "description=Contains Swiss data" \
  -F "is_public=true" \
  -F "file=@project.qgz"
```

**Response:**
```json
{
  "success": true,
  "project": {
    "id": "uuid-here",
    "name": "my_project",
    "title": "My Awesome Project",
    "layers_count": 5,
    "qgz_size": 1234567
  },
  "migration": {
    "total_layers": 5,
    "migrated": 4,
    "failed": 1,
    "details": [...]
  }
}
```

---

## 📋 API Endpoints

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/api/status` | Detailed system status |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/{name}` | Get project details |
| POST | `/api/projects` | Upload and migrate project |
| POST | `/api/projects/publish` | Publish project (simple) |
| DELETE | `/api/projects/{name}` | Delete project |

### Data Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/databases/{db}/tables` | Create PostGIS table |
| POST | `/api/databases/{db}/tables/{table}/upload` | Bulk upload features |
| GET | `/api/databases/{db}/tables` | List tables |

### WMS Proxy

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/{name}/wms` | WMS proxy (GetCapabilities, GetMap, etc.) |

### QWC2 Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/themes` | List QWC2 themes |
| GET | `/api/v1/themes/{name}` | Get theme configuration |

---

## 🔧 Usage Examples

### Python (httpx)

```python
import httpx
from pathlib import Path

async def upload_project():
    async with httpx.AsyncClient() as client:
        # Read .qgz file
        qgz_path = Path("project.qgz")
        
        # Upload
        response = await client.post(
            "https://dufour-api.onrender.com/api/projects",
            data={
                "name": "my_project",
                "title": "My Project",
                "is_public": True
            },
            files={
                "file": qgz_path.open("rb")
            }
        )
        
        return response.json()
```

### JavaScript (fetch)

```javascript
async function uploadProject(file) {
  const formData = new FormData();
  formData.append('name', 'my_project');
  formData.append('title', 'My Project');
  formData.append('is_public', 'true');
  formData.append('file', file);
  
  const response = await fetch('https://dufour-api.onrender.com/api/projects', {
    method: 'POST',
    body: formData
  });
  
  return response.json();
}
```

### cURL (with WMS)

```bash
# GetCapabilities
curl "https://dufour-api.onrender.com/api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetCapabilities"

# GetMap
curl "https://dufour-api.onrender.com/api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=municipalities&BBOX=2485000,1075000,2834000,1295000&WIDTH=800&HEIGHT=600&SRS=EPSG:2056&FORMAT=image/png" \
  --output map.png

# GetFeatureInfo
curl "https://dufour-api.onrender.com/api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetFeatureInfo&LAYERS=municipalities&QUERY_LAYERS=municipalities&X=400&Y=300&INFO_FORMAT=application/json"
```

### OpenLayers Integration

```javascript
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';

const map = new Map({
  target: 'map',
  layers: [
    new TileLayer({
      source: new TileWMS({
        url: 'https://dufour-api.onrender.com/api/projects/my_project/wms',
        params: {
          'LAYERS': 'municipalities',
          'TILED': true
        },
        serverType: 'qgis'
      })
    })
  ],
  view: new View({
    center: [2660000, 1185000], // Swiss coordinates
    zoom: 8,
    projection: 'EPSG:2056'
  })
});
```

---

## 🔐 Authentication

Currently, the API is **public** (no authentication required).

Future versions will implement:
- JWT token authentication
- API keys for programmatic access
- Role-based access control (RBAC)

---

## 📏 Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| File upload | 50 MB | .qgz files only |
| Request timeout | 30 seconds | Configurable per deployment |
| Rate limiting | None | Production will implement |
| Project count | Unlimited | Limited by database storage |

---

## 🐛 Error Handling

All endpoints return standard HTTP status codes:

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Request completed |
| 400 | Bad Request | Invalid file type, malformed data |
| 404 | Not Found | Project doesn't exist |
| 500 | Server Error | Database connection failed |

**Error Response Format:**
```json
{
  "detail": "Project not found"
}
```

---

## 🗺️ Coordinate Systems

### Supported CRS:
- **EPSG:2056** (Swiss LV95) - Recommended for Switzerland
- **EPSG:4326** (WGS84) - GPS coordinates
- **EPSG:3857** (Web Mercator) - Web maps

### Extent Format:
All extents are `[xmin, ymin, xmax, ymax]` in the project's CRS.

**Example (Switzerland in LV95):**
```json
[2485000, 1075000, 2834000, 1295000]
```

---

## 🧪 Testing

### Using Swagger UI:
1. Navigate to `https://dufour-api.onrender.com/docs`
2. Click on any endpoint
3. Click "Try it out"
4. Fill in parameters
5. Click "Execute"
6. View response

### Using Postman:
1. Import OpenAPI spec: `https://dufour-api.onrender.com/openapi.json`
2. All endpoints appear in collection
3. Edit parameters and execute

### Using httpie:
```bash
# Install httpie
pip install httpie

# Health check
http https://dufour-api.onrender.com/

# List projects
http https://dufour-api.onrender.com/api/projects

# Upload (form data)
http --form POST https://dufour-api.onrender.com/api/projects \
  name=my_project \
  title="My Project" \
  is_public=true \
  file@project.qgz
```

---

## 📊 Database Schema

### Projects Table
```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    user_id UUID,
    name VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500),
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    qgz_data BYTEA,
    qgz_size INTEGER,
    crs VARCHAR(50),
    extent GEOMETRY(Polygon, 2056),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Project Layers Table
```sql
CREATE TABLE project_layers (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    layer_name VARCHAR(255),
    layer_type VARCHAR(50),
    geometry_type VARCHAR(50),
    table_name VARCHAR(255),
    datasource VARCHAR(50)
);
```

---

## 🏗️ Architecture

```
┌─────────────────────┐
│  Frontend (React)   │
│  + OpenLayers       │
└──────────┬──────────┘
           │
           │ HTTPS
           ↓
┌─────────────────────┐
│  Nginx Reverse      │
│  Proxy              │
└──────────┬──────────┘
           │
           │ /api/*
           ↓
┌─────────────────────┐
│  Dufour Middleware  │
│  API (FastAPI)      │
└──────┬──────┬───────┘
       │      │
       │      │ WMS
       │      ↓
       │  ┌─────────────┐
       │  │ QGIS Server │
       │  └─────────────┘
       │
       │ SQL
       ↓
┌─────────────────────┐
│  PostgreSQL +       │
│  PostGIS            │
└─────────────────────┘
```

---

## 🔧 Configuration

### Environment Variables

```env
# Database
POSTGIS_HOST=postgis
POSTGIS_PORT=5432
POSTGIS_DB=gis
POSTGIS_USER=gis
POSTGIS_PASSWORD=gis

# QGIS Server
QGIS_SERVER_URL=http://qgis-server:8080/cgi-bin/qgis_mapserv.fcgi

# Storage
PROJECTS_DIR=/data/projects

# API
API_HOST=0.0.0.0
API_PORT=3000
CORS_ORIGINS=https://dufour-app.onrender.com,http://localhost:5173
```

---

## 📦 Installation

### Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/dufour-app.git
cd dufour-app/backend/api

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn main:app --reload --host 0.0.0.0 --port 3000
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# API available at http://localhost:3000
# Swagger UI at http://localhost:3000/docs
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

MIT License - see [LICENSE](../../LICENSE) file for details.

---

## 🆘 Support

- **Documentation:** https://github.com/yourusername/dufour-app
- **Issues:** https://github.com/yourusername/dufour-app/issues
- **Email:** support@dufour-app.ch

---

## 🔗 Related Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [QGIS Server Guide](https://docs.qgis.org/latest/en/docs/server_manual/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [OGC WMS Standard](https://www.ogc.org/standards/wms)
- [OpenLayers API](https://openlayers.org/en/latest/apidoc/)
