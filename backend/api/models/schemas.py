"""
Pydantic models for API request/response schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class ProjectResponse(BaseModel):
    """Response model for project information"""
    name: str
    title: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    modified_at: Optional[datetime] = None
    file_size: Optional[int] = None
    wms_url: Optional[str] = None
    extent: Optional[List[float]] = None  # [minx, miny, maxx, maxy]
    crs: Optional[str] = None


class TableSchema(BaseModel):
    """Schema for creating PostGIS table"""
    schema_name: str = Field(default="public", description="Database schema")
    table_name: str = Field(..., description="Table name")
    columns: List[Dict[str, Any]] = Field(..., description="Column definitions")
    geometry_column: Optional[str] = Field(None, description="Geometry column name")
    geometry_type: Optional[str] = Field(None, description="POINT, LINESTRING, POLYGON, etc.")
    srid: Optional[int] = Field(None, description="Spatial Reference System ID")
    overwrite: bool = Field(default=False, description="Drop table if exists")


class UploadResponse(BaseModel):
    """Response model for data upload"""
    success: bool
    message: str
    rows_inserted: Optional[int] = None
    table_name: str
    schema_name: str


class LayerInfo(BaseModel):
    """Layer information from QGIS project"""
    name: str
    type: str  # vector, raster, wms, etc.
    provider: str
    visible: bool = True
    queryable: bool = True
    extent: Optional[List[float]] = None


class ThemeConfig(BaseModel):
    """QWC2 theme configuration"""
    title: str
    name: str
    url: str
    attribution: Optional[str] = None
    abstract: Optional[str] = None
    keywords: Optional[List[str]] = None
    thumbnail: Optional[str] = None
    mapCrs: str = "EPSG:3857"
    additionalMouseCrs: Optional[List[str]] = None
    extent: List[float]
    scales: List[int]
    printScales: Optional[List[int]] = None
    printResolutions: Optional[List[int]] = None
    backgroundLayers: List[Dict[str, Any]]
    themeLayers: List[Dict[str, Any]]
