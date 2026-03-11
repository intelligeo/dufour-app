"""
QGZ Parser Service
Extracts and parses QGIS project files (.qgz)
Identifies layers, datasources, and prepares for PostGIS migration
"""
import zipfile
import tempfile
import shutil
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import xml.etree.ElementTree as ET
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

# Maximum file size: 50MB
MAX_QGZ_SIZE = 50 * 1024 * 1024


@dataclass
class LayerInfo:
    """Information about a QGIS layer"""
    id: str
    name: str
    layer_type: str  # 'vector', 'raster', 'wms', etc.
    geometry_type: Optional[str]  # 'Point', 'LineString', 'Polygon', etc.
    source_type: str  # 'gpkg', 'shp', 'geojson', 'postgis', 'wms', etc.
    datasource: str  # Original datasource path/connection string
    table_name: Optional[str] = None  # For PostGIS migration
    crs: Optional[str] = None  # EPSG code
    is_local: bool = False  # True if layer data is embedded in .qgz


@dataclass
class ProjectInfo:
    """Information extracted from QGIS project"""
    title: str
    crs: str  # Main project CRS
    extent: Tuple[float, float, float, float]  # xmin, ymin, xmax, ymax
    layers: List[LayerInfo]
    qgz_size: int  # Original file size in bytes


class QGZParser:
    """Parser for QGIS project files (.qgz)"""
    
    def __init__(self, qgz_path: Path):
        """
        Initialize QGZ parser
        
        Args:
            qgz_path: Path to .qgz file
        """
        self.qgz_path = Path(qgz_path)
        self.temp_dir: Optional[Path] = None
        self.qgs_path: Optional[Path] = None
        self.tree: Optional[ET.ElementTree] = None
        self.root: Optional[ET.Element] = None
        
    def __enter__(self):
        """Context manager entry"""
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - cleanup temp files"""
        self.cleanup()
        
    def cleanup(self):
        """Remove temporary extraction directory"""
        if self.temp_dir and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)
            logger.info(f"Cleaned up temp directory: {self.temp_dir}")
            
    def validate_size(self) -> bool:
        """
        Validate .qgz file size
        
        Returns:
            True if file size is within limits
            
        Raises:
            ValueError: If file exceeds size limit
        """
        file_size = self.qgz_path.stat().st_size
        if file_size > MAX_QGZ_SIZE:
            raise ValueError(
                f"File size ({file_size / 1024 / 1024:.1f}MB) exceeds "
                f"maximum allowed size ({MAX_QGZ_SIZE / 1024 / 1024}MB)"
            )
        logger.info(f"File size validation passed: {file_size / 1024 / 1024:.2f}MB")
        return True
        
    def extract(self) -> Path:
        """
        Extract .qgz file to temporary directory
        
        Returns:
            Path to extracted .qgs file
            
        Raises:
            ValueError: If .qgz is invalid or .qgs not found
        """
        self.validate_size()
        
        # Create temp directory
        self.temp_dir = Path(tempfile.mkdtemp(prefix='qgz_'))
        logger.info(f"Extracting to: {self.temp_dir}")
        
        try:
            with zipfile.ZipFile(self.qgz_path, 'r') as zip_ref:
                zip_ref.extractall(self.temp_dir)
        except zipfile.BadZipFile:
            raise ValueError("Invalid .qgz file (not a valid ZIP archive)")
        
        # Find .qgs file
        qgs_files = list(self.temp_dir.glob('*.qgs'))
        if not qgs_files:
            raise ValueError("No .qgs file found in .qgz archive")
        
        self.qgs_path = qgs_files[0]
        logger.info(f"Found .qgs file: {self.qgs_path.name}")
        return self.qgs_path
        
    def parse_xml(self) -> ET.ElementTree:
        """
        Parse .qgs XML file
        
        Returns:
            ElementTree instance
            
        Raises:
            ValueError: If XML parsing fails
        """
        if not self.qgs_path:
            raise ValueError("Must call extract() first")
        
        try:
            self.tree = ET.parse(self.qgs_path)
            self.root = self.tree.getroot()
            logger.info("XML parsed successfully")
            return self.tree
        except ET.ParseError as e:
            raise ValueError(f"Failed to parse .qgs XML: {e}")
            
    def get_project_info(self) -> ProjectInfo:
        """
        Extract project metadata from .qgs
        
        Returns:
            ProjectInfo with project details
        """
        if not self.root:
            raise ValueError("Must call parse_xml() first")
        
        # Get project title — try <title>, then projectname attribute, then 'Untitled'
        title_elem = self.root.find('.//title')
        title = title_elem.text if (title_elem is not None and title_elem.text) else None
        if not title:
            title = self.root.get('projectname') or 'Untitled'
        
        # Get project CRS — try mapcanvas path, then projectCrs path
        crs_elem = self.root.find('.//mapcanvas/destinationsrs/spatialrefsys/authid')
        if crs_elem is None:
            crs_elem = self.root.find('.//projectCrs/spatialrefsys/authid')
        crs = crs_elem.text if crs_elem is not None else 'EPSG:3857'
        
        # Get extent
        extent_elem = self.root.find('.//mapcanvas/extent')
        if extent_elem is not None:
            xmin = float(extent_elem.find('xmin').text)
            ymin = float(extent_elem.find('ymin').text)
            xmax = float(extent_elem.find('xmax').text)
            ymax = float(extent_elem.find('ymax').text)
            extent = (xmin, ymin, xmax, ymax)
        else:
            # Default to Web Mercator world extent
            extent = (-20037508.34, -20037508.34, 20037508.34, 20037508.34)
        
        # Parse layers
        layers = self.parse_layers()
        
        # Get file size
        qgz_size = self.qgz_path.stat().st_size
        
        return ProjectInfo(
            title=title,
            crs=crs,
            extent=extent,
            layers=layers,
            qgz_size=qgz_size
        )
        
    def parse_layers(self) -> List[LayerInfo]:
        """
        Parse all layers from .qgs XML
        
        Returns:
            List of LayerInfo objects
        """
        if not self.root:
            raise ValueError("Must call parse_xml() first")
        
        layers = []
        
        # Find all maplayer elements
        for layer_elem in self.root.findall('.//maplayer'):
            layer_info = self._parse_layer_element(layer_elem)
            if layer_info:
                layers.append(layer_info)
        
        logger.info(f"Parsed {len(layers)} layers")
        return layers
        
    def _parse_layer_element(self, layer_elem: ET.Element) -> Optional[LayerInfo]:
        """
        Parse individual layer element
        
        Supports both QGIS ≤3.34 (id as XML attribute) and
        QGIS 3.40+ (id as <id> child element).
        
        Args:
            layer_elem: XML element for maplayer
            
        Returns:
            LayerInfo or None if layer should be skipped
        """
        # Get layer ID — QGIS 3.40+ uses <id> child element,
        # older versions may use @id attribute on <maplayer>
        id_elem = layer_elem.find('id')
        layer_id = (
            id_elem.text if id_elem is not None and id_elem.text
            else layer_elem.get('id', '')
        )
        
        layer_name = layer_elem.find('layername').text if layer_elem.find('layername') is not None else 'Unnamed'
        layer_type = layer_elem.get('type', 'unknown')  # vector, raster, plugin
        
        # Get datasource
        datasource_elem = layer_elem.find('datasource')
        datasource = datasource_elem.text if datasource_elem is not None else ''
        
        # Determine source type
        source_type = self._identify_source_type(datasource, layer_type)
        
        # Check if layer is embedded (local to .qgz)
        is_local = self._is_local_layer(datasource)
        
        # Get geometry type for vector layers
        # QGIS ≤3.34 may have <geometrytype> child element;
        # QGIS 3.40+ uses geometry="Point" attribute on <maplayer>
        geometry_type = None
        if layer_type == 'vector':
            geom_elem = layer_elem.find('.//geometrytype')
            if geom_elem is not None and geom_elem.text:
                geometry_type = geom_elem.text
            else:
                # Fallback: geometry attribute on <maplayer>
                geometry_type = layer_elem.get('geometry', None)
        
        # Get CRS
        crs_elem = layer_elem.find('.//spatialrefsys/authid')
        crs = crs_elem.text if crs_elem is not None else None
        
        return LayerInfo(
            id=layer_id,
            name=layer_name,
            layer_type=layer_type,
            geometry_type=geometry_type,
            source_type=source_type,
            datasource=datasource,
            crs=crs,
            is_local=is_local
        )
        
    def _identify_source_type(self, datasource: str, layer_type: str) -> str:
        """
        Identify datasource type from connection string
        
        Args:
            datasource: Datasource connection string
            layer_type: QGIS layer type (vector, raster, etc.)
            
        Returns:
            Source type identifier (gpkg, shp, geojson, postgis, wms, etc.)
        """
        ds_lower = datasource.lower()
        
        # Vector formats
        if '.gpkg' in ds_lower or 'geopackage' in ds_lower:
            return 'gpkg'
        elif '.shp' in ds_lower or 'shapefile' in ds_lower:
            return 'shp'
        elif '.geojson' in ds_lower or '.json' in ds_lower:
            return 'geojson'
        elif '.fgb' in ds_lower or 'flatgeobuf' in ds_lower:
            return 'fgb'
        elif '.csv' in ds_lower:
            return 'csv'
        elif 'dbname=' in ds_lower or 'host=' in ds_lower:
            return 'postgis'
        
        # Raster formats
        elif '.tif' in ds_lower or '.tiff' in ds_lower:
            return 'geotiff'
        
        # Services
        elif 'url=' in ds_lower or 'http' in ds_lower:
            if layer_type == 'raster':
                return 'wms'
            else:
                return 'wfs'
        
        return 'unknown'
        
    def _is_local_layer(self, datasource: str) -> bool:
        """
        Check if layer data is embedded in .qgz
        
        Args:
            datasource: Datasource connection string
            
        Returns:
            True if layer is local/embedded
        """
        if not datasource or not self.temp_dir:
            return False
        
        # Check for relative paths or files in temp directory
        if datasource.startswith('./') or datasource.startswith('.\\'):
            return True
        
        # Check if file exists in extracted directory
        datasource_path = Path(datasource.split('|')[0])  # Remove layer specifiers
        if datasource_path.is_absolute():
            return False
        
        # Check relative to .qgs location
        potential_path = self.temp_dir / datasource_path
        return potential_path.exists()
        
    def get_local_layers(self) -> List[LayerInfo]:
        """
        Get list of layers with embedded data
        
        Returns:
            List of LayerInfo for local layers only
        """
        project_info = self.get_project_info()
        return [layer for layer in project_info.layers if layer.is_local]
        
    def save_modified_qgs(self, output_path: Path):
        """
        Save modified .qgs XML to file
        
        Args:
            output_path: Path to save modified .qgs
        """
        if not self.tree:
            raise ValueError("Must parse XML first")
        
        self.tree.write(output_path, encoding='utf-8', xml_declaration=True)
        logger.info(f"Saved modified .qgs to: {output_path}")
        
    def update_layer_datasource(self, layer_id: str, new_datasource: str):
        """
        Update datasource for a specific layer
        
        Supports both QGIS ≤3.34 (@id attribute) and
        QGIS 3.40+ (<id> child element) formats.
        
        Args:
            layer_id: Layer ID to update
            new_datasource: New datasource connection string
        """
        if not self.root:
            raise ValueError("Must parse XML first")
        
        # Try 1: Find by @id attribute (QGIS ≤3.34)
        layer_elem = self.root.find(f".//maplayer[@id='{layer_id}']")
        
        # Try 2: Find by <id> child element text (QGIS 3.40+)
        if layer_elem is None:
            for ml in self.root.findall('.//maplayer'):
                id_elem = ml.find('id')
                if id_elem is not None and id_elem.text == layer_id:
                    layer_elem = ml
                    break
        
        if layer_elem is None:
            raise ValueError(f"Layer {layer_id} not found")
        
        # Update datasource
        datasource_elem = layer_elem.find('datasource')
        if datasource_elem is not None:
            datasource_elem.text = new_datasource
            
            # Also update provider to 'postgres' for PostGIS datasources
            if "dbname=" in new_datasource and "table=" in new_datasource:
                provider_elem = layer_elem.find('.//provider')
                if provider_elem is not None:
                    provider_elem.text = 'postgres'
            
            logger.info(f"Updated datasource for layer {layer_id}")
        else:
            logger.warning(f"No datasource element found for layer {layer_id}")
