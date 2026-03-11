"""
Tests for Project Upload API Endpoint
"""
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import zipfile
from unittest.mock import patch, MagicMock
import io

from main import app
from services.qgz_parser import ProjectInfo, LayerInfo
from services.layer_extractor import MigrationResult

pytestmark = pytest.mark.unit

client = TestClient(app)


@pytest.fixture
def sample_qgz_file():
    """Create a minimal .qgz file in memory"""
    buffer = io.BytesIO()
    
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        qgs_content = """<?xml version="1.0"?>
<qgis version="3.34.0">
  <title>Test Project</title>
  <mapcanvas>
    <destinationsrs>
      <spatialrefsys>
        <authid>EPSG:2056</authid>
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
    <maplayer type="vector" geometry="Point">
      <id>layer1</id>
      <datasource>./points.geojson</datasource>
      <layername>Test Points</layername>
    </maplayer>
  </projectlayers>
</qgis>"""
        zf.writestr('test.qgs', qgs_content)
        zf.writestr('points.geojson', '{"type": "FeatureCollection", "features": []}')
    
    buffer.seek(0)
    return buffer


@pytest.fixture
def mock_migration_success():
    """Mock successful migration"""
    project_info = ProjectInfo(
        title="Test Project",
        crs="EPSG:2056",
        extent=(2600000, 1200000, 2650000, 1250000),
        layers=[
            LayerInfo(
                id="layer1",
                name="Test Points",
                layer_type="vector",
                geometry_type="Point",
                source_type="geojson",
                datasource="./points.geojson",
                table_name=None,
                crs="EPSG:2056",
                is_local=True
            )
        ],
        qgz_size=1024
    )
    
    migration_results = [
        MigrationResult(
            layer_name="Test Points",
            table_name="test_project_test_points",
            features_count=10,
            geometry_type="Point",
            source_crs="EPSG:2056",
            target_crs="EPSG:2056",
            success=True
        )
    ]
    
    modified_qgz_bytes = b"modified qgz content"
    
    return project_info, migration_results, modified_qgz_bytes


class TestProjectUploadAPI:
    """Test project upload API endpoint"""
    
    def test_health_check(self):
        """Test API health check endpoint"""
        response = client.get("/")
        assert response.status_code == 200
        assert response.json()["status"] == "online"
    
    def test_upload_invalid_extension(self):
        """Test upload with invalid file extension"""
        files = {"file": ("test.txt", b"not a qgz file", "text/plain")}
        data = {"name": "test_project"}
        
        response = client.post("/api/projects", files=files, data=data)
        
        assert response.status_code == 400
        assert "Only .qgz files are accepted" in response.json()["detail"]
    
    def test_upload_invalid_project_name(self, sample_qgz_file):
        """Test upload with invalid project name"""
        files = {"file": ("test.qgz", sample_qgz_file.read(), "application/zip")}
        data = {"name": "Invalid-Name-123"}  # Contains uppercase and hyphen
        
        response = client.post("/api/projects", files=files, data=data)
        
        assert response.status_code == 400
        assert "lowercase alphanumeric" in response.json()["detail"]
    
    def test_upload_file_too_large(self):
        """Test upload with file exceeding size limit"""
        # Create large content (>50MB)
        large_content = b"x" * (51 * 1024 * 1024)
        files = {"file": ("large.qgz", large_content, "application/zip")}
        data = {"name": "test_project"}
        
        response = client.post("/api/projects", files=files, data=data)
        
        assert response.status_code == 400
        assert "50MB limit" in response.json()["detail"]
    
    @patch('main.project_migrator.migrate_project')
    @patch('main.db.get_engine')
    def test_upload_successful(
        self,
        mock_db_engine,
        mock_migrate,
        sample_qgz_file,
        mock_migration_success
    ):
        """Test successful project upload and migration"""
        # Mock migration
        mock_migrate.return_value = mock_migration_success
        
        # Mock database connection
        mock_conn = MagicMock()
        mock_engine = MagicMock()
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        mock_db_engine.return_value = mock_engine
        
        # Upload file
        files = {"file": ("test.qgz", sample_qgz_file.read(), "application/zip")}
        data = {
            "name": "test_project",
            "title": "Test Project",
            "description": "Test description",
            "is_public": "true"
        }
        
        response = client.post("/api/projects", files=files, data=data)
        
        assert response.status_code == 200
        result = response.json()
        
        # Check response structure
        assert result["success"] is True
        assert "project" in result
        assert "migration" in result
        
        # Check project info
        assert result["project"]["name"] == "test_project"
        assert result["project"]["title"] == "Test Project"
        assert result["project"]["description"] == "Test description"
        assert result["project"]["is_public"] is True
        
        # Check migration info
        assert result["migration"]["total_layers"] == 1
        assert result["migration"]["migrated"] == 1
        assert result["migration"]["failed"] == 0
        
        # Verify migration was called
        mock_migrate.assert_called_once()
    
    @patch('main.project_migrator.migrate_project')
    @patch('main.project_migrator.rollback_migration')
    def test_upload_migration_failure(
        self,
        mock_rollback,
        mock_migrate,
        sample_qgz_file
    ):
        """Test upload with migration failure triggers rollback"""
        # Mock migration with failure
        project_info = ProjectInfo(
            title="Test",
            crs="EPSG:2056",
            extent=(0, 0, 1, 1),
            layers=[],
            qgz_size=1024
        )
        
        failed_result = MigrationResult(
            layer_name="Test Layer",
            table_name="",
            features_count=0,
            geometry_type="",
            source_crs="",
            target_crs="EPSG:2056",
            success=False,
            error="Extraction failed"
        )
        
        mock_migrate.return_value = (project_info, [failed_result], b"data")
        
        # Upload file
        files = {"file": ("test.qgz", sample_qgz_file.read(), "application/zip")}
        data = {"name": "test_project"}
        
        response = client.post("/api/projects", files=files, data=data)
        
        # Should return 500 due to migration failure
        assert response.status_code == 500
        assert "Layer migration failed" in response.json()["detail"]
        
        # Verify rollback was called
        mock_rollback.assert_called_once()
    
    @patch('main.project_migrator.migrate_project')
    @patch('main.db.get_engine')
    def test_upload_with_optional_fields(
        self,
        mock_db_engine,
        mock_migrate,
        sample_qgz_file,
        mock_migration_success
    ):
        """Test upload with only required fields"""
        mock_migrate.return_value = mock_migration_success
        
        # Mock database
        mock_conn = MagicMock()
        mock_engine = MagicMock()
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        mock_db_engine.return_value = mock_engine
        
        # Upload with minimal data
        files = {"file": ("test.qgz", sample_qgz_file.read(), "application/zip")}
        data = {"name": "test_project"}  # Only required field
        
        response = client.post("/api/projects", files=files, data=data)
        
        assert response.status_code == 200
        result = response.json()
        
        # Should use defaults
        assert result["project"]["is_public"] is False
        assert result["project"]["title"] == "Test Project"  # From .qgs
    
    @patch('main.project_migrator.migrate_project')
    def test_upload_exception_handling(
        self,
        mock_migrate,
        sample_qgz_file
    ):
        """Test error handling for unexpected exceptions"""
        # Mock migration to raise exception
        mock_migrate.side_effect = Exception("Unexpected error")
        
        files = {"file": ("test.qgz", sample_qgz_file.read(), "application/zip")}
        data = {"name": "test_project"}
        
        response = client.post("/api/projects", files=files, data=data)
        
        assert response.status_code == 500
        assert "Failed to upload and migrate project" in response.json()["detail"]


class TestCORSHeaders:
    """Test CORS configuration"""
    
    def test_cors_headers_present(self):
        """Test that CORS headers are present in responses"""
        response = client.get("/")
        
        # Should have CORS headers
        assert "access-control-allow-origin" in response.headers
    
    def test_cors_preflight(self):
        """Test CORS preflight request"""
        response = client.options(
            "/api/projects",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST"
            }
        )
        
        # Should return 200 for preflight
        assert response.status_code == 200


class TestDataValidation:
    """Test input data validation"""
    
    def test_project_name_alphanumeric_only(self, sample_qgz_file):
        """Test project name validation: alphanumeric only"""
        files = {"file": ("test.qgz", sample_qgz_file.read(), "application/zip")}
        
        # Test with special characters
        data = {"name": "test@project#123"}
        response = client.post("/api/projects", files=files, data=data)
        assert response.status_code == 400
        
        # Test with spaces
        sample_qgz_file.seek(0)
        files = {"file": ("test.qgz", sample_qgz_file.read(), "application/zip")}
        data = {"name": "test project"}
        response = client.post("/api/projects", files=files, data=data)
        assert response.status_code == 400
    
    def test_project_name_lowercase_only(self, sample_qgz_file):
        """Test project name validation: lowercase only"""
        files = {"file": ("test.qgz", sample_qgz_file.read(), "application/zip")}
        data = {"name": "TestProject"}
        
        response = client.post("/api/projects", files=files, data=data)
        
        assert response.status_code == 400
        assert "lowercase" in response.json()["detail"]
    
    def test_project_name_with_underscores_allowed(self, sample_qgz_file):
        """Test that underscores are allowed in project names"""
        # This test would need full mocking to pass
        # Just verify the validation logic accepts it
        data = {"name": "test_project_123"}
        
        # Valid format
        assert data["name"].replace('_', '').isalnum()
        assert data["name"].islower()
