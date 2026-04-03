# Tactical Graphics Testing Guide

## Overview

This document covers testing the **n-point tactical graphics (MIL-STD-2525D)** implementation for the MSS_Test project in Dufour.app.

### What Was Implemented

**File Modified**: `frontend/js/plugins/MilSymbSupport.jsx`

**New Features**:
- ✅ Detect tactical graphics (LineString/Polygon features with SIDC codes)
- ✅ Extract control points for `/tactical` endpoint
- ✅ Extract modifiers (T, H, status, state) from KadasMilxLayer attributes
- ✅ Apply visual modifiers (planned/actual dashing + affiliation colors)

**Data Flow**:
```
QGIS Project (MSS_Test.qgz)
    ↓ KadasMilxLayer embedded data
Backend (qgz_parser.py)
    ↓ Extracts to MilSymbLayerInfo → GeoJSON FeatureCollection
Frontend (MilSymbSupport.jsx)
    ↓ Detects tactical graphics (LineString/Polygon + SIDC)
Rendering
    ↓ Affiliation colors + planned/actual dashing
Map Display
```

---

## Testing Strategy

### Phase 1: Unit Tests (Local, No Build Required)

Run the test suite in your browser console to validate the tactical graphics detection logic:

```bash
# Open the test file in a text editor
frontend/js/plugins/test_tactical_graphics.js

# Option A: Paste into browser console
# 1. Open DevTools (F12)
# 2. Go to Console tab
# 3. Copy-paste the test file contents
# 4. Run: runTests()

# Option B: Run in Node.js (if Node is available)
node frontend/js/plugins/test_tactical_graphics.js
```

**Expected Output**:
```
══════════════════════════════════════════════════════════════════════
TACTICAL GRAPHICS TEST SUITE
══════════════════════════════════════════════════════════════════════

✓ PASS: Point feature should NOT be tactical
✓ PASS: LineString with SIDC should be tactical
✓ PASS: Polygon with SIDC should be tactical
✓ PASS: LineString without SIDC should NOT be tactical
✓ PASS: Extract control points from LineString
✓ PASS: Extract modifiers from feature
✓ PASS: Detect planned symbol
✓ PASS: Detect actual (non-planned) symbol
✓ PASS: Extract polygon control points without closing point
✓ PASS: Extract military name from feature

──────────────────────────────────────────────────────────────────────
RESULTS: 10 passed, 0 failed out of 10 tests
──────────────────────────────────────────────────────────────────────

✓ ALL TESTS PASSED - Tactical graphics implementation is working correctly!
```

### Phase 2: Backend Data Validation

Verify the KadasMilxLayer data extraction from MSS_Test.qgz:

```bash
cd backend/api

# Run milsymb extraction tests
python -m pytest tests/test_milsymb_refactoring.py -v -k "TestMilsymbLayerToGeoJSON" 

# Expected: All tests pass, showing GeoJSON output contains:
# - sidc property on LineString/Polygon features
# - mssAttributes (T, H, status, state)
# - symbolType (Point, LineString, Polygon)
```

**Sample output structure** from KadasMilxLayer GeoJSON:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[8.22, 46.82], [8.23, 46.83], ...]
      },
      "properties": {
        "sidc": "SFGPEWRPS----X",
        "militaryName": "Route to Assembly",
        "symbolType": "LineString",
        "mssAttributes": {
          "T": "Route Alpha",
          "status": "planned"
        }
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [8.25, 46.85]
      },
      "properties": {
        "sidc": "SFGPUC-----A--G",
        "militaryName": "Alpha Squad",
        "mssAttributes": {
          "T": "Alpha",
          "Z": "50"
        }
      }
    }
  ]
}
```

---

## Phase 3: Integration Testing (Full Stack)

### Prerequisites

1. **Node.js 20+** installed (for webpack build)
2. **Docker** available (for backend + milsymbol-server)
3. **MSS_Test.qgz** available in `qgis-server/projects/` or `ressources/test_qgs/`

### Step 1: Build Frontend

```bash
cd frontend

# Install dependencies (first time only)
npm install

# Build production bundle
npm run build

# Expected output: 
# webpack 5.x.x compiled successfully
# Static assets in ./dist/ or ./prod/
```

### Step 2: Start Backend Services

```bash
# Option A: Docker Compose (recommended)
docker-compose up -d

# Option B: Local Python
cd backend/api
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python main.py

# Expected: API running on http://localhost:8000
```

### Step 3: Verify MSS_Test.qgz Data

```bash
# Check if project is available
curl http://localhost:8000/api/projects

# Fetch theme config (includes milsymbLayers)
curl http://localhost:8000/api/themes.json?project=MSS_Test | jq '.themes[].name,.themes[].milsymbLayers'

# Expected output:
{
  "name": "MSS Test",
  "milsymbLayers": [
    {
      "title": "BLUE FORCE",
      "geojsonUrl": "/api/projects/MSS_Test/milsymb/BLUE_FORCE.geojson",
      "symbolBaseUrl": "/api/symbols",
      "affiliation": "friendly"
    },
    {
      "title": "RED FORCE",
      "geojsonUrl": "/api/projects/MSS_Test/milsymb/RED_FORCE.geojson",
      "affiliation": "hostile"
    }
  ]
}
```

### Step 4: Fetch GeoJSON from MSS_Test

```bash
# Fetch BLUE FORCE (friendly) layer
curl http://localhost:8000/api/projects/MSS_Test/milsymb/BLUE_FORCE.geojson | jq '.features[0:2]'

# Expected output: Features with sidc + mssAttributes
{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [[...], [...]]
  },
  "properties": {
    "sidc": "SFGPEWRPS----X",
    "militaryName": "Movement Route",
    "mssAttributes": {
      "T": "Route Alpha",
      "status": "planned"
    }
  }
}
```

### Step 5: Visual Testing in Browser

1. **Open Dufour.app**: `http://localhost/` (or your deployment URL)
2. **Select MSS_Test project** from project list
3. **Verify tactical graphics appear**:
   - ✅ LineString features (routes) appear as **colored lines with dashing** (if planned)
   - ✅ Polygon features (areas) appear as **colored polygons with semi-transparent fill**
   - ✅ Point features (unit symbols) appear as **SVG icons**
   - ✅ **Affiliation colors**:
     - 🔵 Blue for friendly
     - 🔴 Red for hostile
     - 🟢 Green for neutral
     - 🟡 Yellow for unknown
   - ✅ **Planned symbols** (status='planned') have **dashed strokes**
   - ✅ **Actual symbols** (status='actual') have **solid strokes**

4. **Test zoom interactions**:
   - Pan and zoom the map
   - Verify tactical graphics remain visible and properly positioned
   - Check that unit names (from T modifier) display if MilSymbSupport renders labels

5. **Test layer visibility**:
   - Toggle layer visibility in LayerTree (if integrated)
   - Verify tactical graphics toggle on/off

---

## Expected Visual Results

### Before Implementation
- LineString/Polygon KadasMilxLayer features render as **simple colored lines**
- No distinction between planned and actual symbols
- No modifier information displayed

### After Implementation
- LineString/Polygon features detect SIDC code
- **Movement routes** render with:
  - Affiliation color (blue/red/green/yellow)
  - Dashing if marked as "planned"
  - Unit name/designation from T modifier (if label support added)
  
- **Unit positions** (Point features) render as:
  - Tactical symbols via `/api/symbols/{SIDC}.svg`
  - Label with unit name if available
  
- **Tactical areas** (Polygon features) render with:
  - Affiliation color stroke + semi-transparent fill
  - Dashing if planned
  - Area designation from properties

---

## Validation Checklist

- [ ] Unit tests pass: `runTests()` in browser console → all 10 tests pass
- [ ] Backend tests pass: `pytest tests/test_milsymb_refactoring.py` → no failures
- [ ] Frontend builds without errors: `npm run build` → completed successfully
- [ ] MSS_Test.qgz loads: Browser shows project in list
- [ ] Theme config includes milsymbLayers: Curl `/api/themes.json?project=MSS_Test` returns layers
- [ ] GeoJSON is valid: Curl `/api/projects/MSS_Test/milsymb/BLUE_FORCE.geojson` returns FeatureCollection
- [ ] Tactical graphics render visually:
  - LineString/Polygon features appear with correct affiliation colors
  - Planned symbols have dashed strokes
  - Point symbols display as SVG icons
  - Map is interactive (pan/zoom work)

---

## Troubleshooting

### Issue: "mil-sym-ts not available on this server"

**Cause**: milsymbol-server doesn't have `@armyc2.c5isr.renderer/mil-sym-ts` package installed

**Solution**:
```bash
cd milsymbol-server
npm install @armyc2.c5isr.renderer/mil-sym-ts
npm start
```

### Issue: GeoJSON features don't have SIDC property

**Cause**: KadasMilxLayer data not properly extracted by backend

**Solution**:
```bash
# Check if MSS_Test.qgz contains KadasMilxLayer data
cd backend/api
python -c "
from services.qgz_parser import QGZParser
from pathlib import Path

qgz = Path('../../qgis-server/projects/MSS_Test.qgz')
with QGZParser(qgz) as p:
    p.extract()
    p.parse_xml()
    layers = p.parse_milsymb_layers()
    for l in layers:
        print(f'Layer: {l.title}, Features: {len(l.features)}')
        if l.features:
            print(f'  First feature SIDC: {l.features[0].sidc}')
"
```

### Issue: Planned/actual dashing not showing

**Cause**: CSS or OpenLayers version issue with `lineDash` property

**Solution**:
1. Check OpenLayers version in `package.json` (should be 5.x)
2. Verify CSS loads correctly: `F12` → Network tab → check for CSS 404s
3. Test manually in console:
   ```javascript
   new ol.style.Stroke({lineDash: [8, 4]})  // should not throw
   ```

### Issue: Affiliation colors not appearing

**Cause**: `mssAttributes.affiliation` not set in GeoJSON metadata

**Solution**: Check that `milsymb_service.py` is correctly reading affiliation from KadasMilxLayer:
```python
# In milsymb_service.py line ~74
"metadata": {
    "affiliation": layer.affiliation  # ← should be friendly/hostile/neutral/unknown
}
```

---

## Next Steps

### Optional Enhancements

1. **Add tactical shape rendering** (currently: affiliation colors only):
   - Fetch `/tactical?sidc=...&points=...&format=geosvg`
   - Use returned SVG as `ol.style.Icon` for authentic MIL-STD-2525D shapes

2. **Add waypoint labels** (currently: no control point labels):
   - Extract lon/lat from control points
   - Render numeric labels (1, 2, 3, ...) at each waypoint
   - Update on size change

3. **Add animated active state**:
   - Flashing or pulse effect for "active" symbols
   - Use CSS animation or requestAnimationFrame

4. **Integrate with LayerTree**:
   - Show tactical graphics in layer panel
   - Allow toggling visibility per symbol/group
   - Show symbol properties on click

---

## Support Resources

- **OpenLayers Documentation**: https://openlayers.org/doc/
- **MIL-STD-2525D Specification**: https://www.dtic.mil/dtic/tr/fulltext/u2/a653048.pdf
- **mil-sym-ts Repository**: https://github.com/ArmyC2/mil-sym-ts
- **Dufour.app Documentation**: See parent project README

---

## Testing Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1 (Unit Tests) | ~5 min | Ready |
| Phase 2 (Backend Tests) | ~2 min | Ready |
| Phase 3a (Build) | ~3-5 min | Depends on Node.js |
| Phase 3b (Visual Test) | ~5-10 min | Depends on build |
| Total (with build) | ~20 min | Estimated |

---

**Document Created**: April 3, 2026  
**Implementation Version**: 1.0  
**Status**: Ready for Testing
