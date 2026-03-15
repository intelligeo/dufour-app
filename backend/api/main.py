"""
Dufour Middleware API
FastAPI server for managing QGIS projects and PostGIS data uploads
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from fastapi.responses import JSONResponse
from typing import List, Optional
import os
import logging
from pathlib import Path
import tempfile
import httpx

logger = logging.getLogger("dufour.api")

from services.project_service import ProjectService
from services.data_service import DataService
from services.qwc_service import QWCService
from services.qgis_storage_service import storage_service
from services.project_migrator import ProjectMigrator
from services.symbol_service import symbol_service, validate_sidc
from models.schemas import ProjectResponse, TableSchema, UploadResponse
from database.connection import db

# Initialize FastAPI app with OpenAPI metadata
app = FastAPI(
    title="Dufour Middleware API",
    description="""
# 🗺️ Dufour-App Backend API

Content management system for QGIS projects and PostGIS data in Dufour-app.

## Features

### Project Management
- Upload and publish QGIS projects (.qgs, .qgz)
- Automatic layer migration from local files to PostGIS
- Project metadata and versioning
- WMS service integration

### Data Management
- PostGIS table creation and management
- Bulk feature upload (GeoJSON, Shapefile, etc.)
- Spatial data validation
- Schema introspection

### WMS Proxy
- On-demand QGIS Server integration
- Cached project retrieval from PostgreSQL
- GetCapabilities, GetMap, GetFeatureInfo support

### QWC2 Integration
- Theme configuration generation
- Layer tree and capabilities export
- Frontend compatibility layer

### Military Symbols (APP-6D / MIL-STD-2525C)
- Single and batch symbol rendering (SVG, PNG) via embedded milsymbol server
- SIDC validation and format detection
- Full modifier support (designation, direction, speed, HQ, etc.)
- Server-side LRU cache with 24h browser caching
- Print composition with symbol overlays on QGIS base maps

## Architecture

```
Frontend (React + OpenLayers)
    ↓
Dufour Middleware API (FastAPI)
    ↓
├── PostgreSQL + PostGIS (data storage)
└── QGIS Server (map rendering)
```

## Authentication

Currently public API. Future versions will implement JWT authentication.

## Rate Limits

- File uploads: 50MB max
- Request timeout: 30 seconds
- No rate limiting (production will implement)

## Support

- Documentation: https://github.com/intelligeo/dufour-app
- Issues: https://github.com/intelligeo/dufour-app/issues
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
            "description": "System health and status endpoints"
        },
        {
            "name": "projects",
            "description": "QGIS project management (upload, publish, delete, list)"
        },
        {
            "name": "data",
            "description": "PostGIS data operations (tables, bulk upload)"
        },
        {
            "name": "wms",
            "description": "OGC WMS proxy for QGIS Server integration"
        },
        {
            "name": "qwc2",
            "description": "QWC2 theme configuration (compatibility layer)"
        },
        {
            "name": "symbols",
            "description": "Military symbol rendering (APP-6D / MIL-STD-2525C via milsymbol)"
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
        "http://localhost:5173",
        "http://localhost:8081",
        "http://localhost"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
project_service = ProjectService()
data_service = DataService()
qwc_service = QWCService()
project_migrator = ProjectMigrator()

# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    import traceback
    
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
    description: Optional[str] = Form(None, description="Project description", example="Contains Swiss municipalities and transportation layers"),
    is_public: bool = Form(False, description="Public visibility"),
    file: UploadFile = File(..., description="QGIS project file (.qgz)"),
    data_files: Optional[List[UploadFile]] = File(default=None, description="Companion data files (.gpkg, .geojson, .shp, .dbf, .shx, .prj, .cpg, .fgb, .csv)")
):
    """
    # Upload and Migrate QGIS Project
    
    Upload a .qgz project file with automatic layer migration to PostGIS.
    
    ## Companion Data Files
    
    QGIS projects often reference external data files (GeoPackage, GeoJSON,
    Shapefile, etc.) with relative paths like `./data.gpkg`. These files are
    **not** embedded in the .qgz archive.
    
    Upload them via the `data_files` parameter so that layer migration can
    find and extract them to PostGIS.
    
    **Supported formats**: `.gpkg`, `.geojson`, `.json`, `.shp` (+ `.dbf`,
    `.shx`, `.prj`, `.cpg`), `.fgb`, `.csv`
    
    ### Example with curl
    ```bash
    curl -X POST https://api.intelligeo.net/api/projects \\
      -F 'name=my_project' \\
      -F 'title=My Project' \\
      -F 'file=@project.qgz' \\
      -F 'data_files=@data.gpkg' \\
      -F 'data_files=@points.geojson'
    ```
    
    ## Workflow:
    
    1. **Validation**: Check file extension, size (50MB max), name format
    2. **Companion files**: Copy uploaded data files alongside extracted .qgz
    3. **Parsing**: Extract project structure, layers, CRS, extent
    4. **Migration**: Convert local layers (GeoPackage, GeoJSON, Shapefile) to PostGIS tables
    5. **Datasource Update**: Rewrite .qgz to reference PostGIS connections
    6. **Storage**: Store modified .qgz in PostgreSQL BYTEA column
    
    ## Supported Layer Sources:
    - GeoPackage (.gpkg)
    - GeoJSON (.geojson)
    - Shapefile (.shp)
    - FlatGeobuf (.fgb)
    - CSV with coordinates
    
    ## Naming Rules:
    - Lowercase letters and numbers only
    - Underscores allowed
    - Example: `swiss_municipalities`, `my_project_2024`
    
    ## Returns:
    ```json
    {
      "success": true,
      "project": {
        "id": "uuid",
        "name": "my_project",
        "title": "My Project",
        "layers_count": 5,
        "qgz_size": 1234567
      },
      "migration": {
        "total_layers": 5,
        "migrated": 4,
        "failed": 1,
        "details": [
          {
            "layer_name": "municipalities",
            "table_name": "my_project_municipalities",
            "features_count": 2352,
            "geometry_type": "MultiPolygon",
            "success": true
          }
        ]
      }
    }
    ```
    
    ## Errors:
    - `400`: Invalid file type, name format, or companion file extension
    - `500`: Migration failure (tables rolled back automatically)
    """
    import uuid
    from datetime import datetime
    from sqlalchemy import text
    
    # Allowed companion file extensions
    ALLOWED_DATA_EXTENSIONS = {
        '.gpkg', '.geojson', '.json', '.shp', '.dbf', '.shx', '.prj', '.cpg',
        '.fgb', '.csv'
    }
    
    try:
        # Normalize data_files: None or empty string from frontend → empty list
        raw_data_files = data_files if data_files else []
        
        # Filter out invalid data_files entries (Swagger UI / frontend may send empty strings)
        valid_data_files = [
            df for df in raw_data_files
            if isinstance(df, UploadFile) and df.filename
        ]
        
        logger.info(
            f"Upload request: name={name}, data_files_raw={len(raw_data_files)}, "
            f"valid_data_files={len(valid_data_files)}, "
            f"filenames={[df.filename for df in valid_data_files]}"
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
            if df.filename:
                ext = Path(df.filename).suffix.lower()
                if ext not in ALLOWED_DATA_EXTENSIONS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unsupported companion file type: {df.filename}. "
                               f"Allowed: {', '.join(sorted(ALLOWED_DATA_EXTENSIONS))}"
                    )
        
        # Save uploaded file to temp location
        temp_file = Path(tempfile.mktemp(suffix='.qgz'))
        companion_dir = None
        try:
            content = await file.read()
            
            # Validate file size (50MB limit)
            if len(content) > 50 * 1024 * 1024:
                raise HTTPException(
                    status_code=400,
                    detail="File size exceeds 50MB limit"
                )
            
            temp_file.write_bytes(content)
            
            # Save companion data files to a temp directory
            # They will be copied into the .qgz extraction dir by the migrator
            companion_paths: List[Path] = []
            if valid_data_files:
                companion_dir = Path(tempfile.mkdtemp(prefix='qgz_companion_'))
                total_companion_size = 0
                for df in valid_data_files:
                    df_content = await df.read()
                    total_companion_size += len(df_content)
                    
                    # 200MB total limit for companion files
                    if total_companion_size > 200 * 1024 * 1024:
                        raise HTTPException(
                            status_code=400,
                            detail="Total companion data files size exceeds 200MB limit"
                        )
                    
                    companion_path = companion_dir / df.filename
                    companion_path.parent.mkdir(parents=True, exist_ok=True)
                    companion_path.write_bytes(df_content)
                    companion_paths.append(companion_path)
                    logger.info(f"Saved companion file: {df.filename} ({len(df_content)} bytes, exists={companion_path.exists()})")
            
            logger.info(f"Companion paths: {[str(p) for p in companion_paths]}")
            
            # Migrate project: parse, extract layers, update datasources.
            # Layers whose source file is missing are skipped (not migrated)
            # and kept as-is in the .qgz.  This follows the QGIS Cloud pattern
            # where data upload is best-effort and non-blocking.
            project_info, migration_results, modified_qgz_bytes = project_migrator.migrate_project(
                qgz_path=temp_file,
                project_name=name,
                target_crs='EPSG:2056',  # Swiss LV95
                companion_files=companion_paths
            )
            
            # Store project in database
            project_id = str(uuid.uuid4())
            insert_sql = text("""
                INSERT INTO projects (
                    id, user_id, name, title, description, is_public,
                    qgz_data, qgz_size, crs,
                    extent_minx, extent_miny, extent_maxx, extent_maxy,
                    created_at, updated_at
                )
                VALUES (
                    :id, :user_id, :name, :title, :description, :is_public,
                    :qgz_data, :qgz_size, :crs,
                    :minx, :miny, :maxx, :maxy,
                    :created_at, :updated_at
                )
                ON CONFLICT (name) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    qgz_data = EXCLUDED.qgz_data,
                    qgz_size = EXCLUDED.qgz_size,
                    crs = EXCLUDED.crs,
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
                    'user_id': None,  # TODO: Get from auth context
                    'name': name,
                    'title': title or project_info.title,
                    'description': description,
                    'is_public': is_public,
                    'qgz_data': modified_qgz_bytes,
                    'qgz_size': len(modified_qgz_bytes),
                    'crs': project_info.crs,
                    'minx': project_info.extent[0],
                    'miny': project_info.extent[1],
                    'maxx': project_info.extent[2],
                    'maxy': project_info.extent[3],
                    'created_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow()
                })
                # Get the actual project ID (may differ from generated one on conflict)
                row = result.fetchone()
                project_id = str(row[0]) if row else project_id
                
                # Delete old layer metadata for this project (in case of re-upload)
                conn.execute(
                    text("DELETE FROM project_layers WHERE project_id = :pid"),
                    {'pid': project_id}
                )
                conn.commit()
            
            # Store layer metadata (all in one connection)
            with db.get_engine().connect() as conn:
                for migration_result in migration_results:
                    if migration_result.success:
                        layer_info = next(
                            (l for l in project_info.layers if l.name == migration_result.layer_name),
                            None
                        )
                        if layer_info:
                            conn.execute(text("""
                                INSERT INTO project_layers (
                                    id, project_id, layer_name, layer_type, 
                                    geometry_type, source_type, table_name, datasource
                                )
                                VALUES (
                                    :id, :project_id, :layer_name, :layer_type,
                                    :geometry_type, :source_type, :table_name, :datasource
                                )
                            """), {
                                'id': str(uuid.uuid4()),
                                'project_id': project_id,
                                'layer_name': layer_info.name,
                                'layer_type': layer_info.layer_type,
                                'geometry_type': layer_info.geometry_type,
                                'source_type': layer_info.source_type or 'unknown',
                                'table_name': migration_result.table_name,
                                'datasource': 'postgis'
                            })
                conn.commit()
            
            # Build response
            successful_migrations = [r for r in migration_results if r.success]
            failed_migrations = [r for r in migration_results if not r.success]
            
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
                    "layers_count": len(project_info.layers),
                    "qgz_size": len(modified_qgz_bytes)
                },
                "migration": {
                    "total_layers": len(project_info.layers),
                    "migrated": len(successful_migrations),
                    "failed": len(failed_migrations),
                    "details": [
                        {
                            "layer_name": r.layer_name,
                            "table_name": r.table_name,
                            "features_count": r.features_count,
                            "geometry_type": r.geometry_type,
                            "success": r.success,
                            "error": r.error
                        }
                        for r in migration_results
                    ]
                }
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
        await qwc_service.generate_theme_config(name)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to publish project: {str(e)}")


@app.delete("/api/projects/{project_name}", tags=["projects"])
async def delete_project(project_name: str):
    """
    # Delete QGIS Project
    
    Permanently remove a project and its associated data.
    
    ### Parameters:
    - `project_name`: Project identifier to delete
    
    ### Actions:
    - Deletes project record from database
    - Removes .qgz file from storage
    - Clears QWC2 theme configuration
    - **Does NOT** delete associated PostGIS tables (manual cleanup required)
    
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
    This operation cannot be undone. PostGIS tables must be dropped manually.
    """
    try:
        # Delete from PostgreSQL database (primary storage)
        deleted = storage_service.delete_project(project_name)

        # Also attempt to clean up legacy filesystem files (.qgs / .qgz)
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


# ==================== QWC ENDPOINTS ====================

@app.get("/themes.json", tags=["qwc2"])
async def get_themes_json():
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
        # Use empty base URL so WMS URLs are relative (e.g. /api/projects/{name}/wms)
        # This avoids http/https mismatch when TLS is terminated by reverse proxy
        themes = await qwc_service.generate_full_themes_json("")
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


# ==================== WMS PROXY ENDPOINTS ====================

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
        qgis_server_url = 'http://127.0.0.1:80/qgis'
        
        # Build query string with MAP parameter
        query_params = dict(request.query_params)
        query_params['MAP'] = str(temp_path)
        
        # Default SERVICE to WMS if not specified
        if 'SERVICE' not in query_params:
            query_params['SERVICE'] = 'WMS'
        
        # Default REQUEST to GetCapabilities if not specified
        if 'REQUEST' not in query_params:
            query_params['REQUEST'] = 'GetCapabilities'
        async with httpx.AsyncClient(timeout=30.0) as client:
            if request.method == "POST":
                body = await request.body()
                from urllib.parse import parse_qs
                post_params = parse_qs(body.decode("utf-8", errors="replace"))
                for key, values in post_params.items():
                    if key not in query_params:
                        query_params[key] = values[0]
            
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
            
            # Return QGIS Server response with correct Content-Type
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers={
                    'Content-Type': response.headers.get('Content-Type', 'application/xml'),
                    'Access-Control-Allow-Origin': '*'
                }
            )
    
    except HTTPException:
        raise
    except httpx.ConnectError as e:
        logger.error(f"WMS proxy: cannot reach QGIS Server at http://127.0.0.1:80/qgis: {e}")
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=3000,
        reload=True,
        log_level="info"
    )
