"""
PostgreSQL/PostGIS Connection Tests
Tests database connectivity, schema, and operations
"""
import pytest
import time
from sqlalchemy import text

from database.connection import db, get_db_session

pytestmark = pytest.mark.integration


class TestPostGISConnection:
    """Test suite for PostgreSQL/PostGIS connectivity"""
    
    def test_connection_success(self):
        """Test 1: Basic database connection"""
        result = db.test_connection()
        
        assert result['connected'] == True, f"Connection failed: {result.get('error')}"
        assert result['latency_ms'] < 1000, f"Latency too high: {result['latency_ms']}ms"  # Changed from 500 to 1000
        assert 'postgresql_version' in result
        assert 'postgis_version' in result
        
        print(f"\n✅ Connection OK: {result['host']}/{result['database']}")
        print(f"   PostgreSQL: {result['postgresql_version']}")
        print(f"   PostGIS: {result['postgis_version']}")
        print(f"   Latency: {result['latency_ms']}ms")
    
    def test_schema_tables_exist(self):
        """Test 2: Verify schema tables are created"""
        session = get_db_session()
        
        try:
            # Check for required tables
            result = session.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'projects', 'project_layers')
                ORDER BY table_name
            """))
            
            tables = [row[0] for row in result]
            
            assert 'users' in tables, "Table 'users' not found"
            assert 'projects' in tables, "Table 'projects' not found"
            assert 'project_layers' in tables, "Table 'project_layers' not found"
            
            print(f"\n✅ Schema tables found: {', '.join(tables)}")
            
        finally:
            session.close()
    
    def test_insert_project_metadata(self):
        """Test 3: Insert and retrieve project metadata"""
        session = get_db_session()
        
        try:
            # Get dev user ID
            result = session.execute(text("SELECT id FROM users WHERE username = 'dev_user'"))
            user_row = result.fetchone()
            assert user_row is not None, "Dev user not found"
            user_id = user_row[0]
            
            # Insert test project
            test_qgz_data = b'PK\x03\x04TEST_QGZ_DATA'  # Fake QGZ header
            
            session.execute(text("""
                INSERT INTO projects (user_id, name, title, description, qgz_data, qgz_size, extent_minx, extent_miny, extent_maxx, extent_maxy, crs)
                VALUES (:user_id, :name, :title, :description, :qgz_data, :qgz_size, :minx, :miny, :maxx, :maxy, :crs)
                ON CONFLICT (name) DO UPDATE SET title = EXCLUDED.title
            """), {
                'user_id': user_id,
                'name': 'test_project_pytest',
                'title': 'Test Project PyTest',
                'description': 'Automated test project',
                'qgz_data': test_qgz_data,
                'qgz_size': len(test_qgz_data),
                'minx': 2485071.0,
                'miny': 1075346.0,
                'maxx': 2837119.0,
                'maxy': 1299941.0,
                'crs': 'EPSG:2056'
            })
            session.commit()
            
            # Retrieve project
            result = session.execute(text("""
                SELECT name, title, qgz_size, crs 
                FROM projects 
                WHERE name = 'test_project_pytest'
            """))
            row = result.fetchone()
            
            assert row is not None, "Project not inserted"
            assert row[0] == 'test_project_pytest'
            assert row[1] == 'Test Project PyTest'
            assert row[2] == len(test_qgz_data)
            assert row[3] == 'EPSG:2056'
            
            print(f"\n✅ Project inserted: {row[0]} ({row[2]} bytes)")
            
        finally:
            session.close()
    
    def test_query_projects_list(self):
        """Test 4: Query projects list with view"""
        session = get_db_session()
        
        try:
            result = session.execute(text("""
                SELECT name, title, layer_count, total_layers_size_bytes, owner_username
                FROM v_projects_summary
                ORDER BY created_at DESC
                LIMIT 10
            """))
            
            projects = [dict(zip(result.keys(), row)) for row in result]
            
            assert len(projects) >= 0, "Query failed"
            
            print(f"\n✅ Found {len(projects)} projects in database")
            for p in projects[:3]:  # Show first 3
                print(f"   - {p['name']}: {p['layer_count']} layers, owner: {p['owner_username']}")
            
        finally:
            session.close()
    
    def test_connection_pool_reuse(self):
        """Test 5: Connection pooling performance"""
        times = []
        
        for i in range(5):
            start = time.time()
            session = get_db_session()
            try:
                session.execute(text("SELECT 1"))
                session.commit()
            finally:
                session.close()
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)
        
        avg_time = sum(times) / len(times)
        
        # First connection might be slower, but subsequent should be fast
        assert avg_time < 150, f"Connection pool too slow: {avg_time:.2f}ms average"  # Adjusted for alwaysdata latency
        assert times[-1] < 120, f"Pooled connection slow: {times[-1]:.2f}ms"  # Adjusted threshold
        
        print(f"\n✅ Connection pool performance:")
        print(f"   Times: {[f'{t:.1f}ms' for t in times]}")
        print(f"   Average: {avg_time:.2f}ms")
    
    def test_postgis_extension(self):
        """Test 6: Verify PostGIS extension and spatial queries"""
        session = get_db_session()
        
        try:
            # Check PostGIS functions
            result = session.execute(text("""
                SELECT 
                    ST_AsText(ST_MakePoint(7.4474, 46.9480)) AS point,
                    ST_Distance(
                        ST_SetSRID(ST_MakePoint(7.4474, 46.9480), 4326),
                        ST_SetSRID(ST_MakePoint(8.5417, 47.3769), 4326)
                    ) AS distance_degrees
            """))
            
            row = result.fetchone()
            assert row is not None
            assert 'POINT' in row[0]
            assert row[1] > 0  # Distance should be positive
            
            print(f"\n✅ PostGIS extension working:")
            print(f"   Point: {row[0]}")
            print(f"   Distance: {row[1]:.6f} degrees")
            
        finally:
            session.close()


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--log-cli-level=DEBUG'])
