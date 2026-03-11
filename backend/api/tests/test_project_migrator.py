"""
Tests for Project Migrator Service
"""
import pytest
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch
import zipfile

from services.project_migrator import ProjectMigrator
from services.qgz_parser import ProjectInfo, LayerInfo
from services.layer_extractor import MigrationResult

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


class TestProjectMigrator:
    """Test Project Migrator functionality"""
    
    def test_find_layer_source_with_pipe(self, project_migrator, tmp_path):
        """Test finding layer source with GeoPackage pipe notation"""
        # Create temp directory structure
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        test_file = data_dir / "test.gpkg"
        test_file.touch()
        
        # Test with pipe notation
        datasource = "./data/test.gpkg|layername=mylayer"
        result = project_migrator._find_layer_source(tmp_path, datasource)
        
        assert result == test_file
    
    def test_find_layer_source_direct_path(self, project_migrator, tmp_path):
        """Test finding layer source with direct path"""
        # Create test file
        test_file = tmp_path / "test.geojson"
        test_file.touch()
        
        datasource = "./test.geojson"
        result = project_migrator._find_layer_source(tmp_path, datasource)
        
        assert result == test_file
    
    def test_find_layer_source_in_subdirectory(self, project_migrator, tmp_path):
        """Test finding layer source in subdirectory"""
        # Create subdirectory structure
        data_dir = tmp_path / "data" / "layers"
        data_dir.mkdir(parents=True)
        test_file = data_dir / "test.shp"
        test_file.touch()
        
        datasource = "./data/layers/test.shp"
        result = project_migrator._find_layer_source(tmp_path, datasource)
        
        assert result == test_file
    
    def test_find_layer_source_not_found(self, project_migrator, tmp_path):
        """Test finding nonexistent layer source"""
        datasource = "./nonexistent.gpkg"
        result = project_migrator._find_layer_source(tmp_path, datasource)
        
        assert result is None
    
    def test_find_layer_source_glob_search(self, project_migrator, tmp_path):
        """Test finding layer source with glob pattern"""
        # Create file in nested structure
        nested_dir = tmp_path / "level1" / "level2"
        nested_dir.mkdir(parents=True)
        test_file = nested_dir / "test.fgb"
        test_file.touch()
        
        # Search should find it via glob
        datasource = "./test.fgb"
        result = project_migrator._find_layer_source(tmp_path, datasource)
        
        assert result == test_file
    
    def test_repackage_qgz(self, project_migrator, tmp_path):
        """Test repackaging .qgz file"""
        # Create source directory structure
        source_dir = tmp_path / "source"
        source_dir.mkdir()
        
        # Create original .qgs
        original_qgs = source_dir / "project.qgs"
        original_qgs.write_text("original content")
        
        # Create modified .qgs
        modified_qgs = source_dir / "modified.qgs"
        modified_qgs.write_text("modified content")
        
        # Create data files
        data_dir = source_dir / "data"
        data_dir.mkdir()
        (data_dir / "file1.txt").write_text("data1")
        (data_dir / "file2.txt").write_text("data2")
        
        # Repackage
        output_path = tmp_path / "output.qgz"
        project_migrator._repackage_qgz(source_dir, output_path, modified_qgs)
        
        # Verify output file created
        assert output_path.exists()
        
        # Verify contents
        with zipfile.ZipFile(output_path, 'r') as zf:
            namelist = zf.namelist()
            
            # Should contain modified .qgs with original name
            assert 'project.qgs' in namelist
            
            # Should contain data files
            assert 'data/file1.txt' in namelist
            assert 'data/file2.txt' in namelist
            
            # Check .qgs has modified content
            qgs_content = zf.read('project.qgs').decode('utf-8')
            assert qgs_content == "modified content"
    
    @patch('services.project_migrator.QGZParser')
    @patch('services.project_migrator.LayerExtractor')
    def test_migrate_project_skip_remote_layers(
        self,
        mock_extractor_class,
        mock_parser_class,
        project_migrator,
        sample_project_info,
        tmp_path
    ):
        """Test that remote layers are skipped during migration"""
        # Mock parser
        mock_parser = MagicMock()
        mock_parser.temp_dir = tmp_path
        mock_parser.extract.return_value = tmp_path / "project.qgs"
        mock_parser.get_project_info.return_value = sample_project_info
        mock_parser_class.return_value.__enter__.return_value = mock_parser
        
        # Mock extractor
        mock_extractor = MagicMock()
        mock_extractor_class.return_value = mock_extractor
        
        # Create dummy source files
        (tmp_path / "data").mkdir()
        (tmp_path / "data" / "points.geojson").touch()
        (tmp_path / "data" / "polygons.gpkg").touch()
        
        # Run migration
        qgz_path = tmp_path / "test.qgz"
        qgz_path.touch()
        
        project_info, migration_results, modified_qgz = project_migrator.migrate_project(
            qgz_path=qgz_path,
            project_name="test_project"
        )
        
        # Should only extract local layers (2 out of 3)
        assert mock_extractor.extract_layer.call_count == 2
    
    @patch('services.project_migrator.QGZParser')
    @patch('services.project_migrator.LayerExtractor')
    def test_migrate_project_rollback_on_failure(
        self,
        mock_extractor_class,
        mock_parser_class,
        project_migrator,
        sample_project_info,
        tmp_path
    ):
        """Test rollback when migration fails"""
        # Mock parser
        mock_parser = MagicMock()
        mock_parser.temp_dir = tmp_path
        mock_parser.extract.return_value = tmp_path / "project.qgs"
        mock_parser.get_project_info.return_value = sample_project_info
        mock_parser_class.return_value.__enter__.return_value = mock_parser
        
        # Mock extractor with failure
        mock_extractor = MagicMock()
        mock_extractor.extract_layer.return_value = MigrationResult(
            layer_name="Points",
            table_name="test_project_points",
            features_count=0,
            geometry_type="Point",
            source_crs="EPSG:4326",
            target_crs="EPSG:2056",
            success=False,
            error="Extraction failed"
        )
        mock_extractor_class.return_value = mock_extractor
        
        # Create dummy source files
        (tmp_path / "data").mkdir()
        (tmp_path / "data" / "points.geojson").touch()
        
        # Run migration
        qgz_path = tmp_path / "test.qgz"
        qgz_path.touch()
        
        project_info, migration_results, modified_qgz = project_migrator.migrate_project(
            qgz_path=qgz_path,
            project_name="test_project"
        )
        
        # Check that we got results even with failures
        assert len(migration_results) > 0
        assert any(not r.success for r in migration_results)
    
    def test_rollback_migration(self, project_migrator):
        """Test rollback migration drops tables"""
        # Create mock migration results
        migration_results = [
            MigrationResult(
                layer_name="layer1",
                table_name="test_project_layer1",
                features_count=100,
                geometry_type="Point",
                source_crs="EPSG:4326",
                target_crs="EPSG:2056",
                success=True
            ),
            MigrationResult(
                layer_name="layer2",
                table_name="test_project_layer2",
                features_count=0,
                geometry_type="",
                source_crs="",
                target_crs="EPSG:2056",
                success=False,
                error="Failed"
            )
        ]
        
        # Mock extractor
        with patch('services.project_migrator.LayerExtractor') as mock_extractor_class:
            mock_extractor = MagicMock()
            mock_extractor_class.return_value = mock_extractor
            
            # Run rollback
            project_migrator.rollback_migration("test_project", migration_results)
            
            # Should only try to drop successful migrations
            mock_extractor.drop_table.assert_called_once_with("test_project_layer1")


class TestProjectMigratorIntegration:
    """Integration tests for project migration"""
    
    @patch('services.project_migrator.QGZParser')
    @patch('services.project_migrator.LayerExtractor')
    def test_full_migration_workflow(
        self,
        mock_extractor_class,
        mock_parser_class,
        project_migrator,
        sample_project_info,
        tmp_path
    ):
        """Test complete migration workflow"""
        # Setup mocks
        mock_parser = MagicMock()
        mock_parser.temp_dir = tmp_path
        mock_parser.extract.return_value = tmp_path / "project.qgs"
        mock_parser.get_project_info.return_value = sample_project_info
        mock_parser_class.return_value.__enter__.return_value = mock_parser
        
        mock_extractor = MagicMock()
        mock_extractor.extract_layer.return_value = MigrationResult(
            layer_name="Points",
            table_name="test_project_points",
            features_count=50,
            geometry_type="Point",
            source_crs="EPSG:4326",
            target_crs="EPSG:2056",
            success=True
        )
        mock_extractor.generate_postgis_datasource.return_value = "dbname='dufour' table='test_project_points'"
        mock_extractor._extract_epsg_code.return_value = 2056
        mock_extractor_class.return_value = mock_extractor
        
        # Create dummy files
        (tmp_path / "data").mkdir()
        (tmp_path / "data" / "points.geojson").touch()
        (tmp_path / "data" / "polygons.gpkg").touch()
        
        # Create dummy .qgz
        qgz_path = tmp_path / "test.qgz"
        with zipfile.ZipFile(qgz_path, 'w') as zf:
            zf.writestr('project.qgs', '<qgis></qgis>')
        
        # Run migration
        project_info, migration_results, modified_qgz = project_migrator.migrate_project(
            qgz_path=qgz_path,
            project_name="test_project",
            target_crs="EPSG:2056"
        )
        
        # Verify results
        assert project_info == sample_project_info
        assert len(migration_results) > 0
        assert modified_qgz is not None
        assert isinstance(modified_qgz, bytes)
        
        # Verify extractor was called
        assert mock_extractor.extract_layer.called
        assert mock_extractor.generate_postgis_datasource.called
        
        # Verify parser datasource updates
        assert mock_parser.update_layer_datasource.called
        assert mock_parser.save_modified_qgs.called
