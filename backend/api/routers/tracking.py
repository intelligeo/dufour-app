"""
Tracking Router
===============
FastAPI router that exposes Dufour's tracking endpoints, all backed by
the `tracking_service` module which communicates with Traccar.

Prefix : /api/tracking
Tags   : tracking

REST endpoints
--------------
GET    /devices             list all devices
POST   /devices             create device
PUT    /devices/{id}        update device
DELETE /devices/{id}        delete device

GET    /groups              list groups (fleets)
POST   /groups              create group
PUT    /groups/{id}         update group
DELETE /groups/{id}         delete group

GET    /positions           current positions (JSON array)
GET    /positions/geojson   current positions as GeoJSON FeatureCollection

GET    /history             position history for a device
GET    /geofences           list geofences

WebSocket
---------
WS     /ws                  real-time position/event stream
                            (JSON messages of shape {type, data})
"""

import asyncio
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

import services.tracking_service as ts
from services.auth_service import get_current_user

logger = logging.getLogger("dufour.tracking.router")

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class DeviceCreate(BaseModel):
    name: str
    uniqueId: str
    groupId: Optional[int] = None
    phone: Optional[str] = ""
    model: Optional[str] = ""
    contact: Optional[str] = ""
    category: Optional[str] = ""


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    uniqueId: Optional[str] = None
    groupId: Optional[int] = None
    phone: Optional[str] = None
    model: Optional[str] = None
    contact: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None


class GroupCreate(BaseModel):
    name: str


# ── Device endpoints ──────────────────────────────────────────────────────────

@router.get("/devices", summary="List all tracking devices")
async def get_devices(
    all_devices: bool = Query(False, alias="all",
                              description="Include devices from all users (admin only)"),
    _user=Depends(get_current_user)
):
    try:
        return await ts.list_devices(all_devices)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


@router.post("/devices", summary="Create a new tracking device", status_code=201)
async def create_device(body: DeviceCreate, _user=Depends(get_current_user)):
    try:
        return await ts.create_device(
            name=body.name,
            identifier=body.uniqueId,
            group_id=body.groupId,
            phone=body.phone or "",
            model=body.model or "",
            contact=body.contact or "",
            category=body.category or "",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


@router.put("/devices/{device_id}", summary="Update a tracking device")
async def update_device(device_id: int, body: DeviceUpdate, _user=Depends(get_current_user)):
    try:
        return await ts.update_device(device_id, **body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


@router.delete("/devices/{device_id}", summary="Delete a tracking device", status_code=204)
async def delete_device(device_id: int, _user=Depends(get_current_user)):
    try:
        await ts.delete_device(device_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


# ── Group / fleet endpoints ────────────────────────────────────────────────────

@router.get("/groups", summary="List fleet groups")
async def get_groups(_user=Depends(get_current_user)):
    try:
        return await ts.list_groups()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


@router.post("/groups", summary="Create a fleet group", status_code=201)
async def create_group(body: GroupCreate, _user=Depends(get_current_user)):
    try:
        return await ts.create_group(body.name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


@router.put("/groups/{group_id}", summary="Update a fleet group")
async def update_group(group_id: int, body: GroupCreate, _user=Depends(get_current_user)):
    try:
        return await ts.update_group(group_id, body.name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


@router.delete("/groups/{group_id}", summary="Delete a fleet group", status_code=204)
async def delete_group(group_id: int, _user=Depends(get_current_user)):
    try:
        await ts.delete_group(group_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


# ── Position endpoints ─────────────────────────────────────────────────────────

@router.get("/positions", summary="Current positions (Traccar format)")
async def get_positions(
    device_id: Optional[int] = Query(None, alias="deviceId"),
    _user=Depends(get_current_user)
):
    try:
        if device_id is not None:
            return await ts.list_positions(device_id)
        return list((await ts.get_latest_positions()).values())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


@router.get("/positions/geojson", summary="Current positions as GeoJSON FeatureCollection")
async def get_positions_geojson(
    project: Optional[str] = Query(None,
                                   description="Filter positions to devices/groups linked to this project name"),
    _user=Depends(get_current_user)
):
    """
    Returns a GeoJSON FeatureCollection suitable for direct consumption by
    an OpenLayers VectorLayer. Each feature carries speed, course, altitude,
    device name and other tracking attributes as properties.

    Pass ``?project=<name>`` to restrict output to devices associated with
    a specific project via the ``project_tracking`` table.
    """
    try:
        return await ts.positions_as_geojson(project_name=project)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


# ── History endpoint ───────────────────────────────────────────────────────────

@router.get("/history", summary="Position history for a device")
async def get_history(
    device_id: int = Query(..., alias="deviceId"),
    from_ts: str = Query(..., alias="from",
                         description="ISO-8601 start timestamp, e.g. 2025-01-01T00:00:00Z"),
    to_ts: str = Query(..., alias="to",
                       description="ISO-8601 end timestamp"),
    _user=Depends(get_current_user)
):
    try:
        return await ts.position_history(device_id, from_ts, to_ts)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


# ── Geofences ─────────────────────────────────────────────────────────────────

@router.get("/geofences", summary="List geofences")
async def get_geofences(_user=Depends(get_current_user)):
    try:
        return await ts.list_geofences()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Traccar error: {exc}") from exc


class ProjectTrackingCreate(BaseModel):
    device_id: Optional[int] = None
    group_id: Optional[int] = None


# ── Project ↔ Device / Group association endpoints ────────────────────────────

@router.get("/projects/{project_name}/devices",
            summary="List Traccar device/group associations for a project")
async def list_project_tracking(project_name: str, _user=Depends(get_current_user)):
    try:
        return await ts.list_project_tracking(project_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/projects/{project_name}/devices",
             summary="Link a Traccar device or group to a project",
             status_code=201)
async def add_project_tracking(
    project_name: str,
    body: ProjectTrackingCreate,
    _user=Depends(get_current_user)
):
    if body.device_id is None and body.group_id is None:
        raise HTTPException(status_code=422, detail="Provide either device_id or group_id")
    if body.device_id is not None and body.group_id is not None:
        raise HTTPException(status_code=422, detail="Provide device_id OR group_id, not both")
    try:
        return await ts.add_project_tracking(project_name, body.device_id, body.group_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/projects/{project_name}/devices/{entry_id}",
               summary="Remove a Traccar device/group association from a project",
               status_code=204)
async def remove_project_tracking(
    project_name: str,
    entry_id: str,
    _user=Depends(get_current_user)
):
    try:
        await ts.remove_project_tracking(project_name, entry_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── Real-time WebSocket ────────────────────────────────────────────────────────

@router.websocket("/ws")
async def tracking_websocket(websocket: WebSocket):
    """
    Real-time tracking stream.

    The client may optionally send a JSON authentication message as the
    first frame:  {"token": "<jwt>"}

    Subsequent server messages:
        {"type": "position", "data": {<Traccar position object>}}
        {"type": "device",   "data": {<Traccar device object>}}
        {"type": "event",    "data": {<Traccar event object>}}
        {"type": "snapshot", "data": {<device_id>: <position>, ...}}
    """
    await websocket.accept()
    logger.info("WS client connected: %s", websocket.client)

    queue = ts.subscribe()

    try:
        # Send current snapshot so the client can initialise the map immediately
        snapshot = await ts.get_latest_positions()
        await websocket.send_text(json.dumps({
            "type": "snapshot",
            "data": snapshot
        }))

        # Relay updates as they arrive
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=30)
                await websocket.send_text(json.dumps(msg))
            except asyncio.TimeoutError:
                # Send a keepalive ping so the connection isn't dropped
                await websocket.send_text(json.dumps({"type": "ping"}))
    except (WebSocketDisconnect, Exception) as exc:
        logger.info("WS client disconnected: %s (%s)", websocket.client, exc)
    finally:
        ts.unsubscribe(queue)
