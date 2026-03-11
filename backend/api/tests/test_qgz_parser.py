"""
Tests for QGZ Parser Service
"""
import pytest
from pathlib import Path
import tempfile
import zipfile
import xml.etree.ElementTree as ET

from services.qgz_parser import QGZParser, LayerInfo, ProjectInfo

pytestmark = pytest.mark.unit


@pytest.fixture
def sample_qgs_xml():
    """Create minimal QGIS project XML"""
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<qgis projectname="Test Project" version="3.34.0-Prizren">
  <title>Test QGIS Project</title>
  <mapcanvas>
    <destinationsrs>
      <spatialrefsys>
        <proj4>+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000</proj4>
        <srsid>47</srsid>
        <srid>2056</srid>
        <authid>EPSG:2056</authid>
        <description>CH1903+ / LV95</description>
      </spatialrefsys>
    </destinationsrs>
    <extent>
      <xmin>2600000</xmin>
      <ymin>1200000</ymin>
      <xmax>2650000</xmax>
      <ymax>1250000</ymax>
    </extent>
  </mapcanvas>
  <projectlayers>
    <maplayer id="layer1" type="vector" geometry="Point">
      <datasource>./data/points.gpkg|layername=points</datasource>
      <layername>Points Layer</layername>
      <geometrytype>Point</geometrytype>
      <srs>
        <spatialrefsys>
          <authid>EPSG:2056</authid>
        </spatialrefsys>
      </srs>
      <provider encoding="UTF-8">ogr</provider>
    </maplayer>
    <maplayer id="layer2" type="vector" geometry="Polygon">
      <datasource>./data/polygons.geojson</datasource>
      <layername>Polygons Layer</layername>
      <geometrytype>Polygon</geometrytype>
      <srs>
        <spatialrefsys>
          <authid>EPSG:4326</authid>
        </spatialrefsys>
      </srs>
      <provider encoding="UTF-8">ogr</provider>
    </maplayer>
    <maplayer id="layer3" type="raster">
      <datasource>crs=EPSG:3857&amp;format&amp;type=xyz&amp;url=https://tile.openstreetmap.org/{z}/{x}/{y}.png</datasource>
      <layername>OpenStreetMap</layername>
      <provider>wms</provider>
    </maplayer>
    <maplayer id="layer4" type="vector" geometry="Point">
      <datasource>dbname='dufour' host=postgresql-intelligeo.alwaysdata.net port=5432 user='intelligeo' password='pwd' sslmode=disable key='id' srid=2056 type=Point table="public"."existing_points" (geom)</datasource>
      <layername>Existing PostGIS Layer</layername>
      <provider encoding="UTF-8">postgres</provider>
    </maplayer>
  </projectlayers>
</qgis>
"""
    return xml_content


@pytest.fixture
def sample_qgz_file(sample_qgs_xml, tmp_path):
    """Create a sample .qgz file for testing"""
    qgz_path = tmp_path / "test_project.qgz"
    
    # Create zip file
    with zipfile.ZipFile(qgz_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add .qgs file
        zf.writestr('test_project.qgs', sample_qgs_xml)
        
        # Add some dummy data files
        zf.writestr('data/points.gpkg', b'dummy gpkg data')
        zf.writestr('data/polygons.geojson', b'{"type": "FeatureCollection"}')
    
    return qgz_path


class TestQGZParser:
    """Test QGZ Parser functionality"""
    
    def test_parser_context_manager(self, sample_qgz_file):
        """Test parser can be used as context manager"""
        with QGZParser(sample_qgz_file) as parser:
            assert parser.qgz_path == sample_qgz_file
            assert parser.temp_dir is None  # Not extracted yet
    
    def test_validate_size(self, sample_qgz_file):
        """Test file size validation"""
        with QGZParser(sample_qgz_file) as parser:
            # Should pass for small test file
            assert parser.validate_size() is True
    
    def test_validate_size_exceeds_limit(self, tmp_path):
        """Test file size validation fails for large files"""
        # Create a real .qgz that is just above the limit via monkeypatch
        large_file = tmp_path / "large.qgz"
        # Write a minimal valid zip so Path() doesn't complain
        with zipfile.ZipFile(large_file, 'w') as zf:
            zf.writestr('dummy.txt', 'x')
        
        import unittest.mock as um
        original_stat = large_file.stat
        
        with QGZParser(large_file) as parser:
            # Patch os.stat at the instance level via Path.stat
            fake_stat = original_stat()
            fake_stat_obj = um.MagicMock(wraps=fake_stat)
            fake_stat_obj.st_size = 51 * 1024 * 1024
            
            with um.patch.object(type(parser.qgz_path), 'stat', return_value=fake_stat_obj):
                with pytest.raises(ValueError, match="exceeds"):
                    parser.validate_size()
    
    def test_extract(self, sample_qgz_file):
        """Test .qgz extraction"""
        with QGZParser(sample_qgz_file) as parser:
            qgs_path = parser.extract()
            
            # Check temp directory created
            assert parser.temp_dir is not None
            assert parser.temp_dir.exists()
            
            # Check .qgs file extracted
            assert qgs_path.exists()
            assert qgs_path.suffix == '.qgs'
            assert qgs_path.name == 'test_project.qgs'
    
    def test_parse_xml(self, sample_qgz_file):
        """Test XML parsing"""
        with QGZParser(sample_qgz_file) as parser:
            parser.extract()
            tree = parser.parse_xml()
            
            # Check XML parsed
            assert parser.tree is not None
            assert parser.root is not None
            assert parser.root.tag == 'qgis'
    
    def test_get_project_info(self, sample_qgz_file):
        """Test project info extraction"""
        with QGZParser(sample_qgz_file) as parser:
            parser.extract()
            parser.parse_xml()
            info = parser.get_project_info()
            
            # Check project info
            assert isinstance(info, ProjectInfo)
            assert info.title == "Test QGIS Project"
            assert info.crs == "EPSG:2056"
            assert info.extent == (2600000, 1200000, 2650000, 1250000)
            assert len(info.layers) == 4
    
    def test_parse_layers(self, sample_qgz_file):
        """Test layer parsing"""
        with QGZParser(sample_qgz_file) as parser:
            parser.extract()
            parser.parse_xml()
            layers = parser.parse_layers()
            
            # Check layer count
            assert len(layers) == 4
            
            # Check first layer (GeoPackage)
            layer1 = layers[0]
            assert isinstance(layer1, LayerInfo)
            assert layer1.name == "Points Layer"
            assert layer1.layer_type == "vector"
            assert layer1.geometry_type == "Point"
            assert layer1.source_type == "gpkg"
            assert layer1.is_local is True
            
            # Check second layer (GeoJSON)
            layer2 = layers[1]
            assert layer2.name == "Polygons Layer"
            assert layer2.source_type == "geojson"
            assert layer2.is_local is True
            
            # Check third layer (WMS)
            layer3 = layers[2]
            assert layer3.name == "OpenStreetMap"
            assert layer3.layer_type == "raster"
            assert layer3.source_type == "wms"
            assert layer3.is_local is False
            
            # Check fourth layer (PostGIS)
            layer4 = layers[3]
            assert layer4.name == "Existing PostGIS Layer"
            assert layer4.source_type == "postgis"
            assert layer4.is_local is False
    
    def test_identify_source_type(self, sample_qgz_file):
        """Test source type identification"""
        with QGZParser(sample_qgz_file) as parser:
            parser.extract()
            parser.parse_xml()
            
            # Test various datasource patterns
            assert parser._identify_source_type("./data.gpkg|layername=test", "vector") == "gpkg"
            assert parser._identify_source_type("./data.shp", "vector") == "shp"
            assert parser._identify_source_type("./data.geojson", "vector") == "geojson"
            assert parser._identify_source_type("./data.fgb", "vector") == "fgb"
            assert parser._identify_source_type("dbname='test' host=localhost", "vector") == "postgis"
            assert parser._identify_source_type("url=https://wms.server.com", "raster") == "wms"
    
    def test_is_local_layer(self, sample_qgz_file):
        """Test local layer detection"""
        with QGZParser(sample_qgz_file) as parser:
            parser.extract()
            parser.parse_xml()
            
            # Paths starting with ./ are detected as local
            assert parser._is_local_layer("./data/file.gpkg") is True
            assert parser._is_local_layer("./data/file.geojson") is True
            
            # Relative path without ./ — only local if file exists in temp dir
            # data/points.gpkg exists because the fixture includes it
            assert parser._is_local_layer("data/points.gpkg") is True
            
            # Remote sources
            assert parser._is_local_layer("dbname='test'") is False
            assert parser._is_local_layer("url=https://server.com") is False
            assert parser._is_local_layer("http://wms.server.com") is False
    
    def test_update_layer_datasource(self, sample_qgz_file):
        """Test updating layer datasource in XML"""
        with QGZParser(sample_qgz_file) as parser:
            parser.extract()
            parser.parse_xml()
            
            # Get original datasource
            layer = parser.root.find(".//maplayer[@id='layer1']")
            original_ds = layer.find('datasource').text
            assert './data/points.gpkg' in original_ds
            
            # Update datasource
            new_ds = "dbname='dufour' host=localhost table='test_points'"
            parser.update_layer_datasource('layer1', new_ds)
            
            # Check updated
            updated_ds = layer.find('datasource').text
            assert updated_ds == new_ds
    
    def test_save_modified_qgs(self, sample_qgz_file, tmp_path):
        """Test saving modified .qgs file"""
        with QGZParser(sample_qgz_file) as parser:
            parser.extract()
            parser.parse_xml()
            
            # Modify something
            parser.update_layer_datasource('layer1', 'new_datasource')
            
            # Save to new file
            output_path = tmp_path / "modified.qgs"
            parser.save_modified_qgs(output_path)
            
            # Verify file saved
            assert output_path.exists()
            
            # Verify modification persisted
            tree = ET.parse(output_path)
            root = tree.getroot()
            layer = root.find(".//maplayer[@id='layer1']")
            assert layer.find('datasource').text == 'new_datasource'
    
    def test_cleanup_on_exit(self, sample_qgz_file):
        """Test temp directory cleanup on context exit"""
        temp_dir_path = None
        
        with QGZParser(sample_qgz_file) as parser:
            parser.extract()
            temp_dir_path = parser.temp_dir
            assert temp_dir_path.exists()
        
        # After context exit, temp dir should be cleaned up
        assert not temp_dir_path.exists()
    
    def test_invalid_qgz_file(self, tmp_path):
        """Test handling of invalid .qgz file"""
        invalid_file = tmp_path / "invalid.qgz"
        invalid_file.write_text("not a zip file")
        
        with pytest.raises(Exception):  # Should raise zipfile error
            with QGZParser(invalid_file) as parser:
                parser.extract()
    
    def test_missing_qgs_file(self, tmp_path):
        """Test handling of .qgz without .qgs file"""
        qgz_path = tmp_path / "no_qgs.qgz"
        
        with zipfile.ZipFile(qgz_path, 'w') as zf:
            zf.writestr('data.txt', 'no qgs file here')
        
        with pytest.raises(ValueError, match="No .qgs file found"):
            with QGZParser(qgz_path) as parser:
                parser.extract()


# ==================== QGIS 3.40+ compatibility tests ====================


class TestQGZParserQGIS340:
    """Test parser with QGIS 3.40 XML format (id as child element, no <geometrytype>)"""
    
    @pytest.fixture
    def qgis340_qgz(self, tmp_path):
        """Create a QGZ mirroring QGIS 3.40 structure (id as child, geometry as attribute)"""
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<qgis projectname="caresg_test" version="3.40.7-Bratislava">
  <title></title>
  <projectCrs>
    <spatialrefsys nativeFormat="Wkt">
      <authid>EPSG:2056</authid>
    </spatialrefsys>
  </projectCrs>
  <mapcanvas name="theMapCanvas">
    <extent>
      <xmin>2699625.691</xmin>
      <ymin>1115328.154</ymin>
      <xmax>2699979.129</xmax>
      <ymax>1115623.061</ymax>
    </extent>
    <destinationsrs>
      <spatialrefsys nativeFormat="Wkt">
        <authid>EPSG:2056</authid>
      </spatialrefsys>
    </destinationsrs>
  </mapcanvas>
  <projectlayers>
    <maplayer type="raster" autoRefreshMode="Disabled">
      <id>_969c5d58_2e0a_4298_9a53_450ccd7b0b6a</id>
      <datasource>contextualWMSLegend=0&amp;crs=EPSG:2056&amp;layers=ch.swisstopo.pixelkarte-grau&amp;url=https://wms.geo.admin.ch</datasource>
      <layername>Landeskarten (grau)</layername>
      <provider>wms</provider>
      <srs><spatialrefsys><authid>EPSG:2056</authid></spatialrefsys></srs>
    </maplayer>
    <maplayer type="vector" geometry="Polygon" wkbType="MultiPolygon">
      <id>beni_immobili_6d23e1cd_c0e1_49f5_9eef_144bbfa73fac</id>
      <datasource>./caresg_mu.gpkg|layername=beni_immobili</datasource>
      <layername>caresg_mu — beni_immobili</layername>
      <provider encoding="UTF-8">ogr</provider>
      <srs><spatialrefsys><authid>EPSG:2056</authid></spatialrefsys></srs>
    </maplayer>
    <maplayer type="vector" geometry="Point" wkbType="Point">
      <id>punti_di_confine_a96cbdad_22c9_44c0_9d72_8cb11d16efee</id>
      <datasource>./caresg_mu.gpkg|layername=punti_di_confine</datasource>
      <layername>caresg_mu — punti_di_confine</layername>
      <provider encoding="UTF-8">ogr</provider>
      <srs><spatialrefsys><authid>EPSG:2056</authid></spatialrefsys></srs>
    </maplayer>
  </projectlayers>
</qgis>"""
        qgz_path = tmp_path / "caresg_test.qgz"
        with zipfile.ZipFile(qgz_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('caresg_test.qgs', xml_content)
            zf.writestr('caresg_mu.gpkg', b'dummy gpkg')
        return qgz_path
    
    def test_layer_id_from_child_element(self, qgis340_qgz):
        """Test that layer IDs are read from <id> child element (QGIS 3.40+)"""
        with QGZParser(qgis340_qgz) as parser:
            parser.extract()
            parser.parse_xml()
            layers = parser.parse_layers()
            
            # WMS layer
            wms_layer = next(l for l in layers if l.name == 'Landeskarten (grau)')
            assert wms_layer.id == '_969c5d58_2e0a_4298_9a53_450ccd7b0b6a'
            
            # Vector layers
            beni = next(l for l in layers if 'beni_immobili' in l.name)
            assert beni.id == 'beni_immobili_6d23e1cd_c0e1_49f5_9eef_144bbfa73fac'
    
    def test_geometry_type_from_attribute(self, qgis340_qgz):
        """Test that geometry type is read from geometry= attribute when <geometrytype> is absent"""
        with QGZParser(qgis340_qgz) as parser:
            parser.extract()
            parser.parse_xml()
            layers = parser.parse_layers()
            
            beni = next(l for l in layers if 'beni_immobili' in l.name)
            assert beni.geometry_type == 'Polygon'
            
            punti = next(l for l in layers if 'punti_di_confine' in l.name)
            assert punti.geometry_type == 'Point'
    
    def test_empty_title_fallback_to_projectname(self, qgis340_qgz):
        """Test that empty <title> falls back to projectname attribute"""
        with QGZParser(qgis340_qgz) as parser:
            parser.extract()
            parser.parse_xml()
            info = parser.get_project_info()
            
            # <title> is empty, should use projectname="caresg_test"
            assert info.title == 'caresg_test'
    
    def test_update_datasource_by_child_id(self, qgis340_qgz):
        """Test update_layer_datasource works with QGIS 3.40 <id> child elements"""
        with QGZParser(qgis340_qgz) as parser:
            parser.extract()
            parser.parse_xml()
            
            layer_id = 'beni_immobili_6d23e1cd_c0e1_49f5_9eef_144bbfa73fac'
            new_ds = "dbname='dufour' host=localhost table='test_beni'"
            
            # This was previously broken — XPath [@id='...'] wouldn't match
            parser.update_layer_datasource(layer_id, new_ds)
            
            # Verify the datasource was updated
            for ml in parser.root.findall('.//maplayer'):
                id_elem = ml.find('id')
                if id_elem is not None and id_elem.text == layer_id:
                    assert ml.find('datasource').text == new_ds
                    # Provider should also be updated to postgres
                    assert ml.find('.//provider').text == 'postgres'
                    break
            else:
                pytest.fail(f"Layer {layer_id} not found after update")
    
    def test_gpkg_layers_detected_as_local(self, qgis340_qgz):
        """Test that ./caresg_mu.gpkg layers are detected as local"""
        with QGZParser(qgis340_qgz) as parser:
            parser.extract()
            parser.parse_xml()
            layers = parser.parse_layers()
            
            local_layers = [l for l in layers if l.is_local]
            remote_layers = [l for l in layers if not l.is_local]
            
            assert len(local_layers) == 2  # beni_immobili, punti_di_confine
            assert len(remote_layers) == 1  # WMS
            assert all(l.source_type == 'gpkg' for l in local_layers)
    
    def test_crs_fallback_to_project_crs(self, tmp_path):
        """Test CRS extraction when mapcanvas has no destinationsrs but projectCrs exists"""
        xml_content = """<?xml version="1.0"?>
<qgis projectname="test" version="3.40.7">
  <title>Test</title>
  <projectCrs>
    <spatialrefsys>
      <authid>EPSG:21781</authid>
    </spatialrefsys>
  </projectCrs>
  <mapcanvas name="theMapCanvas">
    <extent>
      <xmin>600000</xmin><ymin>200000</ymin>
      <xmax>650000</xmax><ymax>250000</ymax>
    </extent>
  </mapcanvas>
  <projectlayers></projectlayers>
</qgis>"""
        qgz_path = tmp_path / "test.qgz"
        with zipfile.ZipFile(qgz_path, 'w') as zf:
            zf.writestr('test.qgs', xml_content)
        
        with QGZParser(qgz_path) as parser:
            parser.extract()
            parser.parse_xml()
            info = parser.get_project_info()
            
            # Should fall back to <projectCrs>
            assert info.crs == 'EPSG:21781'


# ==================== Real fixture tests ====================


FIXTURE_DIR = Path(__file__).parent / "test_qgs"
REAL_QGZ = FIXTURE_DIR / "caresg_test_epsg2056_v340.qgz"
REAL_GPKG = FIXTURE_DIR / "caresg_mu.gpkg"


@pytest.mark.skipif(
    not REAL_QGZ.exists(),
    reason="Real test fixture caresg_test_epsg2056_v340.qgz not available"
)
class TestRealFixture:
    """Tests against the real QGIS 3.40 project fixture"""
    
    def test_parse_real_project_info(self):
        """Test parsing project-level metadata from real QGZ"""
        with QGZParser(REAL_QGZ) as parser:
            parser.extract()
            parser.parse_xml()
            info = parser.get_project_info()
            
            # Both <title> and projectname are empty in this fixture → 'Untitled'
            assert info.title == 'Untitled'
            assert info.crs == 'EPSG:2056'
            
            # Extent should be in Swiss LV95 range
            xmin, ymin, xmax, ymax = info.extent
            assert 2500000 < xmin < 2800000
            assert 1100000 < ymin < 1300000
    
    def test_parse_real_layers(self):
        """Test parsing all 6 layers from real QGZ"""
        with QGZParser(REAL_QGZ) as parser:
            parser.extract()
            parser.parse_xml()
            info = parser.get_project_info()
            
            assert len(info.layers) == 6
            
            # Check layer type counts
            vector_layers = [l for l in info.layers if l.layer_type == 'vector']
            raster_layers = [l for l in info.layers if l.layer_type == 'raster']
            assert len(vector_layers) == 3
            assert len(raster_layers) == 3
    
    def test_real_layer_ids_not_empty(self):
        """Test that layer IDs are correctly extracted (not empty)"""
        with QGZParser(REAL_QGZ) as parser:
            parser.extract()
            parser.parse_xml()
            layers = parser.parse_layers()
            
            for layer in layers:
                assert layer.id, f"Layer '{layer.name}' has empty ID"
                assert len(layer.id) > 5, f"Layer '{layer.name}' ID too short: {layer.id}"
    
    def test_real_vector_layers_have_geometry_type(self):
        """Test that vector layers have geometry type (from attribute, not element)"""
        with QGZParser(REAL_QGZ) as parser:
            parser.extract()
            parser.parse_xml()
            layers = parser.parse_layers()
            
            vector_layers = [l for l in layers if l.layer_type == 'vector']
            for layer in vector_layers:
                assert layer.geometry_type is not None, \
                    f"Vector layer '{layer.name}' has no geometry_type"
                assert layer.geometry_type in ('Point', 'Polygon', 'LineString',
                                                'MultiPoint', 'MultiPolygon', 'MultiLineString'), \
                    f"Unexpected geometry type: {layer.geometry_type}"
    
    def test_real_gpkg_layers_detected_as_local(self):
        """Test that GPKG layers are correctly identified as local"""
        with QGZParser(REAL_QGZ) as parser:
            parser.extract()
            parser.parse_xml()
            layers = parser.parse_layers()
            
            local_layers = [l for l in layers if l.is_local]
            assert len(local_layers) == 3  # beni_immobili, edifici_prog, punti_di_confine
            
            for layer in local_layers:
                assert layer.source_type == 'gpkg'
                assert 'caresg_mu.gpkg' in layer.datasource
    
    def test_real_wms_layers_not_local(self):
        """Test that WMS layers are correctly identified as remote"""
        with QGZParser(REAL_QGZ) as parser:
            parser.extract()
            parser.parse_xml()
            layers = parser.parse_layers()
            
            wms_layers = [l for l in layers if l.source_type == 'wms']
            assert len(wms_layers) == 3
            
            for layer in wms_layers:
                assert layer.is_local is False
                assert layer.layer_type == 'raster'
    
    def test_real_update_datasource_roundtrip(self):
        """Test update_layer_datasource on real project IDs"""
        with QGZParser(REAL_QGZ) as parser:
            parser.extract()
            parser.parse_xml()
            layers = parser.parse_layers()
            
            # Pick a local layer and update its datasource
            local_layer = next(l for l in layers if l.is_local)
            new_ds = "dbname='dufour' host=localhost table='migrated'"
            
            parser.update_layer_datasource(local_layer.id, new_ds)
            
            # Re-parse to verify
            for ml in parser.root.findall('.//maplayer'):
                id_elem = ml.find('id')
                if id_elem is not None and id_elem.text == local_layer.id:
                    assert ml.find('datasource').text == new_ds
                    break
            else:
                pytest.fail(f"Could not find layer {local_layer.id} after update")