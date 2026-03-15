-- ============================================================
-- Dufour Database Schema
-- PostgreSQL + PostGIS
-- ============================================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Users table
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Default development user
INSERT INTO users (username, email)
VALUES ('dev_user', 'dev@intelligeo.net')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- Projects table
-- Stores QGIS projects (.qgz) with metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500),
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    qgz_data BYTEA,
    qgz_size INTEGER,
    crs VARCHAR(50),
    extent_minx DOUBLE PRECISION,
    extent_miny DOUBLE PRECISION,
    extent_maxx DOUBLE PRECISION,
    extent_maxy DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Project layers table
-- Stores metadata for each layer within a project
-- ============================================================
CREATE TABLE IF NOT EXISTS project_layers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    layer_name VARCHAR(255),
    layer_type VARCHAR(50),
    geometry_type VARCHAR(50),
    source_type VARCHAR(50) NOT NULL DEFAULT 'unknown',
    table_name VARCHAR(255),
    datasource VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_project_layers_project_id ON project_layers(project_id);
