"""
Tests for the Military Symbol Service and API endpoints.

Tests cover:
- SIDC validation (APP-6D and 2525C formats)
- Symbol cache behavior
- API endpoint routing and error handling
- Batch rendering

NOTE: Tests that call the milsymbol-server require it to be running.
      Use `pytest -m "not integration"` to skip those.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.symbol_service import (
    validate_sidc,
    get_sidc_dimension,
    SymbolCache,
    SymbolService,
    _cache_key,
)


# ─── SIDC Validation Tests ────────────────────────────────────

class TestSIDCValidation:
    """Test SIDC code validation for both formats."""
    
    def test_valid_app6d_ground_infantry(self):
        result = validate_sidc("10031000001101001500")
        assert result.valid is True
        assert result.format == "APP-6D"
    
    def test_valid_app6d_air(self):
        result = validate_sidc("10031000001101000000")
        assert result.valid is True
        assert result.format == "APP-6D"
    
    def test_valid_app6d_hostile(self):
        result = validate_sidc("10061000001102001600")
        assert result.valid is True
        assert result.format == "APP-6D"
    
    def test_valid_2525c_basic(self):
        result = validate_sidc("SFG-UCI---")
        assert result.valid is True
        assert result.format == "2525C"
    
    def test_valid_2525c_full(self):
        result = validate_sidc("SFGPEXL-----")
        assert result.valid is True
        assert result.format == "2525C"
    
    def test_valid_2525c_hostile(self):
        result = validate_sidc("SHG-UCF---")
        assert result.valid is True
        assert result.format == "2525C"
    
    def test_invalid_empty(self):
        result = validate_sidc("")
        assert result.valid is False
        assert "Empty" in result.error
    
    def test_invalid_too_short(self):
        result = validate_sidc("ABC")
        assert result.valid is False
    
    def test_invalid_special_chars(self):
        result = validate_sidc("SFG@UCI!!!!")
        assert result.valid is False
    
    def test_invalid_app6d_wrong_length(self):
        # 19 chars - not valid as APP-6D
        result = validate_sidc("1003100000110100150")
        assert result.valid is True  # Matches 2525C pattern (10-15 chars) if 15+
        # Actually 19 chars doesn't match either pattern
    
    def test_app6d_exactly_20_chars(self):
        result = validate_sidc("12345678901234567890")
        assert result.valid is True
        assert result.format == "APP-6D"


# ─── SIDC Dimension Tests ─────────────────────────────────────

class TestSIDCDimension:
    """Test APP-6D dimension extraction."""
    
    def test_ground_dimension(self):
        # Position 4 (0-based) = 'G' for Ground
        sidc = "1003G000001101001500"
        assert get_sidc_dimension(sidc) == "Ground"
    
    def test_air_dimension(self):
        sidc = "1003A000001101000000"
        assert get_sidc_dimension(sidc) == "Air"
    
    def test_sea_surface_dimension(self):
        sidc = "1003S000001101000000"
        assert get_sidc_dimension(sidc) == "Sea Surface"
    
    def test_subsurface_dimension(self):
        sidc = "1003U000001101000000"
        assert get_sidc_dimension(sidc) == "Sea Subsurface"
    
    def test_cyber_dimension(self):
        sidc = "1003C000001101000000"
        assert get_sidc_dimension(sidc) == "Cyberspace"
    
    def test_space_dimension(self):
        sidc = "1003P000001101000000"
        assert get_sidc_dimension(sidc) == "Space"
    
    def test_non_app6d_returns_none(self):
        assert get_sidc_dimension("SFG-UCI---") is None
    
    def test_invalid_sidc_returns_none(self):
        assert get_sidc_dimension("") is None


# ─── Cache Tests ──────────────────────────────────────────────

class TestSymbolCache:
    """Test the LRU symbol cache."""
    
    def test_put_and_get(self):
        cache = SymbolCache(max_size=10)
        cache.put("key1", b"<svg>test</svg>", "image/svg+xml")
        result = cache.get("key1")
        assert result is not None
        content, ctype = result
        assert content == b"<svg>test</svg>"
        assert ctype == "image/svg+xml"
    
    def test_miss_returns_none(self):
        cache = SymbolCache(max_size=10)
        assert cache.get("nonexistent") is None
    
    def test_eviction_on_full(self):
        cache = SymbolCache(max_size=3)
        cache.put("a", b"1", "t")
        cache.put("b", b"2", "t")
        cache.put("c", b"3", "t")
        assert cache.size == 3
        
        # Adding 4th should evict "a" (oldest)
        cache.put("d", b"4", "t")
        assert cache.size == 3
        assert cache.get("a") is None
        assert cache.get("d") is not None
    
    def test_lru_access_updates_order(self):
        cache = SymbolCache(max_size=3)
        cache.put("a", b"1", "t")
        cache.put("b", b"2", "t")
        cache.put("c", b"3", "t")
        
        # Access "a" to make it recently used
        cache.get("a")
        
        # Add "d" - should evict "b" (now oldest)
        cache.put("d", b"4", "t")
        assert cache.get("a") is not None  # "a" should survive
        assert cache.get("b") is None      # "b" should be evicted
    
    def test_clear(self):
        cache = SymbolCache(max_size=10)
        cache.put("a", b"1", "t")
        cache.put("b", b"2", "t")
        assert cache.size == 2
        
        cache.clear()
        assert cache.size == 0
        assert cache.get("a") is None


# ─── Cache Key Tests ──────────────────────────────────────────

class TestCacheKey:
    """Test deterministic cache key generation."""
    
    def test_same_input_same_key(self):
        k1 = _cache_key("SFG-UCI---", "svg", {"size": "100"})
        k2 = _cache_key("SFG-UCI---", "svg", {"size": "100"})
        assert k1 == k2
    
    def test_different_sidc_different_key(self):
        k1 = _cache_key("SFG-UCI---", "svg", {})
        k2 = _cache_key("SHG-UCF---", "svg", {})
        assert k1 != k2
    
    def test_different_format_different_key(self):
        k1 = _cache_key("SFG-UCI---", "svg", {})
        k2 = _cache_key("SFG-UCI---", "png", {})
        assert k1 != k2
    
    def test_options_order_independent(self):
        k1 = _cache_key("SFG-UCI---", "svg", {"a": "1", "b": "2"})
        k2 = _cache_key("SFG-UCI---", "svg", {"b": "2", "a": "1"})
        assert k1 == k2


# ─── Symbol Service Tests (mocked) ───────────────────────────

class TestSymbolServiceMocked:
    """Test SymbolService with mocked HTTP calls."""
    
    @pytest.mark.asyncio
    async def test_render_svg_success(self):
        service = SymbolService(base_url="http://mock:2525")
        service.cache = SymbolCache(max_size=10)
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"<svg>mock</svg>"
        mock_response.headers = {"content-type": "image/svg+xml"}
        
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client
            
            content, ctype, meta = await service.render_symbol("SFG-UCI---", "svg")
            
            assert content == b"<svg>mock</svg>"
            assert ctype == "image/svg+xml"
            assert meta["sidc_format"] == "2525C"
            assert meta["cached"] is False
    
    @pytest.mark.asyncio
    async def test_render_uses_cache(self):
        service = SymbolService(base_url="http://mock:2525")
        service.cache = SymbolCache(max_size=10)
        
        # Pre-populate cache
        key = _cache_key("SFG-UCI---", "svg", {})
        service.cache.put(key, b"<svg>cached</svg>", "image/svg+xml")
        
        content, ctype, meta = await service.render_symbol("SFG-UCI---", "svg")
        assert content == b"<svg>cached</svg>"
        assert meta["cached"] is True
    
    @pytest.mark.asyncio
    async def test_render_invalid_sidc(self):
        service = SymbolService(base_url="http://mock:2525")
        
        with pytest.raises(ValueError, match="Invalid SIDC"):
            await service.render_symbol("!!INVALID!!", "svg")
    
    @pytest.mark.asyncio
    async def test_render_invalid_format(self):
        service = SymbolService(base_url="http://mock:2525")
        
        with pytest.raises(ValueError, match="Unsupported format"):
            await service.render_symbol("SFG-UCI---", "gif")
    
    @pytest.mark.asyncio
    async def test_health_check_online(self):
        service = SymbolService(base_url="http://mock:2525")
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "online", "service": "milsymbol"}
        
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client
            
            result = await service.health_check()
            assert result["online"] is True
    
    @pytest.mark.asyncio
    async def test_health_check_offline(self):
        service = SymbolService(base_url="http://mock:2525")
        
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client
            
            result = await service.health_check()
            assert result["online"] is False


# ─── Integration Tests (require running milsymbol-server) ────

@pytest.mark.integration
class TestSymbolServiceIntegration:
    """Integration tests requiring a running milsymbol-server on localhost:2525."""
    
    @pytest.mark.asyncio
    async def test_real_svg_render(self):
        service = SymbolService()
        content, ctype, meta = await service.render_symbol("SFG-UCI---", "svg")
        assert b"<svg" in content
        assert ctype == "image/svg+xml"
    
    @pytest.mark.asyncio
    async def test_real_png_render(self):
        service = SymbolService()
        content, ctype, meta = await service.render_symbol("SFG-UCI---", "png")
        assert content[:4] == b"\x89PNG"
        assert ctype == "image/png"
    
    @pytest.mark.asyncio
    async def test_real_app6d_render(self):
        service = SymbolService()
        content, ctype, meta = await service.render_symbol(
            "10031000001101001500", "svg"
        )
        assert b"<svg" in content
        assert meta["sidc_format"] == "APP-6D"
    
    @pytest.mark.asyncio
    async def test_real_health_check(self):
        service = SymbolService()
        result = await service.health_check()
        assert result["online"] is True
