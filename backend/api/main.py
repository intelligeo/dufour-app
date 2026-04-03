"""
Dufour Middleware API
FastAPI server for managing QGIS projects and PostGIS data uploads
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from fastapi.responses import JSONResponse
from typing import List, Optional
import os
import re
import logging
from pathlib import Path
import tempfile
import httpx

logger = logging.getLogger("dufour.api")

from services.project_service import ProjectService
from services.data_service import DataService
from services.qwc_service import QWCService
from services.qgis_storage_service import storage_service
from services.project_migrator import ProjectMigrator, LayerRecord
from services.symbol_service import symbol_service, validate_sidc
from services.auth_service import get_current_user
from models.schemas import ProjectResponse, TableSchema, UploadResponse
from database.connection import db
from sqlalchemy import text

# Initialize FastAPI app with OpenAPI metadata
app = FastAPI(
    title="Dufour Middleware API",
    description="""
# 🗺️ Dufour-App Backend API

Middleware API for **[Dufour.app](https://dufour.app)** — a web-based GIS platform
built on [QWC2](https://github.com/qgis/qwc2) (QGIS Web Client 2).

Provides project management, OGC WMS rendering (via embedded QGIS Server),
military symbol rendering (APP-6D / MIL-STD-2525C), and a QWC2-compatible
theme configuration layer.

---

## Core Features

| Area | Capabilities |
|------|-------------|
| **Projects** | Upload `.qgz`, auto-migrate layers to PostGIS, per-project schema (`prj_<name>`), companion data files |
| **WMS Proxy** | GetCapabilities · GetMap · GetFeatureInfo · GetLegendGraphic via embedded QGIS Server |
| **QWC2 Themes** | Dynamic `themes.json` generation, layer tree, extent & scale sets |
| **Symbols** | Single & batch rendering (SVG/PNG) of NATO APP-6D + MIL-STD-2525C SIDCs |
| **Print** | Compose print maps with military symbol overlays on QGIS base maps |
| **Auth** | JWT authentication (login, user management, admin panel) |

## Architecture

```
QWC2 Frontend (React + OpenLayers)
        ↓  HTTPS
┌───────────────────────────────────────────┐
│  Docker Container  (Render.com)           │
│                                           │
│  FastAPI (:10000)                         │
│    ├─ /api/projects/*    CRUD + WMS proxy │
│    ├─ /api/symbols/*     milsymbol proxy  │
│    ├─ /api/print/compose overlay + render │
│    ├─ /api/v1/themes/*   QWC2 config      │
│    ├─ /api/auth/*        JWT login        │
│    └─ /api/admin/*       user management  │
│                                           │
│  QGIS Server (nginx :80 → fcgi :9993)    │
│  Milsymbol Server (Node.js :2525)         │
└────────────────┬──────────────────────────┘
                 │ SQL
                 ↓
    PostgreSQL 16 + PostGIS (alwaysdata.net)
```

## Per-Project Schema

Each uploaded project gets a dedicated PostgreSQL schema `prj_<name>`:
- `project` — metadata row
- `project_layers` — one row per layer
- `lyr_<layer>` — PostGIS feature table (when companion data file is provided)

## Authentication

JWT bearer tokens via `/api/auth/login`. Admin endpoints require the `admin` role.

## Links

- [GitHub](https://github.com/intelligeo/dufour-app)
- [API Guide](https://github.com/intelligeo/dufour-app/blob/main/backend/api/API_GUIDE.md)
""",
    version="1.0.0",
    contact={
        "name": "INTELLIGEO.ch",
        "url": "https://intelligeo.ch/",
        "email": "dufour@intelligeo.ch"
    },
    license_info={
        "name": "BSD 2-Clause",
        "url": "https://github.com/intelligeo/dufour-app/blob/main/LICENSE"
    },
    openapi_tags=[
        {
            "name": "system",
            "description": "Health check and detailed status (DB, QGIS Server, milsymbol)"
        },
        {
            "name": "projects",
            "description": "QGIS project CRUD — upload `.qgz` with optional companion data files, per-project schema, publish, delete"
        },
        {
            "name": "wms",
            "description": "OGC WMS proxy — GetCapabilities, GetMap, GetFeatureInfo, GetLegendGraphic, thumbnails"
        },
        {
            "name": "data",
            "description": "PostGIS data operations — create tables, bulk feature upload, list tables"
        },
        {
            "name": "qwc2",
            "description": "QWC2 theme configuration — `themes.json`, layer tree, capabilities"
        },
        {
            "name": "symbols",
            "description": "Military symbol rendering — APP-6D / MIL-STD-2525C, SVG & PNG, batch, print composition"
        },
        {
            "name": "auth",
            "description": "JWT authentication — login, current user info"
        },
        {
            "name": "admin",
            "description": "Admin panel — user CRUD, project management (requires `admin` role)"
        },
        {
            "name": "user",
            "description": "Authenticated user endpoints — own projects, project health"
        },
        {
            "name": "debug",
            "description": "Temporary diagnostic endpoints (development only)"
        },
        {
            "name": "editing",
            "description": "QWC2 Editing API — WFS-T via REST → PostGIS. Dataset path: {project}/{lyr_table}."
        }
    ],
    swagger_ui_parameters={
        "defaultModelsExpandDepth": -1,  # Hide schemas section by default
        "docExpansion": "list",  # Expand operation list
        "filter": True,  # Enable search filter
        "syntaxHighlight.theme": "monokai"
    }
)

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://dufour-app.onrender.com",
        "https://dev.dufour.app",
        "https://map.dufour.app",
        "https://dufour.app",
        "https://www.dufour.app",
        "https://*.geo.admin.ch",
        "http://localhost:5173",
        "http://localhost:8081",
        "http://localhost"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from routers.editing import router as editing_router
app.include_router(editing_router)

# Initialize services
project_service = ProjectService()
data_service = DataService()
qwc_service = QWCService()
project_migrator = ProjectMigrator()


# ---------------------------------------------------------------------------
# DB migration on startup — apply ALTER TABLE for new columns idempotently
# so the app works even if init_schema.py was not re-run on an existing DB.
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def run_db_migrations():
    """Apply incremental DB migrations at startup (idempotent ALTER TABLE)."""
    from sqlalchemy import text as _text
    migrations = [
        # public.users — auth columns (may be missing on old DBs)
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true",
        # public.projects — per-project schema pointer
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS schema_name VARCHAR(63)",
        # public.projects — preferred basemap background layer
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS basemap VARCHAR(100)",
        # public.project_layers — enriched metadata columns
        "ALTER TABLE project_layers ADD COLUMN IF NOT EXISTS crs VARCHAR(50)",
        "ALTER TABLE project_layers ADD COLUMN IF NOT EXISTS features_count INTEGER DEFAULT 0",
        # Drop obsolete CHECK constraint that rejects 'plugin' layer_type
        "ALTER TABLE project_layers DROP CONSTRAINT IF EXISTS valid_layer_type",
        # public.password_reset_tokens — password recovery
        """CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(255) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
        )""",
    ]
    try:
        with db.get_engine().connect() as conn:
            for sql in migrations:
                try:
                    conn.execute(_text(sql))
                except Exception as exc:
                    logger.warning(f"Migration skipped ({exc}): {sql[:60]}")
            conn.commit()
        logger.info("DB migrations applied at startup")
    except Exception as exc:
        logger.error(f"DB migration error at startup: {exc}")



@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    import traceback

    # Let HTTPException flow to the dedicated handler — Starlette dispatches
    # the most-specific handler, but for safety we re-raise explicitly.
    if isinstance(exc, HTTPException):
        raise exc
    
    # Log the full error for debugging
    print(f"Global error handler caught: {type(exc).__name__}: {str(exc)}")
    print(traceback.format_exc())
    
    # Return JSON response with CORS headers
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

# HTTPException handler to ensure CORS headers on 4xx errors (404, 422, etc.)
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )


# ==================== PROJECT ENDPOINTS ====================

@app.get("/", tags=["system"])
async def root():
    """
    # API Health Check
    
    Simple endpoint to verify API is online and responsive.
    
    Returns:
        Service status, name, and version
    """
    return {
        "status": "online",
        "service": "Dufour Middleware API",
        "version": "1.0.0"
    }


@app.get("/api/projects", response_model=List[ProjectResponse], tags=["projects"])
async def list_projects():
    """
    # List All QGIS Projects
    
    Retrieve all published projects with metadata.
    
    ### Returns:
    Array of project objects containing:
    - `id`: Unique project identifier (UUID)
    - `name`: Project slug (lowercase_underscore)
    - `title`: Human-readable title
    - `description`: Project description
    - `is_public`: Visibility flag
    - `crs`: Coordinate reference system (e.g., EPSG:2056)
    - `extent`: Bounding box [xmin, ymin, xmax, ymax]
    - `created_at`: Creation timestamp
    - `updated_at`: Last modification timestamp
    
    ### Example Response:
    ```json
    [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "swiss_municipalities",
        "title": "Swiss Municipalities",
        "description": "Administrative boundaries of Switzerland",
        "is_public": true,
        "crs": "EPSG:2056",
        "extent": [2485000, 1075000, 2834000, 1295000],
        "created_at": "2024-03-09T10:30:00Z",
        "updated_at": "2024-03-09T10:30:00Z"
      }
    ]
    ```
    """
    try:
        # Read from PostgreSQL database (not filesystem)
        db_projects = storage_service.list_projects()
        projects = [ProjectResponse(**p) for p in db_projects]
        return projects
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_name}", tags=["projects"])
async def get_project(project_name: str):
    """
    # Get Project Details
    
    Retrieve detailed information for a specific project.
    
    ### Parameters:
    - `project_name`: Project identifier (e.g., "swiss_municipalities")
    
    ### Returns:
    Project object with:
    - Full metadata
    - Layer list with geometry types
    - WMS endpoint URL
    - Configuration settings
    
    ### Errors:
    - `404`: Project not found
    - `500`: Database or server error
    """
    try:
        # Search in database projects
        db_projects = storage_service.list_projects()
        project_data = next((p for p in db_projects if p['name'] == project_name), None)
        
        if not project_data:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return ProjectResponse(**project_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects", tags=["projects"])
async def upload_and_migrate_project(
    name: str = Form(..., description="Project identifier (lowercase, alphanumeric, underscore)", example="my_project"),
    title: Optional[str] = Form(None, description="Display title", example="My Awesome Project"),
    description: Optional[str] = Form(None, description="Project description"),
    is_public: bool = Form(False, description="Public visibility"),
    basemap: Optional[str] = Form(None, description="Background layer name from themes.json (e.g. 'swisstopo_national', 'osm')", example="swisstopo_national"),
    import_geoservice_layers: bool = Form(False, description="Se True, include anche i layer da geoservizi esterni (WMS/WMTS/XYZ/raster) come voci nel catalogo (senza estrazione PostGIS)"),
    file: UploadFile = File(..., description="QGIS project file (.qgz)"),
    data_files: List[UploadFile] = File(default=[], description="Companion data files (.gpkg, .geojson, .shp, …)"),
    current_user: dict = Depends(get_current_user),
):
    """
    # Upload QGIS Project

    Upload a .qgz project file.  All layers defined in the project XML are
    recorded in `project_layers` with their original datasource strings.

    ## Per-project schema

    Each upload creates (or reuses) a dedicated PostgreSQL schema named
    `prj_<name>` containing:
    - `project` — project metadata
    - `project_layers` — one row per layer
    - `lyr_<layer>` — PostGIS feature table for each vector layer whose
      companion data file is provided

    The `.qgz` binary is stored in `public.projects.qgz_data`; the row also
    carries a `schema_name` field pointing to the per-project schema.

    ## Companion Data Files

    QGIS projects often reference external data files (GeoPackage, GeoJSON,
    Shapefile, etc.) with relative paths like `./data.gpkg`. Upload these
    alongside the `.qgz` via `data_files`.  For each matching vector layer a
    PostGIS feature table `lyr_<name>` is created in the project schema with
    the original SRID (no reprojection).

    ### Example with curl
    ```bash
    curl -X POST https://api.intelligeo.net/api/projects \\
      -F 'name=my_project' \\
      -F 'title=My Project' \\
      -F 'file=@project.qgz' \\
      -F 'data_files=@data.gpkg'
    ```

    ## Workflow

    1. **Validation**: file extension, size ≤ 50 MB, name format
    2. **Parsing**: extract layer metadata from .qgz XML (QGZParser)
    3. **Schema creation**: `prj_<name>` schema + `project` / `project_layers` tables
    4. **Feature extraction** *(companion files)*: `lyr_<layer>` PostGIS tables
    5. **Storage**: `.qgz` bytes in `public.projects.qgz_data` (BYTEA)
    6. **Layer metadata**: one row per layer in `public.project_layers`

    ## Returns
    ```json
    {
      "success": true,
      "project": {
        "id": "…", "name": "…", "schema_name": "prj_…",
        "layers_count": 5, "qgz_size": 123456
      },
      "layers": [
        {
          "layer_name": "parcels", "layer_type": "vector",
          "geometry_type": "Polygon", "source_type": "gpkg",
          "crs": "EPSG:2056", "features_count": 1842,
          "table_name": "lyr_parcels"
        }
      ]
    }
    ```

    ## Errors
    - `400`: invalid file type or name format
    - `500`: parse / DB failure
    """
    import uuid
    from datetime import datetime
    from sqlalchemy import text

    # Allowed companion file extensions (metadata-only inspection)
    ALLOWED_DATA_EXTENSIONS = {
        '.gpkg', '.geojson', '.json', '.shp', '.dbf', '.shx', '.prj', '.cpg',
        '.fgb', '.csv'
    }

    try:
        # ── Companion files come from the declared data_files parameter ──
        # FastAPI natively handles List[UploadFile] — no manual form parsing needed.
        valid_data_files: List[UploadFile] = [
            f for f in (data_files or []) if f and f.filename
        ]

        logger.info(
            f"Upload request: name={name}, "
            f"companion_files={[df.filename for df in valid_data_files]} "
            f"({len(valid_data_files)} file(s))"
        )

        # Validate file extension
        if not file.filename.endswith('.qgz'):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Only .qgz files are accepted"
            )

        # Validate project name format
        if not name.replace('_', '').isalnum() or not name.islower():
            raise HTTPException(
                status_code=400,
                detail="Project name must be lowercase alphanumeric with underscores only"
            )

        # Validate companion file extensions
        for df in valid_data_files:
            ext = Path(df.filename).suffix.lower()
            if ext not in ALLOWED_DATA_EXTENSIONS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported companion file type: {df.filename}. "
                           f"Allowed: {', '.join(sorted(ALLOWED_DATA_EXTENSIONS))}"
                )

        # Save .qgz to a temp file
        temp_file = Path(tempfile.mktemp(suffix='.qgz'))
        companion_dir = None
        try:
            content = await file.read()
            if len(content) > 50 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")
            temp_file.write_bytes(content)

            # Save companion files to a temp directory
            companion_paths: List[Path] = []
            if valid_data_files:
                import tempfile as _tmp
                companion_dir = Path(_tmp.mkdtemp(prefix='qgz_companion_'))
                for df in valid_data_files:
                    df_content = await df.read()
                    dest = companion_dir / df.filename
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(df_content)
                    companion_paths.append(dest)
                    logger.info(f"Saved companion: {df.filename} ({len(df_content)} bytes)")

            # Parse project, create per-project schema, extract feature tables
            project_info, layer_records, qgz_bytes, proj_schema, milsymb_results = project_migrator.migrate_project(
                qgz_path=temp_file,
                project_name=name,
                companion_files=companion_paths if companion_paths else None,
                basemap=basemap,
                import_geoservice_layers=import_geoservice_layers,
            )
            
            # Store project in database (public.projects central catalog)
            project_id = str(uuid.uuid4())
            insert_sql = text("""
                INSERT INTO projects (
                    id, user_id, name, title, description, is_public,
                    qgz_data, qgz_size, crs, schema_name, basemap,
                    extent_minx, extent_miny, extent_maxx, extent_maxy,
                    created_at, updated_at
                )
                VALUES (
                    :id, :user_id, :name, :title, :description, :is_public,
                    :qgz_data, :qgz_size, :crs, :schema_name, :basemap,
                    :minx, :miny, :maxx, :maxy,
                    :created_at, :updated_at
                )
                ON CONFLICT (name) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    qgz_data = EXCLUDED.qgz_data,
                    qgz_size = EXCLUDED.qgz_size,
                    crs = EXCLUDED.crs,
                    schema_name = EXCLUDED.schema_name,
                    basemap = EXCLUDED.basemap,
                    extent_minx = EXCLUDED.extent_minx,
                    extent_miny = EXCLUDED.extent_miny,
                    extent_maxx = EXCLUDED.extent_maxx,
                    extent_maxy = EXCLUDED.extent_maxy,
                    updated_at = EXCLUDED.updated_at
                RETURNING id
            """)
            
            with db.get_engine().connect() as conn:
                result = conn.execute(insert_sql, {
                    'id': project_id,
                    'user_id': current_user['id'],
                    'name': name,
                    'title': title or project_info.title,
                    'description': description,
                    'is_public': is_public,
                    'qgz_data': qgz_bytes,
                    'qgz_size': len(qgz_bytes),
                    'crs': project_info.crs,
                    'schema_name': proj_schema,
                    'basemap': basemap,
                    'minx': project_info.extent[0],
                    'miny': project_info.extent[1],
                    'maxx': project_info.extent[2],
                    'maxy': project_info.extent[3],
                    'created_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow()
                })
                row = result.fetchone()
                project_id = str(row[0]) if row else project_id
                
                # Delete old layer metadata for this project (re-upload case)
                conn.execute(
                    text("DELETE FROM project_layers WHERE project_id = :pid"),
                    {'pid': project_id}
                )
                conn.commit()
            
            # Store layer metadata in public.project_layers (central catalog)
            with db.get_engine().connect() as conn:
                for rec in layer_records:
                    # Skip generic plugin layers — milsymb layers are inserted
                    # below with richer metadata from the MilSymb pipeline.
                    if rec.layer_type == 'plugin':
                        continue
                    conn.execute(text("""
                        INSERT INTO project_layers (
                            id, project_id, layer_name, layer_type,
                            geometry_type, source_type, table_name, datasource,
                            crs, features_count
                        )
                        VALUES (
                            :id, :project_id, :layer_name, :layer_type,
                            :geometry_type, :source_type, :table_name, :datasource,
                            :crs, :features_count
                        )
                    """), {
                        'id': str(uuid.uuid4()),
                        'project_id': project_id,
                        'layer_name': rec.layer_name,
                        'layer_type': rec.layer_type,
                        'geometry_type': rec.geometry_type,
                        'source_type': rec.source_type,
                        'table_name': rec.table_name or '',
                        'datasource': rec.datasource,
                        'crs': rec.crs,
                        'features_count': rec.features_count,
                    })

                # ── MilSymb layers: one project_layers row per KadasMilxLayer ──
                # Each maplayer[@type='plugin'][@name='KadasMilxLayer'] in the
                # .qgz becomes a separate project_layers row so the layer tree
                # and catalog reflect the original project structure.
                # Uses milsymb_results from the migration pipeline (already in PostGIS).
                try:
                    for mr in milsymb_results:
                        conn.execute(text("""
                            INSERT INTO project_layers (
                                id, project_id, layer_name, layer_type,
                                geometry_type, source_type, table_name, datasource,
                                crs, features_count
                            )
                            VALUES (
                                :id, :project_id, :layer_name, :layer_type,
                                :geometry_type, :source_type, :table_name, :datasource,
                                :crs, :features_count
                            )
                        """), {
                            'id': str(uuid.uuid4()),
                            'project_id': project_id,
                            'layer_name': mr['layer_title'],
                            'layer_type': 'milsymb',
                            'geometry_type': 'Mixed',
                            'source_type': 'milsymb',
                            'table_name': mr['table_name'] if mr['success'] else '',
                            'datasource': f"milsymb://{mr['layer_id']}",
                            'crs': f"EPSG:{mr['srid']}",
                            'features_count': mr['features_count'],
                        })
                    if milsymb_results:
                        logger.info(
                            f"Registered {len(milsymb_results)} MilSymb layer(s) "
                            f"in project_layers for '{name}'"
                        )
                except Exception as milsymb_err:
                    logger.warning(f"MilSymb project_layers registration failed: {milsymb_err}")

                conn.commit()

            # Generate QWC2 theme configuration (with preferred basemap)
            try:
                await qwc_service.generate_theme_config(name, basemap=basemap)
            except Exception as qwc_err:
                logger.warning(f"QWC theme generation failed (non-fatal): {qwc_err}")

            return {
                "success": True,
                "project": {
                    "id": project_id,
                    "name": name,
                    "title": title or project_info.title,
                    "description": description,
                    "is_public": is_public,
                    "crs": project_info.crs,
                    "extent": project_info.extent,
                    "schema_name": proj_schema,
                    "basemap": basemap,
                    "layers_count": len(layer_records),
                    "qgz_size": len(qgz_bytes)
                },
                "debug": {
                    "companion_files": [df.filename for df in valid_data_files],
                    "companion_paths": [str(p) for p in companion_paths],
                    "companion_files_received": len(valid_data_files),
                    "layer_records_count": len(layer_records),
                    "layers_extracted": sum(1 for r in layer_records if r.table_name),
                    "layers_failed": [r.layer_name for r in layer_records if not r.success],
                    "layer_errors": {r.layer_name: r.error for r in layer_records if r.error},
                },
                "layers": [
                    {
                        "layer_name": r.layer_name,
                        "layer_type": r.layer_type,
                        "geometry_type": r.geometry_type,
                        "source_type": r.source_type,
                        "crs": r.crs,
                        "features_count": r.features_count,
                        "table_name": r.table_name or None,
                        "success": r.success,
                        "error": r.error,
                    }
                    for r in layer_records
                ],
                "milsymb_layers": [
                    {
                        "layer_id": mr['layer_id'],
                        "layer_title": mr['layer_title'],
                        "table_name": mr['table_name'],
                        "features_count": mr['features_count'],
                        "srid": mr['srid'],
                        "success": mr['success'],
                        "error": mr.get('error'),
                    }
                    for mr in milsymb_results
                ],
            }
            
        finally:
            # Clean up temp files
            if temp_file.exists():
                temp_file.unlink()
            if companion_dir and companion_dir.exists():
                import shutil
                shutil.rmtree(companion_dir, ignore_errors=True)
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Upload and migration error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload and migrate project: {str(e)}"
        )


@app.post("/api/projects/publish", tags=["projects"])
async def publish_project(
    name: str = Form(..., description="Project name", example="my_map"),
    title: Optional[str] = Form(None, description="Display title", example="My Map"),
    description: Optional[str] = Form(None, description="Project description"),
    file: UploadFile = File(..., description=".qgs or .qgz file")
):
    """
    # Publish QGIS Project (Simple Mode)
    
    Simplified publishing for projects with PostGIS layers already configured.
    
    ### Differences from /api/projects:
    - **No migration**: Assumes layers already reference PostGIS
    - **QGIS Desktop plugin**: Designed for direct export from QGIS
    - **QWC2 theme**: Automatically generates QWC2 configuration
    
    ### Use When:
    - Layers already use PostGIS connections
    - Publishing from QGIS Desktop plugin
    - Need immediate WMS availability
    
    ### Returns:
    - Project metadata
    - WMS endpoint URL
    - QWC2 theme configuration
    
    ### Example:
    ```bash
    curl -X POST "https://api.intelligeo.net/api/projects/publish" \\
      -F "name=my_map" \\
      -F "title=My Map" \\
      -F "file=@project.qgz"
    ```
    """
    try:
        # Validate file extension
        if not file.filename.endswith(('.qgs', '.qgz')):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Only .qgs and .qgz files are accepted"
            )
        
        # Read file content
        content = await file.read()
        
        # Publish project
        result = await project_service.publish_project(
            name=name,
            title=title or name,
            description=description,
            file_content=content,
            filename=file.filename
        )
        
        # Generate QWC2 theme configuration
        await qwc_service.generate_theme_config(name)  # legacy: no basemap
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to publish project: {str(e)}")


@app.delete("/api/projects/{project_name}", tags=["projects"])
async def delete_project(project_name: str):
    """
    # Delete QGIS Project
    
    Permanently remove a project and all its associated data.
    
    ### Parameters:
    - `project_name`: Project identifier to delete
    
    ### Actions:
    - Drops the per-project PostgreSQL schema (`prj_<name>`) **with CASCADE**,
      removing all `lyr_*` feature tables and the per-schema `project_layers` table
    - Deletes layer metadata from the central `public.project_layers` catalog
    - Deletes the project record from `public.projects`
    - Removes legacy `.qgz` file from storage if present
    
    ### Returns:
    ```json
    {
      "message": "Project my_project deleted successfully"
    }
    ```
    
    ### Errors:
    - `404`: Project not found
    - `500`: Deletion failed
    
    ### Warning:
    This operation cannot be undone.
    """
    try:
        # ── 1. Fetch project metadata before deletion ─────────────────
        with db.get_engine().connect() as conn:
            row = conn.execute(
                text("SELECT id, schema_name FROM projects WHERE name = :name"),
                {'name': project_name}
            ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Project not found")

        project_id = str(row[0])
        schema_name = row[1]  # e.g. 'prj_caresg'

        # Fallback: if schema_name was never stored (old upload), derive it
        if not schema_name:
            from services.project_migrator import _schema_name as _derive_schema
            schema_name = _derive_schema(project_name)
            logger.warning(
                f"delete_project: schema_name was NULL for '{project_name}', "
                f"using derived name '{schema_name}'"
            )

        # ── 2. Drop per-project schema (CASCADE removes all lyr_* tables) ─
        if schema_name:
            with db.get_engine().connect() as conn:
                conn.execute(
                    text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE')
                )
                conn.commit()
            logger.info(f"Dropped schema: {schema_name}")

        # ── 3. Remove layer metadata from central catalog ─────────────
        with db.get_engine().connect() as conn:
            conn.execute(
                text("DELETE FROM project_layers WHERE project_id = :pid"),
                {'pid': project_id}
            )
            conn.commit()

        # ── 4. Delete from PostgreSQL database (primary storage) ──────
        deleted = storage_service.delete_project(project_name)

        # ── 5. Best-effort cleanup of legacy filesystem files ─────────
        try:
            await project_service.delete_project(project_name)
        except Exception:
            pass  # Filesystem cleanup is best-effort

        if not deleted:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"message": f"Project {project_name} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DATA UPLOAD ENDPOINTS ====================

@app.post("/api/databases/{db_name}/tables", tags=["data"])
async def create_table(
    db_name: str,
    schema: TableSchema
):
    """
    # Create PostGIS Table
    
    Create a new spatial table in PostGIS database.
    
    ### Parameters:
    - `db_name`: Target database name
    - `schema`: Table schema definition (JSON body)
    
    ### Request Body:
    ```json
    {
      "table_name": "municipalities",
      "schema_name": "public",
      "geometry_column": "geom",
      "geometry_type": "MultiPolygon",
      "srid": 2056,
      "columns": [
        {"name": "id", "type": "INTEGER", "primary_key": true},
        {"name": "name", "type": "VARCHAR(255)"},
        {"name": "population", "type": "INTEGER"}
      ]
    }
    ```
    
    ### Supported Geometry Types:
    - Point, MultiPoint
    - LineString, MultiLineString
    - Polygon, MultiPolygon
    - GeometryCollection
    
    ### SRID:
    - 2056: Swiss LV95 (recommended)
    - 4326: WGS84 (GPS coordinates)
    - 3857: Web Mercator
    
    ### Returns:
    - Table creation confirmation
    - Full table metadata
    """
    try:
        result = await data_service.create_table(db_name, schema)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/databases/{db_name}/tables/{table_name}/upload", tags=["data"])
async def upload_features(
    db_name: str,
    table_name: str,
    schema: str = Form("public", description="Database schema"),
    file: UploadFile = File(..., description="CSV data in PostgreSQL COPY format")
):
    """
    # Bulk Upload Features to PostGIS
    
    High-performance bulk insert of spatial features.
    
    ### Parameters:
    - `db_name`: Database name
    - `table_name`: Target table name
    - `schema`: Database schema (default: "public")
    - `file`: CSV file in PostgreSQL COPY format
    
    ### CSV Format:
    Must match PostgreSQL COPY format (tab-separated, WKT geometry):
    ```csv
    1	Zurich	400000	POINT(2683000 1248000)
    2	Bern	133000	POINT(2600000 1199000)
    ```
    
    ### Performance:
    - Uses PostgreSQL COPY command (fastest method)
    - ~100,000 features/second typical
    - Recommended batch size: 10,000-50,000 features
    
    ### Returns:
    ```json
    {
      "success": true,
      "inserted": 42315,
      "duration_seconds": 2.3
    }
    ```
    
    ### Use Cases:
    - QGIS plugin data export
    - Batch geocoding results
    - Migration from other databases
    """
    try:
        content = await file.read()
        
        result = await data_service.bulk_insert(
            db_name=db_name,
            schema=schema,
            table_name=table_name,
            data=content
        )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.get("/api/databases/{db_name}/tables", tags=["data"])
async def list_tables(
    db_name: str,
    schema: str = "public"
):
    """
    # List Database Tables
    
    Retrieve all tables in a database schema.
    
    ### Parameters:
    - `db_name`: Database name
    - `schema`: Schema name (default: "public")
    
    ### Returns:
    ```json
    {
      "tables": [
        {
          "table_name": "municipalities",
          "geometry_type": "MultiPolygon",
          "srid": 2056,
          "feature_count": 2352,
          "extent": [2485000, 1075000, 2834000, 1295000]
        }
      ]
    }
    ```
    
    ### Use Cases:
    - Project setup validation
    - Database inventory
    - QGIS layer discovery
    """
    try:
        tables = await data_service.list_tables(db_name, schema)
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DIAGNOSTIC ENDPOINTS (temporary) ====================

@app.get("/api/diag/fiona", tags=["debug"])
async def diagnose_fiona():
    """
    Verify that fiona + GDAL are working correctly in this environment.
    Returns fiona version, supported drivers, and a test open result.
    No authentication required (diagnostic tool).
    """
    result: dict = {"ok": False, "fiona_version": None, "gdal_version": None,
                    "drivers": [], "test_open": None, "error": None}
    try:
        import fiona
        result["fiona_version"] = fiona.__version__
        gdal_ver = fiona.gdal_version
        result["gdal_version"] = str(gdal_ver) if gdal_ver is not None else None
        result["drivers"] = list(fiona.supported_drivers.keys())[:30]  # first 30
        result["GPKG_supported"] = "GPKG" in fiona.supported_drivers
        # Minimal GPKG write+read test to confirm GDAL linkage is functional
        try:
            import tempfile, os
            from fiona.crs import from_epsg
            schema = {"geometry": "Point", "properties": {"id": "int"}}
            with tempfile.NamedTemporaryFile(suffix=".gpkg", delete=False) as tmp:
                tmp_path = tmp.name
            with fiona.open(tmp_path, "w", driver="GPKG", schema=schema,
                            crs=from_epsg(4326)) as dst:
                dst.write({"geometry": {"type": "Point", "coordinates": [7.0, 47.0]},
                           "properties": {"id": 1}})
            with fiona.open(tmp_path, "r") as src:
                feat_count = len(src)
            os.unlink(tmp_path)
            result["test_open"] = f"OK ({feat_count} feature)"
        except Exception as te:
            result["test_open"] = f"FAILED: {te}"
        result["ok"] = True
    except Exception as e:
        result["error"] = str(e)
    return result


@app.get("/api/projects/{project_name}/diagnose", tags=["debug"])
async def diagnose_project(project_name: str):
    """Temporary diagnostic endpoint: inspect .qgz datasources and PostGIS tables."""
    import zipfile, io, xml.etree.ElementTree as ET
    result = {"project": project_name, "layers": [], "tables": [], "errors": []}
    qgz_bytes = None

    # 1. Inspect .qgz from DB
    try:
        qgz_bytes = storage_service.retrieve_qgz(project_name)
        if not qgz_bytes:
            result["errors"].append("No .qgz found in DB")
        else:
            result["qgz_size"] = len(qgz_bytes)
            with zipfile.ZipFile(io.BytesIO(qgz_bytes)) as zf:
                result["qgz_files"] = zf.namelist()
                qgs_files = [n for n in zf.namelist() if n.endswith('.qgs')]
                if qgs_files:
                    with zf.open(qgs_files[0]) as f:
                        tree = ET.parse(f)
                    root_xml = tree.getroot()
                    for ml in root_xml.iter('maplayer'):
                        layer_name = ml.findtext('layername', '')
                        ds = ml.findtext('datasource', '') or ''
                        provider = ml.findtext('provider', '')
                        result["layers"].append({
                            "name": layer_name,
                            "provider": provider,
                            "datasource_preview": ds[:200],
                        })
    except Exception as e:
        result["errors"].append(f"qgz inspection: {e}")

    # 2. Check PostGIS tables in prj_<name> schema
    try:
        schema = f"prj_{project_name}"
        with db.get_engine().connect() as conn:
            rows = conn.execute(text(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = :s"
            ), {"s": schema}).fetchall()
            result["tables"] = [r[0] for r in rows]
    except Exception as e:
        result["errors"].append(f"schema check: {e}")

    # 3. Check QGIS Server connectivity — ensure .qgz is on disk first
    try:
        import httpx
        temp_dir = Path(tempfile.gettempdir()) / 'dufour_qgis_projects'
        temp_dir.mkdir(exist_ok=True)
        temp_path = temp_dir / f"{project_name}.qgz"

        # Write .qgz to disk if not already cached (same as wms_proxy)
        if qgz_bytes and (not temp_path.exists() or temp_path.stat().st_size != len(qgz_bytes)):
            temp_path.write_bytes(qgz_bytes)
            result["qgz_written_to_disk"] = True

        result["qgz_on_disk"] = temp_path.exists()
        if temp_path.exists():
            result["qgz_disk_size"] = temp_path.stat().st_size

        async with httpx.AsyncClient(timeout=10.0) as client:
            cap_url = f"http://localhost:80/qgis?MAP={temp_path}&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"
            resp = await client.get(cap_url)
            result["qgis_status"] = resp.status_code
            result["qgis_response_preview"] = resp.text[:500]
    except Exception as e:
        result["errors"].append(f"QGIS Server check: {e}")

    return result


# ==================== QWC ENDPOINTS ====================

@app.get("/themes.json", tags=["qwc2"])
async def get_themes_json(request: Request):
    """
    # QWC2 Themes Configuration

    Generate a full QWC2-compatible themes.json dynamically from stored projects.
    This endpoint is consumed by QWC2 StandardApp at startup.

    ### Returns:
    Complete QWC2 themes.json with:
    - Theme items (one per uploaded QGIS project)
    - Background layers (ArcGIS, SwissTopo, OSM)
    - Default scales, CRS, print settings
    """
    try:
        # Derive public API base URL from the incoming request so that WMS,
        # GeoJSON and symbol URLs resolve correctly regardless of whether
        # themes.json is fetched directly or via the nginx reverse proxy.
        api_base_url = str(request.base_url).rstrip("/")
        # When behind the nginx proxy the Host header is rewritten to
        # "api.intelligeo.net" — use it.  Fall back to env var or empty.
        forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        forwarded_proto = request.headers.get("x-forwarded-proto", "https")
        if forwarded_host:
            api_base_url = f"{forwarded_proto}://{forwarded_host}"
        else:
            api_base_url = os.getenv("API_PUBLIC_URL", "").rstrip("/")
        themes = await qwc_service.generate_full_themes_json(api_base_url)
        return JSONResponse(content=themes)
    except Exception as e:
        logger.error(f"Error generating themes.json: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/themes", tags=["qwc2"])
async def list_themes():
    """
    # List QWC2 Themes
    
    Retrieve all available QWC2 themes (projects).
    
    ### QWC2 Compatibility:
    This endpoint mimics QWC2 themes.json format for frontend compatibility.
    
    ### Returns:
    ```json
    {
      "themes": [
        {
          "id": "swiss_municipalities",
          "title": "Swiss Municipalities",
          "thumbnail": "thumb.png",
          "wms_url": "https://api.intelligeo.net/api/projects/swiss_municipalities/wms"
        }
      ]
    }
    ```
    
    ### Use Cases:
    - QWC2 frontend theme picker
    - Project discovery
    - Map catalog
    """
    try:
        themes = await qwc_service.list_themes()
        return {"themes": themes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/themes/{theme_name}", tags=["qwc2"])
async def get_theme_config(theme_name: str):
    """
    # Get QWC2 Theme Configuration
    
    Retrieve full theme configuration for QWC2 frontend.
    
    ### Parameters:
    - `theme_name`: Project/theme identifier
    
    ### Returns:
    Complete QWC2 theme JSON with:
    - Layer tree structure
    - WMS capabilities
    - Initial map extent
    - Search configuration
    - Print templates
    - Tool settings
    
    ### Example Response:
    ```json
    {
      "id": "swiss_municipalities",
      "title": "Swiss Municipalities",
      "wms_url": "https://api.intelligeo.net/api/projects/swiss_municipalities/wms",
      "extent": [2485000, 1075000, 2834000, 1295000],
      "crs": "EPSG:2056",
      "layers": [
        {
          "name": "municipalities",
          "title": "Municipalities",
          "type": "wms",
          "visibility": true
        }
      ],
      "search": {
        "providers": ["coordinates", "nominatim"]
      },
      "tools": {
        "measure": true,
        "print": true,
        "identify": true
      }
    }
    ```
    
    ### Errors:
    - `404`: Theme not found
    """
    try:
        config = await qwc_service.get_theme_config(theme_name)
        if not config:
            raise HTTPException(status_code=404, detail="Theme not found")
        return config
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== UTILITY ENDPOINTS ====================

@app.get("/api/status", tags=["system"])
async def get_status():
    """
    # System Status Check
    
    Comprehensive health check for all infrastructure components.
    
    ### Checks:
    1. **Database**: PostgreSQL/PostGIS connectivity
    2. **QGIS Server**: Map rendering service availability
    3. **Storage**: Project count and disk usage
    
    ### Returns:
    ```json
    {
      "database": {
        "connected": true,
        "version": "PostgreSQL 15.3, PostGIS 3.3"
      },
      "qgis_server": {
        "online": true,
        "url": "http://qgis-server:8080"
      },
      "projects_count": 42,
      "storage_used": "2.3 GB"
    }
    ```
    
    ### Use Cases:
    - Monitoring dashboards
    - Pre-flight checks before operations
    - Troubleshooting deployment issues
    """
    try:
        status = {
            "database": await data_service.check_connection(),
            "qgis_server": await project_service.check_qgis_server(),
            "projects_count": len(await project_service.list_projects()),
            "storage_used": await project_service.get_storage_usage()
        }
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/info", tags=["system"])
async def get_info(request: Request):
    """Return public-facing metadata (API base URL, version, etc.).

    The frontend uses ``api_base_url`` to build absolute WMS/OWS links that
    work even when the user copies them outside the browser (e.g. into QGIS
    Desktop).  The value is derived the same way as in ``/api/themes.json``:
      1. ``X-Forwarded-Host`` header set by the reverse-proxy, or
      2. ``API_PUBLIC_URL`` environment variable, or
      3. the request's own ``base_url`` (fallback for local dev).
    """
    forwarded_host  = request.headers.get("x-forwarded-host") or request.headers.get("host")
    forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    if forwarded_host:
        api_base_url = f"{forwarded_proto}://{forwarded_host}"
    else:
        api_base_url = os.getenv("API_PUBLIC_URL", str(request.base_url).rstrip("/"))
    return {"api_base_url": api_base_url.rstrip("/")}


# ==================== MILITARY SYMBOL ENDPOINTS ====================

@app.get("/api/symbols/health", tags=["symbols"])
async def symbols_health():
    """
    # Milsymbol Server Health Check
    
    Check connectivity and status of the embedded milsymbol rendering server.
    
    ### Returns:
    - `online`: Whether the milsymbol-server is reachable
    - `stats`: Rendering statistics (total requests, cache hits)
    - `supported_sidc`: Supported SIDC formats
    """
    server_health = await symbol_service.health_check()
    cache_stats = symbol_service.get_cache_stats()

    # Add diagnostic info when offline
    if not server_health.get("online"):
        import subprocess
        diag = {}
        try:
            result = subprocess.run(
                ["pgrep", "-a", "node"], capture_output=True, text=True, timeout=2
            )
            diag["node_processes"] = result.stdout.strip() or "none"
        except Exception:
            diag["node_processes"] = "pgrep unavailable"
        try:
            with open("/var/log/milsymbol.log", "r") as f:
                lines = f.readlines()
                diag["milsymbol_log_tail"] = "".join(lines[-20:]).strip()
        except FileNotFoundError:
            diag["milsymbol_log_tail"] = "log file not found"
        except Exception as e:
            diag["milsymbol_log_tail"] = f"error reading log: {e}"
        server_health["diagnostics"] = diag

    return {
        **server_health,
        "cache": cache_stats,
        "config": {
            "default_format": os.getenv("DEFAULT_SIDC_FORMAT", "APP-6D"),
            "default_size": int(os.getenv("MILSYMBOL_DEFAULT_SIZE", "100")),
            "server_url": os.getenv("MILSYMBOL_SERVER_URL", "http://localhost:2525"),
        }
    }


@app.get("/api/symbols/{sidc_with_format}", tags=["symbols"])
async def render_symbol(
    sidc_with_format: str,
    request: Request,
    size: Optional[int] = None
):
    """
    # Render Military Symbol
    
    Generate a military symbol image (SVG or PNG) from a SIDC code.
    
    ## URL Format:
    ```
    GET /api/symbols/{SIDC}.{format}?size=100&uniqueDesignation=HQ
    ```
    
    ## Supported SIDC Formats:
    
    ### APP-6D (20 characters)
    Modern NATO standard. Example: `10031000001211000000`
    
    Structure: `Version(2) + Context(1) + Affiliation(1) + Dimension(1) + Status(1) + FunctionID(6) + Modifier1(2) + Modifier2(2) + Reserved(4)`
    
    ### MIL-STD-2525C (15 characters)
    Legacy format. Example: `SFG-UCI---`
    
    ## Output Formats:
    - `.svg` — Scalable vector (recommended for web maps)
    - `.png` — Raster image (recommended for export/print)
    
    ## Modifier Options (query string):
    All milsymbol.js options are supported:
    - `size`: Symbol size in pixels (default: 100)
    - `uniqueDesignation`: Unit designation text (e.g., "1/INF")
    - `higherFormation`: Higher formation text
    - `quantity`: Quantity indicator
    - `staffComments`: Staff comments
    - `direction`: Direction of movement (degrees)
    - `speed`: Speed indicator
    - `specialHeadquarters`: Special HQ indicator
    - `square`: Force square symbol (true/false)
    
    ## Examples:
    
    ### Friendly infantry company (APP-6D):
    ```
    GET /api/symbols/10031000001101001500.svg
    ```
    
    ### Hostile armor battalion (2525C):
    ```
    GET /api/symbols/SHG-UCF---.svg?size=120
    ```
    
    ### Air fighter with designation (APP-6D):
    ```
    GET /api/symbols/10031000001101000000.svg?uniqueDesignation=F-16
    ```
    
    ### Naval vessel (APP-6D):
    ```
    GET /api/symbols/10031500001101000000.svg
    ```
    
    ### Cyber unit (APP-6D):
    ```
    GET /api/symbols/10031000001101000000.svg
    ```
    
    ## Caching:
    Symbols are cached server-side (LRU, ~512 entries).
    HTTP Cache-Control headers enable browser/CDN caching for 24 hours.
    
    ## Errors:
    - `400`: Invalid SIDC format or unsupported output format
    - `502`: Milsymbol rendering server unreachable
    - `500`: Rendering failure
    """
    # Parse SIDC and format from path
    dot_index = sidc_with_format.rfind(".")
    if dot_index == -1:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Missing format extension. Use .svg or .png",
                "example": "/api/symbols/SFG-UCI---.svg"
            }
        )
    
    sidc = sidc_with_format[:dot_index]
    fmt = sidc_with_format[dot_index + 1:].lower()
    
    # Collect all query params as milsymbol options (excluding 'size' which we handle)
    options = {}
    for key, value in request.query_params.items():
        if key != "size":
            options[key] = value
    
    try:
        content, content_type, metadata = await symbol_service.render_symbol(
            sidc=sidc,
            fmt=fmt,
            size=size,
            **options
        )
        
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-SIDC-Format": metadata.get("sidc_format", "unknown"),
                "X-Symbol-Cached": str(metadata.get("cached", False)).lower(),
                "X-Symbol-Dimension": metadata.get("dimension") or "unknown",
                "Access-Control-Allow-Origin": "*"
            }
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ConnectionError as e:
        raise HTTPException(
            status_code=502,
            detail=f"{str(e)} Check /api/symbols/health for diagnostics."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Symbol rendering failed: {str(e)}")


@app.post("/api/symbols/batch", tags=["symbols"])
async def render_symbols_batch(
    request: Request,
    fmt: str = "svg",
    size: Optional[int] = None
):
    """
    # Batch Render Military Symbols
    
    Render multiple symbols in a single request. Efficient for ORBAT displays
    with many units.
    
    ## Request Body:
    ```json
    {
      "symbols": [
        {"sidc": "10031000001101001500"},
        {"sidc": "10061000001102001600", "uniqueDesignation": "2/ARM"},
        {"sidc": "SFG-UCI---", "size": 80}
      ],
      "format": "svg",
      "defaultSize": 100
    }
    ```
    
    ## Response:
    ```json
    {
      "results": [
        {
          "sidc": "10031000001101001500",
          "content": "<base64-encoded SVG>",
          "content_type": "image/svg+xml",
          "metadata": {"sidc_format": "APP-6D", "cached": false}
        }
      ],
      "total": 3,
      "rendered": 3,
      "errors": 0
    }
    ```
    
    ## Limits:
    - Max 100 symbols per batch request
    - Timeout: 30 seconds
    
    ## Use Cases:
    - ORBAT tree icon loading
    - Print/export with multiple symbols
    - Preloading symbols for scenario playback
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    symbols = body.get("symbols", [])
    batch_fmt = body.get("format", fmt)
    batch_size = body.get("defaultSize", size)
    
    if not symbols:
        raise HTTPException(status_code=400, detail="Empty symbols array")
    
    if len(symbols) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 symbols per batch")
    
    try:
        results = await symbol_service.render_batch(
            symbols=symbols,
            fmt=batch_fmt,
            size=batch_size
        )
        
        errors_count = sum(1 for r in results if "error" in r)
        
        return {
            "results": results,
            "total": len(symbols),
            "rendered": len(symbols) - errors_count,
            "errors": errors_count
        }
    
    except ConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch rendering failed: {str(e)}")


@app.delete("/api/symbols/cache", tags=["symbols"])
async def clear_symbol_cache():
    """
    # Clear Symbol Cache
    
    Flush the server-side LRU cache for rendered symbols.
    Useful after configuration changes or debugging.
    
    ### Returns:
    Cache statistics before and after clearing.
    """
    before = symbol_service.get_cache_stats()
    symbol_service.clear_cache()
    after = symbol_service.get_cache_stats()
    return {
        "message": "Symbol cache cleared",
        "before": before,
        "after": after
    }


@app.get("/api/symbols/validate/{sidc}", tags=["symbols"])
async def validate_sidc_endpoint(sidc: str):
    """
    # Validate SIDC Code
    
    Check if a Symbol Identification Code is valid and identify its format.
    
    ### Parameters:
    - `sidc`: The SIDC code to validate
    
    ### Returns:
    ```json
    {
      "sidc": "10031000001101001500",
      "valid": true,
      "format": "APP-6D",
      "dimension": "Ground"
    }
    ```
    
    ### Supported Formats:
    - **APP-6D**: 20 alphanumeric characters
    - **MIL-STD-2525C**: 10-15 characters (letters, digits, dashes)
    """
    from services.symbol_service import validate_sidc as _validate, get_sidc_dimension
    
    validation = _validate(sidc)
    result = {
        "sidc": sidc,
        "valid": validation.valid,
        "format": validation.format,
    }
    
    if validation.valid:
        result["dimension"] = get_sidc_dimension(sidc)
    else:
        result["error"] = validation.error
    
    return result


# ==================== MILSYMB (MILITARY SYMBOL LAYERS) ENDPOINTS ====================

@app.get("/api/projects/{project_name}/milsymb", tags=["milsymb"])
async def list_milsymb_layers(project_name: str):
    """
    # List military symbol layers

    Return the list of KadasMilxLayer plugin layers embedded in a QGIS
    project, with metadata (affiliation, feature count, extent).
    """
    from services.milsymb_service import get_milsymb_layers_for_project
    layers = get_milsymb_layers_for_project(project_name)
    if not layers:
        return {"project": project_name, "milsymb_layers": []}
    return {
        "project": project_name,
        "milsymb_layers": [
            {
                "layer_id": lyr.layer_id,
                "title": lyr.title,
                "affiliation": lyr.affiliation,
                "crs": lyr.crs,
                "extent": list(lyr.extent) if lyr.extent else None,
                "feature_count": len(lyr.features),
                "symbol_size": lyr.symbol_size,
                "line_width": lyr.line_width,
                "geojson_url": f"/api/projects/{project_name}/milsymb/{lyr.title.replace(' ', '_')}.geojson",
            }
            for lyr in layers
        ],
    }


@app.get("/api/projects/{project_name}/milsymb/{layer_name}.geojson", tags=["milsymb"])
async def get_milsymb_layer_geojson(project_name: str, layer_name: str):
    """
    # Military Symbol Layer GeoJSON

    Return a GeoJSON FeatureCollection for a specific military symbol layer.
    Each Feature contains `sidc`, `militaryName`, and geometry
    ready for client-side rendering via milsymbol.

    Layer name uses underscores for spaces (e.g. `BLUE_FORCE`).
    """
    from services.milsymb_service import get_milsymb_geojson
    geojson = get_milsymb_geojson(project_name, layer_name)
    if geojson is None:
        raise HTTPException(
            status_code=404,
            detail=f"Military symbol layer '{layer_name}' not found in project '{project_name}'"
        )
    return JSONResponse(
        content=geojson,
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "application/geo+json",
        }
    )


# ==================== PRINT WITH SYMBOLS ENDPOINT ====================

@app.post("/api/print/compose", tags=["symbols"])
async def compose_print_with_symbols(request: dict):
    """
    # Compose Print Map with Military Symbols

    Generates a print-ready PNG map by overlaying military symbols
    on a QGIS Server base map at the correct geographic positions.

    ### Request Body:
    ```json
    {
        "extent": {
            "xmin": 800000, "ymin": 5900000,
            "xmax": 860000, "ymax": 5960000,
            "crs": "EPSG:3857"
        },
        "width": 1200,
        "height": 800,
        "dpi": 300,
        "project": "CHE_Basemaps",
        "layers": ["layer1", "layer2"],
        "symbols": [
            {
                "sidc": "10031000001211000000",
                "lon": 7.45, "lat": 46.95,
                "size": 48, "label": "1/52 Inf Bn"
            }
        ]
    }
    ```

    ### Returns:
    PNG image (application/png)
    """
    from services.print_service import (
        compose_print_map, PrintRequest, MapExtent, SymbolOverlay
    )
    
    try:
        extent_data = request.get("extent", {})
        extent = MapExtent(
            xmin=float(extent_data.get("xmin", 0)),
            ymin=float(extent_data.get("ymin", 0)),
            xmax=float(extent_data.get("xmax", 0)),
            ymax=float(extent_data.get("ymax", 0)),
            crs=extent_data.get("crs", "EPSG:3857")
        )
        
        symbols = []
        for s in request.get("symbols", []):
            symbols.append(SymbolOverlay(
                sidc=s["sidc"],
                lon=float(s["lon"]),
                lat=float(s["lat"]),
                size=int(s.get("size", 48)),
                label=s.get("label", ""),
                options=s.get("options", {})
            ))
        
        print_request = PrintRequest(
            extent=extent,
            width=int(request.get("width", 1200)),
            height=int(request.get("height", 800)),
            dpi=int(request.get("dpi", 300)),
            project=request.get("project", ""),
            layers=request.get("layers", []),
            symbols=symbols
        )
        
        png_bytes = await compose_print_map(print_request)
        
        if png_bytes is None:
            return JSONResponse(
                status_code=500,
                content={"error": "Print composition failed. Check server logs."}
            )
        
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": f"inline; filename=dufour_print_{len(symbols)}_symbols.png"
            }
        )
    
    except KeyError as e:
        return JSONResponse(
            status_code=400,
            content={"error": f"Missing required field: {e}"}
        )
    except Exception as e:
        logger.error(f"Print composition error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


# ==================== PRINT HELPERS ====================

def _png_bytes_to_pdf(png_bytes: bytes, dpi: int = 300) -> bytes:
    """
    Wrap a PNG raster in a PDF page using Pillow.

    Pillow's PDF writer embeds the full-resolution raster inside a valid
    single-page PDF.  Page dimensions are derived from pixel size ÷ DPI so
    the physical paper size is preserved exactly.

    This is used instead of QGIS Server's built-in GetPrint PDF renderer,
    which is unreliable in Docker containers because Qt's PDF print driver
    requires a display server and native font/printer support that is not
    present in headless QGIS Server images.
    """
    from PIL import Image
    import io as _io

    img = Image.open(_io.BytesIO(png_bytes))
    img_rgb = img.convert("RGB")

    out = _io.BytesIO()
    # Pillow saves a single-page PDF; resolution= sets the DPI metadata so
    # PDF viewers display the correct physical size.
    img_rgb.save(out, format="PDF", resolution=float(dpi))
    out.seek(0)
    return out.getvalue()


async def _render_getprint_png(
    qgis_url: str,
    params: dict,
    qgis_timeout: float = 120.0,
) -> bytes:
    """
    Ask QGIS Server for a GetPrint response in PNG format.

    Overrides FORMAT → image/png and drops any SIZE-related constraints
    so QGIS Server computes the output size from the layout template + DPI.
    Returns raw PNG bytes.
    """
    import httpx as _httpx
    import xml.etree.ElementTree as _ET

    def _normalize_template_name(name: str) -> str:
        return re.sub(r"[\s_\-]+", "", (name or "").strip().lower())

    async def _fetch_available_templates(_client: _httpx.AsyncClient, _base_params: dict) -> List[str]:
        gps_params = {
            "MAP": _base_params.get("MAP", ""),
            "SERVICE": "WMS",
            "VERSION": _base_params.get("VERSION", "1.3.0"),
            "REQUEST": "GetProjectSettings",
        }
        resp = await _client.get(qgis_url, params=gps_params)
        if resp.status_code != 200:
            return []
        try:
            root = _ET.fromstring(resp.text)
        except Exception:
            return []

        templates: List[str] = []
        for el in root.iter():
            tag = el.tag.split('}')[-1] if '}' in el.tag else el.tag
            if tag == "ComposerTemplate":
                name = (el.get("name") or "").strip()
                if name:
                    templates.append(name)
        return templates

    def _choose_best_template(requested: str, available: List[str]) -> Optional[str]:
        if not available:
            return None

        req = (requested or "").strip()
        if not req:
            return available[0]

        # 1) Exact match
        for tmpl in available:
            if tmpl == req:
                return tmpl

        # 2) Case-insensitive match
        req_lower = req.lower()
        for tmpl in available:
            if tmpl.lower() == req_lower:
                return tmpl

        # 3) Loose match: ignore whitespace, underscores, hyphens
        req_norm = _normalize_template_name(req)
        for tmpl in available:
            if _normalize_template_name(tmpl) == req_norm:
                return tmpl

        # 4) Fallback: first available template
        return available[0]

    png_params = dict(params)
    png_params["FORMAT"] = "image/png"
    # Ensure QGIS Server doesn't complain about a stale application/pdf format
    png_params.pop("format", None)   # drop lower-case duplicate if present

    async with _httpx.AsyncClient(timeout=qgis_timeout) as _client:
        resp = await _client.get(qgis_url, params=png_params)

        # If requested TEMPLATE is invalid, resolve available templates from
        # GetProjectSettings and retry once with the closest match.
        if resp.status_code != 200 and "TEMPLATE parameter is invalid" in (resp.text or ""):
            requested_tmpl = str(png_params.get("TEMPLATE", "") or "")
            available_tmpls = await _fetch_available_templates(_client, png_params)
            chosen_tmpl = _choose_best_template(requested_tmpl, available_tmpls)
            if chosen_tmpl:
                logger.warning(
                    "GetPrint: TEMPLATE '%s' invalid, retrying with '%s' (available=%s)",
                    requested_tmpl,
                    chosen_tmpl,
                    available_tmpls,
                )
                retry_params = dict(png_params)
                retry_params["TEMPLATE"] = chosen_tmpl
                resp = await _client.get(qgis_url, params=retry_params)

    ct = resp.headers.get("Content-Type", "")
    if resp.status_code != 200 or "image" not in ct:
        snippet = resp.text[:300] if hasattr(resp, "text") else repr(resp.content[:300])
        raise RuntimeError(
            f"QGIS GetPrint PNG failed ({resp.status_code}): {snippet}"
        )
    return resp.content


# ── Print preview endpoint ────────────────────────────────────────────────────

@app.get("/api/projects/{project_name}/print/preview", tags=["wms"])
async def print_preview(
    project_name: str,
    request: Request,
):
    """
    # Print Preview (PNG)

    Returns a PNG preview of the requested print layout **without** generating
    a PDF.  Use this to let the user confirm layout, extent and labels before
    triggering the full PDF download.

    Accepts exactly the same query parameters as a WMS ``GetPrint`` request:

    ```
    GET /api/projects/my_project/print/preview
        ?TEMPLATE=A4+Portrait
        &map0:EXTENT=665000,5750000,900000,5950000
        &map0:CRS=EPSG:3857
        &map0:LAYERS=layer1,layer2
        &DPI=150
        &TRANSPARENT=true
    ```

    The endpoint forces ``FORMAT=image/png`` regardless of what the client
    sends, so the QGIS Server PDF driver is never invoked.

    **Resolution tip:** use ``DPI=150`` for a fast preview, ``DPI=300`` for
    the production PDF.
    """
    try:
        from services.qgis_storage_service import storage_service as _ss
    except Exception as _imp_err:
        raise HTTPException(status_code=500, detail=f"Storage service unavailable: {_imp_err}")

    # ── Ensure .qgz is on disk ────────────────────────────────────────────────
    try:
        qgz_bytes = _ss.retrieve_qgz(project_name)
    except Exception as _db_err:
        raise HTTPException(status_code=502, detail=f"DB error: {_db_err}")
    if not qgz_bytes:
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")

    temp_dir = Path(tempfile.gettempdir()) / "dufour_qgis_projects"
    temp_dir.mkdir(exist_ok=True)
    temp_path = temp_dir / f"{project_name}.qgz"
    if not temp_path.exists() or temp_path.stat().st_size != len(qgz_bytes):
        temp_path.write_bytes(qgz_bytes)

    # ── Build QGIS GetPrint params ────────────────────────────────────────────
    qgis_server_url = "http://localhost:80/qgis"
    qp = dict(request.query_params)
    qp["MAP"] = str(temp_path)
    qp["SERVICE"] = "WMS"
    qp["VERSION"] = qp.get("VERSION", "1.3.0")
    qp["REQUEST"] = "GetPrint"
    qp["FORMAT"] = "image/png"   # always PNG for preview

    # Default DPI 150 for a fast preview
    if "DPI" not in qp:
        qp["DPI"] = "150"

    if "TEMPLATE" not in qp:
        raise HTTPException(
            status_code=422,
            detail="Missing required parameter: TEMPLATE (print layout name)",
        )

    try:
        png_bytes = await _render_getprint_png(qgis_server_url, qp)
    except RuntimeError as _re:
        logger.error(f"print_preview: {_re}")
        raise HTTPException(status_code=502, detail=str(_re))
    except Exception as _exc:
        logger.error(f"print_preview unexpected error: {_exc}")
        raise HTTPException(status_code=500, detail=str(_exc))

    template_safe = re.sub(r"[^\w\-]", "_", qp.get("TEMPLATE", "preview"))
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Content-Disposition": f'inline; filename="{project_name}_{template_safe}_preview.png"',
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
        },
    )


# ==================== WMS PROXY ENDPOINTS ====================

@app.get("/api/projects/{project_name}/thumbnail", tags=["wms"])
async def project_thumbnail(project_name: str):
    """
    # Project Thumbnail

    Returns a 200×200 PNG snapshot of the project rendered by QGIS Server via WMS GetMap.
    The bounding box is derived from the project extent stored in the database.
    Used by the QWC2 theme picker to show a preview image for each uploaded project.

    - **200**: PNG image
    - **404**: Project not found
    - **502**: QGIS Server unreachable
    """
    try:
        # Load project metadata for extent / CRS
        project_meta = storage_service.get_project_meta(project_name)
        if not project_meta:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")

        # Ensure .qgz is written to temp dir (same logic as wms_proxy)
        qgz_bytes = storage_service.retrieve_qgz(project_name)
        if not qgz_bytes:
            raise HTTPException(status_code=404, detail=f"Project {project_name} binary not found")

        temp_dir = Path(tempfile.gettempdir()) / 'dufour_qgis_projects'
        temp_dir.mkdir(exist_ok=True)
        temp_path = temp_dir / f"{project_name}.qgz"
        if not temp_path.exists() or temp_path.stat().st_size != len(qgz_bytes):
            temp_path.write_bytes(qgz_bytes)

        # Derive bbox in EPSG:3857 from stored extent
        extent = project_meta.get('extent') or [-180, -85, 180, 85]
        native_crs = project_meta.get('crs') or 'EPSG:4326'
        try:
            from pyproj import Transformer
            to_3857 = Transformer.from_crs(native_crs, "EPSG:3857", always_xy=True)
            xmin, ymin = to_3857.transform(extent[0], extent[1])
            xmax, ymax = to_3857.transform(extent[2], extent[3])
        except Exception:
            # Fallback: assume WGS84 extents and convert manually
            from pyproj import Transformer
            to_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
            xmin, ymin = to_3857.transform(extent[0], extent[1])
            xmax, ymax = to_3857.transform(extent[2], extent[3])

        bbox = f"{xmin},{ymin},{xmax},{ymax}"

        # Build WMS GetMap request to internal QGIS Server
        params = {
            "MAP": str(temp_path),
            "SERVICE": "WMS",
            "VERSION": "1.3.0",
            "REQUEST": "GetMap",
            "CRS": "EPSG:3857",
            "BBOX": bbox,
            "WIDTH": "200",
            "HEIGHT": "200",
            "FORMAT": "image/png",
            "TRANSPARENT": "FALSE",
            # Use the root/project layer — QGIS exposes all layers merged
            "LAYERS": project_name,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get("http://localhost:80/qgis", params=params)

        content_type = resp.headers.get("Content-Type", "image/png")
        if resp.status_code == 200 and "image" in content_type:
            return Response(
                content=resp.content,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=300"},
            )

        # QGIS returned an error — fall back to a 1×1 transparent PNG
        logger.warning(
            f"thumbnail: QGIS GetMap failed for {project_name}: "
            f"HTTP {resp.status_code} {resp.text[:200]}"
        )
        # 1×1 transparent PNG (67 bytes, base64-decoded inline)
        import base64
        _TRANSPARENT_PNG = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        return Response(content=_TRANSPARENT_PNG, media_type="image/png",
                        headers={"Cache-Control": "no-cache"})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"thumbnail error for {project_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.api_route("/api/projects/{project_name}/wms", methods=["GET", "POST"], tags=["wms"])
async def wms_proxy(project_name: str, request: Request):
    """
    # OGC WMS Proxy
    
    Proxy WMS requests to QGIS Server with on-demand project loading.
    
    ## Architecture:
    
    ```
    Client Request
        ↓
    FastAPI Proxy (this endpoint)
        ↓
    1. Retrieve .qgz from PostgreSQL BYTEA column
    2. Write to temporary filesystem location
    3. Forward request to QGIS Server with MAP parameter
        ↓
    QGIS Server (map rendering)
        ↓
    Response (XML, PNG, JSON)
    ```
    
    ## Supported WMS Operations:
    
    ### GetCapabilities
    ```
    GET /api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetCapabilities
    ```
    Returns XML with layer list, styles, CRS support, extent.
    
    ### GetMap
    ```
    GET /api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetMap
        &LAYERS=municipalities
        &BBOX=2485000,1075000,2834000,1295000
        &WIDTH=800&HEIGHT=600
        &SRS=EPSG:2056
        &FORMAT=image/png
    ```
    Returns rendered map image (PNG/JPEG).
    
    ### GetFeatureInfo
    ```
    GET /api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetFeatureInfo
        &LAYERS=municipalities
        &QUERY_LAYERS=municipalities
        &X=400&Y=300
        &INFO_FORMAT=application/json
    ```
    Returns feature attributes at clicked point.
    
    ### GetLegendGraphic
    ```
    GET /api/projects/my_project/wms?SERVICE=WMS&REQUEST=GetLegendGraphic
        &LAYER=municipalities
        &FORMAT=image/png
    ```
    Returns legend image for layer.
    
    ## Caching:
    - Projects are cached in `/tmp/dufour_qgis_projects/`
    - Cache invalidation: file size comparison
    - No time-based expiration (production should add TTL)
    
    ## Performance:
    - First request: ~500ms (database retrieval + file write)
    - Cached requests: ~50ms (QGIS Server only)
    - GetMap rendering: 100-500ms (depends on complexity)
    
    ## Errors:
    - `404`: Project not found in database
    - `500`: QGIS Server error or invalid project file
    
    ## OpenLayers Example:
    ```javascript
    import TileLayer from 'ol/layer/Tile';
    import TileWMS from 'ol/source/TileWMS';
    
    const layer = new TileLayer({
      source: new TileWMS({
        url: 'https://api.intelligeo.net/api/projects/my_project/wms',
        params: {
          'LAYERS': 'municipalities',
          'TILED': true
        },
        serverType: 'qgis'
      })
    });
    ```
    """
    try:
        # 1. Retrieve .qgz from PostgreSQL BYTEA
        try:
            qgz_bytes = storage_service.retrieve_qgz(project_name)
        except Exception as db_err:
            logger.error(f"WMS proxy: DB error for {project_name}: {db_err}")
            raise HTTPException(
                status_code=502,
                detail=f"Database error retrieving project {project_name}: {db_err}"
            )
        
        if not qgz_bytes:
            raise HTTPException(status_code=404, detail=f"Project {project_name} not found")
        
        # 2. Export to temporary file (QGIS Server needs filesystem path)
        temp_dir = Path(tempfile.gettempdir()) / 'dufour_qgis_projects'
        temp_dir.mkdir(exist_ok=True)
        temp_path = temp_dir / f"{project_name}.qgz"
        
        # Cache: only write if not exists or outdated
        if not temp_path.exists() or temp_path.stat().st_size != len(qgz_bytes):
            temp_path.write_bytes(qgz_bytes)
            logger.info(f"WMS: wrote {project_name}.qgz ({len(qgz_bytes)} bytes) to {temp_path}")
        
        # 3. Forward to QGIS Server with MAP parameter
        # QGIS Server runs as FastCGI on port 9993, proxied by nginx on port 80
        # We use our custom nginx config with /qgis location → FastCGI
        # HARDCODED: this is an internal container detail, not user-configurable
        qgis_server_url = 'http://localhost:80/qgis'
        
        # Build query string with MAP parameter
        query_params = dict(request.query_params)
        query_params['MAP'] = str(temp_path)

        # Case-insensitive helpers for OGC params (clients may send lower-case keys)
        def _qget(params: dict, key: str, default=None):
            key_u = key.upper()
            for k, v in params.items():
                if k.upper() == key_u:
                    return v
            return default

        # For POST requests, merge body parameters BEFORE setting defaults so that
        # values sent in the body (e.g. REQUEST=GetPrint, FORMAT=application/pdf)
        # are not silently overridden by the fallback defaults below.
        # We deliberately do NOT override MAP, which is controlled by the server.
        if request.method == "POST":
            _body = await request.body()
            from urllib.parse import parse_qs
            _post_params = parse_qs(_body.decode("utf-8", errors="replace"))
            for _key, _values in _post_params.items():
                if _key not in ('MAP',):
                    query_params[_key] = _values[0]

        # Default SERVICE to WMS if not specified
        if _qget(query_params, 'SERVICE') is None:
            query_params['SERVICE'] = 'WMS'

        # Default REQUEST to GetCapabilities if not specified
        if _qget(query_params, 'REQUEST') is None:
            query_params['REQUEST'] = 'GetCapabilities'

        # Normalize key parameters to canonical upper-case names to avoid
        # downstream mismatches when clients send lowercase variants.
        for _k in (
            'SERVICE', 'REQUEST', 'VERSION', 'FORMAT', 'LAYERS', 'QUERY_LAYERS',
            'INFO_FORMAT', 'I', 'J', 'X', 'Y', 'WIDTH', 'HEIGHT', 'CRS', 'SRS', 'BBOX', 'DPI'
        ):
            _v = _qget(query_params, _k)
            if _v is not None:
                query_params[_k] = _v

        # GetFeatureInfo compatibility guardrails:
        # - ensure QUERY_LAYERS is present (fallback to LAYERS)
        # - ensure INFO_FORMAT defaults to JSON
        # - map click pixel params between WMS 1.3 (I/J) and 1.1.1 (X/Y)
        _request_type = str(_qget(query_params, 'REQUEST', '') or '').upper()
        _version = str(_qget(query_params, 'VERSION', '1.3.0') or '1.3.0')
        if _request_type == 'GETFEATUREINFO':
            _layers = _qget(query_params, 'LAYERS', '')
            if _qget(query_params, 'QUERY_LAYERS') is None and _layers:
                query_params['QUERY_LAYERS'] = _layers

            if _qget(query_params, 'INFO_FORMAT') is None:
                query_params['INFO_FORMAT'] = 'application/json'

            _is_v13 = _version.startswith('1.3')
            if _is_v13:
                if _qget(query_params, 'I') is None and _qget(query_params, 'X') is not None:
                    query_params['I'] = _qget(query_params, 'X')
                if _qget(query_params, 'J') is None and _qget(query_params, 'Y') is not None:
                    query_params['J'] = _qget(query_params, 'Y')
            else:
                if _qget(query_params, 'X') is None and _qget(query_params, 'I') is not None:
                    query_params['X'] = _qget(query_params, 'I')
                if _qget(query_params, 'Y') is None and _qget(query_params, 'J') is not None:
                    query_params['Y'] = _qget(query_params, 'J')

        async with httpx.AsyncClient(timeout=120.0) as client:

            # ── GetPrint PDF → PNG + Pillow PDF conversion ────────────────────
            # QGIS Server's built-in PDF renderer requires a native Qt print
            # driver that is unavailable in headless Docker containers, which
            # causes corrupted or empty PDFs.  We intercept every GetPrint
            # request that asks for PDF, re-render as PNG, and wrap it in a
            # standards-compliant PDF using Pillow (already a dependency).
            _req_type = str(_qget(query_params, 'REQUEST', '') or '').upper()
            _req_fmt  = str(_qget(query_params, 'FORMAT', '') or '').lower()
            if _req_type == 'GETPRINT' and 'pdf' in _req_fmt:
                try:
                    logger.info(
                        f"WMS proxy: intercepting GetPrint PDF for '{project_name}' "
                        f"— rendering as PNG then converting via Pillow"
                    )
                    _dpi = int(_qget(query_params, 'DPI', 300))
                    _png = await _render_getprint_png(qgis_server_url, query_params)
                    _pdf = _png_bytes_to_pdf(_png, dpi=_dpi)
                    _tpl = re.sub(r'[^\w\-]', '_', str(_qget(query_params, 'TEMPLATE', 'print')))
                    return Response(
                        content=_pdf,
                        status_code=200,
                        headers={
                            'Content-Type': 'application/pdf',
                            'Content-Disposition':
                                f'attachment; filename="{project_name}_{_tpl}.pdf"',
                            'Access-Control-Allow-Origin': '*',
                        },
                    )
                except Exception as _pdf_exc:
                    logger.error(
                        f"WMS proxy: GetPrint PDF conversion failed for "
                        f"'{project_name}': {_pdf_exc}"
                    )
                    # Do NOT fall through to the standard proxy path: QGIS Server's
                    # built-in PDF renderer requires a Qt print driver that is absent
                    # in headless Docker, which produces empty or corrupted PDFs.
                    # Return a clear 502 so the client gets an actionable error instead.
                    return Response(
                        content=f'Print failed for "{project_name}": {_pdf_exc}'.encode(),
                        status_code=502,
                        headers={
                            'Content-Type': 'text/plain',
                            'Access-Control-Allow-Origin': '*',
                        },
                    )

            # Log the forwarded request for debugging
            logger.info(f"WMS proxy → {qgis_server_url} method={request.method} params={list(query_params.keys())}")
            
            # Forward with the correct HTTP method
            if request.method == "POST":
                response = await client.post(qgis_server_url, params=query_params)
            else:
                response = await client.get(qgis_server_url, params=query_params)
            
            # Log non-200 responses for debugging
            if response.status_code != 200:
                logger.warning(f"WMS proxy: QGIS Server returned {response.status_code} for {project_name}")
                logger.warning(f"WMS response body (first 500 chars): {response.text[:500]}")

            # Determine HTTP status to return:
            # WMS spec says errors should be 200 + XML ServiceExceptionReport.
            # If QGIS returns 500 with XML body, pass it as 200 so QWC2 can parse the error.
            # If QGIS returns 500 with non-XML body, return 502 with detail.
            content_type = response.headers.get('Content-Type', 'application/xml')
            if response.status_code >= 500:
                body_text = response.text[:200]
                is_xml = body_text.lstrip().startswith('<')
                if is_xml:
                    # QGIS WMS ServiceException – return as 200 so QWC2 handles it
                    return_status = 200
                else:
                    return_status = 502
            else:
                return_status = response.status_code
            
            # For GetCapabilities responses: rewrite the internal OnlineResource URL
            # QGIS Server embeds http://localhost/qgis?MAP=... in the XML,
            # which is not reachable from the browser. Replace it with the public
            # proxy URL /api/projects/{project_name}/wms so QWC2 uses the correct endpoint.
            response_content = response.content
            req_type = str(_qget(query_params, 'REQUEST', '') or '').upper()
            if req_type in ('GETCAPABILITIES', 'GETPROJECTSETTINGS') and 'xml' in content_type.lower():
                try:
                    caps_text = response.text
                    # Replace all occurrences of the internal QGIS Server URL
                    # Pattern: http://localhost.../qgis?MAP=...  (any variant)
                    public_wms_url = f"/api/projects/{project_name}/wms"
                    caps_text = re.sub(
                        r'https?://localhost[^"\'<>]*',
                        public_wms_url,
                        caps_text
                    )
                    response_content = caps_text.encode('utf-8')
                except Exception as rewrite_err:
                    logger.warning(f"WMS proxy: failed to rewrite OnlineResource: {rewrite_err}")
            
            # Return QGIS Server response with correct Content-Type
            return Response(
                content=response_content,
                status_code=return_status,
                headers={
                    'Content-Type': content_type,
                    'Access-Control-Allow-Origin': '*'
                }
            )
    
    except HTTPException:
        raise
    except httpx.ConnectError as e:
        logger.error(f"WMS proxy: cannot reach QGIS Server at http://localhost:80/qgis: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"QGIS Server unreachable. The map rendering service is not available. ({e})"
        )
    except httpx.TimeoutException as e:
        logger.error(f"WMS proxy: QGIS Server timeout for {project_name}: {e}")
        raise HTTPException(
            status_code=504,
            detail=f"QGIS Server timeout while rendering {project_name}"
        )
    except Exception as e:
        import traceback
        logger.error(f"WMS proxy error: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"WMS proxy error: {str(e)}")


# ==================== AUTH ENDPOINTS ====================

from fastapi.security import OAuth2PasswordRequestForm
from services.auth_service import (
    authenticate_user, create_access_token,
    get_current_user, require_admin,
    hash_password, _get_user_by_username,
    _get_user_by_email, generate_reset_token,
    verify_reset_token, mark_token_used,
    reset_user_password, send_reset_email,
)


@app.post("/api/auth/login", tags=["auth"])
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    # Login
    Returns a JWT Bearer token.  Use it in the `Authorization: Bearer <token>` header.
    """
    user = authenticate_user(form_data.username, form_data.password)
    token = create_access_token({"sub": user["id"], "role": user["role"],
                                 "username": user["username"]})
    return {
        "access_token": token,
        "token_type":   "bearer",
        "role":         user["role"],
        "username":     user["username"],
    }


@app.get("/api/auth/me", tags=["auth"])
async def me(current_user=Depends(get_current_user)):
    """Returns the profile of the currently authenticated user."""
    return {k: v for k, v in current_user.items() if k != "password_hash"}


@app.post("/api/auth/forgot-password", tags=["auth"])
async def forgot_password(body: dict):
    """
    # Richiesta reset password
    Invia un'email con link di reset all'indirizzo associato all'account.

    Body: `{"email": "user@example.com"}`

    **Nota**: per sicurezza, la risposta è sempre 200 anche se l'email non esiste.
    """
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=422, detail="Campo 'email' obbligatorio")

    # Always respond 200 to avoid user enumeration
    user = _get_user_by_email(email)
    if not user or not user["is_active"]:
        logger.info(f"Forgot-password request for unknown/inactive email: {email}")
        return {"message": "Se l'indirizzo è associato a un account, riceverai un'email con le istruzioni."}

    token = generate_reset_token(user["id"])
    sent = send_reset_email(user["email"], user["username"], token)
    if not sent:
        logger.warning(f"Reset email could not be sent to {email} — SMTP may not be configured")

    return {"message": "Se l'indirizzo è associato a un account, riceverai un'email con le istruzioni."}


@app.post("/api/auth/reset-password", tags=["auth"])
async def reset_password(body: dict):
    """
    # Reset password
    Verifica il token ricevuto via email e imposta la nuova password.

    Body: `{"token": "...", "new_password": "..."}`
    """
    token = body.get("token", "").strip()
    new_password = body.get("new_password", "").strip()

    if not token:
        raise HTTPException(status_code=422, detail="Campo 'token' obbligatorio")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=422, detail="La password deve essere di almeno 6 caratteri")

    user = verify_reset_token(token)
    reset_user_password(user["id"], new_password)
    mark_token_used(token)

    logger.info(f"Password reset completed for user {user['username']}")
    return {"message": "Password reimpostata con successo. Ora puoi accedere con la nuova password."}


# ==================== ADMIN ENDPOINTS ====================

@app.get("/api/admin/users", tags=["admin"])
async def admin_list_users(_=Depends(require_admin)):
    """List all users (admin only)."""
    from database.connection import db
    from sqlalchemy import text as _t
    with db.get_engine().connect() as conn:
        rows = conn.execute(_t(
            "SELECT id, username, email, role, is_active, created_at "
            "FROM users ORDER BY created_at"
        )).fetchall()
    return [
        {"id": str(r[0]), "username": r[1], "email": r[2],
         "role": r[3], "is_active": r[4],
         "created_at": r[5].isoformat() if r[5] else None}
        for r in rows
    ]


@app.post("/api/admin/users", tags=["admin"], status_code=201)
async def admin_create_user(body: dict, _=Depends(require_admin)):
    """
    Create a new user (admin only).
    Body: `{username, email, password, role}`
    """
    username = body.get("username", "").strip()
    password = body.get("password", "").strip()
    email    = body.get("email", "").strip()
    role     = body.get("role", "user").strip()

    if not username or not password:
        raise HTTPException(400, "username and password are required")
    if role not in ("admin", "user"):
        raise HTTPException(400, "role must be 'admin' or 'user'")
    if _get_user_by_username(username):
        raise HTTPException(409, f"Username '{username}' already exists")

    from database.connection import db
    from sqlalchemy import text as _t
    phash = hash_password(password)
    with db.get_engine().connect() as conn:
        row = conn.execute(_t(
            "INSERT INTO users (username, email, password_hash, role) "
            "VALUES (:u, :e, :ph, :r) RETURNING id"
        ), {"u": username, "e": email, "ph": phash, "r": role}).fetchone()
        conn.commit()
    return {"id": str(row[0]), "username": username, "role": role}


@app.patch("/api/admin/users/{user_id}", tags=["admin"])
async def admin_update_user(user_id: str, body: dict, _=Depends(require_admin)):
    """
    Update a user (admin only).
    Updatable fields: `email`, `role`, `is_active`, `password`.
    """
    from database.connection import db
    from sqlalchemy import text as _t
    sets, params = [], {"id": user_id}
    if "email"     in body: sets.append("email = :email");     params["email"]     = body["email"]
    if "role"      in body: sets.append("role = :role");       params["role"]      = body["role"]
    if "is_active" in body: sets.append("is_active = :active"); params["active"]   = body["is_active"]
    if "password"  in body:
        sets.append("password_hash = :ph")
        params["ph"] = hash_password(body["password"])
    if not sets:
        raise HTTPException(400, "Nothing to update")
    sql = f"UPDATE users SET {', '.join(sets)} WHERE id = :id RETURNING id"
    with db.get_engine().connect() as conn:
        row = conn.execute(_t(sql), params).fetchone()
        conn.commit()
    if not row:
        raise HTTPException(404, "User not found")
    return {"updated": str(row[0])}


@app.delete("/api/admin/users/{user_id}", tags=["admin"])
async def admin_delete_user(user_id: str, current=Depends(require_admin)):
    """Delete a user (admin only). Cannot delete yourself."""
    if current["id"] == user_id:
        raise HTTPException(400, "Cannot delete yourself")
    from database.connection import db
    from sqlalchemy import text as _t
    with db.get_engine().connect() as conn:
        conn.execute(_t("DELETE FROM users WHERE id = :id"), {"id": user_id})
        conn.commit()
    return {"deleted": user_id}


@app.get("/api/admin/projects", tags=["admin"])
async def admin_list_projects(_=Depends(require_admin)):
    """List all projects with owner info (admin only)."""
    projects = storage_service.list_projects()
    return projects


@app.delete("/api/admin/projects/{project_name}", tags=["admin"])
async def admin_delete_project(project_name: str, _=Depends(require_admin)):
    """Delete any project (admin only) — drops per-project schema with CASCADE."""
    try:
        # ── 1. Fetch project metadata ─────────────────────────────────
        with db.get_engine().connect() as conn:
            row = conn.execute(
                text("SELECT id, schema_name FROM projects WHERE name = :name"),
                {'name': project_name}
            ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")

        project_id = str(row[0])
        schema_name = row[1]
        if not schema_name:
            from services.project_migrator import _schema_name as _derive_schema
            schema_name = _derive_schema(project_name)

        # ── 2. Drop per-project schema (CASCADE removes all lyr_* tables) ─
        if schema_name:
            with db.get_engine().connect() as conn:
                conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
                conn.commit()
            logger.info(f"admin_delete_project: dropped schema {schema_name}")

        # ── 3. Remove from central project_layers catalog ────────────
        with db.get_engine().connect() as conn:
            conn.execute(
                text("DELETE FROM project_layers WHERE project_id = :pid"),
                {'pid': project_id}
            )
            conn.commit()

        # ── 4. Delete project record + qgz binary ────────────────────
        ok = storage_service.delete_project(project_name)
        if not ok:
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")

        # ── 5. Best-effort: remove cached .qgz from temp dir ─────────
        try:
            _cached = Path(tempfile.gettempdir()) / 'dufour_qgis_projects' / f"{project_name}.qgz"
            if _cached.exists():
                _cached.unlink()
        except Exception:
            pass

        return {"deleted": project_name}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ==================== USER ENDPOINTS ====================

@app.get("/api/user/projects", tags=["user"])
async def user_list_projects(current=Depends(get_current_user)):
    """List projects owned by the current user."""
    from database.connection import db
    from sqlalchemy import text as _t
    with db.get_engine().connect() as conn:
        rows = conn.execute(_t("""
            SELECT p.name, p.title, p.description, p.crs,
                   p.extent_minx, p.extent_miny, p.extent_maxx, p.extent_maxy,
                   p.qgz_size, p.created_at, p.updated_at
            FROM projects p
            JOIN users u ON p.user_id = u.id
            WHERE u.id = :uid
            ORDER BY p.updated_at DESC
        """), {"uid": current["id"]}).fetchall()
    return [
        {
            "name":        r[0], "title": r[1], "description": r[2], "crs": r[3],
            "extent":      [r[4], r[5], r[6], r[7]] if r[4] is not None else None,
            "file_size":   r[8],
            "created_at":  r[9].isoformat()  if r[9]  else None,
            "updated_at":  r[10].isoformat() if r[10] else None,
            "wms_url":     f"/api/projects/{r[0]}/wms",
            "thumbnail":   f"/api/projects/{r[0]}/thumbnail",
        }
        for r in rows
    ]


@app.get("/api/user/projects/{project_name}/health", tags=["user"])
async def user_project_health(project_name: str, current=Depends(get_current_user)):
    """
    Health check for a single project:
    - Verifies the project is in the DB
    - Tests WMS GetCapabilities via the internal QGIS Server
    Returns a structured status report.
    """
    from database.connection import db
    from sqlalchemy import text as _t

    # Check ownership (admins can check any project)
    if current["role"] != "admin":
        with db.get_engine().connect() as conn:
            row = conn.execute(_t(
                "SELECT 1 FROM projects p JOIN users u ON p.user_id = u.id "
                "WHERE p.name = :n AND u.id = :uid"
            ), {"n": project_name, "uid": current["id"]}).fetchone()
        if not row:
            raise HTTPException(404, "Project not found or not yours")

    report = {"project": project_name, "checks": {}}

    # 1. DB record
    meta = storage_service.get_project_meta(project_name)
    report["checks"]["db_record"] = "ok" if meta else "missing"
    if not meta:
        report["status"] = "error"
        return report

    # 2. Binary in DB
    try:
        qgz = storage_service.retrieve_qgz(project_name)
        report["checks"]["qgz_binary"] = f"ok ({len(qgz)} bytes)" if qgz else "missing"
    except Exception as e:
        report["checks"]["qgz_binary"] = f"error: {e}"

    # 3. WMS GetCapabilities
    try:
        temp_dir = Path(tempfile.gettempdir()) / "dufour_qgis_projects"
        temp_dir.mkdir(exist_ok=True)
        temp_path = temp_dir / f"{project_name}.qgz"
        if qgz and (not temp_path.exists() or temp_path.stat().st_size != len(qgz)):
            temp_path.write_bytes(qgz)
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get("http://localhost:80/qgis", params={
                "MAP": str(temp_path),
                "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetCapabilities"
            })
        report["checks"]["wms_getcapabilities"] = (
            "ok" if r.status_code == 200 and "<WMS_Capabilities" in r.text
            else f"error: HTTP {r.status_code}"
        )
    except Exception as e:
        report["checks"]["wms_getcapabilities"] = f"unreachable: {e}"

    all_ok = all(v.startswith("ok") for v in report["checks"].values())
    report["status"] = "healthy" if all_ok else "degraded"
    return report


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=3000,
        reload=True,
        log_level="info"
    )

