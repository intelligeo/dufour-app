"""
QWC2 Editing Service (WFS-T via REST)
======================================
Implementa l'API REST compatibile con EditingInterface di QWC2.
Tutti gli endpoint lavorano sui layer PostGIS prj_<slug>.lyr_<name>.

Dataset convention:
    editServiceUrl  = /api/v1/data
    editDataset     = {project_name}/{table_name}
        project_name — slug del progetto (es. dufour_default)
        table_name   — nome tabella nel schema (es. lyr_WFS_MSS_Marker)

Endpoint:
    GET    /api/v1/data/{project}/{table}/              → features by bbox
    GET    /api/v1/data/{project}/{table}/extent        → extent bbox
    GET    /api/v1/data/{project}/{table}/{fid}         → single feature
    POST   /api/v1/data/{project}/{table}/multipart     → add feature
    PUT    /api/v1/data/{project}/{table}/multipart/{fid} → edit feature
    DELETE /api/v1/data/{project}/{table}/{fid}         → delete feature
"""
import json
import logging
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query, Form, File, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from database.connection import db
from services.auth_service import get_current_user, oauth2_scheme

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/data",
    tags=["editing"],
)


# ── Auth helpers ───────────────────────────────────────────────────────────────

def get_optional_user(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[Dict]:
    """Dependency: returns user dict if authenticated, None otherwise."""
    if not token:
        return None
    try:
        return get_current_user(token)
    except HTTPException:
        return None


# ── DB helpers ─────────────────────────────────────────────────────────────────

def _resolve_project(project_name: str) -> str:
    """Return schema_name for project_name; raise 404 if not found."""
    with db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT schema_name FROM projects WHERE name = :n"),
            {"n": project_name}
        ).fetchone()
    if not row or not row[0]:
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
    return row[0]  # e.g. "prj_dufour_default"


def _get_geom_info(schema: str, table: str) -> Dict[str, Any]:
    """Return {column, srid} for the geometry column of schema.table."""
    with db.get_engine().connect() as conn:
        row = conn.execute(
            text("""
                SELECT f_geometry_column, srid
                FROM geometry_columns
                WHERE f_table_schema = :s AND f_table_name = :t
                LIMIT 1
            """),
            {"s": schema, "t": table}
        ).fetchone()
    if row:
        return {"column": row[0], "srid": int(row[1]) if row[1] else 4326}
    # Fallback guess
    return {"column": "geom", "srid": 4326}


def _get_non_geom_columns(schema: str, table: str, geom_col: str) -> List[str]:
    """Return list of non-geometry column names for schema.table."""
    with db.get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = :s
                  AND table_name   = :t
                  AND column_name  <> :g
                ORDER BY ordinal_position
            """),
            {"s": schema, "t": table, "g": geom_col}
        ).fetchall()
    return [r[0] for r in rows]


def _parse_crs_to_srid(crs_str: Optional[str]) -> int:
    """Parse 'EPSG:3857' → 3857.  Returns 4326 as default."""
    if not crs_str:
        return 4326
    parts = crs_str.upper().split(":")
    try:
        return int(parts[-1])
    except (ValueError, IndexError):
        return 4326


def _row_to_feature(row, geom_idx: int, pkey_idx: int, col_names: List[str]) -> Dict:
    """Convert a DB row to a GeoJSON Feature dict."""
    properties = {}
    for i, name in enumerate(col_names):
        if i == geom_idx:
            continue
        val = row[i]
        # Serialize non-primitive types
        if hasattr(val, 'isoformat'):
            val = val.isoformat()
        properties[name] = val

    geom_json = row[geom_idx]
    geometry = json.loads(geom_json) if geom_json else None

    fid = row[pkey_idx]
    return {
        "type": "Feature",
        "id": fid,
        "geometry": geometry,
        "properties": properties,
    }


# ── GET features by bbox ───────────────────────────────────────────────────────

@router.get("/{project_name}/{table_name}/")
async def get_features(
    project_name: str,
    table_name: str,
    bbox: Optional[str] = Query(None, description="xmin,ymin,xmax,ymax"),
    crs: Optional[str] = Query(None, description="Map CRS, e.g. EPSG:3857"),
    filter: Optional[str] = Query(None),
    filter_geom: Optional[str] = Query(None),
    fields: Optional[str] = Query(None),
    limit: Optional[int] = Query(None),
    offset: Optional[int] = Query(None),
    _user=Depends(get_optional_user),
):
    schema = _resolve_project(project_name)
    ge = _get_geom_info(schema, table_name)
    geom_col = ge["column"]
    table_srid = ge["srid"]
    map_srid = _parse_crs_to_srid(crs)

    # Build SELECT columns
    cols = _get_non_geom_columns(schema, table_name, geom_col)
    if fields:
        allowed = set(fields.split(","))
        cols = [c for c in cols if c in allowed or c == "fid"]

    select_parts = []
    for c in cols:
        select_parts.append(f'"{c}"')
    # Geometry as GeoJSON in map CRS
    select_parts.append(
        f'ST_AsGeoJSON(ST_Transform("{geom_col}", {map_srid})) AS __geom__'
    )
    all_cols = cols + ["__geom__"]

    where_clauses = []
    params: Dict[str, Any] = {}

    # BBOX filter
    if bbox:
        try:
            xmin, ymin, xmax, ymax = [float(v) for v in bbox.split(",")]
            where_clauses.append(
                f'ST_Intersects("{geom_col}", '
                f'ST_Transform(ST_MakeEnvelope(:xmin,:ymin,:xmax,:ymax,{map_srid}), {table_srid}))'
            )
            params.update(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax)
        except Exception as exc:
            logger.warning(f"Invalid bbox '{bbox}': {exc}")

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    limit_sql = f"LIMIT {int(limit)}" if limit else ""
    offset_sql = f"OFFSET {int(offset)}" if offset else ""

    sql = f"""
        SELECT {", ".join(select_parts)}
        FROM "{schema}"."{table_name}"
        {where_sql}
        ORDER BY "fid"
        {limit_sql}
        {offset_sql}
    """

    # Index of __geom__ (last), index of fid (first among cols)
    geom_idx = len(all_cols) - 1
    try:
        pkey_idx = all_cols.index("fid")
    except ValueError:
        pkey_idx = 0

    try:
        with db.get_engine().connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
    except Exception as exc:
        logger.error(f"get_features {schema}.{table_name}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    features = [_row_to_feature(row, geom_idx, pkey_idx, all_cols) for row in rows]
    return {"type": "FeatureCollection", "features": features}


# ── GET extent ─────────────────────────────────────────────────────────────────

@router.get("/{project_name}/{table_name}/extent")
async def get_extent(
    project_name: str,
    table_name: str,
    crs: Optional[str] = Query(None),
    _user=Depends(get_optional_user),
):
    schema = _resolve_project(project_name)
    ge = _get_geom_info(schema, table_name)
    geom_col = ge["column"]
    map_srid = _parse_crs_to_srid(crs)

    sql = f"""
        SELECT ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e)
        FROM (
            SELECT ST_Extent(ST_Transform("{geom_col}", {map_srid})) AS e
            FROM "{schema}"."{table_name}"
        ) sub
    """
    try:
        with db.get_engine().connect() as conn:
            row = conn.execute(text(sql)).fetchone()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if not row or row[0] is None:
        return {"bbox": None}
    return {"bbox": [row[0], row[1], row[2], row[3]]}


# ── GET feature by ID ──────────────────────────────────────────────────────────

@router.get("/{project_name}/{table_name}/{feature_id}")
async def get_feature_by_id(
    project_name: str,
    table_name: str,
    feature_id: int,
    crs: Optional[str] = Query(None),
    _user=Depends(get_optional_user),
):
    schema = _resolve_project(project_name)
    ge = _get_geom_info(schema, table_name)
    geom_col = ge["column"]
    map_srid = _parse_crs_to_srid(crs)

    cols = _get_non_geom_columns(schema, table_name, geom_col)
    select_parts = [f'"{c}"' for c in cols]
    select_parts.append(f'ST_AsGeoJSON(ST_Transform("{geom_col}", {map_srid})) AS __geom__')
    all_cols = cols + ["__geom__"]

    sql = f"""
        SELECT {", ".join(select_parts)}
        FROM "{schema}"."{table_name}"
        WHERE "fid" = :fid
    """
    try:
        with db.get_engine().connect() as conn:
            row = conn.execute(text(sql), {"fid": feature_id}).fetchone()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if row is None:
        raise HTTPException(status_code=404, detail=f"Feature {feature_id} not found")

    geom_idx = len(all_cols) - 1
    try:
        pkey_idx = all_cols.index("fid")
    except ValueError:
        pkey_idx = 0
    return _row_to_feature(row, geom_idx, pkey_idx, all_cols)


# ── POST add feature (multipart) ───────────────────────────────────────────────

@router.post("/{project_name}/{table_name}/multipart")
async def add_feature(
    project_name: str,
    table_name: str,
    feature: str = Form(..., description="GeoJSON Feature as text"),
    crs: Optional[str] = Query(None),
    current_user: Dict = Depends(get_current_user),
):
    schema = _resolve_project(project_name)
    ge = _get_geom_info(schema, table_name)
    geom_col = ge["column"]
    table_srid = ge["srid"]
    map_srid = _parse_crs_to_srid(crs)

    try:
        feat = json.loads(feature)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid GeoJSON feature")

    properties = feat.get("properties") or {}
    geometry = feat.get("geometry")

    # Build INSERT
    cols_to_insert = [k for k in properties if k not in ("fid",)]
    col_sql = ", ".join(f'"{c}"' for c in cols_to_insert)
    val_sql = ", ".join(f':prop_{c}' for c in cols_to_insert)
    params: Dict[str, Any] = {f"prop_{c}": v for c, v in properties.items() if c != "fid"}

    # Geometry
    if geometry:
        geom_json_str = json.dumps(geometry)
        geom_expr = f"ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geom_json), {map_srid}), {table_srid})"
        params["geom_json"] = geom_json_str
        if col_sql:
            full_col_sql = f'"{geom_col}", {col_sql}'
            full_val_sql = f'{geom_expr}, {val_sql}'
        else:
            full_col_sql = f'"{geom_col}"'
            full_val_sql = geom_expr
    else:
        full_col_sql = col_sql
        full_val_sql = val_sql

    sql = f"""
        INSERT INTO "{schema}"."{table_name}" ({full_col_sql})
        VALUES ({full_val_sql})
        RETURNING "fid"
    """
    try:
        with db.get_engine().connect() as conn:
            row = conn.execute(text(sql), params).fetchone()
            conn.commit()
        new_fid = row[0]
    except Exception as exc:
        logger.error(f"add_feature {schema}.{table_name}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    # Return the inserted feature
    return await get_feature_by_id(project_name, table_name, new_fid, crs, _user=current_user)


# ── PUT edit feature (multipart) ───────────────────────────────────────────────

@router.put("/{project_name}/{table_name}/multipart/{feature_id}")
async def edit_feature(
    project_name: str,
    table_name: str,
    feature_id: int,
    feature: str = Form(..., description="GeoJSON Feature as text"),
    crs: Optional[str] = Query(None),
    current_user: Dict = Depends(get_current_user),
):
    schema = _resolve_project(project_name)
    ge = _get_geom_info(schema, table_name)
    geom_col = ge["column"]
    table_srid = ge["srid"]
    map_srid = _parse_crs_to_srid(crs)

    try:
        feat = json.loads(feature)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid GeoJSON feature")

    properties = feat.get("properties") or {}
    geometry = feat.get("geometry")

    set_parts = []
    params: Dict[str, Any] = {"fid": feature_id}

    # Update geometry
    if geometry:
        geom_json_str = json.dumps(geometry)
        set_parts.append(
            f'"{geom_col}" = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geom_json), {map_srid}), {table_srid})'
        )
        params["geom_json"] = geom_json_str

    # Update properties (skip fid and __version__)
    for k, v in properties.items():
        if k in ("fid", "__version__"):
            continue
        set_parts.append(f'"{k}" = :prop_{k}')
        params[f"prop_{k}"] = v

    if not set_parts:
        raise HTTPException(status_code=422, detail="No fields to update")

    sql = f"""
        UPDATE "{schema}"."{table_name}"
        SET {", ".join(set_parts)}
        WHERE "fid" = :fid
    """
    try:
        with db.get_engine().connect() as conn:
            conn.execute(text(sql), params)
            conn.commit()
    except Exception as exc:
        logger.error(f"edit_feature {schema}.{table_name}/{feature_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    return await get_feature_by_id(project_name, table_name, feature_id, crs, _user=current_user)


# ── DELETE feature ─────────────────────────────────────────────────────────────

@router.delete("/{project_name}/{table_name}/{feature_id}")
async def delete_feature(
    project_name: str,
    table_name: str,
    feature_id: int,
    current_user: Dict = Depends(get_current_user),
):
    schema = _resolve_project(project_name)

    sql = f'DELETE FROM "{schema}"."{table_name}" WHERE "fid" = :fid'
    try:
        with db.get_engine().connect() as conn:
            result = conn.execute(text(sql), {"fid": feature_id})
            conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"Feature {feature_id} not found")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"delete_feature {schema}.{table_name}/{feature_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    return JSONResponse(content={"deleted": feature_id}, status_code=200)
