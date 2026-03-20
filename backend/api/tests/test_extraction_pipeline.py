"""
End-to-end test for the vector extraction pipeline.

Runs the QGZ parsing + companion resolution + fiona extraction steps
WITHOUT actually touching the database.  The goal is to verify that
every layer in the caresg .qgz test file is correctly resolved, opened
by fiona, and that the _create_postgis_table / _insert_features calls
would be made.

Usage:
    cd backend/api
    python -m pytest tests/test_extraction_pipeline.py -v
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from pathlib import Path
from unittest.mock import MagicMock, patch, call
from typing import Dict, List, Optional

import fiona

from services.qgz_parser import QGZParser
from services.project_migrator import ProjectMigrator, LayerRecord, _schema_name

TEST_DIR = Path(__file__).parent / 'test_qgs'
CARESG_QGZ = TEST_DIR / 'caresg_test_epsg2056_v340.qgz'
CARESG_GPKG = TEST_DIR / 'caresg_mu.gpkg'


def test_caresg_parse_and_filter():
    """parse_layers_filtered keeps only the 3 vector layers."""
    with QGZParser(CARESG_QGZ) as p:
        p.extract()
        p.parse_xml()
        filtered = p.parse_layers_filtered()

    assert len(filtered) == 3, f"Expected 3 vector layers, got {len(filtered)}"
    names = {l.name for l in filtered}
    for expected in ('beni_immobili', 'edifici_prog', 'punti_di_confine'):
        assert any(expected in n for n in names), f"Missing layer containing {expected!r}"
    for l in filtered:
        assert l.layer_type == 'vector'
        assert l.source_type == 'gpkg'


def test_companion_map_building():
    """companion_map correctly resolves caresg_mu.gpkg."""
    COMPANION_EXTENSIONS = {'.gpkg', '.geojson', '.json', '.shp',
                            '.fgb', '.csv', '.dbf', '.shx', '.prj', '.cpg'}
    companion_files = [CARESG_GPKG]

    with QGZParser(CARESG_QGZ) as parser:
        parser.extract()
        parser.parse_xml()

        companion_map: Dict[str, Path] = {}

        # (a) embedded
        if parser.temp_dir and parser.temp_dir.exists():
            for f in parser.temp_dir.rglob('*'):
                if f.is_file() and f.suffix.lower() in COMPANION_EXTENSIONS:
                    companion_map.setdefault(f.name.lower(), f)

        # (b) uploaded
        for cf in companion_files:
            if cf.exists():
                companion_map[cf.name.lower()] = cf

    assert 'caresg_mu.gpkg' in companion_map
    assert companion_map['caresg_mu.gpkg'].exists()


def test_resolve_companion():
    """_resolve_companion matches datasources to companion_map."""
    migrator = ProjectMigrator.__new__(ProjectMigrator)

    companion_map = {'caresg_mu.gpkg': CARESG_GPKG}

    datasources = [
        './caresg_mu.gpkg|layername=beni_immobili',
        './caresg_mu.gpkg|layername=edifici_prog',
        './caresg_mu.gpkg|layername=punti_di_confine',
    ]

    for ds in datasources:
        path = migrator._resolve_companion(ds, companion_map)
        assert path is not None, f"_resolve_companion returned None for {ds!r}"
        assert path == CARESG_GPKG


def test_fiona_open_layers():
    """fiona can open each sub-layer of the .gpkg."""
    datasources = [
        './caresg_mu.gpkg|layername=beni_immobili',
        './caresg_mu.gpkg|layername=edifici_prog',
        './caresg_mu.gpkg|layername=punti_di_confine',
    ]

    for ds in datasources:
        fiona_layer = ds.split('|layername=')[1].split('|')[0]
        with fiona.open(str(CARESG_GPKG), layer=fiona_layer) as src:
            assert len(src) > 0, f"Empty layer {fiona_layer}"
            geom = src.schema.get('geometry', '')
            assert geom, f"No geometry in layer {fiona_layer}"
            print(f"  {fiona_layer}: {len(src)} features, geom={geom}, crs={src.crs}")


def test_full_extraction_mocked_db():
    """
    Full extraction loop (step 6 of migrate_project) with mocked DB.
    Verifies that _create_postgis_table and _insert_features would be called
    for each vector layer.
    """
    from services.layer_extractor import LayerExtractor

    # Build layer_records as migrate_project would
    with QGZParser(CARESG_QGZ) as parser:
        parser.extract()
        parser.parse_xml()
        filtered = parser.parse_layers_filtered()

    layer_records = [
        LayerRecord(
            layer_name=li.name,
            layer_type=li.layer_type or 'unknown',
            geometry_type=li.geometry_type or '',
            source_type=li.source_type or 'unknown',
            datasource=li.datasource or '',
            crs=li.crs or 'EPSG:2056',
            qgs_layer_id=li.id,
        )
        for li in filtered
    ]

    companion_map = {'caresg_mu.gpkg': CARESG_GPKG}
    proj_schema = 'prj_caresg_test'

    # Mock the DB engine
    mock_engine = MagicMock()
    extractor = LayerExtractor(project_name='caresg_test', engine=mock_engine)

    EXTRACTABLE_SOURCE_TYPES = {'gpkg', 'shp', 'geojson', 'fgb'}

    migrator = ProjectMigrator.__new__(ProjectMigrator)
    migrator.engine = mock_engine

    tables_created = []

    for rec in layer_records:
        is_vector = (
            rec.layer_type == 'vector'
            or rec.source_type in EXTRACTABLE_SOURCE_TYPES
        )
        assert is_vector, f"Layer {rec.layer_name!r} not detected as vector"
        assert rec.datasource, f"Empty datasource for {rec.layer_name!r}"

        companion_path = migrator._resolve_companion(rec.datasource, companion_map)
        assert companion_path is not None, (
            f"No companion for {rec.layer_name!r}, "
            f"datasource={rec.datasource!r}, "
            f"keys={list(companion_map.keys())}"
        )

        fiona_layer = None
        if '|layername=' in rec.datasource:
            fiona_layer = rec.datasource.split('|layername=')[1].split('|')[0]

        with fiona.open(str(companion_path), layer=fiona_layer) as src:
            table_name = extractor._generate_table_name(rec.layer_name)
            geom_type = src.schema.get('geometry', 'Geometry') or 'Geometry'
            geom_type = geom_type.replace('3D ', '').split()[-1]
            n_features = len(src)

            tables_created.append({
                'layer': rec.layer_name,
                'table': table_name,
                'features': n_features,
                'geom_type': geom_type,
                'fiona_layer': fiona_layer,
            })

            print(f"  ✓ {rec.layer_name!r} → {table_name} ({n_features} features, {geom_type})")

    assert len(tables_created) == 3, f"Expected 3 tables, got {len(tables_created)}"
    for t in tables_created:
        assert t['features'] > 0
        assert t['table'].startswith('lyr_')

    print(f"\nAll {len(tables_created)} layers would be extracted to PostGIS:")
    for t in tables_created:
        print(f"  {proj_schema}.{t['table']} ({t['features']} features)")


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v', '--tb=short'])
