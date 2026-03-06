"""
Dufour Middleware API
FastAPI server for managing QGIS projects and PostGIS data uploads
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import os
from pathlib import Path

from services.project_service import ProjectService
from services.data_service import DataService
from services.qwc_service import QWCService
from models.schemas import ProjectResponse, TableSchema, UploadResponse

# Initialize FastAPI app
app = FastAPI(
    title="Dufour Middleware API",
    description="Content management system for QGIS projects in Dufour-app",
    version="1.0.0"
)

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://dufour-frontend.onrender.com",
        "http://localhost:5173",
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


# ==================== PROJECT ENDPOINTS ====================

@app.get("/")
async def root():
    """API health check"""
    return {
        "status": "online",
        "service": "Dufour Middleware API",
        "version": "1.0.0"
    }


@app.get("/api/status")
async def api_status():
    """
    API status with detailed information for debugging
    """
    import os
    from pathlib import Path
    
    projects_dir = Path(os.getenv('PROJECTS_DIR', '/projects'))
    qgis_server_url = os.getenv('QGIS_SERVER_URL', 'http://qgis-server:80')
    
    # Check projects directory
    projects_exist = projects_dir.exists()
    if projects_exist:
        qgs_files = list(projects_dir.glob('*.qgs'))
        qgz_files = list(projects_dir.glob('*.qgz'))
        project_count = len(qgs_files) + len(qgz_files)
    else:
        project_count = 0
        qgs_files = []
        qgz_files = []
    
    # Check QGIS Server
    qgis_online = await project_service.check_qgis_server()
    
    return {
        "api": "online",
        "version": "1.0.0",
        "projects_dir": str(projects_dir),
        "projects_dir_exists": projects_exist,
        "project_count": project_count,
        "qgs_files": [f.name for f in qgs_files],
        "qgz_files": [f.name for f in qgz_files],
        "qgis_server": {
            "url": qgis_server_url,
            "online": qgis_online
        },
        "database": {
            "host": os.getenv('POSTGIS_HOST'),
            "db": os.getenv('POSTGIS_DB')
        }
    }


@app.get("/api/projects", response_model=List[ProjectResponse])
async def list_projects():
    """
    List all available QGIS projects
    Returns: List of projects with metadata
    """
    try:
        projects = await project_service.list_projects()
        return projects
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_name}")
async def get_project(project_name: str):
    """
    Get project details and configuration
    """
    try:
        project = await project_service.get_project(project_name)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects")
async def publish_project(
    name: str = Form(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...)
):
    """
    Publish a new QGIS project
    Accepts: .qgs or .qgz file from QGIS Desktop plugin
    Returns: Project details and WMS URL
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


@app.delete("/api/projects/{project_name}")
async def delete_project(project_name: str):
    """
    Delete a QGIS project
    """
    try:
        result = await project_service.delete_project(project_name)
        if not result:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"message": f"Project {project_name} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DATA UPLOAD ENDPOINTS ====================

@app.post("/api/databases/{db_name}/tables")
async def create_table(db_name: str, schema: TableSchema):
    """
    Create a new table in PostGIS database
    Used by QGIS plugin to prepare tables for data upload
    """
    try:
        result = await data_service.create_table(db_name, schema)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/databases/{db_name}/tables/{table_name}/upload")
async def upload_features(
    db_name: str,
    table_name: str,
    schema: str = Form("public"),
    file: UploadFile = File(...)
):
    """
    Bulk upload features to PostGIS table
    Accepts: CSV data in COPY format from QGIS plugin
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


@app.get("/api/databases/{db_name}/tables")
async def list_tables(db_name: str, schema: str = "public"):
    """
    List all tables in database schema
    """
    try:
        tables = await data_service.list_tables(db_name, schema)
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== QWC ENDPOINTS ====================

@app.get("/api/v1/themes")
async def list_themes():
    """
    List available QWC2 themes (projects)
    Compatible with QWC2 frontend
    """
    try:
        themes = await qwc_service.list_themes()
        return {"themes": themes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/themes/{theme_name}")
async def get_theme_config(theme_name: str):
    """
    Get QWC2 theme configuration for a project
    Returns layer tree, capabilities, and settings
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

@app.get("/api/status")
async def get_status():
    """
    Get system status: database, QGIS Server, storage
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=3000,
        reload=True,
        log_level="info"
    )
