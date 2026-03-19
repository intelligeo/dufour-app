"""
Quick test of the parsing + resolution pipeline logic.
Does NOT import project_migrator (which requires fiona).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from pathlib import Path
from services.qgz_parser import QGZParser

TEST_DIR = Path(__file__).parent / 'test_qgs'
CARESG_QGZ = TEST_DIR / 'caresg_test_epsg2056_v340.qgz'
CARESG_GPKG = TEST_DIR / 'caresg_mu.gpkg'

errors = []

# ═══ Test 1: parse + filter ═══
print("=== Test 1: parse_layers_filtered ===")
with QGZParser(CARESG_QGZ) as p:
    p.extract()
    p.parse_xml()
    all_layers = p.parse_layers()
    filtered = p.parse_layers_filtered()

print(f"  Total layers: {len(all_layers)}")
print(f"  Filtered (vector + plugin): {len(filtered)}")
for l in filtered:
    print(f"    {l.name!r:40s} type={l.layer_type!r:10s} src={l.source_type!r:10s}")
    print(f"      datasource={l.datasource!r}")

if len(filtered) != 3:
    errors.append(f"Expected 3 filtered layers, got {len(filtered)}")

# ═══ Test 2: companion_map ═══
print("\n=== Test 2: companion_map ===")
COMPANION_EXTENSIONS = {'.gpkg', '.geojson', '.json', '.shp',
                        '.fgb', '.csv', '.dbf', '.shx', '.prj', '.cpg'}

companion_files = [CARESG_GPKG]
companion_map = {}

with QGZParser(CARESG_QGZ) as parser:
    parser.extract()
    parser.parse_xml()
    if parser.temp_dir and parser.temp_dir.exists():
        embedded_files = list(parser.temp_dir.rglob('*'))
        print(f"  Embedded files in .qgz: {[f.name for f in embedded_files if f.is_file()]}")
        for f in embedded_files:
            if f.is_file() and f.suffix.lower() in COMPANION_EXTENSIONS:
                companion_map.setdefault(f.name.lower(), f)
                print(f"  [embedded] {f.name.lower()}")

for cf in companion_files:
    if cf.exists():
        companion_map[cf.name.lower()] = cf
        print(f"  [uploaded] {cf.name.lower()} ({cf.stat().st_size} bytes)")
    else:
        errors.append(f"Companion file does not exist: {cf}")

print(f"  companion_map keys: {list(companion_map.keys())}")

# ═══ Test 3: _resolve_companion logic (inline) ═══
print("\n=== Test 3: resolve companion ===")
def resolve_companion(datasource, cmap):
    file_part = datasource.split('|')[0].lstrip('./')
    filename = Path(file_part).name.lower()
    return cmap.get(filename)

for l in filtered:
    resolved = resolve_companion(l.datasource, companion_map)
    status = "✓" if resolved else "✗ FAIL"
    print(f"  {status} {l.name!r:40s} → {resolved}")
    if resolved is None:
        errors.append(f"No companion for {l.name!r}")

# ═══ Test 4: table name + fiona_layer ═══
print("\n=== Test 4: table names + fiona_layer ===")
for l in filtered:
    safe = ''.join(c if c.isalnum() or c == '_' else '_' for c in l.name).lower().strip('_')
    table = f"lyr_{safe}"[:63]
    fiona_layer = l.datasource.split('|layername=')[1].split('|')[0] if '|layername=' in l.datasource else None
    print(f"  {l.name!r:40s} → table={table!r}, fiona_layer={fiona_layer!r}")

# ═══ Test 5: extraction conditions ═══
print("\n=== Test 5: would-extract check ===")
EXTRACTABLE = {'gpkg', 'shp', 'geojson', 'fgb'}
for l in filtered:
    is_vec = l.layer_type == 'vector' or l.source_type in EXTRACTABLE
    has_ds = bool(l.datasource)
    has_comp = resolve_companion(l.datasource, companion_map) is not None
    extract = is_vec and has_ds and has_comp
    status = "✓ EXTRACT" if extract else "✗ SKIP"
    print(f"  {status} {l.name!r}  (is_vec={is_vec} has_ds={has_ds} comp={has_comp})")
    if not extract:
        errors.append(f"Would NOT extract {l.name!r}")

# ═══ Summary ═══
print(f"\n{'='*60}")
if errors:
    print(f"FAILURES ({len(errors)}):")
    for e in errors:
        print(f"  ✗ {e}")
    sys.exit(1)
else:
    print("ALL CHECKS PASSED ✓")
    print("\nPipeline logic is correct for caresg test data.")
    print("If lyr_* tables are not created on the server, check:")
    print("  1. Server logs for fiona errors (GDAL mismatch in Docker?)")
    print("  2. Companion files actually received (check debug.companion_files in response)")
    print("  3. psycopg2 COPY FROM STDIN permission or SSL issue")
