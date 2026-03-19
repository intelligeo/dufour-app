"""
Quick test of the full extraction pipeline logic WITHOUT fiona.
Tests the parsing, filtering, companion resolution, and table name generation.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from pathlib import Path
from services.qgz_parser import QGZParser
from services.project_migrator import ProjectMigrator, LayerRecord, _schema_name

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

# Simulate embedded files
with QGZParser(CARESG_QGZ) as parser:
    parser.extract()
    parser.parse_xml()
    if parser.temp_dir and parser.temp_dir.exists():
        for f in parser.temp_dir.rglob('*'):
            if f.is_file() and f.suffix.lower() in COMPANION_EXTENSIONS:
                companion_map.setdefault(f.name.lower(), f)
                print(f"  [embedded] {f.name.lower()}")

# Add uploaded files
for cf in companion_files:
    if cf.exists():
        companion_map[cf.name.lower()] = cf
        print(f"  [uploaded] {cf.name.lower()}")
    else:
        print(f"  [MISSING!] {cf}")
        errors.append(f"Companion file does not exist: {cf}")

print(f"  companion_map keys: {list(companion_map.keys())}")

if 'caresg_mu.gpkg' not in companion_map:
    errors.append("'caresg_mu.gpkg' not in companion_map")

# ═══ Test 3: _resolve_companion ═══
print("\n=== Test 3: _resolve_companion ===")
migrator = ProjectMigrator.__new__(ProjectMigrator)

for l in filtered:
    resolved = migrator._resolve_companion(l.datasource, companion_map)
    status = "✓" if resolved else "✗ FAIL"
    print(f"  {status} {l.name!r:40s} → {resolved}")
    if resolved is None:
        errors.append(f"No companion for {l.name!r} (ds={l.datasource!r})")

# ═══ Test 4: table name generation ═══
print("\n=== Test 4: table name generation ===")
# Inline the logic from LayerExtractor._generate_table_name
for l in filtered:
    safe_layer = ''.join(c if c.isalnum() or c == '_' else '_' for c in l.name)
    safe_layer = safe_layer.lower().strip('_')
    table_name = f"lyr_{safe_layer}"
    if len(table_name) > 63:
        table_name = table_name[:63]
    print(f"  {l.name!r:40s} → {table_name}")

# ═══ Test 5: fiona_layer extraction from datasource ═══
print("\n=== Test 5: fiona_layer from datasource ===")
for l in filtered:
    fiona_layer = None
    if '|layername=' in l.datasource:
        fiona_layer = l.datasource.split('|layername=')[1].split('|')[0]
    print(f"  {l.name!r:40s} → fiona_layer={fiona_layer!r}")
    if fiona_layer is None:
        errors.append(f"No fiona_layer for {l.name!r}")

# ═══ Test 6: extraction loop conditions ═══
print("\n=== Test 6: extraction loop check ===")
EXTRACTABLE_SOURCE_TYPES = {'gpkg', 'shp', 'geojson', 'fgb'}

layer_records = [
    LayerRecord(
        layer_name=li.name,
        layer_type=li.layer_type or 'unknown',
        geometry_type=li.geometry_type or '',
        source_type=li.source_type or 'unknown',
        datasource=li.datasource or '',
        crs=li.crs or 'EPSG:2056',
        qgs_layer_id=li.id,
    )
    for li in filtered
]

for rec in layer_records:
    is_vector = (
        rec.layer_type == 'vector'
        or rec.source_type in EXTRACTABLE_SOURCE_TYPES
    )
    has_ds = bool(rec.datasource)
    companion = migrator._resolve_companion(rec.datasource, companion_map)
    
    would_extract = is_vector and has_ds and companion is not None
    
    status = "✓ EXTRACT" if would_extract else "✗ SKIP"
    print(f"  {status} {rec.layer_name!r}")
    print(f"    is_vector={is_vector}, has_ds={has_ds}, companion={'found' if companion else 'NONE'}")
    
    if not would_extract:
        errors.append(f"Layer {rec.layer_name!r} would NOT be extracted!")

# ═══ Summary ═══
print(f"\n{'='*60}")
if errors:
    print(f"FAILURES ({len(errors)}):")
    for e in errors:
        print(f"  ✗ {e}")
else:
    print("ALL CHECKS PASSED ✓")
    print("The extraction pipeline logic is correct for caresg test data.")
    print("If lyr_* tables are not created on the server, the issue is:")
    print("  1. fiona import/open failure in Docker (GDAL version mismatch?)")
    print("  2. Database connection issue (psycopg2 raw_connection)")  
    print("  3. Companion files not received by the server (multipart form)")
