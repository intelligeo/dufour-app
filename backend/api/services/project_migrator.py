"""
Project Migration Service
Parses .qgz files and stores them in the cloud database with a per-project
PostgreSQL schema containing feature tables for each vector layer.

Design:
  - A schema named  prj_<slug>  is created for every uploaded project.
  - Inside the schema:
      • project        — project metadata (no binary blob, that stays in
                          public.projects.qgz_data)
      • project_layers — one row per layer (metadata)
      • lyr_<name>     — one PostGIS feature table per vector layer that
                          has a matching companion file
  - public.projects receives a new row (or is updated) with schema_name
    pointing to the per-project schema.
  - SRID is taken from the fiona source; no reprojection is applied.
  - If any feature table fails, the error is recorded in the LayerRecord
    but the rest of the migration continues (partial success allowed).
"""
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import logging
import re
from dataclasses import dataclass, field

import fiona
from sqlalchemy import text

from services.qgz_parser import QGZParser, ProjectInfo
from services.layer_extractor import LayerExtractor, MigrationResult
from database.connection import db

logger = logging.getLogger(__name__)


@dataclass
class LayerRecord:
    """
    Metadata record for one layer parsed from a .qgz.
    Maps directly to the per-schema project_layers table columns.
    """
    layer_name: str
    layer_type: str       # 'vector', 'raster', 'wms', 'plugin', etc.
    geometry_type: str    # 'Point', 'Polygon', '', etc.
    source_type: str      # 'gpkg', 'postgis', 'wms', 'geojson', etc.
    datasource: str       # Original datasource string from the .qgz XML
    crs: str              # e.g. 'EPSG:2056'
    success: bool = True
    error: Optional[str] = None
    table_name: str = ''        # populated after feature-table extraction
    features_count: int = 0


# Alias so existing callers that import MigrationResult still work
MigrationResult = LayerRecord  # type: ignore[misc]


def _slugify(name: str) -> str:
    """Return a PostgreSQL-safe lowercase identifier from an arbitrary string."""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9_]', '_', slug)
    slug = re.sub(r'_+', '_', slug).strip('_')
    return slug or 'project'


def _schema_name(project_name: str) -> str:
    """Return the per-project schema name: prj_<slug>."""
    return f"prj_{_slugify(project_name)}"


class ProjectMigrator:
    """
    Parse QGIS .qgz projects and store them in the cloud database.

    Workflow:
      1. Extract + parse the .qgz with QGZParser → ProjectInfo + LayerInfo list
      2. Build LayerRecord list from parsed layer metadata
      3. Enrich from companion files (fiona): fill features_count + geometry_type
      4. Create per-project schema  prj_<slug>  (idempotent)
      5. Create project / project_layers tables inside the schema
      6. For each vector layer with a matching companion file, call
         LayerExtractor.extract_layer(..., schema=project_schema) to create
         a lyr_<name> PostGIS table with the original SRID
      7. Populate project_layers table inside the schema
      8. Return (ProjectInfo, list[LayerRecord], qgz_bytes, schema_name)

    The caller (main.py) stores qgz_bytes in public.projects and passes
    schema_name so it can be written to public.projects.schema_name.
    """

    def __init__(self, engine=None):
        self.engine = engine or db.get_engine()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def migrate_project(
        self,
        qgz_path: Path,
        project_name: str,
        target_crs: str = 'EPSG:2056',
        companion_files: Optional[List[Path]] = None,
    ) -> Tuple[ProjectInfo, List[LayerRecord], bytes, str]:
        """
        Parse a .qgz, create per-project schema, extract feature tables.

        Args:
            qgz_path:        Path to the uploaded .qgz file.
            project_name:    Project slug (lowercase, used for schema name).
            target_crs:      Kept for signature compatibility; SRID is taken
                             from the fiona source (no reprojection applied).
            companion_files: Optional data files (.gpkg, .geojson, …) that
                             are referenced by layers inside the .qgz.

        Returns:
            (ProjectInfo, list[LayerRecord], qgz_bytes, schema_name)
        """
        logger.info(f"Migrating project: {project_name}")

        # ── 1. Parse .qgz ────────────────────────────────────────────
        with QGZParser(qgz_path) as parser:
            parser.extract()
            parser.parse_xml()
            project_info = parser.get_project_info()

        logger.info(
            f"Parsed '{project_info.title}': "
            f"{len(project_info.layers)} layers, CRS={project_info.crs}"
        )

        # ── 2. Build initial LayerRecord list ────────────────────────
        layer_records: List[LayerRecord] = [
            LayerRecord(
                layer_name=li.name,
                layer_type=li.layer_type or 'unknown',
                geometry_type=li.geometry_type or '',
                source_type=li.source_type or 'unknown',
                datasource=li.datasource or '',
                crs=li.crs or project_info.crs or 'EPSG:4326',
            )
            for li in project_info.layers
        ]

        # ── 3. Enrich from companion files ───────────────────────────
        companion_map: Dict[str, Path] = {}
        if companion_files:
            companion_map = {
                cf.name.lower(): cf
                for cf in companion_files
                if cf.exists()
            }
            self._enrich_from_companions(layer_records, companion_map)

        # ── 4. Create per-project schema ─────────────────────────────
        proj_schema = _schema_name(project_name)
        self._create_schema(proj_schema)

        # ── 5. Create project / project_layers tables in schema ──────
        self._create_schema_tables(proj_schema)

        # ── 6. Extract feature tables for vector layers ───────────────
        extractor = LayerExtractor(project_name=project_name, engine=self.engine)

        for rec in layer_records:
            if rec.layer_type != 'vector' or not rec.datasource:
                continue

            # Find matching companion file
            companion_path = self._resolve_companion(rec.datasource, companion_map)
            if companion_path is None:
                logger.debug(
                    f"No companion for vector layer '{rec.layer_name}' — skipping table"
                )
                continue

            # Build a minimal LayerInfo-compatible object for the extractor
            class _LI:
                name = rec.layer_name
                source_type = rec.source_type
                layer_type = rec.layer_type

            # Determine fiona open kwargs (support GPKG sub-layers)
            fiona_layer: Optional[str] = None
            if '|layername=' in rec.datasource:
                fiona_layer = rec.datasource.split('|layername=')[1].split('|')[0]

            # Determine SRID from fiona source (preserve original, no reprojection)
            fiona_srid: int = self._srid_from_companion(companion_path, fiona_layer)

            # Build a fiona path string (for GPKG: "file.gpkg|layername=xx")
            if fiona_layer:
                fiona_path_str = f"{companion_path}|layername={fiona_layer}"
            else:
                fiona_path_str = str(companion_path)

            try:
                # Open via fiona to get schema, then call extractor internals
                open_kwargs: dict = {'path': str(companion_path)}
                if fiona_layer:
                    open_kwargs['layer'] = fiona_layer

                with fiona.open(**open_kwargs) as src:
                    table_name = extractor._generate_table_name(rec.layer_name)
                    geom_type = src.schema.get('geometry', 'Geometry') or 'Geometry'
                    # Normalise 3D types (e.g. '3D MultiPolygon' → 'MultiPolygon')
                    geom_type = geom_type.replace('3D ', '').split()[-1]

                    extractor._create_postgis_table(
                        table_name=table_name,
                        geometry_type=geom_type,
                        srid=fiona_srid,
                        properties=src.schema['properties'],
                        schema=proj_schema,
                    )

                    # No transformation — SRID is kept as-is
                    inserted = extractor._insert_features(
                        src=src,
                        table_name=table_name,
                        transformer=None,
                        schema=proj_schema,
                        srid=fiona_srid,
                    )

                rec.table_name = table_name
                rec.features_count = inserted
                if not rec.geometry_type:
                    rec.geometry_type = geom_type
                logger.info(
                    f"Extracted '{rec.layer_name}' → "
                    f"{proj_schema}.{table_name} ({inserted} features, SRID={fiona_srid})"
                )

            except Exception as exc:
                rec.success = False
                rec.error = str(exc)
                logger.error(
                    f"Failed to extract feature table for '{rec.layer_name}': {exc}"
                )

        # ── 7. Populate per-schema project_layers table ───────────────
        self._populate_schema_layers(proj_schema, layer_records)

        # ── 8. Return ─────────────────────────────────────────────────
        qgz_bytes = qgz_path.read_bytes()
        logger.info(
            f"Migration done for '{project_name}': schema={proj_schema}, "
            f"{len(qgz_bytes)} bytes, {len(layer_records)} layer records"
        )
        return project_info, layer_records, qgz_bytes, proj_schema

    # ------------------------------------------------------------------
    # Schema / table creation helpers
    # ------------------------------------------------------------------

    def _create_schema(self, schema: str) -> None:
        """Create the per-project PostgreSQL schema (idempotent)."""
        with self.engine.connect() as conn:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
            conn.commit()
        logger.info(f"Schema ensured: {schema}")

    def _create_schema_tables(self, schema: str) -> None:
        """Create project + project_layers tables inside the per-project schema."""
        ddl = f"""
            CREATE TABLE IF NOT EXISTS "{schema}".project (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name        VARCHAR(255) NOT NULL,
                title       VARCHAR(500),
                description TEXT,
                crs         VARCHAR(50),
                extent_minx DOUBLE PRECISION,
                extent_miny DOUBLE PRECISION,
                extent_maxx DOUBLE PRECISION,
                extent_maxy DOUBLE PRECISION,
                created_at  TIMESTAMP DEFAULT NOW(),
                updated_at  TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS "{schema}".project_layers (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                layer_name     VARCHAR(255) NOT NULL,
                layer_type     VARCHAR(50),
                geometry_type  VARCHAR(100),
                source_type    VARCHAR(50),
                crs            VARCHAR(50),
                table_name     VARCHAR(63),
                datasource     TEXT,
                features_count INTEGER DEFAULT 0,
                success        BOOLEAN DEFAULT TRUE,
                error          TEXT
            );
        """
        with self.engine.connect() as conn:
            for stmt in ddl.strip().split(';'):
                stmt = stmt.strip()
                if stmt:
                    conn.execute(text(stmt))
            conn.commit()
        logger.info(f"Tables ensured in schema: {schema}")

    def _populate_schema_layers(
        self,
        schema: str,
        layer_records: List[LayerRecord],
    ) -> None:
        """Insert/replace layer metadata rows in {schema}.project_layers."""
        import uuid as _uuid
        with self.engine.connect() as conn:
            conn.execute(text(f'TRUNCATE "{schema}".project_layers'))
            for rec in layer_records:
                conn.execute(text(f"""
                    INSERT INTO "{schema}".project_layers (
                        id, layer_name, layer_type, geometry_type,
                        source_type, crs, table_name, datasource,
                        features_count, success, error
                    ) VALUES (
                        :id, :layer_name, :layer_type, :geometry_type,
                        :source_type, :crs, :table_name, :datasource,
                        :features_count, :success, :error
                    )
                """), {
                    'id': str(_uuid.uuid4()),
                    'layer_name': rec.layer_name,
                    'layer_type': rec.layer_type,
                    'geometry_type': rec.geometry_type,
                    'source_type': rec.source_type,
                    'crs': rec.crs,
                    'table_name': rec.table_name or None,
                    'datasource': rec.datasource,
                    'features_count': rec.features_count,
                    'success': rec.success,
                    'error': rec.error,
                })
            conn.commit()
        logger.info(f"Populated {len(layer_records)} rows in {schema}.project_layers")

    # ------------------------------------------------------------------
    # Companion file helpers
    # ------------------------------------------------------------------

    def _resolve_companion(
        self,
        datasource: str,
        companion_map: Dict[str, Path],
    ) -> Optional[Path]:
        """Return the companion Path matching the datasource file reference."""
        file_part = datasource.split('|')[0].lstrip('./')
        filename = Path(file_part).name.lower()
        return companion_map.get(filename)

    def _srid_from_companion(
        self,
        companion_path: Path,
        fiona_layer: Optional[str] = None,
    ) -> int:
        """Extract EPSG code from a fiona source; default 4326 if unreadable."""
        try:
            open_kwargs: dict = {'path': str(companion_path)}
            if fiona_layer:
                open_kwargs['layer'] = fiona_layer
            with fiona.open(**open_kwargs) as src:
                crs = src.crs or {}
                # fiona ≥ 1.9 uses CRS object with .to_epsg()
                if hasattr(crs, 'to_epsg'):
                    epsg = crs.to_epsg()
                    if epsg:
                        return int(epsg)
                # Older fiona: dict with 'init' key
                init = crs.get('init', '') if isinstance(crs, dict) else ''
                if init.upper().startswith('EPSG:'):
                    return int(init.split(':')[1])
        except Exception as exc:
            logger.warning(f"Could not determine SRID from {companion_path}: {exc}")
        return 4326

    # ------------------------------------------------------------------
    # Enrichment helper (feature counts + geometry_type from fiona)
    # ------------------------------------------------------------------

    def _enrich_from_companions(
        self,
        layer_records: List[LayerRecord],
        companion_map: Dict[str, Path],
    ) -> None:
        """
        Open companion data files with fiona and enrich matching layer records.

        For each layer record whose datasource references a companion file:
          - sets features_count from the fiona collection length
          - fills geometry_type if it is still empty

        Operates in-place.  Any fiona error is logged and skipped.
        """
        if not companion_map:
            return

        logger.info(
            f"Enriching layer records from {len(companion_map)} companion file(s): "
            f"{list(companion_map.keys())}"
        )

        for rec in layer_records:
            if not rec.datasource:
                continue

            companion_path = self._resolve_companion(rec.datasource, companion_map)
            if companion_path is None:
                continue

            fiona_layer: Optional[str] = None
            if '|layername=' in rec.datasource:
                fiona_layer = rec.datasource.split('|layername=')[1].split('|')[0]

            try:
                open_kwargs: dict = {'path': str(companion_path)}
                if fiona_layer:
                    open_kwargs['layer'] = fiona_layer

                with fiona.open(**open_kwargs) as src:
                    count = len(src)
                    geom = (src.schema or {}).get('geometry', '') or ''

                    rec.features_count = count
                    if not rec.geometry_type and geom:
                        rec.geometry_type = geom.replace('3D ', '').split()[-1]

                    logger.info(
                        f"  Enriched '{rec.layer_name}' from "
                        f"{companion_path.name}"
                        f"{'/' + fiona_layer if fiona_layer else ''}: "
                        f"{count} features, geometry={rec.geometry_type}"
                    )

            except Exception as exc:
                logger.warning(
                    f"  Could not enrich '{rec.layer_name}' from "
                    f"{companion_path.name}: {exc}"
                )
