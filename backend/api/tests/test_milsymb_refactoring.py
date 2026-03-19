"""
Tests for the milsymbol-compatible data structure refactoring.

Covers:
- MSS_TO_MILSYMBOL mapping dict & numeric coercion
- _parse_milsymb_item()  (single MapItem → MilSymbFeature)
- parse_milsymb_layers() (KadasMilxLayer → split sub-layers)
- milsymb_service.py GeoJSON conversion & title normalisation

Uses only ``unittest`` (stdlib) – no pytest required.
Run:  python -m unittest discover -s tests -p "test_milsymb_refactoring.py" -v
"""
import json
import os
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
from unittest.mock import patch

# Ensure backend/api is on sys.path (same trick as conftest.py)
_API_DIR = Path(__file__).resolve().parent.parent
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("LOG_LEVEL", "WARNING")

from services.qgz_parser import (          # noqa: E402
    MSS_TO_MILSYMBOL,
    MilSymbFeature,
    MilSymbLayerInfo,
    QGZParser,
    _AFFILIATION_MAP_2525C,
    _NUMERIC_MILSYMBOL_KEYS,
)
from services.milsymb_service import (      # noqa: E402
    milsymb_feature_to_geojson,
    milsymb_layer_to_geojson,
    get_milsymb_geojson,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _build_mss_string(sidc: str, attrs: Optional[Dict[str, str]] = None) -> str:
    """Build a mini-XML mssString as Kadas produces it."""
    parts = [f'<Symbol ID="{sidc}">']
    for k, v in (attrs or {}).items():
        parts.append(f'<Attribute ID="{k}">{v}</Attribute>')
    parts.append("</Symbol>")
    return "".join(parts)


def _build_map_item_json(
    sidc: str,
    military_name: str = "",
    symbol_type: str = "Point",
    points: Optional[list] = None,
    mss_attrs: Optional[Dict[str, str]] = None,
    symbol_scale: float = 1.0,
) -> str:
    """Return JSON payload matching what KadasMilxItem stores inside <MapItem>."""
    return json.dumps({
        "props": {
            "mssString": _build_mss_string(sidc, mss_attrs),
            "militaryName": military_name,
            "symbolType": symbol_type,
            "symbolScale": symbol_scale,
        },
        "state": {
            "points": points or [[7.45, 46.95]],
        },
    })


def _make_kadasmilxlayer_xml(
    parent_title: str,
    items: List[dict],
    crs: str = "EPSG:4326",
    layer_id: str = "milx_layer_1",
    symbol_size: int = 60,
    line_width: int = 2,
) -> str:
    """Return a complete <qgis> XML string with one KadasMilxLayer and N items.

    We must use ElementTree to build the XML so that JSON payloads
    (containing double-quotes) are properly escaped as &quot; in the
    serialised text nodes.
    """
    root = ET.Element("qgis", attrib={"projectname": "test", "version": "3.40.7"})
    ET.SubElement(root, "title").text = "Test"
    pc = ET.SubElement(ET.SubElement(root, "projectCrs"), "spatialrefsys")
    ET.SubElement(pc, "authid").text = "EPSG:2056"
    mc = ET.SubElement(root, "mapcanvas")
    ext = ET.SubElement(mc, "extent")
    for tag, val in [("xmin", "0"), ("ymin", "0"), ("xmax", "1"), ("ymax", "1")]:
        ET.SubElement(ext, tag).text = val
    pl = ET.SubElement(root, "projectlayers")
    ml = ET.SubElement(pl, "maplayer", attrib={
        "type": "plugin",
        "name": "KadasMilxLayer",
        "title": parent_title,
        "milx_symbol_size": str(symbol_size),
        "milx_line_width": str(line_width),
    })
    ET.SubElement(ml, "id").text = layer_id
    ET.SubElement(ml, "layername").text = parent_title
    srs_auth = ET.SubElement(ET.SubElement(ml, "srs"), "spatialrefsys")
    ET.SubElement(srs_auth, "authid").text = crs

    for it in items:
        payload = _build_map_item_json(
            sidc=it["sidc"],
            military_name=it.get("name", ""),
            symbol_type=it.get("symbol_type", "Point"),
            points=it.get("points"),
            mss_attrs=it.get("mss_attrs"),
            symbol_scale=it.get("symbol_scale", 1.0),
        )
        mi = ET.SubElement(ml, "MapItem", attrib={"name": "KadasMilxItem"})
        mi.text = payload

    return ET.tostring(root, encoding="unicode", xml_declaration=True)


def _parser_from_xml(xml_string: str) -> QGZParser:
    """Create a headless QGZParser with only root populated (no disk I/O)."""
    root = ET.fromstring(xml_string)
    p = QGZParser.__new__(QGZParser)
    p.root = root
    p.temp_dir = None
    p.qgs_path = None
    p.tree = None
    return p


def _make_elem(payload: str) -> ET.Element:
    """Wrap a JSON payload into a <MapItem> element."""
    elem = ET.Element("MapItem", attrib={"name": "KadasMilxItem"})
    elem.text = payload
    return elem


def _make_feat(**kw) -> MilSymbFeature:
    """Shortcut to build a MilSymbFeature with sensible defaults."""
    defaults: dict = dict(
        sidc="SFGPUC-----A--G",
        military_name="Alpha",
        geometry_type="Point",
        coordinates=[[7.45, 46.95]],
        modifiers={"uniqueDesignation": "Alpha", "speed": "50"},
        mss_raw_attributes={"T": "Alpha", "Z": "50"},
        affiliation="friendly",
        symbol_scale=1.0,
    )
    defaults.update(kw)
    return MilSymbFeature(**defaults)


def _make_two_feature_parser() -> QGZParser:
    """Parser with one KadasMilxLayer containing 2 items."""
    xml = _make_kadasmilxlayer_xml(
        parent_title="BLUE FORCE",
        items=[
            {
                "sidc": "SFGPUC-----A--G",
                "name": "gren team DELTA",
                "points": [[7.45, 46.95]],
                "mss_attrs": {"T": "DELTA"},
            },
            {
                "sidc": "SHGPUC-----A--G",
                "name": "hostile CP",
                "points": [[7.50, 47.00]],
                "mss_attrs": {"T": "ECHO", "H": "observed"},
            },
        ],
    )
    return _parser_from_xml(xml)


def _make_test_layers() -> List[MilSymbLayerInfo]:
    """Two fake layers for title-normalisation tests."""
    feat_a = MilSymbFeature(
        sidc="SFGPUC-----A--G",
        military_name="gren team DELTA",
        geometry_type="Point",
        coordinates=[[7.45, 46.95]],
        modifiers={"uniqueDesignation": "DELTA"},
        affiliation="friendly",
    )
    feat_b = MilSymbFeature(
        sidc="SHGPUC-----A--G",
        military_name="hostile CP",
        geometry_type="Point",
        coordinates=[[7.50, 47.00]],
        affiliation="hostile",
    )
    return [
        MilSymbLayerInfo(
            layer_id="l1_feat1",
            title="BLUE FORCE / gren team DELTA",
            affiliation="friendly",
            crs="EPSG:4326",
            parent_layer_title="BLUE FORCE",
            features=[feat_a],
        ),
        MilSymbLayerInfo(
            layer_id="l1_feat2",
            title="BLUE FORCE / hostile CP",
            affiliation="hostile",
            crs="EPSG:4326",
            parent_layer_title="BLUE FORCE",
            features=[feat_b],
        ),
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# MSS_TO_MILSYMBOL mapping
# ═══════════════════════════════════════════════════════════════════════════════

class TestMSSToMilsymbolMapping(unittest.TestCase):
    """Verify the static mapping dict is consistent."""

    def test_mapping_not_empty(self):
        self.assertGreater(len(MSS_TO_MILSYMBOL), 20)

    def test_key_T_maps_to_uniqueDesignation(self):
        self.assertEqual(MSS_TO_MILSYMBOL["T"], "uniqueDesignation")

    def test_key_H_maps_to_additionalInformation(self):
        self.assertEqual(MSS_TO_MILSYMBOL["H"], "additionalInformation")

    def test_key_G_maps_to_staffComments(self):
        self.assertEqual(MSS_TO_MILSYMBOL["G"], "staffComments")

    def test_key_Q_maps_to_direction(self):
        self.assertEqual(MSS_TO_MILSYMBOL["Q"], "direction")

    def test_key_Z_maps_to_speed(self):
        self.assertEqual(MSS_TO_MILSYMBOL["Z"], "speed")

    def test_key_XE_alias_for_altitudeDepth(self):
        self.assertEqual(MSS_TO_MILSYMBOL["X"], "altitudeDepth")
        self.assertEqual(MSS_TO_MILSYMBOL["XE"], "altitudeDepth")

    def test_all_values_are_camelCase_strings(self):
        for k, v in MSS_TO_MILSYMBOL.items():
            self.assertIsInstance(v, str)
            self.assertTrue(v[0].islower(), f"Value '{v}' for key '{k}' should be camelCase")

    def test_numeric_keys_subset_of_mapping_values(self):
        values = set(MSS_TO_MILSYMBOL.values())
        for nk in _NUMERIC_MILSYMBOL_KEYS:
            self.assertIn(nk, values, f"Numeric key '{nk}' not in mapping values")


# ═══════════════════════════════════════════════════════════════════════════════
# _parse_milsymb_item – single MapItem
# ═══════════════════════════════════════════════════════════════════════════════

class TestParseMilsymbItem(unittest.TestCase):
    """Test QGZParser._parse_milsymb_item (static method)."""

    # -- Basic extraction --

    def test_basic_point_feature(self):
        payload = _build_map_item_json(
            sidc="SFGPUC-----A--G",
            military_name="gren team DELTA",
            points=[[7.45, 46.95]],
        )
        feat = QGZParser._parse_milsymb_item(_make_elem(payload))
        self.assertIsNotNone(feat)
        self.assertEqual(feat.sidc, "SFGPUC-----A--G")
        self.assertEqual(feat.military_name, "gren team DELTA")
        self.assertEqual(feat.geometry_type, "Point")
        self.assertEqual(feat.coordinates, [[7.45, 46.95]])

    def test_linestring_feature(self):
        payload = _build_map_item_json(
            sidc="SFGPUC-----A--G",
            symbol_type="Line",
            points=[[7.4, 46.9], [7.5, 47.0]],
        )
        feat = QGZParser._parse_milsymb_item(_make_elem(payload))
        self.assertIsNotNone(feat)
        self.assertEqual(feat.geometry_type, "LineString")

    def test_polygon_feature(self):
        pts = [[7.4, 46.9], [7.5, 47.0], [7.6, 46.8], [7.6, 46.8]]
        payload = _build_map_item_json(
            sidc="SFGPUC-----A--G",
            symbol_type="Polygon",
            points=pts,
        )
        feat = QGZParser._parse_milsymb_item(_make_elem(payload))
        self.assertIsNotNone(feat)
        self.assertEqual(feat.geometry_type, "Polygon")

    # -- Affiliation from SIDC --

    def test_affiliation_friendly(self):
        for ch in "FA":
            sidc = f"S{ch}GPUC-----A--G"
            payload = _build_map_item_json(sidc=sidc)
            feat = QGZParser._parse_milsymb_item(_make_elem(payload))
            self.assertIsNotNone(feat)
            self.assertEqual(feat.affiliation, "friendly", f"SIDC char '{ch}' should be friendly")

    def test_affiliation_hostile(self):
        for ch in "HS":
            sidc = f"S{ch}GPUC-----A--G"
            payload = _build_map_item_json(sidc=sidc)
            feat = QGZParser._parse_milsymb_item(_make_elem(payload))
            self.assertIsNotNone(feat)
            self.assertEqual(feat.affiliation, "hostile", f"SIDC char '{ch}' should be hostile")

    def test_affiliation_neutral(self):
        for ch in "NL":
            sidc = f"S{ch}GPUC-----A--G"
            payload = _build_map_item_json(sidc=sidc)
            feat = QGZParser._parse_milsymb_item(_make_elem(payload))
            self.assertIsNotNone(feat)
            self.assertEqual(feat.affiliation, "neutral", f"SIDC char '{ch}' should be neutral")

    def test_affiliation_unknown(self):
        for ch in "PU":
            sidc = f"S{ch}GPUC-----A--G"
            payload = _build_map_item_json(sidc=sidc)
            feat = QGZParser._parse_milsymb_item(_make_elem(payload))
            self.assertIsNotNone(feat)
            self.assertEqual(feat.affiliation, "unknown", f"SIDC char '{ch}' should be unknown")

    # -- MSS attributes → milsymbol modifiers --

    def test_modifiers_mapped_from_mss_attrs(self):
        payload = _build_map_item_json(
            sidc="SFGPUC-----A--G",
            mss_attrs={"T": "Alpha", "H": "2nd Bn", "Z": "35 kph"},
        )
        feat = QGZParser._parse_milsymb_item(_make_elem(payload))
        self.assertIsNotNone(feat)
        self.assertEqual(feat.modifiers["uniqueDesignation"], "Alpha")
        self.assertEqual(feat.modifiers["additionalInformation"], "2nd Bn")
        self.assertEqual(feat.modifiers["speed"], "35 kph")

    def test_direction_coerced_to_numeric_string(self):
        payload = _build_map_item_json(
            sidc="SFGPUC-----A--G",
            mss_attrs={"Q": "135.7"},
        )
        feat = QGZParser._parse_milsymb_item(_make_elem(payload))
        self.assertIsNotNone(feat)
        self.assertEqual(feat.modifiers["direction"], "135")

    def test_unknown_mss_key_not_in_modifiers(self):
        payload = _build_map_item_json(
            sidc="SFGPUC-----A--G",
            mss_attrs={"ZZ": "garbage"},
        )
        feat = QGZParser._parse_milsymb_item(_make_elem(payload))
        self.assertIsNotNone(feat)
        self.assertNotIn("ZZ", feat.modifiers)
        self.assertEqual(len(feat.modifiers), 0)

    def test_mss_raw_attributes_preserved(self):
        payload = _build_map_item_json(
            sidc="SFGPUC-----A--G",
            mss_attrs={"T": "Bravo", "ZZ": "ignored"},
        )
        feat = QGZParser._parse_milsymb_item(_make_elem(payload))
        self.assertIsNotNone(feat)
        self.assertEqual(feat.mss_raw_attributes["T"], "Bravo")
        self.assertEqual(feat.mss_raw_attributes["ZZ"], "ignored")

    # -- Edge cases --

    def test_empty_text_returns_none(self):
        elem = ET.Element("MapItem", attrib={"name": "KadasMilxItem"})
        elem.text = ""
        self.assertIsNone(QGZParser._parse_milsymb_item(elem))

    def test_no_sidc_returns_none(self):
        payload = json.dumps({
            "props": {"mssString": "<Symbol></Symbol>", "symbolType": "Point"},
            "state": {"points": [[0, 0]]},
        })
        elem = ET.Element("MapItem", attrib={"name": "KadasMilxItem"})
        elem.text = payload
        self.assertIsNone(QGZParser._parse_milsymb_item(elem))

    def test_no_points_returns_none(self):
        payload = _build_map_item_json(sidc="SFGPUC-----A--G", points=["EMPTY"])
        # Override the points manually after build to get truly empty
        data = json.loads(payload)
        data["state"]["points"] = []
        payload = json.dumps(data)
        self.assertIsNone(QGZParser._parse_milsymb_item(_make_elem(payload)))


# ═══════════════════════════════════════════════════════════════════════════════
# parse_milsymb_layers – layer splitting
# ═══════════════════════════════════════════════════════════════════════════════

class TestParseMilsymbLayersSplitting(unittest.TestCase):
    """Test that parse_milsymb_layers splits each KadasMilxItem into its own layer."""

    def test_two_items_produce_two_layers(self):
        layers = _make_two_feature_parser().parse_milsymb_layers()
        self.assertEqual(len(layers), 2)

    def test_each_layer_has_exactly_one_feature(self):
        layers = _make_two_feature_parser().parse_milsymb_layers()
        for lyr in layers:
            self.assertEqual(len(lyr.features), 1)

    def test_sub_layer_title_format(self):
        layers = _make_two_feature_parser().parse_milsymb_layers()
        self.assertEqual(layers[0].title, "BLUE FORCE / gren team DELTA")
        self.assertEqual(layers[1].title, "BLUE FORCE / hostile CP")

    def test_parent_layer_title_set(self):
        layers = _make_two_feature_parser().parse_milsymb_layers()
        for lyr in layers:
            self.assertEqual(lyr.parent_layer_title, "BLUE FORCE")

    def test_layer_ids_are_unique(self):
        layers = _make_two_feature_parser().parse_milsymb_layers()
        ids = [lyr.layer_id for lyr in layers]
        self.assertEqual(len(ids), len(set(ids)))

    def test_friendly_and_hostile_affiliations(self):
        layers = _make_two_feature_parser().parse_milsymb_layers()
        self.assertEqual(layers[0].affiliation, "friendly")
        self.assertEqual(layers[1].affiliation, "hostile")

    def test_crs_propagated(self):
        layers = _make_two_feature_parser().parse_milsymb_layers()
        for lyr in layers:
            self.assertEqual(lyr.crs, "EPSG:4326")

    def test_symbol_size_and_line_width(self):
        xml = _make_kadasmilxlayer_xml(
            parent_title="SZ",
            items=[{"sidc": "SFGPUC-----A--G", "name": "a"}],
            symbol_size=80,
            line_width=4,
        )
        layers = _parser_from_xml(xml).parse_milsymb_layers()
        self.assertEqual(layers[0].symbol_size, 80)
        self.assertEqual(layers[0].line_width, 4)

    def test_no_kadasmilxlayer_returns_empty(self):
        xml = '<?xml version="1.0"?><qgis version="3.40"><projectlayers></projectlayers></qgis>'
        layers = _parser_from_xml(xml).parse_milsymb_layers()
        self.assertEqual(layers, [])

    def test_feature_extent_computed_from_coords(self):
        xml = _make_kadasmilxlayer_xml(
            parent_title="G",
            items=[{
                "sidc": "SFGPUC-----A--G",
                "name": "line",
                "symbol_type": "Line",
                "points": [[7.0, 46.0], [8.0, 47.0]],
            }],
        )
        layers = _parser_from_xml(xml).parse_milsymb_layers()
        self.assertEqual(layers[0].extent, (7.0, 46.0, 8.0, 47.0))

    def test_modifiers_forwarded_to_feature(self):
        xml = _make_kadasmilxlayer_xml(
            parent_title="M",
            items=[{
                "sidc": "SFGPUC-----A--G",
                "name": "x",
                "mss_attrs": {"T": "ZULU", "Q": "90"},
            }],
        )
        layers = _parser_from_xml(xml).parse_milsymb_layers()
        feat = layers[0].features[0]
        self.assertEqual(feat.modifiers["uniqueDesignation"], "ZULU")
        self.assertEqual(feat.modifiers["direction"], "90")


# ═══════════════════════════════════════════════════════════════════════════════
# milsymb_service – GeoJSON conversion
# ═══════════════════════════════════════════════════════════════════════════════

class TestMilsymbFeatureToGeoJSON(unittest.TestCase):
    """Test milsymb_feature_to_geojson()."""

    def test_point_geometry(self):
        gj = milsymb_feature_to_geojson(_make_feat())
        self.assertEqual(gj["geometry"]["type"], "Point")
        self.assertEqual(gj["geometry"]["coordinates"], [7.45, 46.95])

    def test_linestring_geometry(self):
        gj = milsymb_feature_to_geojson(_make_feat(
            geometry_type="LineString",
            coordinates=[[7.0, 46.0], [8.0, 47.0]],
        ))
        self.assertEqual(gj["geometry"]["type"], "LineString")

    def test_polygon_ring_closed(self):
        gj = milsymb_feature_to_geojson(_make_feat(
            geometry_type="Polygon",
            coordinates=[[7, 46], [8, 47], [9, 46]],
        ))
        ring = gj["geometry"]["coordinates"][0]
        self.assertEqual(ring[0], ring[-1], "Polygon ring must be closed")

    def test_properties_contain_sidc_and_name(self):
        gj = milsymb_feature_to_geojson(_make_feat())
        p = gj["properties"]
        self.assertEqual(p["sidc"], "SFGPUC-----A--G")
        self.assertEqual(p["militaryName"], "Alpha")

    def test_modifiers_are_flat_properties(self):
        gj = milsymb_feature_to_geojson(_make_feat())
        p = gj["properties"]
        self.assertEqual(p["uniqueDesignation"], "Alpha")
        self.assertEqual(p["speed"], "50")

    def test_affiliation_in_properties(self):
        gj = milsymb_feature_to_geojson(_make_feat(affiliation="hostile"))
        self.assertEqual(gj["properties"]["affiliation"], "hostile")

    def test_empty_modifiers_still_has_core_props(self):
        gj = milsymb_feature_to_geojson(_make_feat(modifiers={}))
        p = gj["properties"]
        self.assertIn("sidc", p)
        self.assertNotIn("uniqueDesignation", p)


class TestMilsymbLayerToGeoJSON(unittest.TestCase):
    """Test milsymb_layer_to_geojson()."""

    def _make_layer(self) -> MilSymbLayerInfo:
        feat = MilSymbFeature(
            sidc="SFGPUC-----A--G",
            military_name="Bravo",
            geometry_type="Point",
            coordinates=[[7.45, 46.95]],
            modifiers={"uniqueDesignation": "Bravo"},
            affiliation="friendly",
        )
        return MilSymbLayerInfo(
            layer_id="milx_1_feat1",
            title="BLUE FORCE / Bravo",
            affiliation="friendly",
            crs="EPSG:4326",
            parent_layer_title="BLUE FORCE",
            features=[feat],
            symbol_size=60,
            line_width=2,
        )

    def test_type_is_feature_collection(self):
        gj = milsymb_layer_to_geojson(self._make_layer())
        self.assertEqual(gj["type"], "FeatureCollection")

    def test_name_matches_title(self):
        gj = milsymb_layer_to_geojson(self._make_layer())
        self.assertEqual(gj["name"], "BLUE FORCE / Bravo")

    def test_metadata_contains_parent_layer_title(self):
        gj = milsymb_layer_to_geojson(self._make_layer())
        self.assertEqual(gj["metadata"]["parentLayerTitle"], "BLUE FORCE")

    def test_metadata_affiliation(self):
        gj = milsymb_layer_to_geojson(self._make_layer())
        self.assertEqual(gj["metadata"]["affiliation"], "friendly")

    def test_features_count(self):
        gj = milsymb_layer_to_geojson(self._make_layer())
        self.assertEqual(len(gj["features"]), 1)


# ═══════════════════════════════════════════════════════════════════════════════
# milsymb_service – title normalisation / get_milsymb_geojson
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetMilsymbGeoJSON(unittest.TestCase):
    """Test get_milsymb_geojson() title matching with mocked project retrieval."""

    def _call(self, layer_title: str):
        """Call get_milsymb_geojson with the project retrieval mocked."""
        with patch(
            "services.milsymb_service.get_milsymb_layers_for_project",
            return_value=_make_test_layers(),
        ):
            return get_milsymb_geojson("proj", layer_title)

    def test_exact_match(self):
        gj = self._call("BLUE FORCE / gren team DELTA")
        self.assertIsNotNone(gj)
        self.assertEqual(gj["name"], "BLUE FORCE / gren team DELTA")

    def test_normalised_underscores_and_slashes(self):
        gj = self._call("BLUE_FORCE___gren_team_DELTA")
        self.assertIsNotNone(gj)

    def test_case_insensitive(self):
        gj = self._call("blue force / gren team delta")
        self.assertIsNotNone(gj)

    def test_fallback_without_parent_prefix(self):
        gj = self._call("gren_team_DELTA")
        self.assertIsNotNone(gj)

    def test_not_found_returns_none(self):
        gj = self._call("NONEXISTENT")
        self.assertIsNone(gj)


# ═══════════════════════════════════════════════════════════════════════════════
# Affiliation helpers
# ═══════════════════════════════════════════════════════════════════════════════

class TestAffiliationMap(unittest.TestCase):
    """Verify the _AFFILIATION_MAP_2525C coverage."""

    def test_friendly_chars(self):
        for ch in "FADM":
            self.assertEqual(_AFFILIATION_MAP_2525C[ch], "friendly")

    def test_hostile_chars(self):
        for ch in "HSJK":
            self.assertEqual(_AFFILIATION_MAP_2525C[ch], "hostile")

    def test_neutral_chars(self):
        for ch in "NL":
            self.assertEqual(_AFFILIATION_MAP_2525C[ch], "neutral")

    def test_unknown_chars(self):
        for ch in "PUGW":
            self.assertEqual(_AFFILIATION_MAP_2525C[ch], "unknown")


# ═══════════════════════════════════════════════════════════════════════════════
# Round-trip: QGZ on disk → parse → GeoJSON
# ═══════════════════════════════════════════════════════════════════════════════

class TestRoundTripQGZToGeoJSON(unittest.TestCase):
    """End-to-end: build a .qgz with milsymb data, parse it, verify GeoJSON."""

    def test_round_trip(self):
        qgs_xml = _make_kadasmilxlayer_xml(
            parent_title="RED FORCE",
            items=[
                {
                    "sidc": "SHGPUC-----A--G",
                    "name": "tank platoon",
                    "points": [[7.5, 47.0]],
                    "mss_attrs": {"T": "TP1", "Q": "270", "Z": "60 kph"},
                },
                {
                    "sidc": "SHGPUC-----A--G",
                    "name": "arty battery",
                    "points": [[7.6, 47.1], [7.7, 47.2]],
                    "symbol_type": "Line",
                    "mss_attrs": {"T": "ARTY"},
                },
            ],
        )
        with tempfile.TemporaryDirectory() as td:
            qgz = Path(td) / "milsymb_test.qgz"
            with zipfile.ZipFile(qgz, "w", zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("milsymb_test.qgs", qgs_xml)

            with QGZParser(qgz) as parser:
                parser.extract()
                parser.parse_xml()
                layers = parser.parse_milsymb_layers()

        self.assertEqual(len(layers), 2)

        # First sub-layer: tank platoon (point)
        gj1 = milsymb_layer_to_geojson(layers[0])
        self.assertEqual(gj1["type"], "FeatureCollection")
        feat1 = gj1["features"][0]
        self.assertEqual(feat1["properties"]["sidc"], "SHGPUC-----A--G")
        self.assertEqual(feat1["properties"]["uniqueDesignation"], "TP1")
        self.assertEqual(feat1["properties"]["direction"], "270")
        self.assertEqual(feat1["properties"]["speed"], "60 kph")
        self.assertEqual(feat1["properties"]["affiliation"], "hostile")
        self.assertEqual(feat1["geometry"]["type"], "Point")

        # Second sub-layer: arty battery (linestring)
        gj2 = milsymb_layer_to_geojson(layers[1])
        feat2 = gj2["features"][0]
        self.assertEqual(feat2["properties"]["uniqueDesignation"], "ARTY")
        self.assertEqual(feat2["geometry"]["type"], "LineString")

        # Metadata
        self.assertEqual(gj1["metadata"]["parentLayerTitle"], "RED FORCE")
        self.assertEqual(gj2["metadata"]["parentLayerTitle"], "RED FORCE")


if __name__ == "__main__":
    unittest.main()
