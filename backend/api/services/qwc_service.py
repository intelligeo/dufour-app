"""
QWC Service
Generates QWC2 theme configurations from QGIS projects
Provides integration between QGIS Server and QWC2 frontend
"""
import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import xml.etree.ElementTree as ET
import aiofiles

from models.schemas import ThemeConfig

logger = logging.getLogger(__name__)


class QWCService:
    """Service for QWC2 configuration management"""
    
    def __init__(self):
        # QWC config directory
        self.qwc_config_dir = Path(os.getenv('QWC_CONFIG_DIR', '/qwc-config'))
        self.themes_dir = self.qwc_config_dir / 'themes'
        self.themes_dir.mkdir(parents=True, exist_ok=True)
        
        # Projects directory
        self.projects_dir = Path(os.getenv('PROJECTS_DIR', '/data/projects'))
        
        # QGIS Server URL
        self.qgis_server_url = os.getenv('QGIS_SERVER_URL', 'http://qgis-server:8080')
    
    
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

    async def generate_full_themes_json(self, api_base_url: str = "") -> Dict[str, Any]:
        """
        Generate full QWC2-compatible themes.json from projects stored in PostgreSQL.
        This is what QWC2 StandardApp expects at /themes.json.

        Args:
            api_base_url: Base URL for WMS proxy (e.g. https://api.intelligeo.net).
                          If empty, uses relative paths.
        """
        items = []

        # Read projects from PostgreSQL database
        try:
            from services.qgis_storage_service import storage_service
            db_projects = storage_service.list_projects()
        except Exception as e:
            logger.error(f"Failed to read projects from database: {e}")
            db_projects = []

        for project in db_projects:
            try:
                project_name = project['name']
                extent = project.get('extent') or [-180, -85, 180, 85]
                map_crs = project.get('crs') or 'EPSG:3857'

                # Build QWC2-compatible WMS URL
                wms_url = f"{api_base_url}/api/projects/{project_name}/wms"

                item = {
                    "id": project_name,
                    "name": project_name,
                    "title": project.get('title') or project_name,
                    "description": project.get('description') or '',
                    "url": wms_url,
                    "attribution": "Dufour.app",
                    "mapCrs": "EPSG:3857",
                    "bbox": {
                        "crs": "EPSG:4326",
                        "bounds": [-180, -85, 180, 85]
                    },
                    "initialBbox": {
                        "crs": map_crs,
                        "bounds": extent
                    },
                    "scales": self._default_scales_full(),
                    "printScales": self._default_scales(),
                    "printResolutions": [150, 300, 600],
                    "searchProviders": ["coordinates", "geoadmin"],
                    "backgroundLayers": [
                        {"name": "arcgis_world_imagery"},
                        {"name": "arcgis_world_topo"},
                        {"name": "swisstopo_national"},
                        {"name": "osm"}
                    ],
                    "sublayers": [],
                    "thumbnail": "assets/img/mapthumbs/default.jpg",
                    "additionalMouseCrs": ["EPSG:2056", "EPSG:4326", "EPSG:21781", "MGRS"]
                }
                items.append(item)
            except Exception as e:
                logger.warning(f"Failed to build theme for project {project.get('name')}: {e}")
                continue

        # Also check for theme JSON files on filesystem (legacy)
        for theme_file in sorted(self.themes_dir.glob('*.json')):
            try:
                theme_name = theme_file.stem
                # Skip if already loaded from DB
                if any(i['id'] == theme_name for i in items):
                    continue
                async with aiofiles.open(theme_file, 'r') as f:
                    content = await f.read()
                    config = json.loads(content)
                extent = config.get('extent', [-180, -85, 180, 85])
                map_crs = config.get('mapCrs', 'EPSG:3857')
                wms_url = f"{api_base_url}/api/projects/{theme_name}/wms"
                item = {
                    "id": theme_name,
                    "name": theme_name,
                    "title": config.get('title', theme_name),
                    "description": config.get('abstract', ''),
                    "url": wms_url,
                    "attribution": config.get('attribution', 'Dufour.app'),
                    "mapCrs": "EPSG:3857",
                    "bbox": {"crs": "EPSG:4326", "bounds": [-180, -85, 180, 85]},
                    "initialBbox": {"crs": map_crs, "bounds": extent},
                    "scales": self._default_scales_full(),
                    "printScales": self._default_scales(),
                    "printResolutions": [150, 300, 600],
                    "searchProviders": ["coordinates", "geoadmin"],
                    "backgroundLayers": [
                        {"name": "arcgis_world_imagery"},
                        {"name": "arcgis_world_topo"},
                        {"name": "swisstopo_national"},
                        {"name": "osm"}
                    ],
                    "sublayers": [],
                    "thumbnail": "assets/img/mapthumbs/default.jpg"
                }
                items.append(item)
            except Exception:
                continue

        # If no projects uploaded yet, provide a default placeholder
        if not items:
            items.append({
                "id": "dufour_default",
                "name": "dufour_default",
                "title": "Dufour World",
                "description": "Upload QGIS projects to add themes",
                "url": f"{api_base_url}/api/projects/dufour_default/wms",
                "attribution": "Dufour.app",
                "mapCrs": "EPSG:3857",
                "bbox": {"crs": "EPSG:4326", "bounds": [-180, -85, 180, 85]},
                "initialBbox": {"crs": "EPSG:4326", "bounds": [5.95, 45.82, 10.49, 47.81]},
                "scales": self._default_scales_full(),
                "printScales": self._default_scales(),
                "printResolutions": [150, 300, 600],
                "searchProviders": ["coordinates", "geoadmin"],
                "backgroundLayers": [
                    {"name": "arcgis_world_imagery"},
                    {"name": "arcgis_world_topo"},
                    {"name": "swisstopo_national"},
                    {"name": "osm"}
                ],
                "sublayers": [],
                "thumbnail": "assets/img/mapthumbs/default.jpg",
                "additionalMouseCrs": ["EPSG:2056", "EPSG:4326", "EPSG:21781", "MGRS"]
            })

        default_theme = items[0]["id"] if items else "dufour_default"

        return {
            "themes": {
                "title": "root",
                "items": items,
                "subdirs": [],
                "defaultTheme": default_theme,
                "externalLayers": [],
                "themeInfoLinks": [],
                "defaultMapCrs": "EPSG:3857",
                "defaultScales": self._default_scales_full(),
                "defaultPrintScales": self._default_scales(),
                "defaultPrintResolutions": [150, 300, 600],
                "defaultSearchProviders": ["coordinates", "geoadmin"],
                "defaultPrintGrid": [
                    {"s": 10000, "x": 1000, "y": 1000},
                    {"s": 5000, "x": 500, "y": 500},
                    {"s": 2500, "x": 250, "y": 250},
                    {"s": 1000, "x": 100, "y": 100},
                    {"s": 500, "x": 50, "y": 50}
                ],
                "backgroundLayers": self._get_qwc2_background_layers()
            }
        }

    def _default_scales(self) -> List[int]:
        return [1000000, 500000, 250000, 100000, 50000, 25000,
                10000, 5000, 2500, 1000, 500, 250]

    def _default_scales_full(self) -> List[int]:
        """Full scale range including global zoom levels"""
        return [2000000000, 1000000000, 500000000, 250000000, 100000000,
                50000000, 25000000, 10000000, 5000000, 2500000,
                1000000, 500000, 250000, 100000, 50000, 25000,
                10000, 5000, 2500, 1000, 500, 250]

    def _get_qwc2_background_layers(self) -> List[Dict[str, Any]]:
        """Background layers in full QWC2 themes.json format"""
        return [
            {
                "name": "arcgis_world_imagery",
                "title": "ArcGIS World Imagery",
                "type": "xyz",
                "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                "projection": "EPSG:3857",
                "thumbnail": "assets/arcgis_imagery.jpg",
                "attribution": "Esri, DigitalGlobe, GeoEye, Earthstar Geographics"
            },
            {
                "name": "arcgis_world_topo",
                "title": "ArcGIS World Topographic",
                "type": "xyz",
                "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
                "projection": "EPSG:3857",
                "thumbnail": "assets/arcgis_topo.jpg",
                "attribution": "Esri, HERE, Garmin, OpenStreetMap contributors"
            },
            {
                "name": "swisstopo_national",
                "title": "SwissTopo National Map",
                "type": "wmts",
                "url": "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{TileMatrix}/{TileRow}/{TileCol}.jpeg",
                "tileMatrixPrefix": "",
                "tileMatrixSet": "3857",
                "originX": -20037508.3428,
                "originY": 20037508.3428,
                "projection": "EPSG:3857",
                "resolutions": [4000, 3750, 3500, 3250, 3000, 2750, 2500, 2250, 2000,
                                1750, 1500, 1250, 1000, 750, 650, 500, 250, 100, 50,
                                20, 10, 5, 2.5, 2, 1.5, 1, 0.5],
                "tileSize": [256, 256],
                "thumbnail": "assets/swisstopo.jpg",
                "attribution": "swisstopo"
            },
            {
                "name": "osm",
                "title": "OpenStreetMap",
                "type": "osm",
                "source": "osm",
                "thumbnail": "assets/osm.jpg",
                "attribution": "OpenStreetMap contributors"
            }
        ]
    
    
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
                "thumbnail": "assets/swisstopo.jpg"
            },
            {
                "name": "osm",
                "title": "OpenStreetMap",
                "type": "osm",
                "source": "osm",
                "visibility": False
            }
        ]
