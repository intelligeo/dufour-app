"""
Project Service
Manages QGIS project files: upload, storage, validation, metadata
"""
import os
import shutil
import zipfile
import tempfile
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
import xml.etree.ElementTree as ET
import aiofiles
import httpx

from models.schemas import ProjectResponse


class ProjectService:
    """Service for managing QGIS projects"""
    
    def __init__(self):
        # Project storage directory
        self.projects_dir = Path(os.getenv('PROJECTS_DIR', '/projects'))
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        
        # QGIS Server URL for GetCapabilities
        self.qgis_server_url = os.getenv('QGIS_SERVER_URL', 'http://qgis-server:80')
    
    
    async def list_projects(self) -> List[ProjectResponse]:
        """
        List all available QGIS projects
        Scans projects directory and returns metadata
        """
        projects = []
        
        # Scan both .qgs and .qgz files
        for pattern in ['*.qgs', '*.qgz']:
            for project_file in self.projects_dir.glob(pattern):
                try:
                    metadata = await self._extract_project_metadata(project_file)
                    projects.append(ProjectResponse(**metadata))
                except Exception as e:
                    print(f"Warning: Could not read project {project_file.name}: {e}")
                    continue
        
        # Sort by modified date, newest first
        projects.sort(key=lambda p: p.modified_at or datetime.min, reverse=True)
        
        return projects
    
    
    async def get_project(self, project_name: str) -> Optional[ProjectResponse]:
        """
        Get project details by name
        """
        project_file = self.projects_dir / f"{project_name}.qgs"
        
        if not project_file.exists():
            return None
        
        metadata = await self._extract_project_metadata(project_file)
        return ProjectResponse(**metadata)
    
    
    async def publish_project(
        self,
        name: str,
        title: str,
        description: Optional[str],
        file_content: bytes,
        filename: str
    ) -> Dict[str, Any]:
        """
        Publish a new QGIS project
        1. Save .qgs file to projects directory
        2. Validate project XML
        3. Extract metadata
        4. Return project details with WMS URL
        """
        # Sanitize project name (no spaces, special chars)
        safe_name = self._sanitize_name(name)
        project_file = self.projects_dir / f"{safe_name}.qgs"
        
        # Handle .qgz (zip) files - extract .qgs
        if filename.endswith('.qgz'):
            # TODO: Extract .qgs from .qgz archive
            raise NotImplementedError("QGZ files not yet supported. Please use QGS format.")
        
        # Save file
        async with aiofiles.open(project_file, 'wb') as f:
            await f.write(file_content)
        
        # Validate XML
        try:
            tree = ET.parse(project_file)
            root = tree.getroot()
            
            # Update project title if provided
            title_element = root.find('.//title')
            if title_element is not None and title:
                title_element.text = title
            
            # Save modified XML
            tree.write(project_file, encoding='utf-8', xml_declaration=True)
            
        except ET.ParseError as e:
            # Remove invalid file
            project_file.unlink()
            raise ValueError(f"Invalid QGIS project file: {e}")
        
        # Extract metadata
        metadata = await self._extract_project_metadata(project_file)
        
        # Generate WMS URL
        wms_url = f"{self.qgis_server_url}/cgi-bin/qgis_mapserv.fcgi?MAP=/data/projects/{safe_name}.qgs"
        metadata['wms_url'] = wms_url
        
        return {
            "success": True,
            "message": f"Project '{title}' published successfully",
            "project": metadata,
            "wms_url": wms_url,
            "wms_capabilities": f"{wms_url}&SERVICE=WMS&REQUEST=GetCapabilities"
        }
    
    
    async def delete_project(self, project_name: str) -> bool:
        """
        Delete a QGIS project file
        """
        project_file = self.projects_dir / f"{project_name}.qgs"
        
        if not project_file.exists():
            return False
        
        project_file.unlink()
        
        # Also delete associated QWC theme config
        theme_file = Path(os.getenv('QWC_CONFIG_DIR', '/qwc-config')) / 'themes' / f"{project_name}.json"
        if theme_file.exists():
            theme_file.unlink()
        
        return True
    
    
    async def check_qgis_server(self) -> bool:
        """
        Check if QGIS Server is responding
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.qgis_server_url}/cgi-bin/qgis_mapserv.fcgi?SERVICE=WMS&REQUEST=GetCapabilities",
                    timeout=5.0
                )
                return response.status_code == 200
        except:
            return False
    
    
    async def get_storage_usage(self) -> int:
        """
        Calculate total storage used by projects in MB
        """
        total_size = 0
        for project_file in self.projects_dir.glob('*.qgs'):
            total_size += project_file.stat().st_size
        
        return total_size // (1024 * 1024)  # Convert to MB
    
    
    # ============ Private Helper Methods ============
    
    async def _extract_project_metadata(self, project_file: Path) -> Dict[str, Any]:
        """
        Extract metadata from QGIS project XML
        Supports both .qgs and .qgz (compressed) files
        """
        # Handle .qgz (compressed) files
        if project_file.suffix == '.qgz':
            try:
                with zipfile.ZipFile(project_file, 'r') as zf:
                    # Find .qgs file inside archive
                    qgs_files = [f for f in zf.namelist() if f.endswith('.qgs')]
                    if not qgs_files:
                        raise ValueError("No .qgs file found in .qgz archive")
                    
                    # Read .qgs content from archive
                    qgs_content = zf.read(qgs_files[0])
                    root = ET.fromstring(qgs_content)
            except Exception as e:
                raise ValueError(f"Failed to extract metadata from .qgz: {e}")
        else:
            # Handle .qgs (uncompressed) files
            tree = ET.parse(project_file)
            root = tree.getroot()
        
        # Extract basic info
        title_elem = root.find('.//title')
        title = title_elem.text if title_elem is not None else project_file.stem
        
        # Extract CRS
        crs_elem = root.find('.//mapcanvas/destinationsrs/spatialrefsys/authid')
        crs = crs_elem.text if crs_elem is not None else 'EPSG:3857'
        
        # Extract extent
        extent = None
        extent_elem = root.find('.//mapcanvas/extent')
        if extent_elem is not None:
            try:
                extent = [
                    float(extent_elem.find('xmin').text),
                    float(extent_elem.find('ymin').text),
                    float(extent_elem.find('xmax').text),
                    float(extent_elem.find('ymax').text)
                ]
            except:
                pass
        
        # File stats
        stat = project_file.stat()
        
        return {
            "name": project_file.stem,
            "title": title,
            "description": None,
            "created_at": datetime.fromtimestamp(stat.st_ctime),
            "modified_at": datetime.fromtimestamp(stat.st_mtime),
            "file_size": stat.st_size,
            "crs": crs,
            "extent": extent,
            "wms_url": f"{self.qgis_server_url}/cgi-bin/qgis_mapserv.fcgi?MAP=/data/projects/{project_file.name}"
        }
    
    
    def _sanitize_name(self, name: str) -> str:
        """
        Sanitize project name for filesystem
        Remove spaces, special characters
        """
        import re
        # Replace spaces with underscores
        name = name.replace(' ', '_')
        # Remove non-alphanumeric characters except underscore and hyphen
        name = re.sub(r'[^a-zA-Z0-9_-]', '', name)
        # Lowercase
        name = name.lower()
        return name
