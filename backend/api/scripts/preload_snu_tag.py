"""
Preload SNU_TAG.qgz project into PostgreSQL
"""
import os
import sys
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.qgis_storage_service import storage_service

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def preload_snu_tag():
    """Load SNU_TAG.qgz from resources into PostgreSQL"""
    
    # Path to test project
    project_file = Path(__file__).parent.parent.parent.parent / 'resources' / 'test_qgs' / 'SNU_TAG.qgz'
    
    if not project_file.exists():
        logger.error(f"Project file not found: {project_file}")
        return False
    
    logger.info(f"Loading {project_file.name} ({project_file.stat().st_size / 1024:.2f}KB)")
    
    try:
        # Read file
        qgz_bytes = project_file.read_bytes()
        
        # Store in PostgreSQL
        result = storage_service.store_qgz(
            project_name='snu_tag',  # lowercase as per DB constraint
            qgz_bytes=qgz_bytes,
            title='SNU',
            description='Test project on non-official trails.'
        )
        
        logger.info(f"✅ Successfully stored project: {result}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to load project: {e}", exc_info=True)
        return False


if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("PRELOAD SNU_TAG.qgz INTO POSTGRESQL")
    logger.info("=" * 60)
    
    success = preload_snu_tag()
    
    if success:
        # Verify storage
        logger.info("\nVerifying storage...")
        projects = storage_service.list_projects()
        logger.info(f"Total projects in storage: {len(projects)}")
        
        for proj in projects:
            logger.info(f"  - {proj['name']}: {proj['title']} ({proj['file_size'] / 1024:.2f}KB)")
    
    logger.info("=" * 60)
    logger.info("✅ PRELOAD COMPLETE" if success else "❌ PRELOAD FAILED")
    logger.info("=" * 60)
    
    sys.exit(0 if success else 1)
