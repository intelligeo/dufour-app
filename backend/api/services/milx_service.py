"""
MilX Service
Extracts military symbol (KadasMilxLayer) data from QGIS projects
stored in PostgreSQL, and serves it as GeoJSON suitable for
client-side rendering via milsymbol.

Pipeline:
  1.  Retrieve .qgz bytes from DB
  2.  Parse .qgs XML → MilxLayerInfo / MilxFeature  (qgz_parser)
  3.  Convert to GeoJSON FeatureCollection
"""

import io
import json
import logging
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.qgz_parser import (
    QGZParser,
    MilxFeature,
    MilxLayerInfo,
)

logger = logging.getLogger(__name__)


# ── GeoJSON conversion ────────────────────────────────────────────────────────

def milx_feature_to_geojson(feat: MilxFeature) -> Dict[str, Any]:
    """Convert a single MilxFeature to a GeoJSON Feature dict."""
    coords = feat.coordinates  # [[lon, lat], ...]

    if feat.geometry_type == "Point":
        geometry = {
            "type": "Point",
            "coordinates": coords[0] if coords else [0, 0],
        }
    elif feat.geometry_type == "Polygon":
        # Close the ring if not already closed
        ring = [list(c) for c in coords]
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        geometry = {
            "type": "Polygon",
            "coordinates": [ring],
        }
    else:  # LineString
        geometry = {
            "type": "LineString",
            "coordinates": [list(c) for c in coords],
        }

    # Build properties — include everything the frontend needs to render
    props: Dict[str, Any] = {
        "sidc": feat.sidc,
        "militaryName": feat.military_name,
        "symbolType": feat.geometry_type,
        "symbolScale": feat.symbol_scale,
    }
    # Flatten MSS attributes  (T → uniqueDesignation, etc.)
    if feat.attributes:
        props["mssAttributes"] = feat.attributes
        # Map well-known Kadas attribute IDs to milsymbol query params
        if "T" in feat.attributes:
            props["uniqueDesignation"] = feat.attributes["T"]
        if "XE" in feat.attributes:
            props["xeCode"] = feat.attributes["XE"]

    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": props,
    }


def milx_layer_to_geojson(layer: MilxLayerInfo) -> Dict[str, Any]:
    """Convert a full MilxLayerInfo to a GeoJSON FeatureCollection."""
    features = [milx_feature_to_geojson(f) for f in layer.features]
    return {
        "type": "FeatureCollection",
        "name": layer.title,
        "crs": {
            "type": "name",
            "properties": {"name": f"urn:ogc:def:crs:{layer.crs.replace(':', '::')}"}
        },
        "metadata": {
            "layerId": layer.layer_id,
            "affiliation": layer.affiliation,
            "symbolSize": layer.symbol_size,
            "lineWidth": layer.line_width,
        },
        "features": features,
    }


# ── Extraction from stored .qgz bytes ────────────────────────────────────────

def extract_milx_layers_from_qgz(qgz_bytes: bytes) -> List[MilxLayerInfo]:
    """
    Given raw .qgz bytes, extract all KadasMilxLayer layers.

    Returns:
        List of MilxLayerInfo (may be empty).
    """
    # Write bytes to a temp file so QGZParser can work with it
    tmp = tempfile.NamedTemporaryFile(suffix=".qgz", delete=False)
    try:
        tmp.write(qgz_bytes)
        tmp.close()

        with QGZParser(Path(tmp.name)) as parser:
            parser.extract()
            parser.parse_xml()
            return parser.parse_milx_layers()
    except Exception as e:
        logger.error(f"Failed to extract MilX layers: {e}")
        return []
    finally:
        Path(tmp.name).unlink(missing_ok=True)


def extract_milx_layers_from_qgs_xml(qgs_xml: str) -> List[MilxLayerInfo]:
    """
    Parse MilX layers directly from a .qgs XML string (no .qgz needed).
    Useful for projects stored on disk as plain .qgs.
    """
    import xml.etree.ElementTree as ET
    from services.qgz_parser import _guess_affiliation, MilxFeature

    root = ET.fromstring(qgs_xml)
    parser = QGZParser.__new__(QGZParser)  # bypass __init__
    parser.root = root
    parser.temp_dir = None
    parser.qgs_path = None
    parser.tree = None
    return parser.parse_milx_layers()


# ── High-level API helpers ────────────────────────────────────────────────────

def get_milx_layers_for_project(project_name: str) -> List[MilxLayerInfo]:
    """
    Retrieve .qgz from DB and extract MilX layers.

    Returns:
        List[MilxLayerInfo] — empty if no MilX layers or project not found.
    """
    try:
        from services.qgis_storage_service import storage_service
        qgz_bytes = storage_service.retrieve_qgz(project_name)
        if not qgz_bytes:
            logger.warning(f"No .qgz found in DB for project '{project_name}'")
            return []
        return extract_milx_layers_from_qgz(qgz_bytes)
    except Exception as e:
        logger.error(f"get_milx_layers_for_project('{project_name}'): {e}")
        return []


def get_milx_geojson(project_name: str, layer_title: str) -> Optional[Dict[str, Any]]:
    """
    Return a GeoJSON FeatureCollection for a specific MilX layer.

    Args:
        project_name: Project identifier
        layer_title: Layer title (e.g. "BLUE FORCE")

    Returns:
        GeoJSON dict or None if not found.
    """
    layers = get_milx_layers_for_project(project_name)
    # Match by title (case-insensitive, with fallback to slug)
    title_lower = layer_title.lower().replace("_", " ")
    for lyr in layers:
        if lyr.title.lower() == title_lower:
            return milx_layer_to_geojson(lyr)
    # Try matching with underscores replaced by spaces
    for lyr in layers:
        if lyr.title.lower().replace(" ", "_") == layer_title.lower():
            return milx_layer_to_geojson(lyr)
    return None
