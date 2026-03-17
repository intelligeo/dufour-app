# 🗺️ Dufour API Guide# 🗺️ Dufour API Documentation



Middleware API for **[Dufour.app](https://dufour.app)** — a web-based GIS## Overview

platform built on [QWC2](https://github.com/qgis/qwc2) (QGIS Web Client 2).

The Dufour Middleware API is a FastAPI-based service for managing QGIS projects, PostGIS spatial data, and **military symbol rendering**. It provides endpoints for uploading projects, migrating layers, serving maps via OGC WMS, and rendering NATO military symbols (APP-6D / MIL-STD-2525C) through an embedded milsymbol server.

| Environment | Base URL |

|-------------|----------|## 📚 Interactive Documentation

| Production  | `https://api.intelligeo.net` |

| Local dev   | `http://localhost:3000` |### Swagger UI (Recommended)

**URL:** `https://api.intelligeo.net/docs`

---

- Interactive API explorer

## 📚 Interactive Documentation- Try endpoints directly in browser

- Request/response examples

| Format | URL | Best for |- Schema validation

|--------|-----|----------|

| **Swagger UI** | [`/docs`](https://api.intelligeo.net/docs) | Try endpoints in the browser |### ReDoc (Alternative)

| **ReDoc** | [`/redoc`](https://api.intelligeo.net/redoc) | Clean, readable reference |**URL:** `https://api.intelligeo.net/redoc`

| **OpenAPI JSON** | [`/openapi.json`](https://api.intelligeo.net/openapi.json) | Import into Postman / generate SDKs |

- Clean, three-panel layout

---- Better for reading documentation

- Printable format

## 🚀 Quick Start

### OpenAPI Specification

### 1. Health Check**URL:** `https://api.intelligeo.net/openapi.json`



```bash- Machine-readable API spec

curl https://api.intelligeo.net/- Import into Postman/Insomnia

```- Generate client SDKs



```json---

{ "status": "online", "service": "Dufour Middleware API", "version": "1.0.0" }

```## 🚀 Quick Start



### 2. List Projects### 1. Check API Health



```bash```bash

curl https://api.intelligeo.net/api/projectscurl https://api.intelligeo.net/

``````



### 3. Upload a Project with Companion Data**Response:**

```json

```bash{

curl -X POST https://api.intelligeo.net/api/projects \  "status": "online",

  -F 'name=my_project' \  "service": "Dufour Middleware API",

  -F 'title=My Project' \  "version": "1.0.0"

  -F 'description=Swiss data' \}

  -F 'is_public=true' \```

  -F 'file=@project.qgz' \

  -F 'data_files=@data.gpkg'### 2. List Projects

```

```bash

The upload flow:curl https://api.intelligeo.net/api/projects

```

1. **Validation** — file extension, size ≤ 50 MB, name format

2. **Parsing** — extract layer metadata from `.qgz` XML**Response:**

3. **Schema creation** — `prj_<name>` schema + `project` / `project_layers````json

4. **Feature extraction** — for each companion file that matches a layer[

   datasource, a PostGIS table `lyr_<layer>` is created with original SRID  {

5. **Datasource rewrite** — the `.qgs` XML inside the `.qgz` is rewritten    "id": "550e8400-e29b-41d4-a716-446655440000",

   so layers point to PostGIS instead of local files    "name": "swiss_municipalities",

6. **Storage** — repackaged `.qgz` stored as `BYTEA` in `public.projects`    "title": "Swiss Municipalities",

    "description": "Administrative boundaries",

### 4. View on the Map    "is_public": true,

    "crs": "EPSG:2056",

```bash    "extent": [2485000, 1075000, 2834000, 1295000],

# GetCapabilities    "created_at": "2024-03-09T10:30:00Z"

curl "https://api.intelligeo.net/api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetCapabilities"  }

]

# GetMap (PNG)```

curl -o map.png "https://api.intelligeo.net/api/projects/my_project/wms?\

SERVICE=WMS&REQUEST=GetMap&LAYERS=parcels&\### 3. Upload QGIS Project

BBOX=2485000,1075000,2834000,1295000&WIDTH=800&HEIGHT=600&\

SRS=EPSG:2056&FORMAT=image/png"```bash

```curl -X POST "https://api.intelligeo.net/api/projects" \

  -F "name=my_project" \

---  -F "title=My Awesome Project" \

  -F "description=Contains Swiss data" \

## 📋 Endpoint Reference  -F "is_public=true" \

  -F "file=@project.qgz"

### System```



| Method | Endpoint | Description |**Response:**

|--------|----------|-------------|```json

| GET | `/` | Health check |{

| GET | `/api/status` | Detailed status (DB, QGIS Server, milsymbol) |  "success": true,

  "project": {

### Projects    "id": "uuid-here",

    "name": "my_project",

| Method | Endpoint | Description |    "title": "My Awesome Project",

|--------|----------|-------------|    "layers_count": 5,

| GET | `/api/projects` | List all projects |    "qgz_size": 1234567

| GET | `/api/projects/{name}` | Get project details + layers |  },

| POST | `/api/projects` | Upload `.qgz` + optional companion files |  "migration": {

| POST | `/api/projects/publish` | Publish project (simple upload) |    "total_layers": 5,

| DELETE | `/api/projects/{name}` | Delete project + schema |    "migrated": 4,

    "failed": 1,

### WMS Proxy    "details": [...]

  }

| Method | Endpoint | Description |}

|--------|----------|-------------|```

| GET/POST | `/api/projects/{name}/wms` | OGC WMS proxy (all request types) |

| GET | `/api/projects/{name}/thumbnail` | Auto-generated map thumbnail |---



### Data Management## 📋 API Endpoints



| Method | Endpoint | Description |### System

|--------|----------|-------------|

| POST | `/api/databases/{db}/tables` | Create PostGIS table || Method | Endpoint | Description |

| POST | `/api/databases/{db}/tables/{table}/upload` | Bulk upload features ||--------|----------|-------------|

| GET | `/api/databases/{db}/tables` | List tables || GET | `/` | Health check |

| GET | `/api/status` | Detailed system status |

### QWC2 Integration

### Projects

| Method | Endpoint | Description |

|--------|----------|-------------|| Method | Endpoint | Description |

| GET | `/themes.json` | Full QWC2 theme configuration (consumed by frontend) ||--------|----------|-------------|

| GET | `/api/v1/themes` | List QWC2 themes || GET | `/api/projects` | List all projects |

| GET | `/api/v1/themes/{name}` | Get single theme config || GET | `/api/projects/{name}` | Get project details |

| POST | `/api/projects` | Upload and migrate project |

### Military Symbols 🎖️| POST | `/api/projects/publish` | Publish project (simple) |

| DELETE | `/api/projects/{name}` | Delete project |

| Method | Endpoint | Description |

|--------|----------|-------------|### Data Management

| GET | `/api/symbols/health` | Milsymbol server health & cache stats |

| GET | `/api/symbols/{SIDC}.{svg\|png}` | Render single symbol || Method | Endpoint | Description |

| POST | `/api/symbols/batch` | Batch render (up to 100 symbols) ||--------|----------|-------------|

| GET | `/api/symbols/validate/{SIDC}` | Validate SIDC code || POST | `/api/databases/{db}/tables` | Create PostGIS table |

| DELETE | `/api/symbols/cache` | Clear server-side LRU cache || POST | `/api/databases/{db}/tables/{table}/upload` | Bulk upload features |

| GET | `/api/databases/{db}/tables` | List tables |

### Print Composition 🖨️

### WMS Proxy

| Method | Endpoint | Description |

|--------|----------|-------------|| Method | Endpoint | Description |

| POST | `/api/print/compose` | Compose map with symbol overlays → PNG ||--------|----------|-------------|

| GET | `/api/projects/{name}/wms` | WMS proxy (GetCapabilities, GetMap, etc.) |

### Authentication 🔐

### QWC2 Integration

| Method | Endpoint | Description |

|--------|----------|-------------|| Method | Endpoint | Description |

| POST | `/api/auth/login` | Obtain JWT token (OAuth2 password flow) ||--------|----------|-------------|

| GET | `/api/auth/me` | Current user info || GET | `/api/v1/themes` | List QWC2 themes |

| GET | `/api/v1/themes/{name}` | Get theme configuration |

### Admin Panel (requires `admin` role)

### Military Symbols 🎖️

| Method | Endpoint | Description |

|--------|----------|-------------|| Method | Endpoint | Description |

| GET | `/api/admin/users` | List all users ||--------|----------|-------------|

| POST | `/api/admin/users` | Create user || GET | `/api/symbols/health` | Milsymbol server health & stats |

| PATCH | `/api/admin/users/{id}` | Update user || GET | `/api/symbols/{SIDC}.{svg\|png}` | Render single symbol (SVG or PNG) |

| DELETE | `/api/admin/users/{id}` | Delete user || POST | `/api/symbols/batch` | Batch render multiple symbols |

| GET | `/api/admin/projects` | List all projects (admin view) || GET | `/api/symbols/validate/{SIDC}` | Validate SIDC code |

| DELETE | `/api/admin/projects/{name}` | Delete any project || DELETE | `/api/symbols/cache` | Clear server-side symbol cache |



### User Endpoints (requires login)### Print Composition 🖨️



| Method | Endpoint | Description || Method | Endpoint | Description |

|--------|----------|-------------||--------|----------|-------------|

| GET | `/api/user/projects` | List own projects || POST | `/api/print/compose` | Compose print map with military symbol overlays |

| GET | `/api/user/projects/{name}/health` | Project health (WMS reachability) |

---

---

## 🔧 Usage Examples

## 🔐 Authentication

### Python (httpx)

The API uses **JWT bearer tokens** (HS256, 8-hour expiry).

```python

### Loginimport httpx

from pathlib import Path

```bash

curl -X POST https://api.intelligeo.net/api/auth/login \async def upload_project():

  -d 'username=admin&password=changeme'    async with httpx.AsyncClient() as client:

```        # Read .qgz file

        qgz_path = Path("project.qgz")

```json        

{ "access_token": "eyJ...", "token_type": "bearer" }        # Upload

```        response = await client.post(

            "https://api.intelligeo.net/api/projects",

### Authenticated Requests            data={

                "name": "my_project",

```bash                "title": "My Project",

curl -H "Authorization: Bearer eyJ..." \                "is_public": True

  https://api.intelligeo.net/api/auth/me            },

```            files={

                "file": qgz_path.open("rb")

> **Note:** Public endpoints (`/api/projects`, WMS proxy, symbols, themes)            }

> do **not** require authentication.        )

        

---        return response.json()

```

## 🔧 Usage Examples

### JavaScript (fetch)

### Python (httpx)

```javascript

```pythonasync function uploadProject(file) {

import httpx  const formData = new FormData();

  formData.append('name', 'my_project');

async def upload_project():  formData.append('title', 'My Project');

    async with httpx.AsyncClient(base_url="https://api.intelligeo.net") as c:  formData.append('is_public', 'true');

        resp = await c.post(  formData.append('file', file);

            "/api/projects",  

            data={"name": "my_project", "title": "My Project", "is_public": "true"},  const response = await fetch('https://api.intelligeo.net/api/projects', {

            files=[    method: 'POST',

                ("file", open("project.qgz", "rb")),    body: formData

                ("data_files", open("data.gpkg", "rb")),  });

            ],  

        )  return response.json();

        return resp.json()}

``````



### JavaScript (fetch)### cURL (with WMS)



```javascript```bash

async function uploadProject(qgzFile, gpkgFile) {# GetCapabilities

  const form = new FormData();curl "https://api.intelligeo.net/api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetCapabilities"

  form.append("name", "my_project");

  form.append("title", "My Project");# GetMap

  form.append("is_public", "true");curl "https://api.intelligeo.net/api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=municipalities&BBOX=2485000,1075000,2834000,1295000&WIDTH=800&HEIGHT=600&SRS=EPSG:2056&FORMAT=image/png" \

  form.append("file", qgzFile);  --output map.png

  if (gpkgFile) form.append("data_files", gpkgFile);

# GetFeatureInfo

  const res = await fetch("https://api.intelligeo.net/api/projects", {curl "https://api.intelligeo.net/api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetFeatureInfo&LAYERS=municipalities&QUERY_LAYERS=municipalities&X=400&Y=300&INFO_FORMAT=application/json"

    method: "POST",```

    body: form,

  });### OpenLayers Integration

  return res.json();

}```javascript

```import Map from 'ol/Map';

import View from 'ol/View';

### OpenLayers WMS Layerimport TileLayer from 'ol/layer/Tile';

import TileWMS from 'ol/source/TileWMS';

```javascript

import TileWMS from "ol/source/TileWMS";const map = new Map({

  target: 'map',

const wmsSource = new TileWMS({  layers: [

  url: "https://api.intelligeo.net/api/projects/my_project/wms",    new TileLayer({

  params: { LAYERS: "parcels", TILED: true },      source: new TileWMS({

  serverType: "qgis",        url: 'https://api.intelligeo.net/api/projects/my_project/wms',

});        params: {

```          'LAYERS': 'municipalities',

          'TILED': true

### cURL — WMS Operations        },

        serverType: 'qgis'

```bash      })

# GetCapabilities    })

curl "https://api.intelligeo.net/api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetCapabilities"  ],

  view: new View({

# GetMap    center: [2660000, 1185000], // Swiss coordinates

curl -o map.png "https://api.intelligeo.net/api/projects/my_project/wms?\    zoom: 8,

SERVICE=WMS&REQUEST=GetMap&LAYERS=municipalities&\    projection: 'EPSG:2056'

BBOX=2485000,1075000,2834000,1295000&WIDTH=800&HEIGHT=600&\  })

SRS=EPSG:2056&FORMAT=image/png"});

```

# GetFeatureInfo

curl "https://api.intelligeo.net/api/projects/my_project/wms?\---

SERVICE=WMS&REQUEST=GetFeatureInfo&LAYERS=municipalities&\

QUERY_LAYERS=municipalities&X=400&Y=300&INFO_FORMAT=application/json"## 🔐 Authentication



# GetLegendGraphicCurrently, the API is **public** (no authentication required).

curl -o legend.png "https://api.intelligeo.net/api/projects/my_project/wms?\

SERVICE=WMS&REQUEST=GetLegendGraphic&LAYER=municipalities&FORMAT=image/png"Future versions will implement:

```- JWT token authentication

- API keys for programmatic access

---- Role-based access control (RBAC)



## 🎖️ Military Symbols---



Embedded [milsymbol](https://github.com/spatialillusions/milsymbol) server## 📏 Limits

renders both **APP-6D** (20 char) and **MIL-STD-2525C** (15 char) SIDCs.

| Resource | Limit | Notes |

### Single Symbol|----------|-------|-------|

| File upload | 50 MB | .qgz files only |

```bash| Request timeout | 30 seconds | Configurable per deployment |

# APP-6D (SVG)| Rate limiting | None | Production will implement |

curl https://api.intelligeo.net/api/symbols/10031000001101001500.svg| Project count | Unlimited | Limited by database storage |



# 2525C with modifiers (PNG)---

curl -o unit.png "https://api.intelligeo.net/api/symbols/SFG-UCI---.png?\

size=200&uniqueDesignation=1/INF"## 🐛 Error Handling

```

All endpoints return standard HTTP status codes:

### Modifier Query Parameters

| Code | Meaning | Example |

| Param | Type | Description ||------|---------|---------|

|-------|------|-------------|| 200 | Success | Request completed |

| `size` | int | Symbol size (px) || 400 | Bad Request | Invalid file type, malformed data |

| `uniqueDesignation` | string | Unit designation || 404 | Not Found | Project doesn't exist |

| `higherFormation` | string | Higher formation || 500 | Server Error | Database connection failed |

| `direction` | number | Direction of movement (°) |

| `speed` | string | Speed indicator |**Error Response Format:**

| `quantity` | string | Quantity |```json

| `staffComments` | string | Staff comments |{

| `specialHeadquarters` | string | HQ marker |  "detail": "Project not found"

| `square` | bool | Force square bounding box |}

```

### Batch Render

---

```bash

curl -X POST https://api.intelligeo.net/api/symbols/batch \## 🗺️ Coordinate Systems

  -H "Content-Type: application/json" \

  -d '{### Supported CRS:

    "symbols": [- **EPSG:2056** (Swiss LV95) - Recommended for Switzerland

      {"sidc": "10031000001101001500"},- **EPSG:4326** (WGS84) - GPS coordinates

      {"sidc": "SFG-UCI---", "uniqueDesignation": "HQ"}- **EPSG:3857** (Web Mercator) - Web maps

    ],

    "format": "svg",### Extent Format:

    "defaultSize": 80All extents are `[xmin, ymin, xmax, ymax]` in the project's CRS.

  }'

```**Example (Switzerland in LV95):**

```json

### Validate SIDC[2485000, 1075000, 2834000, 1295000]

```

```bash

curl https://api.intelligeo.net/api/symbols/validate/10031000001101001500---

```

## 🧪 Testing

```json

{ "sidc": "10031000001101001500", "valid": true, "format": "APP-6D", "dimension": "Ground" }### Using Swagger UI:

```1. Navigate to `https://api.intelligeo.net/docs`

2. Click on any endpoint

### Caching3. Click "Try it out"

4. Fill in parameters

- **Server**: LRU cache (512 entries) in FastAPI proxy5. Click "Execute"

- **Browser**: `Cache-Control: public, max-age=86400` (24 h)6. View response



---### Using Postman:

1. Import OpenAPI spec: `https://api.intelligeo.net/openapi.json`

## 🖨️ Print Composition2. All endpoints appear in collection

3. Edit parameters and execute

Overlay military symbols on a QGIS Server base map and return a composite PNG.

### Using httpie:

```bash```bash

curl -X POST https://api.intelligeo.net/api/print/compose \# Install httpie

  -H "Content-Type: application/json" \pip install httpie

  -d '{

    "extent": {"xmin":800000,"ymin":5900000,"xmax":860000,"ymax":5960000,"crs":"EPSG:3857"},# Health check

    "width": 1200, "height": 800, "dpi": 300,http https://api.intelligeo.net/

    "project": "CHE_Basemaps", "layers": ["National_Map"],

    "symbols": [# List projects

      {"sidc":"10031000001211000000","lon":7.45,"lat":46.95,"size":48,"label":"1/52 Inf Bn"}http https://api.intelligeo.net/api/projects

    ]

  }'# Upload (form data)

```http --form POST https://api.intelligeo.net/api/projects \

  name=my_project \

### Request Fields  title="My Project" \

  is_public=true \

| Field | Required | Description |  file@project.qgz

|-------|----------|-------------|```

| `extent` | ✅ | `{xmin, ymin, xmax, ymax, crs}` |

| `symbols` | ✅ | Array of `{sidc, lon, lat, size?, label?, options?}` |---

| `project` | ❌ | QGIS project for base map |

| `layers` | ❌ | WMS layers to include |## 📊 Database Schema

| `width` / `height` | ❌ | Output size (default 1200 × 800) |

| `dpi` | ❌ | Print DPI (default 300) |### Projects Table

```sql

---CREATE TABLE projects (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

## 🏗️ Architecture    user_id UUID REFERENCES users(id),

    name VARCHAR(255) UNIQUE NOT NULL,

```    title VARCHAR(500),

┌─────────────────────────────────────────────────────┐    description TEXT,

│  QWC2 Frontend  (React + OpenLayers)                 │    is_public BOOLEAN DEFAULT false,

│  served by nginx on Render (port 10000)              │    qgz_data BYTEA,

└───────────────────────┬──────────────────────────────┘    qgz_size INTEGER,

                        │ HTTPS  /api/*  /themes.json    crs VARCHAR(50),

                        ↓    extent_minx DOUBLE PRECISION,

┌─────────────────────────────────────────────────────┐    extent_miny DOUBLE PRECISION,

│  Backend Docker Container  (Render.com, port 10000)  │    extent_maxx DOUBLE PRECISION,

│                                                      │    extent_maxy DOUBLE PRECISION,

│  ┌──────────────────────────────────────────┐       │    created_at TIMESTAMP DEFAULT NOW(),

│  │  FastAPI  (uvicorn)                      │       │    updated_at TIMESTAMP DEFAULT NOW()

│  │                                          │       │);

│  │  /api/projects/*  → CRUD + WMS proxy     │       │```

│  │  /api/symbols/*   → milsymbol proxy      │       │

│  │  /api/print/*     → Pillow composition   │       │### Project Layers Table

│  │  /api/v1/themes/* → QWC2 config builder  │       │```sql

│  │  /api/auth/*      → JWT (python-jose)    │       │CREATE TABLE project_layers (

│  │  /api/admin/*     → user CRUD            │       │    id UUID PRIMARY KEY,

│  └──────┬───────────────────┬───────────────┘       │    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

│         │                   │                        │    layer_name VARCHAR(255),

│  ┌──────▼──────┐   ┌───────▼───────────┐           │    layer_type VARCHAR(50),

│  │ milsymbol   │   │ QGIS Server       │           │    geometry_type VARCHAR(50),

│  │ Node.js 18  │   │ nginx :80 →       │           │    table_name VARCHAR(255),

│  │ :2525       │   │ spawn-fcgi :9993  │           │    datasource VARCHAR(50)

│  └─────────────┘   └──────────────────┘           │);

└──────────────────────┬───────────────────────────────┘```

                       │ SQL (sslmode=require)

                       ↓

┌─────────────────────────────────────────────────────┐## 🎖️ Military Symbols API

│  PostgreSQL 16 + PostGIS                             │

│  alwaysdata.net                                      │The Dufour API includes an embedded military symbol rendering service based on [milsymbol](https://github.com/spatialillusions/milsymbol). It supports both **APP-6D** (20-character) and **MIL-STD-2525C** (15-character) SIDC codes, with SVG and PNG output.

│                                                      │

│  public.projects        — central project catalog    │The milsymbol-server runs as a sidecar process (Node.js, port 2525) inside the same Docker container. FastAPI proxies and caches all requests.

│  public.project_layers  — layer metadata             │

│  public.users           — auth (bcrypt)              │### Render a Symbol (SVG)

│  prj_<name>.*           — per-project feature data   │

└─────────────────────────────────────────────────────┘```bash

```# APP-6D: Friendly ground infantry company

curl https://api.intelligeo.net/api/symbols/10031000001101001500.svg

---

# 2525C: Friendly ground unit with modifiers

## 📊 Database Schemacurl "https://api.intelligeo.net/api/symbols/SFG-UCI---.svg?uniqueDesignation=1/INF&size=120"

```

### `public.projects`

### Render a Symbol (PNG)

| Column | Type | Notes |

|--------|------|-------|```bash

| id | UUID PK | |curl -o symbol.png "https://api.intelligeo.net/api/symbols/SFG-UCI---.png?size=200"

| name | VARCHAR UNIQUE | lowercase alphanumeric + `_` |```

| title | VARCHAR | display name |

| description | TEXT | |### Modifier Options (Query String)

| is_public | BOOLEAN | |

| qgz_data | BYTEA | raw `.qgz` binary (max 50 MB) |All milsymbol.js modifiers are supported as query parameters:

| qgz_size | INTEGER | |

| crs | VARCHAR | e.g. `EPSG:2056` || Parameter | Type | Description | Example |

| schema_name | VARCHAR | e.g. `prj_my_project` ||-----------|------|-------------|---------|

| extent_minx … extent_maxy | DOUBLE | bounding box || `size` | int | Symbol size in pixels | `100` |

| created_at / updated_at | TIMESTAMP | || `uniqueDesignation` | string | Unit designation | `1/INF` |

| `higherFormation` | string | Higher formation text | `4th Div` |

### `public.project_layers`| `quantity` | string | Quantity indicator | `3` |

| `staffComments` | string | Staff comments | `Advancing` |

| Column | Type | Notes || `direction` | number | Direction of movement (degrees) | `90` |

|--------|------|-------|| `speed` | string | Speed indicator | `Fast` |

| id | UUID PK | || `specialHeadquarters` | string | Special HQ marker | `NATO` |

| project_id | UUID FK → projects | || `square` | bool | Force square symbol | `true` |

| layer_name | VARCHAR | |

| layer_type | VARCHAR | `vector` / `raster` |### Supported Dimensions (APP-6D)

| geometry_type | VARCHAR | `Point`, `Polygon`, … |

| source_type | VARCHAR | `gpkg`, `postgres`, `wms`, … || Char (pos 5) | Dimension | Description |

| table_name | VARCHAR | PostGIS table in `prj_*` schema ||--------------|-----------|-------------|

| datasource | VARCHAR | original or rewritten datasource || G | Ground | Land forces, equipment, installations |

| crs | VARCHAR | || A | Air | Fixed wing, rotary wing, UAV |

| features_count | INTEGER | || S | Sea Surface | Ships, boats, naval |

| U | Sea Subsurface | Submarines, mines, torpedoes |

### `public.users`| P | Space | Satellites, space stations |

| C | Cyberspace | Cyber operations, networks |

| Column | Type | Notes || F | SOF | Special Operations Forces |

|--------|------|-------|| X | Other | Activities, events, operations |

| id | UUID PK | |

| username | VARCHAR UNIQUE | |### Validate SIDC

| hashed_password | VARCHAR | bcrypt |

| role | VARCHAR | `admin` / `user` |```bash

| is_active | BOOLEAN | |curl https://api.intelligeo.net/api/symbols/validate/10031000001101001500

| created_at | TIMESTAMP | |```



### Per-project schema (`prj_<name>`)**Response:**

```json

| Table | Description |{

|-------|-------------|  "sidc": "10031000001101001500",

| `project` | project metadata row |  "valid": true,

| `project_layers` | layer metadata |  "format": "APP-6D",

| `lyr_<layer>` | PostGIS feature table with original SRID |  "dimension": "Ground"

}

---```



## 🗺️ Coordinate Systems### Batch Rendering



| EPSG | Name | Usage |Render up to 100 symbols in a single request. Efficient for ORBAT displays.

|------|------|-------|

| **2056** | Swiss LV95 | Recommended for Switzerland |```bash

| **4326** | WGS 84 | GPS, lat/lon |curl -X POST "https://api.intelligeo.net/api/symbols/batch" \

| **3857** | Web Mercator | Web map tiles |  -H "Content-Type: application/json" \

  -d '{

Extents are always `[xmin, ymin, xmax, ymax]` in the project CRS.    "symbols": [

      {"sidc": "10031000001101001500"},

---      {"sidc": "SFG-UCI---", "uniqueDesignation": "HQ"},

      {"sidc": "10061000001102001600"}

## 📏 Limits    ],

    "format": "svg",

| Resource | Limit |    "defaultSize": 80

|----------|-------|  }'

| `.qgz` upload | 50 MB |```

| Companion extensions | `.gpkg .geojson .json .shp .dbf .shx .prj .cpg .fgb .csv` |

| Batch symbols | 100 per request |**Response:**

| JWT expiry | 8 hours |```json

| Symbol cache | 512 entries (LRU) |{

  "results": [

---    {"sidc": "10031000001101001500", "content": "<base64>", "content_type": "image/svg+xml", "metadata": {"sidc_format": "APP-6D", "cached": false}},

    {"sidc": "SFG-UCI---", "content": "<base64>", "content_type": "image/svg+xml", "metadata": {"sidc_format": "2525C", "cached": false}},

## 🐛 Error Handling    {"sidc": "10061000001102001600", "content": "<base64>", "content_type": "image/svg+xml", "metadata": {"sidc_format": "APP-6D", "cached": false}}

  ],

Standard HTTP status codes with a JSON body:  "total": 3,

  "rendered": 3,

```json  "errors": 0

{ "detail": "Project not found" }}

``````



| Code | Meaning |### Symbol Health Check

|------|---------|

| 200 | Success |```bash

| 201 | Created |curl https://api.intelligeo.net/api/symbols/health

| 400 | Bad request (invalid file, name, SIDC, …) |```

| 401 | Unauthorized (missing or expired JWT) |

| 403 | Forbidden (insufficient role) |**Response:**

| 404 | Not found |```json

| 500 | Internal server error |{

  "online": true,

---  "url": "http://localhost:2525",

  "status": "online",

## 🔧 Environment Variables  "service": "dufour-milsymbol-server",

  "version": "1.0.0",

```env  "cache": {"size": 42, "max_size": 512},

# Database  "config": {"default_format": "APP-6D", "default_size": 100}

POSTGIS_HOST=postgresql-intelligeo.alwaysdata.net}

POSTGIS_PORT=5432```

POSTGIS_DB=intelligeo_dufour

POSTGIS_USER=intelligeo_dufour### Clear Symbol Cache

POSTGIS_PASSWORD=***

```bash

# QGIS Server (embedded, set by Dockerfile)curl -X DELETE https://api.intelligeo.net/api/symbols/cache

QGIS_SERVER_URL=http://localhost:80/qgis```



# Milsymbol (embedded)### Caching Behavior

MILSYMBOL_SERVER_URL=http://localhost:2525

MILSYMBOL_PORT=2525- **Server-side**: LRU cache (512 entries) in FastAPI proxy

MILSYMBOL_DEFAULT_SIZE=100- **Client-side**: LRU cache (1024 entries) in browser via `symbolService.js`

DEFAULT_SIDC_FORMAT=APP-6D- **HTTP headers**: `Cache-Control: public, max-age=86400` (24h browser/CDN caching)

SYMBOL_CACHE_SIZE=512

---

# Auth

JWT_SECRET_KEY=***## 🖨️ Print Composition API



# Render.comCompose print-ready maps by overlaying military symbols on QGIS Server base maps.

PORT=10000

LOG_LEVEL=INFO### POST `/api/print/compose`

```

```bash

---curl -X POST "https://api.intelligeo.net/api/print/compose" \

  -H "Content-Type: application/json" \

## 📦 Local Development  -d '{

    "extent": {

```bash      "xmin": 800000, "ymin": 5900000,

cd backend/api      "xmax": 860000, "ymax": 5960000,

python -m venv .venv && source .venv/bin/activate   # .venv\Scripts\activate on Windows      "crs": "EPSG:3857"

pip install -r requirements.txt    },

cp .env.example .env   # fill in DB credentials + JWT secret    "width": 1200,

uvicorn main:app --reload --port 3000    "height": 800,

```    "dpi": 300,

    "project": "CHE_Basemaps",

---    "layers": ["National_Map"],

    "symbols": [

## 🧪 Testing      {

        "sidc": "10031000001211000000",

```bash        "lon": 7.45, "lat": 46.95,

cd backend/api        "size": 48, "label": "1/52 Inf Bn"

pytest                          # all tests      },

pytest tests/test_qgz_parser.py # single module      {

pytest -k "test_upload"         # by name        "sidc": "10061000001102001600",

```        "lon": 7.60, "lat": 47.05,

        "size": 48, "label": "2 Arm Coy"

### Using Swagger UI      }

    ]

1. Open `https://api.intelligeo.net/docs`  }'

2. Click an endpoint → **Try it out** → **Execute**```

3. For auth endpoints, click the 🔒 icon and paste a JWT token

**Response:** PNG image (`image/png`)

### Using Postman

### Print Composition Process

Import the OpenAPI spec from `https://api.intelligeo.net/openapi.json`.

1. Fetches base map from QGIS Server via WMS `GetMap`

---2. Fetches all military symbols from milsymbol-server (in parallel)

3. Converts WGS84 lon/lat → pixel coordinates for the given extent

## 🤝 Contributing4. Overlays symbols using Pillow image composition

5. Adds text labels with shadow below each symbol

1. Fork → feature branch → PR6. Returns a composite PNG at the requested DPI

2. Follow existing code style

3. Add tests for new endpoints### Print Request Fields



---| Field | Type | Required | Default | Description |

|-------|------|----------|---------|-------------|

## 📝 License| `extent` | object | ✅ | — | Map extent (`xmin`, `ymin`, `xmax`, `ymax`, `crs`) |

| `width` | int | ❌ | 1200 | Output width in pixels |

BSD 2-Clause — see [LICENSE](../../LICENSE).| `height` | int | ❌ | 800 | Output height in pixels |

| `dpi` | int | ❌ | 300 | DPI for print quality |

---| `project` | string | ❌ | — | QGIS project name for base map |

| `layers` | array | ❌ | — | WMS layers to include |

## 🔗 Links| `symbols` | array | ✅ | — | Array of `SymbolOverlay` objects |



- [Dufour.app](https://dufour.app)### SymbolOverlay Fields

- [GitHub](https://github.com/intelligeo/dufour-app)

- [FastAPI](https://fastapi.tiangolo.com/)| Field | Type | Required | Default | Description |

- [QGIS Server](https://docs.qgis.org/latest/en/docs/server_manual/)|-------|------|----------|---------|-------------|

- [PostGIS](https://postgis.net/documentation/)| `sidc` | string | ✅ | — | SIDC code (APP-6D or 2525C) |

- [milsymbol](https://github.com/spatialillusions/milsymbol)| `lon` | float | ✅ | — | WGS84 longitude |

- [QWC2](https://github.com/qgis/qwc2)| `lat` | float | ✅ | — | WGS84 latitude |

| `size` | int | ❌ | 48 | Symbol size in pixels |
| `label` | string | ❌ | — | Text label below symbol |
| `options` | object | ❌ | — | Additional milsymbol options |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                             │
│  ┌───────────────┐ ┌──────────────┐ ┌─────────────┐│
│  │ OpenLayers    │ │ milsymbol.js │ │ ORBAT       ││
│  │ Map           │ │ (client-side)│ │ Manager     ││
│  └───────┬───────┘ └──────┬───────┘ └──────┬──────┘│
│          │                │                 │        │
│          │   symbolService.js (LRU cache)   │        │
│          └────────────┬─────────────────────┘        │
└───────────────────────┼──────────────────────────────┘
                        │ HTTPS
                        ↓
┌─────────────────────────────────────────────────────┐
│  Nginx Reverse Proxy                                 │
└───────────────────────┼──────────────────────────────┘
                        │ /api/*
                        ↓
┌─────────────────────────────────────────────────────┐
│  Docker Container (Render.com)                       │
│                                                      │
│  ┌───────────────────────────────────────────┐      │
│  │  FastAPI Middleware (:3000)                │      │
│  │                                           │      │
│  │  /api/symbols/* ──→ Milsymbol Server      │      │
│  │  /api/print/*   ──→ Print Service + Pillow│      │
│  │  /api/projects/*/wms ──→ QGIS Server      │      │
│  └──────┬─────────────────────┬──────────────┘      │
│         │                     │                      │
│  ┌──────▼──────┐  ┌──────────▼──────────┐          │
│  │ milsymbol   │  │ QGIS Server         │          │
│  │ server      │  │ (:8080)             │          │
│  │ Node.js     │  │ WMS/WFS/WMTS        │          │
│  │ (:2525)     │  │                     │          │
│  └─────────────┘  └─────────────────────┘          │
└──────────────────────┼───────────────────────────────┘
                       │ SQL
                       ↓
┌─────────────────────────────────────────────────────┐
│  PostgreSQL 16 + PostGIS (alwaysdata.net)            │
│  Projects (BYTEA) + Spatial Data + ORBAT Storage     │
└─────────────────────────────────────────────────────┘
```

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

# Milsymbol Server (embedded sidecar)
MILSYMBOL_SERVER_URL=http://localhost:2525
MILSYMBOL_PORT=2525
MILSYMBOL_DEFAULT_SIZE=100
DEFAULT_SIDC_FORMAT=APP-6D
SYMBOL_CACHE_SIZE=512
```

---

## 📦 Installation

### Local Development

```bash
# Clone repository
git clone https://github.com/intelligeo/dufour-app.git
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

- **Documentation:** https://github.com/intelligeo/dufour-app
- **Issues:** https://github.com/intelligeo/dufour-app/issues
- **Email:** support@dufour-app.ch

---

## 🔗 Related Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [QGIS Server Guide](https://docs.qgis.org/latest/en/docs/server_manual/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [OGC WMS Standard](https://www.ogc.org/standards/wms)
- [OpenLayers API](https://openlayers.org/en/latest/apidoc/)
