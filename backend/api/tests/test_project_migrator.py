"""
Tests for Project Migrator Service
"""
import pytest
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch
import zipfile

from services.project_migrator import ProjectMigrator, _slugify, _schema_name
from services.qgz_parser import ProjectInfo, LayerInfo
from services.layer_extractor import LayerExtractor

pytestmark = pytest.mark.unit


@pytest.fixture
def project_migrator():
    """Create ProjectMigrator instance"""
    with patch('services.project_migrator.db.get_engine'):
        return ProjectMigrator()


@pytest.fixture
def sample_project_info():
    """Create sample ProjectInfo"""
    return ProjectInfo(
        title="Test Project",
        crs="EPSG:2056",
        extent=(2600000, 1200000, 2650000, 1250000),
        layers=[
            LayerInfo(
                id="layer1",
                name="Points",
                layer_type="vector",
                geometry_type="Point",
                source_type="geojson",
                datasource="./data/points.geojson",
                table_name=None,
                crs="EPSG:4326",
                is_local=True
            ),
            LayerInfo(
                id="layer2",
                name="Polygons",
                layer_type="vector",
                geometry_type="Polygon",
                source_type="gpkg",
                datasource="./data/polygons.gpkg|layername=polygons",
                table_name=None,
                crs="EPSG:2056",
                is_local=True
            ),
            LayerInfo(
                id="layer3",
                name="Existing PostGIS",
                layer_type="vector",
                geometry_type="Point",
                source_type="postgis",
                datasource="dbname='dufour' host=localhost table='existing'",
                table_name="existing",
                crs="EPSG:2056",
                is_local=False
            )
        ],
        qgz_size=1024 * 50  # 50KB
    )


class TestHelpers:
    """Test module-level helper functions"""

    def test_slugify_simple(self):
        assert _slugify("my_project") == "my_project"

    def test_slugify_special_chars(self):
        assert _slugify("My Project!") == "my_project_"

    def test_slugify_empty(self):
        assert _slugify("!!!") == "project"

    def test_schema_name(self):
        assert _schema_name("hello_world") == "prj_hello_world"


class TestResolveCompanion:
    """Test _resolve_companion() — the lookup that matches datasource → file"""

    def test_simple_match(self, project_migrator, tmp_path):
        """Datasource like ./data.gpkg matches companion data.gpkg"""
        f = tmp_path / "data.gpkg"
        f.touch()
        companion_map = {"data.gpkg": f}
        result = project_migrator._resolve_companion("./data.gpkg", companion_map)
        assert result == f

    def test_pipe_notation(self, project_migrator, tmp_path):
        """Datasource with |layername= is stripped correctly"""
        f = tmp_path / "polygons.gpkg"
        f.touch()
        companion_map = {"polygons.gpkg": f}
        result = project_migrator._resolve_companion(
            "./data/polygons.gpkg|layername=parcels", companion_map
        )
        assert result == f

    def test_subdirectory_path(self, project_migrator, tmp_path):
        """Datasource with subdirectory resolved by basename"""
        f = tmp_path / "points.geojson"
        f.touch()
        companion_map = {"points.geojson": f}
        result = project_migrator._resolve_companion(
            "./subdir/points.geojson", companion_map
        )
        assert result == f

    def test_no_match(self, project_migrator):
        """Missing companion returns None"""
        result = project_migrator._resolve_companion(
            "./missing.gpkg", {}
        )
        assert result is None

    def test_case_insensitive(self, project_migrator, tmp_path):
        """companion_map keys are lowered; datasource basename is lowered too"""
        f = tmp_path / "MyData.gpkg"
        f.touch()
        companion_map = {"mydata.gpkg": f}
        # _resolve_companion lowercases the datasource filename
        result = project_migrator._resolve_companion(
            "./MyData.gpkg", companion_map
        )
        assert result == f


class TestEmbeddedCompanionDiscovery:
    """
    Test that migrate_project() discovers data files embedded inside the .qgz
    archive, not only files explicitly uploaded by the user.
    This was the root cause of the companion-files bug.
    """

    def _make_qgz_with_embedded_gpkg(self, tmp_path):
        """Create a .qgz archive that contains a .gpkg inside it."""
        qgs_xml = """<?xml version="1.0" encoding="UTF-8"?>
<qgis projectname="embed_test" version="3.40.7">
  <title>Embedded Test</title>
  <mapcanvas>
    <destinationsrs><spatialrefsys><authid>EPSG:2056</authid></spatialrefsys></destinationsrs>
    <extent><xmin>2600000</xmin><ymin>1200000</ymin><xmax>2650000</xmax><ymax>1250000</ymax></extent>
  </mapcanvas>
  <projectlayers>
    <maplayer type="vector" geometry="Point">
      <id>embedded_layer_1</id>
      <datasource>./data.gpkg|layername=points</datasource>
      <layername>Embedded Points</layername>
      <srs><spatialrefsys><authid>EPSG:2056</authid></spatialrefsys></srs>
      <provider>ogr</provider>
    </maplayer>
  </projectlayers>
</qgis>"""
        qgz_path = tmp_path / "embed_test.qgz"
        with zipfile.ZipFile(qgz_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("embed_test.qgs", qgs_xml)
            zf.writestr("data.gpkg", b"FAKE_GPKG_CONTENT")
        return qgz_path

    @patch('services.project_migrator.fiona')
    @patch('services.project_migrator.db')
    def test_embedded_gpkg_found_in_companion_map(
        self, mock_db, mock_fiona, tmp_path
    ):
        """
        When a .qgz contains a .gpkg, migrate_project() should add it to
        companion_map and attempt extraction (instead of 'No companion' skip).
        """
        mock_engine = MagicMock()
        mock_db.get_engine.return_value = mock_engine
        # Make engine.connect() a context-manager that returns a mock connection
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=False)

        # fiona.open should be called for the embedded gpkg
        mock_src = MagicMock()
        mock_src.crs = {'init': 'EPSG:2056'}
        mock_src.__len__ = Mock(return_value=5)
        mock_src.schema = {'geometry': 'Point', 'properties': {'name': 'str'}}
        mock_src.__iter__ = Mock(return_value=iter([]))
        mock_fiona.open.return_value.__enter__ = Mock(return_value=mock_src)
        mock_fiona.open.return_value.__exit__ = Mock(return_value=False)

        qgz_path = self._make_qgz_with_embedded_gpkg(tmp_path)

        migrator = ProjectMigrator(engine=mock_engine)
        project_info, layer_records, qgz_bytes, schema = migrator.migrate_project(
            qgz_path=qgz_path,
            project_name="embed_test",
            companion_files=None,       # NO uploaded companions
        )

        # The single layer should NOT have been skipped
        assert len(layer_records) == 1
        rec = layer_records[0]
        assert rec.layer_name == "Embedded Points"
        assert rec.source_type == "gpkg"

        # fiona.open must have been called (companion found → extraction attempted)
        assert mock_fiona.open.called, (
            "fiona.open was never called — embedded .gpkg was not discovered"
        )
