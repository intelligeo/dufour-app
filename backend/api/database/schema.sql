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
    password_hash VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Migrate existing rows: add auth columns if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Seed users (passwords are bcrypt hashes; update via /api/admin/users in production)
-- admin  → password: admin
-- demo_user → password: demo
INSERT INTO users (username, email, password_hash, role, is_active)
VALUES
  ('admin',     'admin@intelligeo.net',   '$2b$12$KIX7JxCbFr3bXOjoxASuKO7zBobMZ1WLcOSMIzOtjFMrUANBPfWFe', 'admin', true),
  ('demo_user', 'demo@intelligeo.net',    '$2b$12$T2CphSbQ8OkHfEKKkSaZgOGjOIRPXKLKZB9W8f6mXP5KRYlCr.Bam', 'user',  true)
ON CONFLICT (username) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role          = EXCLUDED.role,
      is_active     = EXCLUDED.is_active;

-- ============================================================
-- Projects table (central catalog)
-- One row per uploaded project.
-- schema_name points to the per-project schema (prj_<slug>)
-- where the actual feature tables live.
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
    -- per-project schema where feature tables are stored (prj_<slug>)
    schema_name VARCHAR(63),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Migrate existing rows: set schema_name if missing
ALTER TABLE projects ADD COLUMN IF NOT EXISTS schema_name VARCHAR(63);

-- ============================================================
-- Project layers table (central catalog)
-- One row per layer in a project.
-- table_name is the unqualified table name inside schema_name.
-- When table_name IS NULL the layer has no feature table
-- (raster, WMS, missing companion file, etc.).
-- ============================================================
CREATE TABLE IF NOT EXISTS project_layers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    layer_name VARCHAR(255),
    layer_type VARCHAR(50),
    geometry_type VARCHAR(50),
    source_type VARCHAR(50) NOT NULL DEFAULT 'unknown',
    crs VARCHAR(50),
    -- unqualified feature table name inside the project schema (may be NULL)
    table_name VARCHAR(255),
    -- original datasource string from the .qgz XML
    datasource TEXT,
    features_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Migrate existing rows: add new columns if missing
ALTER TABLE project_layers ADD COLUMN IF NOT EXISTS crs VARCHAR(50);
ALTER TABLE project_layers ADD COLUMN IF NOT EXISTS features_count INTEGER DEFAULT 0;
ALTER TABLE project_layers ALTER COLUMN datasource TYPE TEXT;

-- Drop the manually-added CHECK constraint that rejects 'plugin' layers
-- (layer_type is free-form VARCHAR; validation is done in application code)
ALTER TABLE project_layers DROP CONSTRAINT IF EXISTS valid_layer_type;

-- ============================================================
-- Password reset tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_project_layers_project_id ON project_layers(project_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
