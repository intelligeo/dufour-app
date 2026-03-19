"""
MilSymb Migrator Service
Creates PostGIS feature tables for KadasMilxLayer plugin layers
extracted from QGIS .qgz projects.

Each KadasMilxLayer becomes a table in the per-project schema:
  prj_<name>.lyr_milsymb_<title>

Table schema:
  fid             SERIAL PRIMARY KEY
  sidc            VARCHAR(30)         -- MIL-STD-2525C SIDC code
  military_name   TEXT                -- Human label
  symbol_type     VARCHAR(20)         -- 'Point', 'LineString', 'Polygon'
  symbol_scale    REAL                -- Per-feature scale factor
  mss_attributes  JSONB               -- MSS XML attributes (T, XE, etc.)
  geom            geometry(Geometry, <srid>)

Geometry types:
  - 1-point symbols  → Point
  - N-point lines    → LineString
  - N-point areas    → Polygon

The milsymb_service is updated to read from PostGIS instead of
re-parsing the .qgz every time.
"""
import json
import struct
import binascii
import logging
from io import StringIO
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.engine import Engine

from services.qgz_parser import (
    QGZParser,
    MilSymbFeature,
    MilSymbLayerInfo,
)
from database.connection import db

logger = logging.getLogger(__name__)


# ── Table name generation ────────────────────────────────────────────────────

def _milsymb_table_name(layer_title: str) -> str:
    """
    Generate PostGIS table name for a KadasMilxLayer.

    Returns: lyr_milsymb_<sanitised_title> (max 63 chars)
    """
    import re
    slug = layer_title.lower()
    slug = re.sub(r'[^a-z0-9_]', '_', slug)
    slug = re.sub(r'_+', '_', slug).strip('_')
    table_name = f"lyr_milsymb_{slug}"
    return table_name[:63]


# ── EWKB hex helper ──────────────────────────────────────────────────────────

def _coords_to_ewkb_hex(
    coords: List[List[float]],
    geometry_type: str,
    srid: int,
) -> str:
    """
    Convert MilSymbFeature coordinates to EWKB hex.

    Args:
        coords: [[lon, lat], ...] coordinate pairs
        geometry_type: 'Point', 'LineString', or 'Polygon'
        srid: EPSG SRID code

    Returns:
        Hex-encoded EWKB string
    """
    from shapely.geometry import Point, LineString, Polygon

    if geometry_type == 'Point' and coords:
        geom = Point(coords[0])
    elif geometry_type == 'Polygon' and coords:
        ring = [tuple(c) for c in coords]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        geom = Polygon(ring)
    elif geometry_type == 'LineString' and coords:
        geom = LineString([tuple(c) for c in coords])
    else:
        # Fallback: point at 0,0
        geom = Point(0, 0)

    # Standard WKB (little-endian)
    wkb_bytes = geom.wkb
    endian = wkb_bytes[0]
    wkb_type = struct.unpack('<I', wkb_bytes[1:5])[0]

    # Set SRID flag
    ewkb_type = wkb_type | 0x20000000
    ewkb = (
        bytes([endian])
        + struct.pack('<I', ewkb_type)
        + struct.pack('<I', srid)
        + wkb_bytes[5:]
    )
    return binascii.hexlify(ewkb).decode('ascii').upper()


# ── Main migrator ─────────────────────────────────────────────────────────────

class MilSymbMigrator:
    """
    Create PostGIS feature tables for KadasMilxLayer layers in a per-project schema.

    Usage:
        migrator = MilSymbMigrator(engine=engine)
        results = migrator.migrate_milsymb_layers(
            milsymb_layers=parser.parse_milsymb_layers(),
            schema='prj_my_project',
        )
    """

    def __init__(self, engine: Optional[Engine] = None):
        self.engine = engine or db.get_engine()

    def migrate_milsymb_layers(
        self,
        milsymb_layers: List[MilSymbLayerInfo],
        schema: str,
    ) -> List[Dict]:
        """
        Migrate all KadasMilxLayer layers to PostGIS tables.

        For each MilSymbLayerInfo:
          1. Create table prj_<name>.lyr_milsymb_<title>
          2. Insert features via COPY FROM STDIN with EWKB hex geometry
          3. Create spatial GIST index

        Args:
            milsymb_layers: List of MilSymbLayerInfo from QGZParser
            schema: Target PostgreSQL schema (e.g. 'prj_my_project')

        Returns:
            List of result dicts with table_name, features_count, success, error
        """
        results = []

        for layer in milsymb_layers:
            table_name = _milsymb_table_name(layer.title)
            try:
                # Determine SRID from layer CRS
                srid = 4326
                if layer.crs and ':' in layer.crs:
                    try:
                        srid = int(layer.crs.split(':')[-1])
                    except ValueError:
                        pass

                # Create table
                self._create_milsymb_table(table_name, srid, schema)

                # Insert features
                count = self._insert_milsymb_features(
                    layer.features, table_name, srid, schema
                )

                logger.info(
                    f"Migrated milsymb layer '{layer.title}' → "
                    f"{schema}.{table_name} ({count} features, SRID={srid})"
                )

                results.append({
                    'layer_id': layer.layer_id,
                    'layer_title': layer.title,
                    'table_name': table_name,
                    'features_count': count,
                    'srid': srid,
                    'success': True,
                    'error': None,
                })

            except Exception as e:
                logger.error(
                    f"Failed to migrate milsymb layer '{layer.title}': {e}"
                )
                results.append({
                    'layer_id': layer.layer_id,
                    'layer_title': layer.title,
                    'table_name': table_name,
                    'features_count': 0,
                    'srid': 4326,
                    'success': False,
                    'error': str(e),
                })

        return results

    def _create_milsymb_table(
        self,
        table_name: str,
        srid: int,
        schema: str,
    ) -> None:
        """
        Create the milsymb feature table.

        Schema:
            fid             SERIAL PRIMARY KEY
            sidc            VARCHAR(30)
            military_name   TEXT
            symbol_type     VARCHAR(20)   -- 'Point', 'LineString', 'Polygon'
            symbol_scale    REAL
            mss_attributes  JSONB
            geom            geometry(Geometry, <srid>)
        """
        with self.engine.connect() as conn:
            conn.execute(text(
                f'DROP TABLE IF EXISTS "{schema}"."{table_name}" CASCADE'
            ))

            create_sql = f"""
                CREATE TABLE "{schema}"."{table_name}" (
                    fid             SERIAL PRIMARY KEY,
                    sidc            VARCHAR(30),
                    military_name   TEXT,
                    symbol_type     VARCHAR(20),
                    symbol_scale    REAL DEFAULT 1.0,
                    mss_attributes  JSONB DEFAULT '{{}}'::jsonb,
                    geom            geometry(Geometry, {srid})
                )
            """
            conn.execute(text(create_sql))

            # Spatial index
            conn.execute(text(
                f'CREATE INDEX "{table_name}_geom_idx" '
                f'ON "{schema}"."{table_name}" USING GIST (geom)'
            ))

            conn.commit()
            logger.info(
                f"Created milsymb table: {schema}.{table_name} (SRID={srid})"
            )

    def _insert_milsymb_features(
        self,
        features: List[MilSymbFeature],
        table_name: str,
        srid: int,
        schema: str,
    ) -> int:
        """
        Insert milsymb features via COPY FROM STDIN with EWKB hex geometry.

        TSV columns: geom, sidc, military_name, symbol_type, symbol_scale, mss_attributes
        """
        if not features:
            return 0

        raw_conn = self.engine.raw_connection()
        try:
            cursor = raw_conn.cursor()

            copy_sql = (
                f'COPY "{schema}"."{table_name}" '
                f'(geom, sidc, military_name, symbol_type, symbol_scale, mss_attributes) '
                f'FROM STDIN'
            )

            importstr = bytearray()
            count = 0

            for feat in features:
                try:
                    # EWKB hex geometry
                    ewkb = _coords_to_ewkb_hex(
                        feat.coordinates, feat.geometry_type, srid
                    )

                    # Escape values for COPY TSV format
                    sidc = (feat.sidc or '').replace('\t', '').replace('\n', '')
                    mil_name = (feat.military_name or '').replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n')
                    sym_type = (feat.geometry_type or 'Point').replace('\t', '')
                    sym_scale = str(feat.symbol_scale or 1.0)

                    # MSS attributes as JSON string
                    mss_json = json.dumps(feat.attributes or {}, ensure_ascii=False)
                    mss_json = mss_json.replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n')

                    # TSV row: geom \t sidc \t military_name \t symbol_type \t symbol_scale \t mss_attributes
                    row = f"{ewkb}\t{sidc}\t{mil_name}\t{sym_type}\t{sym_scale}\t{mss_json}\n"
                    importstr.extend(row.encode('utf-8'))
                    count += 1

                except Exception as e:
                    logger.warning(f"Skipping milsymb feature: {e}")
                    continue

            if importstr:
                cursor.copy_expert(copy_sql, StringIO(importstr.decode('utf-8')))

            raw_conn.commit()
            cursor.close()

        except Exception as e:
            raw_conn.rollback()
            raise e
        finally:
            raw_conn.close()

        return count


# ── Read milsymb features from PostGIS ────────────────────────────────────────

def read_milsymb_geojson_from_postgis(
    project_name: str,
    layer_title: str,
    engine: Optional[Engine] = None,
) -> Optional[Dict]:
    """
    Read milsymb features from PostGIS and return as GeoJSON FeatureCollection.

    This replaces the old approach of re-parsing .qgz on every request.

    Args:
        project_name: Project slug (used to derive schema name prj_<name>)
        layer_title: Layer title to look up table name
        engine: SQLAlchemy engine

    Returns:
        GeoJSON FeatureCollection dict, or None if not found
    """
    import re
    engine = engine or db.get_engine()

    schema = f"prj_{project_name}"
    table_name = _milsymb_table_name(layer_title)

    try:
        with engine.connect() as conn:
            # Check table exists
            result = conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = :schema AND table_name = :table)"
            ), {'schema': schema, 'table': table_name})
            if not result.scalar():
                logger.debug(
                    f"MilSymb table {schema}.{table_name} not found — "
                    f"falling back to .qgz parse"
                )
                return None

            # Read features
            rows = conn.execute(text(f"""
                SELECT
                    fid,
                    sidc,
                    military_name,
                    symbol_type,
                    symbol_scale,
                    mss_attributes,
                    ST_AsGeoJSON(geom)::json AS geometry
                FROM "{schema}"."{table_name}"
                ORDER BY fid
            """)).fetchall()

        features = []
        for row in rows:
            props = {
                'sidc': row[1],
                'militaryName': row[2],
                'symbolType': row[3],
                'symbolScale': row[4],
            }
            mss_attrs = row[5]
            if mss_attrs:
                props['mssAttributes'] = mss_attrs
                if 'T' in mss_attrs:
                    props['uniqueDesignation'] = mss_attrs['T']
                if 'XE' in mss_attrs:
                    props['xeCode'] = mss_attrs['XE']

            features.append({
                'type': 'Feature',
                'geometry': row[6],
                'properties': props,
            })

        return {
            'type': 'FeatureCollection',
            'name': layer_title,
            'features': features,
        }

    except Exception as e:
        logger.error(
            f"Failed to read milsymb from PostGIS "
            f"({schema}.{table_name}): {e}"
        )
        return None
