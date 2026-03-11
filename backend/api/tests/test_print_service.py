"""
Tests for Print Service — Military Symbol Overlay Composition

Tests cover:
- Coordinate conversion (WGS84 → Mercator, geo → pixel)
- Symbol fetching (mocked)
- Base map fetching (mocked)
- Full composition pipeline
- Edge cases (empty symbols, no base map, label rendering)

NOTE: All tests mock HTTP calls. No running milsymbol-server or QGIS Server needed.
"""

import io
import math
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.print_service import (
    MapExtent,
    SymbolOverlay,
    PrintRequest,
    lonlat_to_mercator,
    geo_to_pixel,
    fetch_symbol_image,
    fetch_base_map,
    compose_print_map,
)


pytestmark = pytest.mark.unit


# ── Coordinate Conversion ────────────────────────────────────

class TestLonLatToMercator:
    """Test WGS84 → EPSG:3857 conversion."""

    def test_origin(self):
        x, y = lonlat_to_mercator(0.0, 0.0)
        assert abs(x) < 1.0
        assert abs(y) < 1.0

    def test_bern(self):
        """Bern, CH ≈ lon 7.44, lat 46.95"""
        x, y = lonlat_to_mercator(7.4474, 46.9480)
        assert 828_000 < x < 830_000  # ~829'099 m
        assert 5_930_000 < y < 5_940_000

    def test_negative_lon(self):
        x, _ = lonlat_to_mercator(-90.0, 0.0)
        assert x < 0

    def test_high_latitude(self):
        """Near poles the y value grows large."""
        _, y = lonlat_to_mercator(0.0, 85.0)
        assert y > 19_000_000


class TestGeoToPixel:
    """Test geographic → pixel conversion."""

    def test_top_left(self):
        """Top-left of extent → pixel (0, 0)"""
        extent = MapExtent(xmin=0, ymin=0, xmax=100, ymax=100, crs="EPSG:2056")
        # With a non-3857 CRS the coords pass through directly
        px, py = geo_to_pixel(0, 100, extent, 800, 600)
        assert px == 0
        assert py == 0

    def test_bottom_right(self):
        extent = MapExtent(xmin=0, ymin=0, xmax=100, ymax=100, crs="EPSG:2056")
        px, py = geo_to_pixel(100, 0, extent, 800, 600)
        assert px == 800
        assert py == 600

    def test_center(self):
        extent = MapExtent(xmin=0, ymin=0, xmax=100, ymax=100, crs="EPSG:2056")
        px, py = geo_to_pixel(50, 50, extent, 800, 600)
        assert px == 400
        assert py == 300

    def test_with_wgs84_lonlat(self):
        """When CRS is EPSG:3857, lon/lat are converted to Mercator first."""
        extent = MapExtent(
            xmin=800_000, ymin=5_900_000,
            xmax=860_000, ymax=5_960_000,
            crs="EPSG:3857",
        )
        px, py = geo_to_pixel(7.45, 46.95, extent, 1200, 800)
        # Should produce a pixel within the image
        assert 0 <= px <= 1200
        assert 0 <= py <= 800


# ── MapExtent Properties ─────────────────────────────────────

class TestMapExtent:
    def test_width_height(self):
        ext = MapExtent(xmin=10, ymin=20, xmax=110, ymax=120)
        assert ext.width == 100
        assert ext.height == 100


# ── SymbolOverlay Defaults ───────────────────────────────────

class TestSymbolOverlay:
    def test_defaults(self):
        sym = SymbolOverlay(sidc="SFG-UCI---", lon=7.45, lat=46.95)
        assert sym.size == 48
        assert sym.label == ""
        assert sym.options == {}


# ── PrintRequest Defaults ────────────────────────────────────

class TestPrintRequest:
    def test_defaults(self):
        req = PrintRequest(
            extent=MapExtent(xmin=0, ymin=0, xmax=1, ymax=1)
        )
        assert req.width == 1200
        assert req.height == 800
        assert req.dpi == 300
        assert req.symbols == []
        assert req.background_color == "#ffffff"


# ── fetch_symbol_image (mocked) ──────────────────────────────

class TestFetchSymbolImage:

    @pytest.mark.asyncio
    async def test_success(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b"\x89PNG_FAKE"

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        result = await fetch_symbol_image(mock_client, "SFG-UCI---", 48, "png")
        assert result == b"\x89PNG_FAKE"

    @pytest.mark.asyncio
    async def test_server_error_returns_none(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 500

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        result = await fetch_symbol_image(mock_client, "BAD-SIDC", 48, "png")
        assert result is None

    @pytest.mark.asyncio
    async def test_connection_error_returns_none(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("connection refused"))

        result = await fetch_symbol_image(mock_client, "SFG-UCI---", 48, "png")
        assert result is None


# ── fetch_base_map (mocked) ──────────────────────────────────

class TestFetchBaseMap:

    @pytest.mark.asyncio
    async def test_success(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "image/png"}
        mock_resp.content = b"\x89PNG_MAP"

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        req = PrintRequest(
            extent=MapExtent(xmin=800000, ymin=5900000, xmax=860000, ymax=5960000),
            project="CHE_Basemaps",
            layers=["ortho"],
        )
        result = await fetch_base_map(mock_client, req)
        assert result == b"\x89PNG_MAP"

    @pytest.mark.asyncio
    async def test_non_image_returns_none(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "text/xml"}
        mock_resp.content = b"<ServiceException/>"

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        req = PrintRequest(extent=MapExtent(xmin=0, ymin=0, xmax=1, ymax=1))
        result = await fetch_base_map(mock_client, req)
        assert result is None

    @pytest.mark.asyncio
    async def test_connection_error_returns_none(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("timeout"))

        req = PrintRequest(extent=MapExtent(xmin=0, ymin=0, xmax=1, ymax=1))
        result = await fetch_base_map(mock_client, req)
        assert result is None


# ── compose_print_map (full pipeline, mocked) ────────────────

# Helper: build fake PIL modules for environments where Pillow DLL is blocked
def _make_pil_mocks():
    """Return (mock_Image, mock_ImageDraw, mock_ImageFont, modules_dict)."""
    import types

    mock_image_instance = MagicMock()
    # .size returns tuple, .split returns 4-channel list
    mock_image_instance.size = (400, 300)
    mock_image_instance.split.return_value = [MagicMock()] * 4

    mock_Image = MagicMock()
    mock_Image.new.return_value = mock_image_instance
    mock_Image.open.return_value = mock_image_instance
    mock_Image.LANCZOS = 1

    mock_ImageDraw = MagicMock()
    mock_draw_instance = MagicMock()
    mock_draw_instance.textbbox.return_value = (0, 0, 30, 12)
    mock_ImageDraw.Draw.return_value = mock_draw_instance

    mock_ImageFont = MagicMock()

    # Build a fake PIL package so `from PIL import Image, ImageDraw, ImageFont` works
    pil_pkg = types.ModuleType("PIL")
    pil_pkg.Image = mock_Image
    pil_pkg.ImageDraw = mock_ImageDraw
    pil_pkg.ImageFont = mock_ImageFont

    modules = {
        "PIL": pil_pkg,
        "PIL.Image": mock_Image,
        "PIL.ImageDraw": mock_ImageDraw,
        "PIL.ImageFont": mock_ImageFont,
    }
    return mock_Image, mock_ImageDraw, mock_ImageFont, modules


class TestComposePrintMap:

    @pytest.mark.asyncio
    async def test_no_pillow_returns_none(self):
        """If Pillow is not installed, compose returns None."""
        req = PrintRequest(extent=MapExtent(xmin=0, ymin=0, xmax=1, ymax=1))
        with patch.dict("sys.modules", {"PIL": None, "PIL.Image": None,
                                         "PIL.ImageDraw": None, "PIL.ImageFont": None}):
            result = await compose_print_map(req)
        assert result is None

    @pytest.mark.asyncio
    async def test_blank_canvas_when_no_basemap(self):
        """When QGIS Server is unreachable, compose creates a blank white canvas."""
        mock_Image, _, _, pil_modules = _make_pil_mocks()

        # Make save() write a fake PNG header
        def _fake_save(buf, **kw):
            buf.write(b"\x89PNG_FAKE_DATA")
        canvas = mock_Image.new.return_value
        # final_image is Image.new("RGB", ...) — the second call
        final_img = MagicMock()
        final_img.save = _fake_save
        final_img.size = (400, 300)
        mock_Image.new.side_effect = [canvas, final_img]

        req = PrintRequest(
            extent=MapExtent(xmin=800000, ymin=5900000, xmax=860000, ymax=5960000),
            width=400, height=300, dpi=96, symbols=[],
        )

        with patch.dict("sys.modules", pil_modules), \
             patch("services.print_service.fetch_base_map", new_callable=AsyncMock, return_value=None), \
             patch("services.print_service.fetch_symbol_image", new_callable=AsyncMock, return_value=None):
            result = await compose_print_map(req)

        assert result is not None
        assert result[:4] == b"\x89PNG"

    @pytest.mark.asyncio
    async def test_compose_with_symbols(self):
        """Compose base map + one symbol overlay."""
        mock_Image, mock_ImageDraw, _, pil_modules = _make_pil_mocks()

        base_img = MagicMock()
        base_img.size = (400, 300)
        base_img.split.return_value = [MagicMock()] * 4
        sym_img = MagicMock()
        sym_img.width = 48
        sym_img.height = 48

        # open() returns base_img for base map, sym_img for symbol
        mock_Image.open.side_effect = [base_img, sym_img]
        # new("RGB", ...) for final composite
        final_img = MagicMock()
        final_img.save = lambda buf, **kw: buf.write(b"\x89PNG_COMPOSITE")
        final_img.size = (400, 300)
        mock_Image.new.return_value = final_img

        req = PrintRequest(
            extent=MapExtent(xmin=800000, ymin=5900000, xmax=860000, ymax=5960000),
            width=400, height=300, dpi=96,
            symbols=[
                SymbolOverlay(sidc="10031000001211000000", lon=7.45, lat=46.95, size=48, label="HQ"),
            ],
        )

        with patch.dict("sys.modules", pil_modules), \
             patch("services.print_service.fetch_base_map", new_callable=AsyncMock, return_value=b"PNG_BASE"), \
             patch("services.print_service.fetch_symbol_image", new_callable=AsyncMock, return_value=b"PNG_SYM"):
            result = await compose_print_map(req)

        assert result is not None
        assert result[:4] == b"\x89PNG"

    @pytest.mark.asyncio
    async def test_compose_skips_failed_symbols(self):
        """Symbols that fail to render are silently skipped."""
        mock_Image, _, _, pil_modules = _make_pil_mocks()

        canvas = mock_Image.new.return_value
        final_img = MagicMock()
        final_img.save = lambda buf, **kw: buf.write(b"\x89PNG_BLANK")
        final_img.size = (100, 100)
        mock_Image.new.side_effect = [canvas, final_img]

        req = PrintRequest(
            extent=MapExtent(xmin=0, ymin=0, xmax=1, ymax=1, crs="EPSG:3857"),
            width=100, height=100, dpi=96,
            symbols=[SymbolOverlay(sidc="BAD-SIDC", lon=0.5, lat=0.5)],
        )

        with patch.dict("sys.modules", pil_modules), \
             patch("services.print_service.fetch_base_map", new_callable=AsyncMock, return_value=None), \
             patch("services.print_service.fetch_symbol_image", new_callable=AsyncMock, return_value=None):
            result = await compose_print_map(req)

        assert result is not None
        assert result[:4] == b"\x89PNG"
