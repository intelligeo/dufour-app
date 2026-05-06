"""
PostgreSQL/PostGIS Connection Management
SQLAlchemy-based connection pooling with async support
"""
import os
import logging
from typing import Optional
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text, MetaData
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool, QueuePool

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG if os.getenv('LOG_LEVEL') == 'DEBUG' else logging.INFO)


class DatabaseConnection:
    """
    Singleton database connection manager
    Supports both sync and async operations
    """
    
    _instance: Optional['DatabaseConnection'] = None
    _engine = None
    _async_engine = None
    _session_factory = None
    _async_session_factory = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._engine is None:
            self._initialize_connections()
    
    def _initialize_connections(self):
        """Initialize sync and async database connections"""
        
        # Read connection parameters from environment
        host = os.getenv('POSTGIS_HOST', 'postgresql-intelligeo.alwaysdata.net')
        port = os.getenv('POSTGIS_PORT', '5432')
        database = os.getenv('POSTGIS_DB', 'intelligeo_dufour')
        username = os.getenv('POSTGIS_USER', 'intelligeo_dufour')
        password = os.getenv('POSTGIS_PASSWORD', '')
        
        # Validate credentials
        if not password:
            logger.warning("POSTGIS_PASSWORD not set! Connection may fail.")
        
        # Build connection URLs
        sync_url = f"postgresql://{username}:{password}@{host}:{port}/{database}"
        async_url = f"postgresql+asyncpg://{username}:{password}@{host}:{port}/{database}"
        
        logger.info(f"Initializing database connection to {host}:{port}/{database}")
        
        # Create sync engine with connection pooling
        self._engine = create_engine(
            sync_url,
            poolclass=QueuePool,
            pool_size=5,  # Number of persistent connections
            max_overflow=10,  # Additional connections when pool full
            pool_timeout=30,  # Seconds to wait for connection
            pool_recycle=300,  # Recycle connections every 5 min (alwaysdata closes idle connections)
            pool_pre_ping=True,  # Verify connection is alive before using it
            echo=os.getenv('LOG_LEVEL') == 'DEBUG',  # Log SQL queries in debug mode
            connect_args={
                'connect_timeout': 10,
                'options': '-c timezone=Europe/Zurich'
            }
        )
        
        # Create async engine (for future async endpoints)
        self._async_engine = create_async_engine(
            async_url,
            poolclass=QueuePool,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=3600,
            echo=os.getenv('LOG_LEVEL') == 'DEBUG'
        )
        
        # Create session factories
        self._session_factory = sessionmaker(
            bind=self._engine,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False
        )
        
        self._async_session_factory = async_sessionmaker(
            bind=self._async_engine,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False
        )
        
        logger.info("Database connection initialized successfully")
    
    def get_engine(self):
        """Get SQLAlchemy sync engine"""
        if self._engine is None:
            self._initialize_connections()
        return self._engine
    
    def get_async_engine(self):
        """Get SQLAlchemy async engine"""
        if self._async_engine is None:
            self._initialize_connections()
        return self._async_engine
    
    def get_session(self) -> Session:
        """Get new sync database session"""
        if self._session_factory is None:
            self._initialize_connections()
        return self._session_factory()
    
    def get_async_session(self) -> AsyncSession:
        """Get new async database session"""
        if self._async_session_factory is None:
            self._initialize_connections()
        return self._async_session_factory()
    
    def get_connection_config(self) -> dict:
        """
        Get database connection configuration
        
        Returns:
            Dictionary with connection parameters
        """
        return {
            'host': os.getenv('POSTGIS_HOST', 'postgresql-intelligeo.alwaysdata.net'),
            'port': int(os.getenv('POSTGIS_PORT', '5432')),
            'database': os.getenv('POSTGIS_DB', 'intelligeo_dufour'),
            'user': os.getenv('POSTGIS_USER', 'intelligeo_dufour'),
            'password': os.getenv('POSTGIS_PASSWORD', '')
        }
    
    @asynccontextmanager
    async def session_scope(self):
        """
        Async context manager for database sessions
        Automatically commits or rolls back on exception
        
        Usage:
            async with db.session_scope() as session:
                result = await session.execute(query)
        """
        session = self.get_async_session()
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()
    
    def test_connection(self) -> dict:
        """
        Test database connectivity (sync)
        Returns connection status and latency
        """
        import time
        
        try:
            start = time.time()
            with self._engine.connect() as conn:
                result = conn.execute(text("SELECT 1 AS test, version() AS pg_version, PostGIS_version() AS postgis_version"))
                row = result.fetchone()
                latency_ms = (time.time() - start) * 1000
                
                logger.info(f"Database connection test successful (latency: {latency_ms:.2f}ms)")
                
                return {
                    "connected": True,
                    "latency_ms": round(latency_ms, 2),
                    "postgresql_version": row[1].split(' ')[0] if row else "unknown",
                    "postgis_version": row[2] if row else "unknown",
                    "host": os.getenv('POSTGIS_HOST'),
                    "database": os.getenv('POSTGIS_DB')
                }
        except Exception as e:
            logger.error(f"Database connection test failed: {e}")
            return {
                "connected": False,
                "error": str(e),
                "host": os.getenv('POSTGIS_HOST'),
                "database": os.getenv('POSTGIS_DB')
            }
    
    async def test_connection_async(self) -> dict:
        """Test database connectivity (async)"""
        import time
        
        try:
            start = time.time()
            async with self._async_engine.connect() as conn:
                result = await conn.execute(text("SELECT 1 AS test, version() AS pg_version"))
                row = result.fetchone()
                latency_ms = (time.time() - start) * 1000
                
                logger.info(f"Async database connection test successful (latency: {latency_ms:.2f}ms)")
                
                return {
                    "connected": True,
                    "latency_ms": round(latency_ms, 2),
                    "postgresql_version": row[1].split(' ')[0] if row else "unknown"
                }
        except Exception as e:
            logger.error(f"Async database connection test failed: {e}")
            return {
                "connected": False,
                "error": str(e)
            }
    
    def close(self):
        """Close all database connections"""
        if self._engine:
            self._engine.dispose()
            logger.info("Sync engine disposed")
        if self._async_engine:
            self._async_engine.dispose()
            logger.info("Async engine disposed")


# Global singleton instance
db = DatabaseConnection()


# Convenience functions
def get_db_session() -> Session:
    """Get new database session (sync)"""
    return db.get_session()


def get_db_connection():
    """Get database connection singleton"""
    return db
