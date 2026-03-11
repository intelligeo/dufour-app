"""
Test suite for QGISStorageService (PostgreSQL BYTEA storage)
"""
import pytest
import zipfile
import io
from pathlib import Path
from services.qgis_storage_service import storage_service

pytestmark = pytest.mark.integration

# Test project path
TEST_PROJECT = Path(__file__).parent.parent.parent / 'resources' / 'test_qgs' / 'SNU_TAG.qgz'

@pytest.fixture
def test_qgz_bytes():
    """Load test .qgz file"""
    if not TEST_PROJECT.exists():
        pytest.skip(f"Test project not found: {TEST_PROJECT}")
    return TEST_PROJECT.read_bytes()

@pytest.fixture
def test_project_name():
    """Unique test project name"""
    return 'test_storage_pytest'

def test_store_retrieve_qgz(test_qgz_bytes, test_project_name):
    """Test round-trip: store → retrieve → verify binary integrity"""
    # Store project
    result = storage_service.store_qgz(
        project_name=test_project_name,
        qgz_bytes=test_qgz_bytes,
        title='Test Storage Project',
        description='Pytest round-trip test'
    )
    
    assert 'project_id' in result
    assert result['name'] == test_project_name
    assert result['size_bytes'] == len(test_qgz_bytes)
    
    # Retrieve project
    retrieved_bytes = storage_service.retrieve_qgz(test_project_name)
    
    # Verify binary integrity
    assert retrieved_bytes == test_qgz_bytes
    assert len(retrieved_bytes) == len(test_qgz_bytes)
    
    print(f"✅ Round-trip OK: {len(test_qgz_bytes)} bytes")

def test_list_projects():
    """Test list_projects() returns stored projects"""
    projects = storage_service.list_projects()
    
    assert len(projects) > 0
    assert 'snu_tag' in [p['name'] for p in projects]
    
    snu = next(p for p in projects if p['name'] == 'snu_tag')
    # Note: title extracted from .qgz XML metadata, not filename
    assert snu['title'] is not None
    assert snu['file_size'] == 51175  # list_projects uses 'file_size'
    assert snu['owner'] == 'dev_user'  # list_projects uses 'owner' not 'username'
    
    print(f"✅ Listed {len(projects)} projects")

def test_metadata_extraction(test_qgz_bytes, test_project_name):
    """Test extent/CRS extraction from .qgz XML"""
    result = storage_service.store_qgz(
        project_name=f"{test_project_name}_meta",
        qgz_bytes=test_qgz_bytes,
        title='Metadata Test'
    )
    
    # Query metadata directly
    from database.connection import get_db_session
    from sqlalchemy import text
    session = get_db_session()
    try:
        query = text("""
            SELECT extent_minx, extent_miny, extent_maxx, extent_maxy, crs
            FROM projects 
            WHERE name = :name
        """)
        row = session.execute(query, {'name': f"{test_project_name}_meta"}).fetchone()
        
        assert row is not None
        assert row[0] is not None  # minx
        assert row[4] == 'EPSG:2056'  # Swiss LV95
        
        print(f"✅ Extent: [{row[0]:.2f}, {row[1]:.2f}, {row[2]:.2f}, {row[3]:.2f}]")
        print(f"✅ CRS: {row[4]}")
    finally:
        session.close()

def test_size_limit():
    """Test rejection of files > 50MB"""
    # Create fake 51MB file
    large_data = b'x' * (51 * 1024 * 1024)
    
    with pytest.raises(ValueError, match="too large"):
        storage_service.store_qgz(
            project_name='too_large',
            qgz_bytes=large_data,
            title='Too Large'
        )
    
    print("✅ Size limit enforced (50MB)")

def test_invalid_qgz():
    """Test rejection of non-ZIP files"""
    invalid_data = b'this is not a zip file'
    
    with pytest.raises(ValueError, match="Invalid .qgz file"):
        storage_service.store_qgz(
            project_name='invalid_zip',
            qgz_bytes=invalid_data,
            title='Invalid'
        )
    
    print("✅ ZIP validation works")

def test_export_to_filesystem(test_qgz_bytes, test_project_name):
    """Test export to temporary directory"""
    import tempfile
    
    # Store project first
    storage_service.store_qgz(
        project_name=f"{test_project_name}_export",
        qgz_bytes=test_qgz_bytes,
        title='Export Test'
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / f"{test_project_name}_export.qgz"
        storage_service.export_to_filesystem(f"{test_project_name}_export", output_path)
        
        assert output_path.exists()
        assert output_path.stat().st_size > 0
        
        # Verify it's a valid ZIP
        with zipfile.ZipFile(output_path, 'r') as zf:
            assert any('.qgs' in name for name in zf.namelist())
        
        print(f"✅ Exported to {output_path} ({output_path.stat().st_size} bytes)")

def test_delete_project(test_project_name):
    """Test project deletion"""
    # Store test project first
    test_data = b'PK\x03\x04fake'  # Minimal ZIP header
    
    # Create valid .qgz
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as zf:
        zf.writestr('test.qgs', '<?xml version="1.0"?><qgis></qgis>')
    test_qgz = buf.getvalue()
    
    storage_service.store_qgz(
        project_name=f"{test_project_name}_delete",
        qgz_bytes=test_qgz,
        title='To Delete'
    )
    
    # Delete it
    deleted_id = storage_service.delete_project(f"{test_project_name}_delete")
    assert deleted_id is not None
    
    # Verify deletion
    projects = storage_service.list_projects()
    assert f"{test_project_name}_delete" not in [p['name'] for p in projects]
    
    print(f"✅ Deleted project {deleted_id}")

def test_update_existing_project(test_qgz_bytes, test_project_name):
    """Test updating existing project (INSERT ON CONFLICT)"""
    # First insert
    result1 = storage_service.store_qgz(
        project_name=f"{test_project_name}_update",
        qgz_bytes=test_qgz_bytes[:10000],  # Smaller version
        title='Version 1'
    )
    
    # Update with full version
    result2 = storage_service.store_qgz(
        project_name=f"{test_project_name}_update",
        qgz_bytes=test_qgz_bytes,
        title='Version 2 Updated'
    )
    
    # IDs should be the same (update, not new insert)
    assert result1['project_id'] == result2['project_id']
    assert result2['size_bytes'] == len(test_qgz_bytes)
    
    # Verify title updated
    projects = storage_service.list_projects()
    updated = next(p for p in projects if p['name'] == f"{test_project_name}_update")
    assert updated['title'] == 'Version 2 Updated'
    
    print("✅ Update existing project works")

if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
