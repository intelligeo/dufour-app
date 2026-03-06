"""
QWC Service
Generates QWC2 theme configurations from QGIS projects
Provides integration between QGIS Server and QWC2 frontend
"""
import os
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
import xml.etree.ElementTree as ET
import aiofiles

from models.schemas import ThemeConfig


class QWCService:
    """Service for QWC2 configuration management"""
    
    def __init__(self):
        # QWC config directory
        self.qwc_config_dir = Path(os.getenv('QWC_CONFIG_DIR', '/qwc-config'))
        self.themes_dir = self.qwc_config_dir / 'themes'
        self.themes_dir.mkdir(parents=True, exist_ok=True)
        
        # Projects directory
        self.projects_dir = Path(os.getenv('PROJECTS_DIR', '/projects'))
        
        # QGIS Server URL
        self.qgis_server_url = os.getenv('QGIS_SERVER_URL', 'http://qgis-server:80')
    
    
    async def generate_theme_config(self, project_name: str) -> Dict[str, Any]:
        """
        Generate QWC2 theme configuration from QGIS project
        Reads .qgs XML and creates compatible theme JSON
        """
        project_file = self.projects_dir / f"{project_name}.qgs"
        
        if not project_file.exists():
            raise FileNotFoundError(f"Project {project_name}.qgs not found")
        
        # Parse QGIS project XML
        tree = ET.parse(project_file)
        root = tree.getroot()
        
        # Extract project metadata
        title = self._get_text(root, './/title') or project_name
        abstract = self._get_text(root, './/abstract')
        
        # Extract CRS
        crs_elem = root.find('.//mapcanvas/destinationsrs/spatialrefsys/authid')
        map_crs = crs_elem.text if crs_elem is not None else 'EPSG:3857'
        
        # Extract extent
        extent = self._extract_extent(root)
        
        # Extract scales
        scales = self._extract_scales(root)
        
        # Extract layers
        theme_layers = await self._extract_layers(root, project_name)
        
        # Build theme configuration
        theme_config = {
            "title": title,
            "name": project_name,
            "url": f"{self.qgis_server_url}/cgi-bin/qgis_mapserv.fcgi?MAP=/data/projects/{project_name}.qgs",
            "abstract": abstract,
            "attribution": "Dufour-app",
            "keywords": ["military", "tactical"],
            "mapCrs": map_crs,
            "extent": extent,
            "scales": scales,
            "printScales": scales,
            "printResolutions": [96],
            "backgroundLayers": self._get_background_layers(),
            "themeLayers": theme_layers,
            "searchProviders": ["coordinates"],
            "editConfig": {},
            "watermark": {
                "text": "Dufour-app",
                "position": "bottomright"
            }
        }
        
        # Save theme config to JSON
        theme_file = self.themes_dir / f"{project_name}.json"
        async with aiofiles.open(theme_file, 'w') as f:
            await f.write(json.dumps(theme_config, indent=2))
        
        return theme_config
    
    
    async def list_themes(self) -> List[Dict[str, str]]:
        """
        List all available QWC2 themes
        """
        themes = []
        
        for theme_file in self.themes_dir.glob('*.json'):
            try:
                async with aiofiles.open(theme_file, 'r') as f:
                    content = await f.read()
                    config = json.loads(content)
                    themes.append({
                        "name": theme_file.stem,
                        "title": config.get('title', theme_file.stem),
                        "url": config.get('url')
                    })
            except:
                continue
        
        return themes
    
    
    async def get_theme_config(self, theme_name: str) -> Optional[Dict[str, Any]]:
        """
        Get full theme configuration
        """
        theme_file = self.themes_dir / f"{theme_name}.json"
        
        if not theme_file.exists():
            return None
        
        async with aiofiles.open(theme_file, 'r') as f:
            content = await f.read()
            return json.loads(content)
    
    
    # ============ Private Helper Methods ============
    
    def _get_text(self, root: ET.Element, xpath: str) -> Optional[str]:
        """Safely get text from XML element"""
        elem = root.find(xpath)
        return elem.text if elem is not None else None
    
    
    def _extract_extent(self, root: ET.Element) -> List[float]:
        """Extract map extent from project"""
        extent_elem = root.find('.//mapcanvas/extent')
        
        if extent_elem is not None:
            try:
                return [
                    float(extent_elem.find('xmin').text),
                    float(extent_elem.find('ymin').text),
                    float(extent_elem.find('xmax').text),
                    float(extent_elem.find('ymax').text)
                ]
            except:
                pass
        
        # Default extent (Swiss bounds in EPSG:3857)
        return [664577, 5753148, 1167741, 6075303]
    
    
    def _extract_scales(self, root: ET.Element) -> List[int]:
        """Extract scale denominators from project"""
        # Try to find configured scales
        scales_elem = root.find('.//mapcanvas/scales')
        
        if scales_elem is not None:
            scales = []
            for scale in scales_elem.findall('scale'):
                try:
                    scales.append(int(float(scale.text)))
                except:
                    pass
            if scales:
                return sorted(scales, reverse=True)
        
        # Default scales for web mapping
        return [
            1000000, 500000, 250000, 100000, 50000, 25000,
            10000, 5000, 2500, 1000, 500, 250
        ]
    
    
    async def _extract_layers(self, root: ET.Element, project_name: str) -> List[Dict[str, Any]]:
        """
        Extract layer tree from QGIS project
        Builds QWC2-compatible layer structure
        """
        layers = []
        
        # Find all maplayers
        for layer_elem in root.findall('.//maplayer'):
            layer_id = layer_elem.get('id', '')
            layer_name = self._get_text(layer_elem, 'layername') or 'Unnamed'
            layer_type = layer_elem.get('type', 'vector')
            
            # Check if layer is visible
            visible = True
            visibility_elem = layer_elem.find('.//renderer-v2')
            
            # Build layer configuration
            layer_config = {
                "name": layer_name,
                "id": layer_id,
                "title": layer_name,
                "visibility": visible,
                "queryable": True,
                "displayField": "",
                "opacity": 255,
                "bbox": {
                    "crs": "EPSG:3857",
                    "bounds": [664577, 5753148, 1167741, 6075303]
                }
            }
            
            # Add layer type-specific config
            if layer_type == 'raster':
                layer_config['type'] = 'wms'
            else:
                layer_config['type'] = 'wms'  # Vector layers served as WMS
            
            layers.append(layer_config)
        
        # Reverse to match QGIS layer order (bottom to top)
        return list(reversed(layers))
    
    
    def _get_background_layers(self) -> List[Dict[str, Any]]:
        """
        Get default background layers configuration
        Swiss Topo layers for Dufour-app
        """
        return [
            {
                "name": "swisstopo",
                "title": "SwissTopo National Map",
                "type": "wmts",
                "url": "https://wmts.geo.admin.ch/1.0.0/{Layer}/default/current/3857/{TileMatrix}/{TileRow}/{TileCol}.jpeg",
                "tileMatrixSet": "3857",
                "originX": -20037508.34,
                "originY": 20037508.34,
                "projection": "EPSG:3857",
                "tileSize": [256, 256],
                "resolutions": [
                    4000, 3750, 3500, 3250, 3000, 2750, 2500, 2250, 2000,
                    1750, 1500, 1250, 1000, 750, 650, 500, 250, 100, 50,
                    20, 10, 5, 2.5, 2, 1.5, 1, 0.5
                ],
                "visibility": True,
                "thumbnail": "swisstopo.jpg"
            },
            {
                "name": "osm",
                "title": "OpenStreetMap",
                "type": "osm",
                "source": "osm",
                "visibility": False
            }
        ]
