"""
Print Service — Military Symbol Overlay for QGIS Print Compositions

Generates print-ready maps by:
1. Requesting a QGIS Server GetPrint/GetMap for the base map
2. Overlaying military symbols at the correct geo positions
3. Returning a composite image (PNG or PDF-ready PNG)

This allows including military unit symbols in QGIS print layouts
without requiring them to be stored in the QGIS project.
"""

import asyncio
import io
import logging
import math
from dataclasses import dataclass, field
from typing import Optional

import httpx

logger = logging.getLogger("dufour.print_service")

# ─── Configuration ───────────────────────────────────────────────

QGIS_SERVER_URL = "http://localhost:8080/cgi-bin/qgis_mapserv.fcgi"
MILSYMBOL_SERVER_URL = "http://localhost:2525"


@dataclass
class MapExtent:
    """Geographic extent for map composition"""
    xmin: float
    ymin: float
    xmax: float
    ymax: float
    crs: str = "EPSG:3857"

    @property
    def width(self):
        return self.xmax - self.xmin

    @property
    def height(self):
        return self.ymax - self.ymin


@dataclass
class SymbolOverlay:
    """A military symbol to overlay on the print map"""
    sidc: str
    lon: float  # WGS84 longitude
    lat: float  # WGS84 latitude
    size: int = 48
    label: str = ""
    options: dict = field(default_factory=dict)


@dataclass
class PrintRequest:
    """Print composition request"""
    extent: MapExtent
    width: int = 1200   # pixels
    height: int = 800   # pixels
    dpi: int = 300
    project: str = ""   # QGIS project name
    layers: list = field(default_factory=list)
    symbols: list = field(default_factory=list)  # List of SymbolOverlay
    background_color: str = "#ffffff"


def lonlat_to_mercator(lon: float, lat: float) -> tuple[float, float]:
    """Convert WGS84 lon/lat to EPSG:3857 (Web Mercator)"""
    x = lon * 20037508.34 / 180.0
    lat_rad = lat * math.pi / 180.0
    y = math.log(math.tan(math.pi / 4.0 + lat_rad / 2.0)) * 20037508.34 / math.pi
    return (x, y)


def geo_to_pixel(
    lon: float, lat: float,
    extent: MapExtent,
    img_width: int, img_height: int
) -> tuple[int, int]:
    """Convert geographic coordinates to pixel position on image"""
    if extent.crs == "EPSG:3857":
        x, y = lonlat_to_mercator(lon, lat)
    else:
        # Assume already in target CRS
        x, y = lon, lat

    px = int((x - extent.xmin) / extent.width * img_width)
    py = int((extent.ymax - y) / extent.height * img_height)
    return (px, py)


async def fetch_symbol_image(
    client: httpx.AsyncClient,
    sidc: str,
    size: int = 48,
    fmt: str = "png"
) -> Optional[bytes]:
    """Fetch rendered symbol from milsymbol-server"""
    try:
        url = f"{MILSYMBOL_SERVER_URL}/{sidc}.{fmt}?size={size}"
        resp = await client.get(url, timeout=5.0)
        if resp.status_code == 200:
            return resp.content
        logger.warning("Symbol server returned %d for %s", resp.status_code, sidc)
        return None
    except Exception as e:
        logger.warning("Failed to fetch symbol %s: %s", sidc, e)
        return None


async def fetch_base_map(
    client: httpx.AsyncClient,
    request: PrintRequest
) -> Optional[bytes]:
    """Fetch base map from QGIS Server via WMS GetMap"""
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "FORMAT": "image/png",
        "TRANSPARENT": "true",
        "WIDTH": str(request.width),
        "HEIGHT": str(request.height),
        "CRS": request.extent.crs,
        "BBOX": f"{request.extent.xmin},{request.extent.ymin},{request.extent.xmax},{request.extent.ymax}",
        "DPI": str(request.dpi),
    }

    if request.project:
        params["MAP"] = request.project
    if request.layers:
        params["LAYERS"] = ",".join(request.layers)

    try:
        resp = await client.get(QGIS_SERVER_URL, params=params, timeout=30.0)
        if resp.status_code == 200 and "image" in resp.headers.get("content-type", ""):
            return resp.content
        logger.warning("QGIS Server returned %d", resp.status_code)
        return None
    except Exception as e:
        logger.error("Failed to fetch base map: %s", e)
        return None


async def compose_print_map(request: PrintRequest) -> Optional[bytes]:
    """
    Compose a print-ready map with military symbol overlays.
    
    Steps:
    1. Fetch base map from QGIS Server
    2. Fetch all symbol images from milsymbol-server (in parallel)
    3. Overlay symbols at correct pixel positions using Pillow
    4. Return composite PNG
    
    Returns PNG bytes or None on failure.
    Requires Pillow (PIL) — imported lazily.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        logger.error("Pillow is required for print composition. Install with: pip install Pillow")
        return None

    async with httpx.AsyncClient() as client:
        # Step 1: Fetch base map and symbols in parallel
        tasks = [fetch_base_map(client, request)]

        for sym in request.symbols:
            tasks.append(
                fetch_symbol_image(client, sym.sidc, sym.size, "png")
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)

        base_map_data = results[0] if not isinstance(results[0], Exception) else None
        symbol_images_data = results[1:]

    # Step 2: Create base image
    if base_map_data:
        base_image = Image.open(io.BytesIO(base_map_data)).convert("RGBA")
        # Resize if needed
        if base_image.size != (request.width, request.height):
            base_image = base_image.resize((request.width, request.height), Image.LANCZOS)
    else:
        # Create blank canvas if no base map
        logger.warning("No base map available, creating blank canvas")
        base_image = Image.new("RGBA", (request.width, request.height), request.background_color)

    # Step 3: Overlay symbols
    for i, sym in enumerate(request.symbols):
        sym_data = symbol_images_data[i] if i < len(symbol_images_data) else None
        if isinstance(sym_data, Exception) or sym_data is None:
            continue

        try:
            sym_img = Image.open(io.BytesIO(sym_data)).convert("RGBA")
        except Exception:
            continue

        # Convert geo position to pixel
        px, py = geo_to_pixel(
            sym.lon, sym.lat,
            request.extent,
            request.width, request.height
        )

        # Center symbol on position
        paste_x = px - sym_img.width // 2
        paste_y = py - sym_img.height // 2

        # Paste with alpha compositing
        base_image.paste(sym_img, (paste_x, paste_y), sym_img)

        # Draw label if present
        if sym.label:
            draw = ImageDraw.Draw(base_image)
            try:
                font = ImageFont.truetype("arial.ttf", 12)
            except (OSError, IOError):
                font = ImageFont.load_default()

            bbox = draw.textbbox((0, 0), sym.label, font=font)
            text_width = bbox[2] - bbox[0]

            label_x = px - text_width // 2
            label_y = py + sym_img.height // 2 + 4

            # Text shadow
            draw.text((label_x + 1, label_y + 1), sym.label, fill="white", font=font)
            draw.text((label_x, label_y), sym.label, fill="black", font=font)

    # Step 4: Convert to PNG bytes
    output = io.BytesIO()
    # Convert to RGB for smaller file size (no transparency needed for print)
    final_image = Image.new("RGB", base_image.size, "white")
    final_image.paste(base_image, mask=base_image.split()[3])
    final_image.save(output, format="PNG", dpi=(request.dpi, request.dpi))
    output.seek(0)

    logger.info(
        "Composed print map: %dx%d, %d symbols, %d dpi",
        request.width, request.height, len(request.symbols), request.dpi
    )

    return output.getvalue()
