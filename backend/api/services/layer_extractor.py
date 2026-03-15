"""
Layer Extractor Service
Extracts layer data from QGIS projects and migrates to PostGIS
Supports: GeoJSON, GeoPackage, Shapefile, FlatGeobuf
"""
import fiona
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import logging
from dataclasses import dataclass
from sqlalchemy import text, inspect
from sqlalchemy.engine import Engine
import pyproj
from shapely.geometry import shape, mapping
from shapely.ops import transform

from database.connection import db
from services.qgz_parser import LayerInfo

logger = logging.getLogger(__name__)


@dataclass
class MigrationResult:
    """Result of layer migration to PostGIS"""
    layer_name: str
    table_name: str
    features_count: int
    geometry_type: str
    source_crs: str
    target_crs: str
    success: bool
    error: Optional[str] = None


class LayerExtractor:
    """Extract and migrate layer data to PostGIS"""
    
    # Supported vector formats
    SUPPORTED_FORMATS = ['gpkg', 'shp', 'geojson', 'fgb']
    
    # PostGIS connection template
    POSTGIS_CONNECTION_TEMPLATE = (
        "dbname='{database}' host='{host}' port={port} "
        "user='{user}' password='{password}' sslmode=disable "
        "key='fid' srid={srid} type={geometry_type} "
        "table=\"{schema}\".\"{table}\" (geom) sql="
    )
    
    def __init__(self, project_name: str, engine: Optional[Engine] = None):
        """
        Initialize layer extractor
        
        Args:
            project_name: Name of the project (for table naming)
            engine: SQLAlchemy engine (defaults to db.get_engine())
        """
        self.project_name = project_name
        self.engine = engine or db.get_engine()
        
    def extract_layer(
        self,
        layer_info: LayerInfo,
        source_path: Path,
        target_crs: str = 'EPSG:2056',
        schema: str = 'public'
    ) -> MigrationResult:
        """
        Extract layer data and migrate to PostGIS
        
        Args:
            layer_info: Layer information from QGZ parser
            source_path: Path to source file (gpkg, shp, geojson, etc.)
            target_crs: Target CRS for PostGIS (default: EPSG:2056 - Swiss LV95)
            schema: Target PostgreSQL schema (default: public)
            
        Returns:
            MigrationResult with migration details
        """
        logger.info(f"Extracting layer: {layer_info.name} from {source_path} → schema={schema}")
        
        # Validate format
        if layer_info.source_type not in self.SUPPORTED_FORMATS:
            return MigrationResult(
                layer_name=layer_info.name,
                table_name='',
                features_count=0,
                geometry_type='',
                source_crs='',
                target_crs=target_crs,
                success=False,
                error=f"Unsupported format: {layer_info.source_type}"
            )
        
        try:
            # Generate table name (unqualified — schema provides project isolation)
            table_name = self._generate_table_name(layer_info.name)
            
            # Read source data with fiona
            with fiona.open(source_path) as src:
                # Get source info
                source_crs = src.crs_wkt or src.crs.get('init', 'EPSG:4326')
                geometry_type = src.schema['geometry']
                features_count = len(src)
                
                logger.info(
                    f"Source: {features_count} features, "
                    f"geometry: {geometry_type}, CRS: {source_crs}"
                )
                
                # Create PostGIS table in target schema
                self._create_postgis_table(
                    table_name=table_name,
                    geometry_type=geometry_type,
                    srid=self._extract_epsg_code(target_crs),
                    properties=src.schema['properties'],
                    schema=schema
                )
                
                # Transform and insert features
                transformer = self._get_transformer(source_crs, target_crs)
                inserted = self._insert_features(
                    src=src,
                    table_name=table_name,
                    transformer=transformer,
                    schema=schema,
                    srid=self._extract_epsg_code(target_crs)
                )
                
                logger.info(f"Inserted {inserted} features into {schema}.{table_name}")
                
                return MigrationResult(
                    layer_name=layer_info.name,
                    table_name=table_name,
                    features_count=inserted,
                    geometry_type=geometry_type,
                    source_crs=source_crs,
                    target_crs=target_crs,
                    success=True
                )
                
        except Exception as e:
            logger.error(f"Failed to extract layer {layer_info.name}: {e}")
            return MigrationResult(
                layer_name=layer_info.name,
                table_name='',
                features_count=0,
                geometry_type='',
                source_crs='',
                target_crs=target_crs,
                success=False,
                error=str(e)
            )
    
    def _generate_table_name(self, layer_name: str) -> str:
        """
        Generate PostGIS table name from layer name.
        
        The project schema provides isolation, so no project prefix is needed.
        Returns: lyr_{sanitized_layer_name} (max 63 chars)
        """
        # Sanitize: lowercase, alphanumeric + underscore only
        safe_layer = ''.join(c if c.isalnum() or c == '_' else '_' for c in layer_name)
        safe_layer = safe_layer.lower().strip('_')
        
        table_name = f"lyr_{safe_layer}"
        
        # Truncate if too long (PostgreSQL limit: 63 chars)
        if len(table_name) > 63:
            table_name = table_name[:63]
        
        return table_name
    
    def _extract_epsg_code(self, crs_string: str) -> int:
        """
        Extract EPSG code from CRS string
        
        Args:
            crs_string: CRS string (e.g., 'EPSG:2056')
            
        Returns:
            EPSG code as integer
        """
        if 'EPSG:' in crs_string:
            return int(crs_string.split(':')[1])
        return 2056  # Default to Swiss LV95
    
    def _create_postgis_table(
        self,
        table_name: str,
        geometry_type: str,
        srid: int,
        properties: Dict[str, str],
        schema: str = 'public'
    ):
        """
        Create PostGIS table for layer data in the given schema.
        
        Args:
            table_name: Unqualified table name
            geometry_type: Geometry type (Point, LineString, Polygon, etc.)
            srid: EPSG SRID code
            properties: Dictionary of property names and types
            schema: Target PostgreSQL schema (default: public)
        """
        with self.engine.connect() as conn:
            # Drop table if exists (qualified with schema)
            conn.execute(text(f'DROP TABLE IF EXISTS "{schema}"."{table_name}" CASCADE'))
            
            # Build column definitions
            columns = ['fid SERIAL PRIMARY KEY']
            
            # Add attribute columns
            for prop_name, prop_type in properties.items():
                col_name = self._sanitize_column_name(prop_name)
                pg_type = self._map_fiona_type_to_postgres(prop_type)
                columns.append(f'"{col_name}" {pg_type}')
            
            # Create table in target schema
            columns_sql = ', '.join(columns)
            create_sql = f'CREATE TABLE "{schema}"."{table_name}" ({columns_sql})'
            conn.execute(text(create_sql))
            
            # Add geometry column (schema-qualified)
            add_geom_sql = f"""
                SELECT AddGeometryColumn(
                    '{schema}', '{table_name}', 'geom', {srid}, 
                    '{geometry_type.upper()}', 2
                )
            """
            conn.execute(text(add_geom_sql))
            
            # Create spatial index (schema-qualified)
            index_sql = (
                f'CREATE INDEX "{table_name}_geom_idx" '
                f'ON "{schema}"."{table_name}" USING GIST (geom)'
            )
            conn.execute(text(index_sql))
            
            conn.commit()
            logger.info(f"Created PostGIS table: {schema}.{table_name}")
    
    def _sanitize_column_name(self, name: str) -> str:
        """
        Sanitize column name for PostgreSQL
        
        Args:
            name: Original column name
            
        Returns:
            Sanitized column name
        """
        # Lowercase, replace spaces with underscore
        safe_name = name.lower().replace(' ', '_')
        # Remove special characters except underscore
        safe_name = ''.join(c if c.isalnum() or c == '_' else '' for c in safe_name)
        # Ensure doesn't start with number
        if safe_name and safe_name[0].isdigit():
            safe_name = 'col_' + safe_name
        return safe_name or 'unnamed'
    
    def _map_fiona_type_to_postgres(self, fiona_type: str) -> str:
        """
        Map fiona property type to PostgreSQL type
        
        Args:
            fiona_type: Fiona type string
            
        Returns:
            PostgreSQL type string
        """
        type_map = {
            'int': 'INTEGER',
            'int32': 'INTEGER',
            'int64': 'BIGINT',
            'float': 'DOUBLE PRECISION',
            'float32': 'REAL',
            'float64': 'DOUBLE PRECISION',
            'str': 'TEXT',
            'bool': 'BOOLEAN',
            'date': 'DATE',
            'datetime': 'TIMESTAMP',
            'time': 'TIME'
        }
        
        fiona_type_lower = fiona_type.lower()
        
        # Check for string length specification (e.g., "str:80")
        if ':' in fiona_type_lower:
            base_type, length = fiona_type_lower.split(':')
            if base_type == 'str':
                return f'VARCHAR({length})'
        
        return type_map.get(fiona_type_lower, 'TEXT')
    
    def _get_transformer(self, source_crs: str, target_crs: str):
        """
        Get CRS transformer function
        
        Args:
            source_crs: Source CRS string
            target_crs: Target CRS string
            
        Returns:
            Transformer function or None if CRS are same
        """
        # Extract EPSG codes
        source_epsg = self._extract_epsg_code(source_crs) if 'EPSG' in source_crs else None
        target_epsg = self._extract_epsg_code(target_crs)
        
        # No transformation needed if same CRS
        if source_epsg == target_epsg:
            return None
        
        # Create pyproj transformer
        if source_epsg:
            source_proj = pyproj.CRS(f'EPSG:{source_epsg}')
        else:
            # Parse WKT
            source_proj = pyproj.CRS(source_crs)
        
        target_proj = pyproj.CRS(f'EPSG:{target_epsg}')
        
        transformer = pyproj.Transformer.from_crs(
            source_proj,
            target_proj,
            always_xy=True
        )
        
        return transformer.transform
    
    def _insert_features(
        self,
        src: fiona.Collection,
        table_name: str,
        transformer=None,
        schema: str = 'public',
        srid: Optional[int] = None
    ) -> int:
        """
        Insert features from source into PostGIS table (schema-qualified).
        
        Args:
            src: Fiona collection (source data)
            table_name: Unqualified target table name
            transformer: Optional CRS transformer function
            schema: Target PostgreSQL schema (default: public)
            srid: SRID to use for ST_GeomFromText; falls back to source CRS
            
        Returns:
            Number of features inserted
        """
        # Resolve SRID once: prefer explicit arg, then fiona CRS, then default 2056
        if srid is None:
            src_init = (src.crs or {}).get('init', 'EPSG:2056')
            srid = self._extract_epsg_code(src_init if 'EPSG' in src_init.upper() else 'EPSG:2056')

        inserted = 0
        
        with self.engine.connect() as conn:
            for feature in src:
                try:
                    # Get geometry
                    geom = shape(feature['geometry'])
                    
                    # Transform if needed
                    if transformer:
                        geom = transform(transformer, geom)
                    
                    # Get properties
                    properties = feature['properties'] or {}
                    
                    # Build column names and values
                    columns = []
                    values = []
                    
                    for key, value in properties.items():
                        col_name = self._sanitize_column_name(key)
                        columns.append(f'"{col_name}"')
                        values.append(value)
                    
                    # Add geometry
                    columns.append('geom')
                    wkt = geom.wkt
                    
                    # Build INSERT statement (schema-qualified table)
                    columns_sql = ', '.join(columns)
                    placeholders = ', '.join([':val' + str(i) for i in range(len(values))])
                    placeholders += ', ST_GeomFromText(:geom_wkt, :srid)'
                    
                    insert_sql = f'''
                        INSERT INTO "{schema}"."{table_name}" ({columns_sql})
                        VALUES ({placeholders})
                    '''
                    
                    # Execute insert
                    params = {f'val{i}': v for i, v in enumerate(values)}
                    params['geom_wkt'] = wkt
                    params['srid'] = srid
                    
                    conn.execute(text(insert_sql), params)
                    inserted += 1
                    
                except Exception as e:
                    logger.warning(f"Failed to insert feature {inserted}: {e}")
                    continue
            
            conn.commit()
        
        return inserted
    
    def generate_postgis_datasource(
        self,
        table_name: str,
        geometry_type: str,
        srid: int = 2056,
        schema: str = 'public'
    ) -> str:
        """
        Generate PostGIS datasource connection string for QGIS
        
        Args:
            table_name: PostGIS table name
            geometry_type: Geometry type (POINT, LINESTRING, POLYGON, etc.)
            srid: EPSG SRID code
            schema: Database schema (default: public)
            
        Returns:
            QGIS-compatible PostGIS connection string
        """
        # Get database connection details from environment/config
        db_config = db.get_connection_config()
        
        connection_string = self.POSTGIS_CONNECTION_TEMPLATE.format(
            database=db_config['database'],
            host=db_config['host'],
            port=db_config['port'],
            user=db_config['user'],
            password=db_config['password'],
            schema=schema,
            table=table_name,
            srid=srid,
            geometry_type=geometry_type.upper()
        )
        
        return connection_string
    
    def table_exists(self, table_name: str, schema: str = 'public') -> bool:
        """
        Check if table exists in the given schema.
        
        Args:
            table_name: Table name to check
            schema: PostgreSQL schema to inspect (default: public)
            
        Returns:
            True if table exists
        """
        inspector = inspect(self.engine)
        return table_name in inspector.get_table_names(schema=schema)
    
    def drop_table(self, table_name: str, schema: str = 'public'):
        """
        Drop PostGIS table from the given schema.
        
        Args:
            table_name: Table name to drop
            schema: PostgreSQL schema (default: public)
        """
        with self.engine.connect() as conn:
            conn.execute(text(f'DROP TABLE IF EXISTS "{schema}"."{table_name}" CASCADE'))
            conn.commit()
            logger.info(f"Dropped table: {schema}.{table_name}")
