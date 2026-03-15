"""
QGIS Project Storage Service
Manages .qgz file storage in PostgreSQL BYTEA (OPTION A)
"""
import os
import logging
import tempfile
import zipfile
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

from sqlalchemy import text
from database.connection import db, get_db_session

logger = logging.getLogger(__name__)


class QGISStorageService:
    """
    Service for storing and retrieving QGIS projects in PostgreSQL
    Uses BYTEA column for binary storage (max ~50MB per project)
    """
    
    def __init__(self):
        self.max_project_size = 50 * 1024 * 1024  # 50MB limit
    
    
    def store_qgz(
        self, 
        project_name: str, 
        qgz_bytes: bytes,
        title: Optional[str] = None,
        description: Optional[str] = None,
        user_id: Optional[str] = None  # Auto-fetch dev user if None
    ) -> Dict[str, Any]:
        """
        Store .qgz file in PostgreSQL BYTEA column
        
        Args:
            project_name: URL-safe project name
            qgz_bytes: Binary content of .qgz file
            title: Project display title
            description: Project description
            user_id: Owner user ID (default: fetch dev_user)
        
        Returns:
            Dict with project_id, name, size
        
        Raises:
            ValueError: If file too large or invalid
        """
        # Get dev user ID if not provided
        if user_id is None:
            session_temp = get_db_session()
            try:
                result = session_temp.execute(text("SELECT id FROM users WHERE username = 'dev_user'"))
                row = result.fetchone()
                user_id = str(row[0]) if row else 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            finally:
                session_temp.close()
        # Validate size
        qgz_size = len(qgz_bytes)
        if qgz_size > self.max_project_size:
            raise ValueError(
                f"Project file too large: {qgz_size / 1024 / 1024:.2f}MB "
                f"(max {self.max_project_size / 1024 / 1024}MB)"
            )
        
        # Validate .qgz structure
        if not self._validate_qgz(qgz_bytes):
            raise ValueError("Invalid .qgz file structure")
        
        # Extract metadata from .qgz
        metadata = self._extract_metadata(qgz_bytes)
        
        session = get_db_session()
        try:
            # Insert or update project
            result = session.execute(text("""
                INSERT INTO projects (
                    user_id, name, title, description,
                    qgz_data, qgz_size,
                    extent_minx, extent_miny, extent_maxx, extent_maxy,
                    crs, created_at, updated_at
                ) VALUES (
                    :user_id, :name, :title, :description,
                    :qgz_data, :qgz_size,
                    :minx, :miny, :maxx, :maxy,
                    :crs, NOW(), NOW()
                )
                ON CONFLICT (name) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    qgz_data = EXCLUDED.qgz_data,
                    qgz_size = EXCLUDED.qgz_size,
                    extent_minx = EXCLUDED.extent_minx,
                    extent_miny = EXCLUDED.extent_miny,
                    extent_maxx = EXCLUDED.extent_maxx,
                    extent_maxy = EXCLUDED.extent_maxy,
                    crs = EXCLUDED.crs,
                    updated_at = NOW()
                RETURNING id, name, qgz_size
            """), {
                'user_id': user_id,
                'name': project_name,
                'title': title or project_name.replace('_', ' ').title(),
                'description': description or f"QGIS Project: {project_name}",
                'qgz_data': qgz_bytes,
                'qgz_size': qgz_size,
                'minx': metadata.get('extent', [0, 0, 0, 0])[0],
                'miny': metadata.get('extent', [0, 0, 0, 0])[1],
                'maxx': metadata.get('extent', [0, 0, 0, 0])[2],
                'maxy': metadata.get('extent', [0, 0, 0, 0])[3],
                'crs': metadata.get('crs', 'EPSG:2056')
            })
            
            row = result.fetchone()
            session.commit()
            
            logger.info(f"Stored project {project_name} ({qgz_size / 1024:.2f}KB) with ID {row[0]}")
            
            return {
                'project_id': str(row[0]),
                'name': row[1],
                'size_bytes': row[2],
                'size_mb': row[2] / 1024 / 1024
            }
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to store project {project_name}: {e}")
            raise
        finally:
            session.close()
    
    
    def retrieve_qgz(self, project_name: str) -> Optional[bytes]:
        """
        Retrieve .qgz file from PostgreSQL
        
        Args:
            project_name: Project name
        
        Returns:
            Binary .qgz content or None if not found
            
        Raises:
            Exception: on database connection/query errors (not swallowed)
        """
        session = get_db_session()
        try:
            result = session.execute(text("""
                SELECT qgz_data, qgz_size
                FROM projects
                WHERE name = :name
            """), {'name': project_name})
            
            row = result.fetchone()
            if not row:
                logger.warning(f"Project '{project_name}' not found in DB")
                return None
            
            qgz_data = bytes(row[0])
            qgz_size = row[1]
            
            logger.info(f"Retrieved project {project_name} ({qgz_size / 1024:.2f}KB)")
            return qgz_data
            
        except Exception as e:
            logger.error(f"DB ERROR retrieving project {project_name}: {e}")
            raise  # Propagate — let caller distinguish "not found" from "DB error"
        finally:
            session.close()
    
    
    def list_projects(self) -> List[Dict[str, Any]]:
        """
        List all stored projects with metadata
        
        Returns:
            List of project dicts
        """
        session = get_db_session()
        try:
            result = session.execute(text("""
                SELECT 
                    p.id, p.name, p.title, p.description,
                    p.qgz_size, p.crs, p.schema_name,
                    p.extent_minx, p.extent_miny, p.extent_maxx, p.extent_maxy,
                    p.created_at, p.updated_at,
                    u.username as owner
                FROM projects p
                LEFT JOIN users u ON p.user_id = u.id
                ORDER BY p.updated_at DESC
            """))
            
            projects = []
            for row in result:
                projects.append({
                    'id': str(row[0]),
                    'name': row[1],
                    'title': row[2],
                    'description': row[3],
                    'file_size': row[4],
                    'crs': row[5],
                    'schema_name': row[6],
                    'extent': [row[7], row[8], row[9], row[10]] if row[7] else None,
                    'created_at': row[11],
                    'modified_at': row[12],
                    'owner': row[13],
                    'wms_url': f"/api/projects/{row[1]}/wms"
                })
            
            logger.info(f"Listed {len(projects)} projects")
            return projects
            
        except Exception as e:
            logger.error(f"Failed to list projects: {e}")
            return []
        finally:
            session.close()
    
    
    def delete_project(self, project_name: str) -> bool:
        """
        Delete project from storage
        
        Args:
            project_name: Project name
        
        Returns:
            True if deleted, False if not found
        """
        session = get_db_session()
        try:
            result = session.execute(text("""
                DELETE FROM projects
                WHERE name = :name
                RETURNING id
            """), {'name': project_name})
            
            deleted = result.fetchone() is not None
            session.commit()
            
            if deleted:
                logger.info(f"Deleted project {project_name}")
            else:
                logger.warning(f"Project {project_name} not found for deletion")
            
            return deleted
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to delete project {project_name}: {e}")
            return False
        finally:
            session.close()
    
    
    def export_to_filesystem(self, project_name: str, output_path: Path) -> bool:
        """
        Export .qgz from PostgreSQL to filesystem
        Used for QGIS Server WMS rendering
        
        Args:
            project_name: Project name
            output_path: Path to write .qgz file
        
        Returns:
            True if exported successfully
        """
        qgz_bytes = self.retrieve_qgz(project_name)
        if not qgz_bytes:
            return False
        
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(qgz_bytes)
            logger.info(f"Exported {project_name} to {output_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to export {project_name}: {e}")
            return False
    
    
    def _validate_qgz(self, qgz_bytes: bytes) -> bool:
        """
        Validate .qgz file structure (should be a valid ZIP)
        """
        try:
            import io
            with zipfile.ZipFile(io.BytesIO(qgz_bytes), 'r') as zf:
                # Check for .qgs file inside
                has_qgs = any(f.endswith('.qgs') for f in zf.namelist())
                return has_qgs
        except Exception as e:
            logger.warning(f"Invalid .qgz structure: {e}")
            return False
    
    
    def _extract_metadata(self, qgz_bytes: bytes) -> Dict[str, Any]:
        """
        Extract metadata from .qgz file (extent, CRS, layers)
        """
        import io
        import xml.etree.ElementTree as ET
        
        metadata = {
            'extent': [0, 0, 0, 0],
            'crs': 'EPSG:2056',
            'layer_count': 0
        }
        
        try:
            with zipfile.ZipFile(io.BytesIO(qgz_bytes), 'r') as zf:
                # Find .qgs file
                qgs_file = next((f for f in zf.namelist() if f.endswith('.qgs')), None)
                if not qgs_file:
                    return metadata
                
                # Parse XML
                qgs_content = zf.read(qgs_file)
                root = ET.fromstring(qgs_content)
                
                # Extract extent
                extent_elem = root.find('.//extent')
                if extent_elem is not None:
                    metadata['extent'] = [
                        float(extent_elem.find('xmin').text or 0),
                        float(extent_elem.find('ymin').text or 0),
                        float(extent_elem.find('xmax').text or 0),
                        float(extent_elem.find('ymax').text or 0)
                    ]
                
                # Extract CRS
                crs_elem = root.find('.//spatialrefsys/authid')
                if crs_elem is not None:
                    metadata['crs'] = crs_elem.text
                
                # Count layers
                layers = root.findall('.//maplayer')
                metadata['layer_count'] = len(layers)
                
        except Exception as e:
            logger.warning(f"Could not extract metadata: {e}")
        
        return metadata


# Singleton instance
storage_service = QGISStorageService()
