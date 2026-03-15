"""
Project Migration Service
Orchestrates .qgz parsing, layer extraction, and database storage
"""
from pathlib import Path
from typing import List, Optional, Tuple
import logging
import shutil
from sqlalchemy.engine import Engine

from services.qgz_parser import QGZParser, LayerInfo, ProjectInfo
from services.layer_extractor import LayerExtractor, MigrationResult
from database.connection import db

logger = logging.getLogger(__name__)


class ProjectMigrator:
    """Migrate QGIS projects to cloud storage with PostGIS layers"""
    
    def __init__(self, engine: Optional[Engine] = None):
        """
        Initialize project migrator
        
        Args:
            engine: SQLAlchemy engine (defaults to db.get_engine())
        """
        self.engine = engine or db.get_engine()
    
    def migrate_project(
        self,
        qgz_path: Path,
        project_name: str,
        target_crs: str = 'EPSG:2056',
        companion_files: Optional[List[Path]] = None
    ) -> Tuple[ProjectInfo, List[MigrationResult], Optional[bytes]]:
        """
        Migrate QGIS project to cloud storage
        
        1. Parse .qgz file
        2. Copy companion data files alongside extracted .qgz
        3. Extract local layers to PostGIS
        4. Update .qgz datasources to point to PostGIS
        5. Return modified .qgz as bytes
        
        Args:
            qgz_path: Path to .qgz file
            project_name: Project identifier (for table naming)
            target_crs: Target CRS for PostGIS layers
            companion_files: Optional list of data files (.gpkg, .geojson, etc.)
                             to copy into the extraction directory so that
                             relative-path datasources can be resolved.
            
        Returns:
            Tuple of (ProjectInfo, List[MigrationResult], modified_qgz_bytes)
        """
        logger.info(f"Starting migration for project: {project_name}")
        
        migration_results: List[MigrationResult] = []
        modified_qgz_bytes: Optional[bytes] = None
        
        try:
            with QGZParser(qgz_path) as parser:
                # Step 1: Extract and parse .qgz
                parser.extract()
                parser.parse_xml()
                project_info = parser.get_project_info()
                
                logger.info(
                    f"Parsed project: {project_info.title}, "
                    f"{len(project_info.layers)} layers"
                )
                
                # Step 1b: Copy companion data files into extraction directory
                if companion_files:
                    for companion_path in companion_files:
                        if companion_path.exists():
                            dest = parser.temp_dir / companion_path.name
                            shutil.copy2(companion_path, dest)
                            logger.info(
                                f"Copied companion file: {companion_path.name} "
                                f"-> {dest}"
                            )
                
                # Step 2: Migrate local layers to PostGIS
                extractor = LayerExtractor(project_name, self.engine)
                
                for layer_info in project_info.layers:
                    # Skip non-local layers (already in PostGIS, WMS, etc.)
                    if not layer_info.is_local:
                        logger.info(
                            f"Skipping remote layer: {layer_info.name} "
                            f"(type: {layer_info.source_type})"
                        )
                        continue
                    
                    # Skip unsupported formats
                    if layer_info.source_type not in LayerExtractor.SUPPORTED_FORMATS:
                        logger.warning(
                            f"Skipping unsupported format: {layer_info.name} "
                            f"({layer_info.source_type})"
                        )
                        migration_results.append(MigrationResult(
                            layer_name=layer_info.name,
                            table_name='',
                            features_count=0,
                            geometry_type='',
                            source_crs='',
                            target_crs=target_crs,
                            success=False,
                            error=f"Unsupported format: {layer_info.source_type}"
                        ))
                        continue
                    
                    # Find source file in extracted .qgz
                    source_path = self._find_layer_source(
                        parser.temp_dir,
                        layer_info.datasource
                    )
                    
                    if not source_path:
                        # Extract filename for clearer error message
                        ds = layer_info.datasource.split('|')[0].lstrip('./')
                        logger.error(
                            f"Source file not found for layer: {layer_info.name} "
                            f"(datasource: {ds})"
                        )
                        migration_results.append(MigrationResult(
                            layer_name=layer_info.name,
                            table_name='',
                            features_count=0,
                            geometry_type='',
                            source_crs='',
                            target_crs=target_crs,
                            success=False,
                            error=f"Source file not found: {ds}. "
                                  f"Upload it via the data_files parameter."
                        ))
                        continue
                    
                    # Extract layer to PostGIS
                    logger.info(f"Migrating layer: {layer_info.name}")
                    result = extractor.extract_layer(
                        layer_info=layer_info,
                        source_path=source_path,
                        target_crs=target_crs
                    )
                    migration_results.append(result)
                    
                    # Step 3: Update datasource in .qgz XML
                    if result.success:
                        new_datasource = extractor.generate_postgis_datasource(
                            table_name=result.table_name,
                            geometry_type=result.geometry_type,
                            srid=extractor._extract_epsg_code(target_crs)
                        )
                        
                        parser.update_layer_datasource(
                            layer_id=layer_info.id,
                            new_datasource=new_datasource
                        )
                        
                        logger.info(
                            f"Updated datasource for {layer_info.name} "
                            f"-> {result.table_name}"
                        )
                
                # Step 4: Save modified .qgz
                if any(r.success for r in migration_results):
                    # Save modified .qgs to temp file
                    modified_qgs = parser.temp_dir / 'modified.qgs'
                    parser.save_modified_qgs(modified_qgs)
                    
                    # Create new .qgz with modified .qgs
                    modified_qgz_path = parser.temp_dir / 'modified.qgz'
                    self._repackage_qgz(
                        source_dir=parser.temp_dir,
                        output_path=modified_qgz_path,
                        qgs_file=modified_qgs
                    )
                    
                    # Read modified .qgz as bytes
                    with open(modified_qgz_path, 'rb') as f:
                        modified_qgz_bytes = f.read()
                    
                    logger.info(f"Created modified .qgz: {len(modified_qgz_bytes)} bytes")
                else:
                    # No migrations, use original .qgz
                    with open(qgz_path, 'rb') as f:
                        modified_qgz_bytes = f.read()
            
            # Log summary
            successful = sum(1 for r in migration_results if r.success)
            failed = len(migration_results) - successful
            logger.info(
                f"Migration complete: {successful} success, {failed} failed"
            )
            
            return project_info, migration_results, modified_qgz_bytes
            
        except Exception as e:
            logger.error(f"Migration failed for {project_name}: {e}")
            raise
    
    def _find_layer_source(
        self,
        temp_dir: Path,
        datasource: str
    ) -> Optional[Path]:
        """
        Find source file for layer in extracted .qgz directory
        
        Args:
            temp_dir: Extracted .qgz directory
            datasource: Layer datasource string
            
        Returns:
            Path to source file or None
        """
        # Common patterns in QGIS datasources:
        # GeoPackage: "./data.gpkg|layername=mylayer"
        # Shapefile: "./data/mylayer.shp"
        # GeoJSON: "./data/mylayer.geojson"
        # FlatGeobuf: "./data/mylayer.fgb"
        
        # Extract file path from datasource
        if '|' in datasource:
            # GeoPackage format with layer name
            file_part = datasource.split('|')[0]
        else:
            file_part = datasource
        
        # Remove leading './'
        file_part = file_part.lstrip('./')
        
        # Try to find file
        candidate = temp_dir / file_part
        if candidate.exists():
            return candidate
        
        # Try without subdirectories
        candidate = temp_dir / Path(file_part).name
        if candidate.exists():
            return candidate
        
        # Try glob search
        pattern = Path(file_part).name
        matches = list(temp_dir.rglob(pattern))
        if matches:
            return matches[0]
        
        return None
    
    def check_missing_files(
        self,
        qgz_path: Path,
        companion_files: Optional[List[Path]] = None
    ) -> Tuple[ProjectInfo, List[str]]:
        """
        Pre-check: parse .qgz and identify missing companion data files.
        
        Call this BEFORE migrate_project to give the user a clear 422 error
        listing exactly which files need to be uploaded via data_files.
        
        Args:
            qgz_path: Path to .qgz file
            companion_files: Optional companion files already provided
            
        Returns:
            Tuple of (ProjectInfo, list of missing filenames)
        """
        with QGZParser(qgz_path) as parser:
            parser.extract()
            parser.parse_xml()
            project_info = parser.get_project_info()
            
            # Copy companion files into extraction directory (same as migrate)
            if companion_files:
                for cp in companion_files:
                    if cp.exists():
                        dest = parser.temp_dir / cp.name
                        shutil.copy2(cp, dest)
                        logger.info(f"[pre-check] Copied companion: {cp.name} -> {dest} (exists={dest.exists()})")
                    else:
                        logger.warning(f"[pre-check] Companion file not found: {cp}")
            
            # Log extraction directory contents
            if parser.temp_dir:
                all_files = list(parser.temp_dir.rglob('*'))
                logger.info(f"[pre-check] temp_dir contents ({len(all_files)} files): {[f.name for f in all_files if f.is_file()]}")
            
            # Check each local layer
            missing: List[str] = []
            seen_files: set = set()
            
            for layer in project_info.layers:
                if not layer.is_local:
                    continue
                if layer.source_type not in LayerExtractor.SUPPORTED_FORMATS:
                    continue
                
                # Extract the filename from datasource
                ds = layer.datasource.split('|')[0].lstrip('./')
                filename = Path(ds).name
                
                if filename in seen_files:
                    continue  # Already checked this file
                seen_files.add(filename)
                
                source = self._find_layer_source(parser.temp_dir, layer.datasource)
                if not source:
                    missing.append(filename)
            
            return project_info, missing

    def _repackage_qgz(
        self,
        source_dir: Path,
        output_path: Path,
        qgs_file: Path
    ):
        """
        Repackage .qgz file with modified .qgs
        
        Args:
            source_dir: Directory with extracted .qgz contents
            output_path: Output .qgz file path
            qgs_file: Modified .qgs file
        """
        import zipfile
        
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add modified .qgs with original name
            original_qgs_files = list(source_dir.glob('*.qgs'))
            # Filter out our own 'modified.qgs' temp file
            original_qgs_files = [f for f in original_qgs_files if f.name != 'modified.qgs']
            if not original_qgs_files:
                raise ValueError("No original .qgs file found in extracted directory")
            original_qgs = original_qgs_files[0]
            zf.write(qgs_file, original_qgs.name)
            
            # Files to exclude from repackage
            exclude_files = {original_qgs, qgs_file, output_path}
            
            # Add all other files (excluding .qgs files and output)
            for file_path in source_dir.rglob('*'):
                if file_path.is_file() and file_path not in exclude_files:
                    # Skip any temp .qgz files inside extracted dir
                    if file_path.suffix == '.qgz':
                        continue
                    arcname = file_path.relative_to(source_dir)
                    zf.write(file_path, arcname)
        
        logger.info(f"Repackaged .qgz: {output_path}")
    
    def rollback_migration(self, project_name: str, migration_results: List[MigrationResult]):
        """
        Rollback migration by dropping created PostGIS tables
        
        Args:
            project_name: Project name
            migration_results: List of migration results
        """
        logger.warning(f"Rolling back migration for project: {project_name}")
        
        extractor = LayerExtractor(project_name, self.engine)
        
        for result in migration_results:
            if result.success and result.table_name:
                try:
                    extractor.drop_table(result.table_name)
                    logger.info(f"Dropped table: {result.table_name}")
                except Exception as e:
                    logger.error(f"Failed to drop table {result.table_name}: {e}")
