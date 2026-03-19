"""
MilSymb Service
Extracts military symbol (KadasMilxLayer) data from QGIS projects
stored in PostgreSQL, and serves it as GeoJSON suitable for
client-side rendering via milsymbol.

Pipeline:
  1.  Retrieve .qgz bytes from DB
  2.  Parse .qgs XML → MilSymbLayerInfo / MilSymbFeature  (qgz_parser)
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
    MilSymbFeature,
    MilSymbLayerInfo,
)

logger = logging.getLogger(__name__)


# ── GeoJSON conversion ────────────────────────────────────────────────────────

def milsymb_feature_to_geojson(feat: MilSymbFeature) -> Dict[str, Any]:
    """Convert a single MilSymbFeature to a GeoJSON Feature dict.

    All milsymbol-compatible modifiers are emitted as **flat** GeoJSON
    properties so the frontend can forward them directly as query
    parameters to the milsymbol-server or as options to
    ``new ms.Symbol(sidc, options)``.

    The property schema matches the milsymbol ``SymbolOptions`` interface:
    ``sidc``, ``uniqueDesignation``, ``staffComments``, ``speed``, etc.
    """
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

    # Build properties — flat milsymbol-compatible keys
    props: Dict[str, Any] = {
        "sidc": feat.sidc,
        "militaryName": feat.military_name,
        "symbolType": feat.geometry_type,
        "symbolScale": feat.symbol_scale,
        "affiliation": feat.affiliation,
    }

    # Merge milsymbol modifiers as flat properties
    # These map 1:1 to milsymbol SymbolOptions (uniqueDesignation, speed, etc.)
    if feat.modifiers:
        props.update(feat.modifiers)

    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": props,
    }


def milsymb_layer_to_geojson(layer: MilSymbLayerInfo) -> Dict[str, Any]:
    """Convert a full MilSymbLayerInfo to a GeoJSON FeatureCollection.

    Since each MilSymbLayerInfo now represents a single feature
    (one KadasMilxItem), the FeatureCollection will typically contain
    exactly one Feature.  The metadata block carries per-layer info
    that the frontend uses for styling.
    """
    features = [milsymb_feature_to_geojson(f) for f in layer.features]
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
            "parentLayerTitle": layer.parent_layer_title,
            "symbolSize": layer.symbol_size,
            "lineWidth": layer.line_width,
        },
        "features": features,
    }


# ── Extraction from stored .qgz bytes ────────────────────────────────────────

def extract_milsymb_layers_from_qgz(qgz_bytes: bytes) -> List[MilSymbLayerInfo]:
    """
    Given raw .qgz bytes, extract all KadasMilxLayer layers.

    Returns:
        List of MilSymbLayerInfo (may be empty).
    """
    # Write bytes to a temp file so QGZParser can work with it
    tmp = tempfile.NamedTemporaryFile(suffix=".qgz", delete=False)
    try:
        tmp.write(qgz_bytes)
        tmp.close()

        with QGZParser(Path(tmp.name)) as parser:
            parser.extract()
            parser.parse_xml()
            return parser.parse_milsymb_layers()
    except Exception as e:
        logger.error(f"Failed to extract military symbol layers: {e}")
        return []
    finally:
        Path(tmp.name).unlink(missing_ok=True)


def extract_milsymb_layers_from_qgs_xml(qgs_xml: str) -> List[MilSymbLayerInfo]:
    """
    Parse military symbol layers directly from a .qgs XML string (no .qgz needed).
    Useful for projects stored on disk as plain .qgs.
    """
    import xml.etree.ElementTree as ET
    from services.qgz_parser import MilSymbFeature  # noqa: F401

    root = ET.fromstring(qgs_xml)
    parser = QGZParser.__new__(QGZParser)  # bypass __init__
    parser.root = root
    parser.temp_dir = None
    parser.qgs_path = None
    parser.tree = None
    return parser.parse_milsymb_layers()


# ── High-level API helpers ────────────────────────────────────────────────────

def get_milsymb_layers_for_project(project_name: str) -> List[MilSymbLayerInfo]:
    """
    Retrieve .qgz from DB and extract military symbol layers.

    Returns:
        List[MilSymbLayerInfo] — empty if no military symbol layers or project not found.
    """
    try:
        from services.qgis_storage_service import storage_service
        qgz_bytes = storage_service.retrieve_qgz(project_name)
        if not qgz_bytes:
            logger.warning(f"No .qgz found in DB for project '{project_name}'")
            return []
        return extract_milsymb_layers_from_qgz(qgz_bytes)
    except Exception as e:
        logger.error(f"get_milsymb_layers_for_project('{project_name}'): {e}")
        return []


def get_milsymb_geojson(project_name: str, layer_title: str) -> Optional[Dict[str, Any]]:
    """
    Return a GeoJSON FeatureCollection for a specific military symbol sub-layer.

    Args:
        project_name: Project identifier
        layer_title: Layer title – URL-encoded with underscores for spaces
                     and slashes (e.g. "BLUE_FORCE___gren_team_DELTA")

    Returns:
        GeoJSON dict or None if not found.
    """
    layers = get_milsymb_layers_for_project(project_name)

    # Normalise the requested title for comparison:
    # URL uses underscores for both spaces and slashes
    def _normalise(s: str) -> str:
        return s.lower().replace(" ", "_").replace("/", "_")

    title_norm = _normalise(layer_title)

    for lyr in layers:
        if _normalise(lyr.title) == title_norm:
            return milsymb_layer_to_geojson(lyr)

    # Fallback: try matching without the parent prefix
    for lyr in layers:
        # e.g. "BLUE FORCE / gren team DELTA" → try just "gren_team_DELTA"
        if " / " in lyr.title:
            suffix = lyr.title.split(" / ", 1)[1]
            if _normalise(suffix) == title_norm:
                return milsymb_layer_to_geojson(lyr)

    return None
