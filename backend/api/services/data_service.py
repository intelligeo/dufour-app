"""
Data Service
Manages PostGIS database operations: create tables, upload features
"""
import os
import psycopg2
from psycopg2 import sql
from typing import List, Dict, Any, Optional
from io import StringIO

from models.schemas import TableSchema, UploadResponse


class DataService:
    """Service for PostGIS database operations"""
    
    def __init__(self):
        # Database connection parameters from environment
        self.db_config = {
            'host': os.getenv('POSTGIS_HOST', 'postgis'),
            'port': int(os.getenv('POSTGIS_PORT', 5432)),
            'database': os.getenv('POSTGIS_DB', 'gisdb'),
            'user': os.getenv('POSTGIS_USER', 'gisuser'),
            'password': os.getenv('POSTGIS_PASSWORD', 'gispassword')
        }
    
    
    def _get_connection(self, db_name: Optional[str] = None):
        """Get database connection"""
        config = self.db_config.copy()
        if db_name:
            config['database'] = db_name
        
        return psycopg2.connect(**config)
    
    
    async def check_connection(self) -> bool:
        """Check if database is accessible"""
        try:
            conn = self._get_connection()
            conn.close()
            return True
        except:
            return False
    
    
    async def create_table(self, db_name: str, schema: TableSchema) -> Dict[str, Any]:
        """
        Create a PostGIS table
        Supports vector and non-spatial tables
        """
        conn = self._get_connection(db_name)
        cursor = conn.cursor()
        
        try:
            # Create schema if not exists
            if schema.schema_name != 'public':
                cursor.execute(
                    sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
                        sql.Identifier(schema.schema_name)
                    )
                )
            
            # Drop table if overwrite requested
            if schema.overwrite:
                cursor.execute(
                    sql.SQL("DROP TABLE IF EXISTS {}.{} CASCADE").format(
                        sql.Identifier(schema.schema_name),
                        sql.Identifier(schema.table_name)
                    )
                )
            
            # Build column definitions
            col_defs = []
            for col in schema.columns:
                col_name = col['name']
                col_type = col['type']
                col_def = f"{col_name} {col_type}"
                
                if col.get('primary_key'):
                    col_def += " PRIMARY KEY"
                if col.get('not_null'):
                    col_def += " NOT NULL"
                if 'default' in col:
                    col_def += f" DEFAULT {col['default']}"
                
                col_defs.append(col_def)
            
            # Create table
            create_sql = sql.SQL("CREATE TABLE {}.{} ({})").format(
                sql.Identifier(schema.schema_name),
                sql.Identifier(schema.table_name),
                sql.SQL(', '.join(col_defs))
            )
            
            cursor.execute(create_sql)
            
            # Add geometry column if specified
            if schema.geometry_column and schema.geometry_type and schema.srid:
                cursor.execute(
                    sql.SQL(
                        "SELECT AddGeometryColumn(%s, %s, %s, %s, %s, 2)"
                    ),
                    (
                        schema.schema_name,
                        schema.table_name,
                        schema.geometry_column,
                        schema.srid,
                        schema.geometry_type
                    )
                )
                
                # Create spatial index
                cursor.execute(
                    sql.SQL(
                        "CREATE INDEX {}_geom_idx ON {}.{} USING GIST ({})"
                    ).format(
                        sql.Identifier(f"{schema.table_name}"),
                        sql.Identifier(schema.schema_name),
                        sql.Identifier(schema.table_name),
                        sql.Identifier(schema.geometry_column)
                    )
                )
            
            conn.commit()
            
            return {
                "success": True,
                "message": f"Table {schema.schema_name}.{schema.table_name} created successfully",
                "schema": schema.schema_name,
                "table": schema.table_name
            }
            
        except Exception as e:
            conn.rollback()
            raise Exception(f"Failed to create table: {str(e)}")
        
        finally:
            cursor.close()
            conn.close()
    
    
    async def bulk_insert(
        self,
        db_name: str,
        schema: str,
        table_name: str,
        data: bytes
    ) -> UploadResponse:
        """
        Bulk insert features using COPY command
        Expects CSV data in COPY format from QGIS plugin
        """
        conn = self._get_connection(db_name)
        cursor = conn.cursor()
        
        try:
            # Decode data
            data_str = data.decode('utf-8')
            
            # Use COPY FROM for bulk insert
            copy_sql = sql.SQL("COPY {}.{} FROM STDIN").format(
                sql.Identifier(schema),
                sql.Identifier(table_name)
            )
            
            # Execute COPY
            cursor.copy_expert(copy_sql, StringIO(data_str))
            
            # Get row count
            rows_inserted = cursor.rowcount
            
            conn.commit()
            
            return UploadResponse(
                success=True,
                message=f"Successfully uploaded {rows_inserted} features",
                rows_inserted=rows_inserted,
                table_name=table_name,
                schema_name=schema
            )
            
        except Exception as e:
            conn.rollback()
            raise Exception(f"Bulk insert failed: {str(e)}")
        
        finally:
            cursor.close()
            conn.close()
    
    
    async def list_tables(self, db_name: str, schema: str = "public") -> List[Dict[str, Any]]:
        """
        List all tables in a schema
        """
        conn = self._get_connection(db_name)
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """
                SELECT 
                    table_name,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
                FROM pg_tables
                WHERE schemaname = %s
                ORDER BY table_name
                """,
                (schema,)
            )
            
            tables = []
            for row in cursor.fetchall():
                tables.append({
                    "name": row[0],
                    "size": row[1]
                })
            
            return tables
            
        finally:
            cursor.close()
            conn.close()
    
    
    async def execute_sql(self, db_name: str, sql_query: str) -> List[Dict[str, Any]]:
        """
        Execute arbitrary SQL query (for admin/debugging)
        """
        conn = self._get_connection(db_name)
        cursor = conn.cursor()
        
        try:
            cursor.execute(sql_query)
            
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                results = []
                for row in cursor.fetchall():
                    results.append(dict(zip(columns, row)))
                return results
            else:
                conn.commit()
                return [{"affected_rows": cursor.rowcount}]
                
        except Exception as e:
            conn.rollback()
            raise Exception(f"SQL execution failed: {str(e)}")
        
        finally:
            cursor.close()
            conn.close()
