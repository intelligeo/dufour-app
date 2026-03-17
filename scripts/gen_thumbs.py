"""
Generate minimal basemap thumbnail PNGs (200x150) with no external dependencies.
Uses raw zlib + struct to produce valid PNG files.
"""
import struct
import zlib
import os

THUMB_DIR = os.path.join("frontend", "static", "assets", "img", "mapthumbs")
os.makedirs(THUMB_DIR, exist_ok=True)

W, H = 200, 150


def _make_png(w, h, rows_rgb):
    """Create a valid PNG from raw RGB rows. rows_rgb[y] = bytes of R,G,B triples."""
    def _chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    # IHDR
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    # IDAT: each row preceded by filter byte 0 (none)
    raw = b''
    for row in rows_rgb:
        raw += b'\x00' + row  # filter=None
    idat = zlib.compress(raw)
    # Build PNG
    sig = b'\x89PNG\r\n\x1a\n'
    return sig + _chunk(b'IHDR', ihdr) + _chunk(b'IDAT', idat) + _chunk(b'IEND', b'')


# ── OSM: light beige with road-like lines + water area ──
rows = []
for y in range(H):
    row = bytearray()
    for x in range(W):
        r, g, b = 241, 238, 232
        if y % 30 < 2:
            r, g, b = 255, 255, 255
        if x % 40 < 2:
            r, g, b = 255, 255, 255
        if x > W * 0.6 and y > H * 0.5:
            r, g, b = 170, 211, 223
        row.extend([r, g, b])
    rows.append(bytes(row))
with open(os.path.join(THUMB_DIR, "osm.jpg"), "wb") as f:
    f.write(_make_png(W, H, rows))
print("  osm.jpg")

# ── ArcGIS Imagery: dark satellite texture ──
rows = []
for y in range(H):
    row = bytearray()
    for x in range(W):
        r = 25 + ((x * 7 + y * 3) % 20)
        g = 45 + ((x * 3 + y * 7) % 25)
        b = 35 + ((x * 5 + y * 5) % 15)
        row.extend([min(r, 255), min(g, 255), min(b, 255)])
    rows.append(bytes(row))
with open(os.path.join(THUMB_DIR, "arcgis_imagery.jpg"), "wb") as f:
    f.write(_make_png(W, H, rows))
print("  arcgis_imagery.jpg")

# ── CartoDB Dark Matter: near-black with faint grid ──
rows = []
for y in range(H):
    row = bytearray()
    for x in range(W):
        r, g, b = 38, 38, 38
        if x % 25 < 1 or y % 25 < 1:
            r, g, b = 55, 55, 55
        if x % 50 < 1 or y % 50 < 1:
            r, g, b = 65, 65, 65
        row.extend([r, g, b])
    rows.append(bytes(row))
with open(os.path.join(THUMB_DIR, "cartodb_dark.jpg"), "wb") as f:
    f.write(_make_png(W, H, rows))
print("  cartodb_dark.jpg")

# ── CartoDB Positron: light gray with faint grid ──
rows = []
for y in range(H):
    row = bytearray()
    for x in range(W):
        r, g, b = 238, 238, 236
        if x % 25 < 1 or y % 25 < 1:
            r, g, b = 220, 220, 218
        if x % 50 < 1 or y % 50 < 1:
            r, g, b = 210, 210, 208
        row.extend([r, g, b])
    rows.append(bytes(row))
with open(os.path.join(THUMB_DIR, "cartodb_positron.jpg"), "wb") as f:
    f.write(_make_png(W, H, rows))
print("  cartodb_positron.jpg")

# ── OpenTopoMap: green with contour lines ──
rows = []
for y in range(H):
    t = y / max(H - 1, 1)
    row = bytearray()
    for x in range(W):
        r = int(195 + 30 * t)
        g = int(220 - 30 * t)
        b = int(175 + 15 * t)
        if y % 12 < 1:
            r, g, b = 160, 120, 80
        edge = min(x, W - 1 - x, y, H - 1 - y) / 30.0
        if edge < 1:
            f = edge
            r = int(r * f + 140 * (1 - f))
            g = int(g * f + 100 * (1 - f))
            b = int(b * f + 70 * (1 - f))
        row.extend([r, g, b])
    rows.append(bytes(row))
with open(os.path.join(THUMB_DIR, "opentopomap.jpg"), "wb") as f:
    f.write(_make_png(W, H, rows))
print("  opentopomap.jpg")

# ── swisstopo: beige-green with grid ──
rows = []
for y in range(H):
    row = bytearray()
    for x in range(W):
        r, g, b = 218, 222, 198
        if x % 20 < 1 or y % 20 < 1:
            r, g, b = 190, 195, 175
        if x % 60 < 1 or y % 60 < 1:
            r, g, b = 170, 175, 155
        row.extend([r, g, b])
    rows.append(bytes(row))
with open(os.path.join(THUMB_DIR, "swisstopo.jpg"), "wb") as f:
    f.write(_make_png(W, H, rows))
print("  swisstopo.jpg")

print(f"\nAll thumbnails generated in {THUMB_DIR}/")
