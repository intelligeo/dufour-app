"""
Military Symbol Service
Proxy to the embedded milsymbol-server (Node.js) for rendering
NATO military symbols (APP-6D and MIL-STD-2525C).

Provides:
- SVG/PNG symbol rendering via SIDC codes
- LRU cache for frequently requested symbols  
- SIDC validation for both APP-6D (20-char) and 2525C (15-char) formats
- Batch rendering support
- Health check for milsymbol-server connectivity
"""

import os
import re
import hashlib
from typing import Optional, Dict, Tuple, Literal
from functools import lru_cache
from dataclasses import dataclass, field

import httpx


# ─── Configuration ─────────────────────────────────────────────

MILSYMBOL_SERVER_URL = os.getenv("MILSYMBOL_SERVER_URL", "http://localhost:2525")
SYMBOL_CACHE_SIZE = int(os.getenv("SYMBOL_CACHE_SIZE", "512"))
DEFAULT_SYMBOL_SIZE = int(os.getenv("MILSYMBOL_DEFAULT_SIZE", "100"))
DEFAULT_SIDC_FORMAT = os.getenv("DEFAULT_SIDC_FORMAT", "APP-6D")  # "APP-6D" or "2525C"


# ─── SIDC Validation ──────────────────────────────────────────

# APP-6D: exactly 20 alphanumeric characters
APP6D_PATTERN = re.compile(r"^[A-Za-z0-9]{20}$")

# MIL-STD-2525C: 10-15 characters (letters, digits, dashes, asterisks)
MS2525C_PATTERN = re.compile(r"^[A-Za-z0-9\-\*]{10,15}$")


@dataclass
class SIDCValidation:
    valid: bool
    format: Optional[str] = None  # "APP-6D" or "2525C"
    error: Optional[str] = None


def validate_sidc(sidc: str) -> SIDCValidation:
    """Validate a Symbol Identification Code (SIDC)."""
    if not sidc:
        return SIDCValidation(valid=False, error="Empty SIDC")
    
    if APP6D_PATTERN.match(sidc):
        return SIDCValidation(valid=True, format="APP-6D")
    
    if MS2525C_PATTERN.match(sidc):
        return SIDCValidation(valid=True, format="2525C")
    
    return SIDCValidation(
        valid=False,
        error=f"Invalid SIDC format: '{sidc}'. "
              f"Expected APP-6D (20 alphanumeric) or 2525C (10-15 chars with dashes)"
    )


# ─── APP-6D Dimensions ───────────────────────────────────────

# Mapping from APP-6D dimension digit (position 5) to human-readable name
APP6D_DIMENSIONS = {
    "A": "Air",
    "G": "Ground",
    "S": "Sea Surface",
    "U": "Sea Subsurface",
    "F": "SOF",
    "X": "Other",
    "C": "Cyberspace",
    "P": "Space",
}


def get_sidc_dimension(sidc: str) -> Optional[str]:
    """Extract the dimension (domain) from an APP-6D SIDC."""
    validation = validate_sidc(sidc)
    if not validation.valid or validation.format != "APP-6D":
        return None
    # In APP-6D, position index 4 (0-based) is the symbol set / dimension
    dim_char = sidc[4].upper()
    return APP6D_DIMENSIONS.get(dim_char, "Unknown")


# ─── Symbol Cache ─────────────────────────────────────────────

def _cache_key(sidc: str, fmt: str, options: dict) -> str:
    """Generate a deterministic cache key for a symbol request."""
    opts_str = "&".join(f"{k}={v}" for k, v in sorted(options.items()))
    raw = f"{sidc}.{fmt}?{opts_str}"
    return hashlib.md5(raw.encode()).hexdigest()


class SymbolCache:
    """Simple LRU-like in-memory cache for rendered symbols."""
    
    def __init__(self, max_size: int = 512):
        self.max_size = max_size
        self._cache: Dict[str, Tuple[bytes, str]] = {}  # key -> (content, content_type)
        self._access_order: list = []
    
    def get(self, key: str) -> Optional[Tuple[bytes, str]]:
        if key in self._cache:
            # Move to end (most recently used)
            if key in self._access_order:
                self._access_order.remove(key)
            self._access_order.append(key)
            return self._cache[key]
        return None
    
    def put(self, key: str, content: bytes, content_type: str):
        if len(self._cache) >= self.max_size and key not in self._cache:
            # Evict least recently used
            if self._access_order:
                oldest = self._access_order.pop(0)
                self._cache.pop(oldest, None)
        
        self._cache[key] = (content, content_type)
        if key in self._access_order:
            self._access_order.remove(key)
        self._access_order.append(key)
    
    @property
    def size(self) -> int:
        return len(self._cache)
    
    def clear(self):
        self._cache.clear()
        self._access_order.clear()


# Global cache instance
_symbol_cache = SymbolCache(max_size=SYMBOL_CACHE_SIZE)


# ─── Symbol Service ───────────────────────────────────────────

class SymbolService:
    """
    Service to render military symbols via the embedded milsymbol-server.
    Handles proxy requests, caching, and validation.
    """
    
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or MILSYMBOL_SERVER_URL
        self.cache = _symbol_cache
    
    async def health_check(self) -> dict:
        """Check milsymbol-server health."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/health")
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "online": True,
                        "url": self.base_url,
                        **data
                    }
                return {"online": False, "url": self.base_url, "status_code": resp.status_code}
        except Exception as e:
            return {"online": False, "url": self.base_url, "error": str(e)}
    
    async def render_symbol(
        self,
        sidc: str,
        fmt: Literal["svg", "png"] = "svg",
        size: Optional[int] = None,
        **options
    ) -> Tuple[bytes, str, dict]:
        """
        Render a military symbol.
        
        Args:
            sidc: Symbol Identification Code (APP-6D or 2525C)
            fmt: Output format ("svg" or "png")
            size: Symbol size in pixels
            **options: Additional milsymbol options (uniqueDesignation, etc.)
        
        Returns:
            Tuple of (content_bytes, content_type, metadata)
        
        Raises:
            ValueError: Invalid SIDC or format
            ConnectionError: milsymbol-server unreachable
        """
        # Validate SIDC
        validation = validate_sidc(sidc)
        if not validation.valid:
            raise ValueError(validation.error)
        
        # Validate format
        fmt_lower = fmt.lower()
        if fmt_lower not in ("svg", "png"):
            raise ValueError(f"Unsupported format: {fmt}. Use 'svg' or 'png'")
        
        # Build options
        if size:
            options["size"] = size
        
        # Check cache
        cache_key = _cache_key(sidc, fmt_lower, options)
        cached = self.cache.get(cache_key)
        if cached:
            content, content_type = cached
            return content, content_type, {
                "cached": True,
                "sidc_format": validation.format,
                "dimension": get_sidc_dimension(sidc)
            }
        
        # Request from milsymbol-server
        url = f"{self.base_url}/{sidc}.{fmt_lower}"
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=options if options else None)
                
                if resp.status_code != 200:
                    error_detail = resp.text
                    try:
                        error_detail = resp.json()
                    except Exception:
                        pass
                    raise ValueError(
                        f"milsymbol-server returned {resp.status_code}: {error_detail}"
                    )
                
                content = resp.content
                content_type = resp.headers.get("content-type", "application/octet-stream")
                
                # Cache the result
                self.cache.put(cache_key, content, content_type)
                
                return content, content_type, {
                    "cached": False,
                    "sidc_format": validation.format,
                    "dimension": get_sidc_dimension(sidc)
                }
        
        except httpx.ConnectError:
            raise ConnectionError(
                f"Cannot reach milsymbol-server at {self.base_url}. "
                "Is the service running?"
            )
    
    async def render_batch(
        self,
        symbols: list,
        fmt: Literal["svg", "png"] = "svg",
        size: Optional[int] = None
    ) -> list:
        """
        Render multiple symbols in batch.
        
        Args:
            symbols: List of dicts with 'sidc' and optional modifier fields
            fmt: Output format
            size: Default size
        
        Returns:
            List of dicts with 'sidc', 'content' (base64), 'content_type', 'metadata'
        """
        import base64
        
        results = []
        for sym in symbols:
            sidc = sym.get("sidc") or sym.get("SIDC")
            if not sidc:
                results.append({"sidc": None, "error": "Missing SIDC"})
                continue
            
            # Extract options (everything except 'sidc')
            options = {k: v for k, v in sym.items() if k.lower() != "sidc"}
            
            try:
                content, content_type, metadata = await self.render_symbol(
                    sidc=sidc,
                    fmt=fmt,
                    size=size,
                    **options
                )
                results.append({
                    "sidc": sidc,
                    "content": base64.b64encode(content).decode("utf-8"),
                    "content_type": content_type,
                    "metadata": metadata
                })
            except Exception as e:
                results.append({
                    "sidc": sidc,
                    "error": str(e)
                })
        
        return results
    
    def get_cache_stats(self) -> dict:
        """Return cache statistics."""
        return {
            "size": self.cache.size,
            "max_size": self.cache.max_size
        }
    
    def clear_cache(self):
        """Clear the symbol cache."""
        self.cache.clear()


# Singleton instance
symbol_service = SymbolService()
