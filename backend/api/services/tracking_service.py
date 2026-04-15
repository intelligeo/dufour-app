"""
Traccar Tracking Service
========================
Proxy layer between the Dufour FastAPI backend and a Traccar server
(https://www.traccar.org / https://github.com/traccar/traccar).

Responsibilities
----------------
- Wraps every Traccar REST API call with authentication and error handling.
- Exposes async helpers consumed by the tracking router.
- Manages a background WebSocket subscription to Traccar's /api/socket
  and re-broadcasts position updates to connected Dufour WebSocket clients.

Configuration (env vars)
------------------------
TRACCAR_URL       Base URL of the Traccar server, e.g. http://traccar:8082
TRACCAR_USER      Traccar admin e-mail
TRACCAR_PASSWORD  Traccar admin password
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Set

import httpx
import websockets
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger("dufour.tracking")

# ── Configuration ──────────────────────────────────────────────────────────────

TRACCAR_URL = os.getenv("TRACCAR_URL", "http://traccar:8082")
TRACCAR_USER = os.getenv("TRACCAR_USER", "admin")
TRACCAR_PASSWORD = os.getenv("TRACCAR_PASSWORD", "admin")

# ── Shared state ───────────────────────────────────────────────────────────────

# Latest known position per device id  {device_id: position_dict}
_latest_positions: Dict[int, Dict[str, Any]] = {}

# Active Dufour WebSocket subscribers  (set of asyncio.Queue)
_subscribers: Set[asyncio.Queue] = set()

# Background task handle
_ws_task: Optional[asyncio.Task] = None


# ── HTTP helpers ───────────────────────────────────────────────────────────────

def _auth() -> httpx.BasicAuth:
    return httpx.BasicAuth(TRACCAR_USER, TRACCAR_PASSWORD)


def _headers() -> Dict[str, str]:
    return {"Content-Type": "application/json", "Accept": "application/json"}


async def _get(path: str, params: Optional[Dict] = None) -> Any:
    """Perform an authenticated GET against the Traccar REST API."""
    url = f"{TRACCAR_URL}/api{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, auth=_auth(), headers=_headers(), params=params)
    resp.raise_for_status()
    return resp.json()


async def _post(path: str, payload: Dict) -> Any:
    url = f"{TRACCAR_URL}/api{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, auth=_auth(), headers=_headers(), json=payload)
    resp.raise_for_status()
    return resp.json()


async def _put(path: str, payload: Dict) -> Any:
    url = f"{TRACCAR_URL}/api{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.put(url, auth=_auth(), headers=_headers(), json=payload)
    resp.raise_for_status()
    return resp.json()


async def _delete(path: str) -> None:
    url = f"{TRACCAR_URL}/api{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(url, auth=_auth(), headers=_headers())
    resp.raise_for_status()


# ── Device management ──────────────────────────────────────────────────────────

async def list_devices(all_devices: bool = False) -> List[Dict]:
    """Return all devices visible to the configured Traccar user."""
    return await _get("/devices", params={"all": str(all_devices).lower()})


async def get_device(device_id: int) -> Dict:
    devices = await _get("/devices", params={"id": device_id})
    if not devices:
        raise ValueError(f"Device {device_id} not found")
    return devices[0]


async def create_device(name: str, identifier: str, group_id: Optional[int] = None,
                        phone: str = "", model: str = "", contact: str = "",
                        category: str = "") -> Dict:
    payload = {
        "name": name,
        "uniqueId": identifier,
        "phone": phone,
        "model": model,
        "contact": contact,
        "category": category,
    }
    if group_id is not None:
        payload["groupId"] = group_id
    return await _post("/devices", payload)


async def update_device(device_id: int, **kwargs) -> Dict:
    # Fetch current state first to fill required fields
    current = await get_device(device_id)
    current.update({k: v for k, v in kwargs.items() if v is not None})
    return await _put(f"/devices/{device_id}", current)


async def delete_device(device_id: int) -> None:
    await _delete(f"/devices/{device_id}")


# ── Group (fleet) management ───────────────────────────────────────────────────

async def list_groups() -> List[Dict]:
    return await _get("/groups")


async def create_group(name: str) -> Dict:
    return await _post("/groups", {"name": name})


async def update_group(group_id: int, name: str) -> Dict:
    return await _put(f"/groups/{group_id}", {"id": group_id, "name": name})


async def delete_group(group_id: int) -> None:
    await _delete(f"/groups/{group_id}")


# ── Positions ──────────────────────────────────────────────────────────────────

async def list_positions(device_id: Optional[int] = None) -> List[Dict]:
    """Return latest positions for all (or one) device(s)."""
    params: Dict = {}
    if device_id is not None:
        params["deviceId"] = device_id
    return await _get("/positions", params)


async def get_latest_positions() -> Dict[int, Dict]:
    """Return the cached latest positions (populated by the WS background task)."""
    if not _latest_positions:
        # Do a one-off REST fetch to populate cache before WS is ready
        positions = await list_positions()
        for pos in positions:
            _latest_positions[pos["deviceId"]] = pos
    return dict(_latest_positions)


# ── Geofences ─────────────────────────────────────────────────────────────────

async def list_geofences() -> List[Dict]:
    return await _get("/geofences")


# ── Reports ───────────────────────────────────────────────────────────────────

async def position_history(device_id: int, from_ts: str, to_ts: str) -> List[Dict]:
    """
    Return position history for a device.
    from_ts / to_ts must be ISO-8601 strings, e.g. '2025-01-01T00:00:00Z'.
    """
    return await _get("/reports/route", {
        "deviceId": device_id,
        "from": from_ts,
        "to": to_ts,
    })


# ── WebSocket broadcast ────────────────────────────────────────────────────────

def subscribe() -> asyncio.Queue:
    """Register a new subscriber. Returns a Queue that receives position dicts."""
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    _subscribers.add(q)
    logger.debug("Tracking subscriber added (%d total)", len(_subscribers))
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)
    logger.debug("Tracking subscriber removed (%d remaining)", len(_subscribers))


def _broadcast(message: Dict) -> None:
    dead: Set[asyncio.Queue] = set()
    for q in _subscribers:
        try:
            q.put_nowait(message)
        except asyncio.QueueFull:
            dead.add(q)
    _subscribers.difference_update(dead)


# ── Traccar WebSocket background task ─────────────────────────────────────────

async def _traccar_ws_loop() -> None:
    """
    Connect to Traccar WebSocket and relay position/device events to
    all subscribed Dufour clients.  Reconnects automatically on disconnect.
    """
    import base64

    credentials = base64.b64encode(
        f"{TRACCAR_USER}:{TRACCAR_PASSWORD}".encode()
    ).decode()

    ws_url = TRACCAR_URL.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/api/socket"
    headers = {"Authorization": f"Basic {credentials}"}

    backoff = 2
    while True:
        try:
            logger.info("Connecting to Traccar WebSocket: %s", ws_url)
            async with websockets.connect(ws_url, additional_headers=headers,
                                          ping_interval=30) as ws:
                backoff = 2  # reset on successful connect
                logger.info("Traccar WebSocket connected")
                async for raw in ws:
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    # Handle positions array
                    for pos in data.get("positions", []):
                        _latest_positions[pos["deviceId"]] = pos
                        _broadcast({"type": "position", "data": pos})

                    # Handle device status changes
                    for dev in data.get("devices", []):
                        _broadcast({"type": "device", "data": dev})

                    # Handle events (alarms, geofence enter/exit …)
                    for evt in data.get("events", []):
                        _broadcast({"type": "event", "data": evt})

        except ConnectionClosed as exc:
            logger.warning("Traccar WebSocket closed: %s – reconnecting in %ds", exc, backoff)
        except OSError as exc:
            logger.warning("Traccar WebSocket OS error: %s – reconnecting in %ds", exc, backoff)
        except Exception as exc:
            logger.exception("Traccar WebSocket unexpected error: %s", exc)

        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 60)


def start_ws_listener() -> None:
    """Schedule the background WebSocket task (call once at startup)."""
    global _ws_task
    if _ws_task is None or _ws_task.done():
        _ws_task = asyncio.create_task(_traccar_ws_loop())
        logger.info("Traccar WebSocket listener task started")


def stop_ws_listener() -> None:
    """Cancel the background WebSocket task (call at shutdown)."""
    global _ws_task
    if _ws_task and not _ws_task.done():
        _ws_task.cancel()
        logger.info("Traccar WebSocket listener task cancelled")


# ── GeoJSON helpers ───────────────────────────────────────────────────────────

def position_to_geojson_feature(pos: Dict, device: Optional[Dict] = None) -> Dict:
    """Convert a Traccar position dict to a GeoJSON Feature."""
    props = {
        "device_id": pos.get("deviceId"),
        "device_name": device.get("name", "") if device else "",
        "speed": pos.get("speed", 0),          # km/h
        "course": pos.get("course", 0),         # degrees
        "altitude": pos.get("altitude", 0),     # metres
        "accuracy": pos.get("accuracy", 0),
        "fix_time": pos.get("fixTime", ""),
        "server_time": pos.get("serverTime", ""),
        "attributes": pos.get("attributes", {}),
        "protocol": pos.get("protocol", ""),
        "outdated": pos.get("outdated", False),
        "valid": pos.get("valid", True),
    }
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [pos.get("longitude", 0), pos.get("latitude", 0)]
        },
        "properties": props
    }


async def positions_as_geojson() -> Dict:
    """Return a GeoJSON FeatureCollection with current positions for all devices."""
    positions = await get_latest_positions()
    devices_list = await list_devices()
    devices_by_id = {d["id"]: d for d in devices_list}

    features = [
        position_to_geojson_feature(pos, devices_by_id.get(pos["deviceId"]))
        for pos in positions.values()
    ]
    return {
        "type": "FeatureCollection",
        "features": features
    }
