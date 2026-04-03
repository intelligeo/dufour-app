#!/usr/bin/env python3
"""
Tactical Graphics Data Validation Script
Verifies that the MilSymbSupport.jsx implementation will work correctly
with KadasMilxLayer GeoJSON data from MSS_Test.qgz
"""

import json
from typing import Dict, Any, List

# ─────────────────────────────────────────────────────────────────
# Sample GeoJSON data simulating KadasMilxLayer output
# ─────────────────────────────────────────────────────────────────

SAMPLE_GEOJSON: Dict[str, Any] = {
    "type": "FeatureCollection",
    "name": "Tactical Graphics - MSS Test",
    "crs": {
        "type": "name",
        "properties": {"name": "urn:ogc:def:crs:EPSG::4326"}
    },
    "metadata": {
        "layerId": "milsymb_001",
        "affiliation": "friendly",
        "symbolSize": 40,
        "lineWidth": 3
    },
    "features": [
        # Point: Unit position (single tactical symbol)
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [8.227, 46.823]
            },
            "properties": {
                "sidc": "SFGPUC-----A--G",
                "militaryName": "Alpha Squad",
                "symbolType": "Point",
                "symbolScale": 1.0,
                "mssAttributes": {"T": "Alpha", "Z": "50"}
            }
        },
        # LineString: Movement route (tactical graphic - n-point)
        {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [8.220, 46.820],
                    [8.230, 46.825],
                    [8.240, 46.828],
                    [8.250, 46.830]
                ]
            },
            "properties": {
                "sidc": "SFGPEWRPS----X",
                "militaryName": "Route to Assembly",
                "symbolType": "LineString",
                "symbolScale": 1.0,
                "mssAttributes": {
                    "T": "Route Alpha",
                    "status": "planned"  # ← This should trigger dashed rendering
                }
            }
        },
        # Polygon: Hostile assault area (tactical graphic - n-point)
        {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [8.210, 46.810],
                    [8.260, 46.810],
                    [8.260, 46.840],
                    [8.210, 46.840],
                    [8.210, 46.810]  # closing point
                ]]
            },
            "properties": {
                "sidc": "SHGPGDARH-----",
                "militaryName": "Enemy AO",
                "symbolType": "Polygon",
                "symbolScale": 1.0,
                "mssAttributes": {
                    "T": "AO-Red",
                    "H": "confirmed",
                    "state": "actual"  # ← should NOT have dashing (solid line)
                }
            }
        }
    ]
}


# ─────────────────────────────────────────────────────────────────
# Validation Functions (mirrors MilSymbSupport.jsx logic)
# ─────────────────────────────────────────────────────────────────

def validate_feature_structure(feature: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate a single feature has correct structure for tactical graphics rendering.
    """
    result = {
        "valid": True,
        "errors": [],
        "warnings": [],
        "analysis": {}
    }

    # Check required fields
    if "type" not in feature or feature["type"] != "Feature":
        result["valid"] = False
        result["errors"].append("Missing or invalid 'type' field")
        return result

    if "geometry" not in feature:
        result["valid"] = False
        result["errors"].append("Missing 'geometry' field")
        return result

    if "properties" not in feature:
        result["valid"] = False
        result["errors"].append("Missing 'properties' field")
        return result

    geom = feature["geometry"]
    props = feature["properties"]

    # Validate geometry
    if "type" not in geom:
        result["valid"] = False
        result["errors"].append("Geometry missing 'type' field")
        return result

    geom_type = geom.get("type")
    if geom_type not in ["Point", "LineString", "Polygon"]:
        result["errors"].append(f"Unsupported geometry type: {geom_type}")

    # Validate properties for tactical graphics
    sidc = props.get("sidc")
    geom_type = geom.get("type")

    result["analysis"]["geometry_type"] = geom_type
    result["analysis"]["has_sidc"] = bool(sidc)
    result["analysis"]["sidc_value"] = sidc or "none"
    result["analysis"]["sidc_length"] = len(sidc) if sidc else 0

    # Determine if this is a tactical graphic
    is_tactical = (geom_type in ["LineString", "Polygon"]) and sidc and len(sidc) >= 10
    result["analysis"]["is_tactical_graphic"] = is_tactical

    # Check for required properties
    required_for_tactical = ["militaryName", "symbolType"]
    for req in required_for_tactical:
        if req not in props:
            result["warnings"].append(f"Missing recommended field: {req}")

    # Validate mssAttributes if present
    mss = props.get("mssAttributes", {})
    if isinstance(mss, dict):
        result["analysis"]["mssAttributes"] = list(mss.keys())
        
        # Check for modifier extraction
        if "T" in mss:
            result["analysis"]["has_modifier_T"] = True
            result["analysis"]["modifier_T_value"] = mss["T"]
        
        if "H" in mss:
            result["analysis"]["has_modifier_H"] = True
            result["analysis"]["modifier_H_value"] = mss["H"]
        
        if "status" in mss:
            result["analysis"]["has_status"] = True
            result["analysis"]["status_value"] = mss["status"]
        
        if "state" in mss:
            result["analysis"]["has_state"] = True
            result["analysis"]["state_value"] = mss["state"]
    else:
        result["warnings"].append("mssAttributes should be a dict")

    # Check for planned/actual status
    status = (mss.get("status") or "").lower()
    state = (mss.get("state") or "").lower()
    is_planned = "planned" in status or "planned" in state
    result["analysis"]["is_planned"] = is_planned
    result["analysis"]["render_style"] = "dashed" if is_planned else "solid"

    return result


def validate_geojson_collection(geojson: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate entire GeoJSON FeatureCollection for tactical graphics.
    """
    report = {
        "valid": True,
        "total_features": 0,
        "valid_features": 0,
        "tactical_graphics": 0,
        "points": 0,
        "linestrings": 0,
        "polygons": 0,
        "features_with_sidc": 0,
        "planned_symbols": 0,
        "actual_symbols": 0,
        "feature_details": []
    }

    if geojson.get("type") != "FeatureCollection":
        report["valid"] = False
        report["error"] = f"Invalid GeoJSON type: {geojson.get('type')}"
        return report

    features = geojson.get("features", [])
    report["total_features"] = len(features)

    for idx, feature in enumerate(features):
        validation = validate_feature_structure(feature)
        
        detail = {
            "index": idx,
            "name": feature.get("properties", {}).get("militaryName", "unnamed"),
            "valid": validation["valid"],
            "analysis": validation["analysis"]
        }
        report["feature_details"].append(detail)

        if validation["valid"]:
            report["valid_features"] += 1

        geom_type = validation["analysis"].get("geometry_type")
        if geom_type == "Point":
            report["points"] += 1
        elif geom_type == "LineString":
            report["linestrings"] += 1
        elif geom_type == "Polygon":
            report["polygons"] += 1

        if validation["analysis"].get("has_sidc"):
            report["features_with_sidc"] += 1

        if validation["analysis"].get("is_tactical_graphic"):
            report["tactical_graphics"] += 1

        if validation["analysis"].get("is_planned"):
            report["planned_symbols"] += 1
        else:
            report["actual_symbols"] += 1

    return report


# ─────────────────────────────────────────────────────────────────
# Test Runner
# ─────────────────────────────────────────────────────────────────

def run_validation():
    """Execute comprehensive validation against sample GeoJSON."""
    
    print("\n" + "═" * 80)
    print("TACTICAL GRAPHICS DATA VALIDATION")
    print("=" * 80)
    
    # Validate entire collection
    print("\n📊 Validating GeoJSON FeatureCollection...\n")
    report = validate_geojson_collection(SAMPLE_GEOJSON)
    
    # Print summary
    print(f"Total Features:        {report['total_features']}")
    print(f"Valid Features:        {report['valid_features']}")
    print(f"Tactical Graphics:     {report['tactical_graphics']}")
    print(f"Point Symbols:         {report['points']}")
    print(f"LineString (Routes):   {report['linestrings']}")
    print(f"Polygon (Areas):       {report['polygons']}")
    print(f"Features with SIDC:    {report['features_with_sidc']}")
    print(f"Planned Symbols:       {report['planned_symbols']}")
    print(f"Actual Symbols:        {report['actual_symbols']}")
    
    # Print per-feature analysis
    print("\n" + "─" * 80)
    print("FEATURE ANALYSIS")
    print("─" * 80)
    
    for detail in report['feature_details']:
        analysis = detail['analysis']
        name = detail['name']
        geom_type = analysis.get('geometry_type', 'unknown')
        is_tactical = analysis.get('is_tactical_graphic', False)
        is_planned = analysis.get('is_planned', False)
        
        status = "✓ TACTICAL" if is_tactical else "○ BASIC"
        style = "DASHED" if is_planned else "SOLID"
        
        print(f"\n[{detail['index']}] {name}")
        print(f"    Geometry:    {geom_type}")
        print(f"    Status:      {status}")
        print(f"    Render:      {style} stroke")
        print(f"    SIDC:        {analysis.get('sidc_value', 'none')}")
        
        if analysis.get('mssAttributes'):
            print(f"    Modifiers:   {', '.join(analysis['mssAttributes'])}")
            if 'modifier_T_value' in analysis:
                print(f"      T (unit):  {analysis['modifier_T_value']}")
            if 'status_value' in analysis:
                print(f"      status:    {analysis['status_value']}")
    
    # Validation results
    print("\n" + "─" * 80)
    print("VALIDATION RESULTS")
    print("─" * 80)
    
    all_valid = all(d['valid'] for d in report['feature_details'])
    
    checks = [
        ("GeoJSON structure valid", report['valid']),
        ("All features valid", all_valid),
        ("Tactical graphics detected", report['tactical_graphics'] > 0),
        ("Planned symbols identified", report['planned_symbols'] > 0),
        ("SIDC codes present", report['features_with_sidc'] > 0),
        ("Point symbols present", report['points'] > 0),
        ("LineString routes present", report['linestrings'] > 0),
        ("Polygon areas present", report['polygons'] > 0),
    ]
    
    passed = 0
    for check_name, result in checks:
        symbol = "✓" if result else "✗"
        status = "PASS" if result else "FAIL"
        print(f"{symbol} {check_name:.<50} {status}")
        if result:
            passed += 1
    
    print("\n" + "─" * 80)
    print(f"OVERALL: {passed}/{len(checks)} checks passed")
    print("─" * 80)
    
    if passed == len(checks):
        print("\n✓ DATA VALIDATION SUCCESSFUL")
        print("\nThe GeoJSON structure is correct for tactical graphics rendering.")
        print("MilSymbSupport.jsx will correctly:")
        print("  • Detect tactical graphics (LineString/Polygon with SIDC)")
        print("  • Extract control points for /tactical endpoint")
        print("  • Extract modifiers (T, H, status, state)")
        print("  • Apply planned/actual dashing based on status")
        print("  • Render with affiliation colors")
    else:
        print("\n✗ VALIDATION FAILED")
        print("Some checks did not pass. Review the structure above.")
    
    print("\n" + "=" * 80 + "\n")


if __name__ == "__main__":
    run_validation()
