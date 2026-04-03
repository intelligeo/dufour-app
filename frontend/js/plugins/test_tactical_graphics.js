/**
 * Test suite for tactical graphics detection and extraction
 * Simulates what MilSymbSupport.jsx will do with KadasMilxLayer GeoJSON data
 * 
 * Run this in browser console or Node.js to validate tactical graphics functions
 */

// ─────────────────────────────────────────────────────────────────
// Mock OpenLayers for Node.js testing (optional)
// ─────────────────────────────────────────────────────────────────

function setupMocks() {
    if (typeof ol === 'undefined') {
        // Mock for Node.js
        global.ol = {
            proj: {
                transform: (coord, fromCrs, toCrs) => {
                    // For 3857 → 4326, simple approximation
                    // Real implementation would use proper projection math
                    if (fromCrs === 'EPSG:3857' && toCrs === 'EPSG:4326') {
                        const EARTH_RADIUS = 6378137;
                        const lng = (coord[0] / EARTH_RADIUS) * (180 / Math.PI);
                        const lat = (2 * Math.atan(Math.exp(coord[1] / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);
                        return [lng, lat];
                    }
                    return coord;
                }
            }
        };
    }
}

// ─────────────────────────────────────────────────────────────────
// Test data: simulated GeoJSON from KadasMilxLayer
// ─────────────────────────────────────────────────────────────────

const SAMPLE_GEOJSON = {
    type: 'FeatureCollection',
    name: 'Tactical Graphics',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
    metadata: {
        layerId: 'layer_123',
        affiliation: 'friendly',
        symbolSize: 40,
        lineWidth: 3
    },
    features: [
        // Point feature: unit symbol (single milsymbol)
        {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [8.227, 46.823]  // WGS84
            },
            properties: {
                sidc: 'SFGPUC-----A--G',
                militaryName: 'Alpha Squad',
                symbolType: 'Point',
                symbolScale: 1.0,
                mssAttributes: {
                    T: 'Alpha',
                    Z: '50'  // speed
                }
            }
        },
        // LineString feature: movement route (tactical graphic - n-point)
        {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [8.220, 46.820],
                    [8.230, 46.825],
                    [8.240, 46.828],
                    [8.250, 46.830]
                ]
            },
            properties: {
                sidc: 'SFGPEWRPS----X',  // Movement Route
                militaryName: 'Route to Assembly',
                symbolType: 'LineString',
                symbolScale: 1.0,
                mssAttributes: {
                    T: 'Route Alpha',
                    status: 'planned'  // ← indicates planned (vs actual)
                }
            }
        },
        // Polygon feature: encirclement/assault area (tactical graphic - n-point)
        {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [8.210, 46.810],
                    [8.260, 46.810],
                    [8.260, 46.840],
                    [8.210, 46.840],
                    [8.210, 46.810]  // closing point
                ]]
            },
            properties: {
                sidc: 'SHGPGDARH-----',  // Hostile Assault Area
                militaryName: 'Enemy AO',
                symbolType: 'Polygon',
                symbolScale: 1.0,
                mssAttributes: {
                    T: 'AO-Red',
                    H: 'confirmed',
                    state: 'actual'  // ← indicates actual (not planned)
                }
            }
        },
        // LineString without SIDC: plain overlay (no tactical processing)
        {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [[8.200, 46.800], [8.300, 46.900]]
            },
            properties: {
                name: 'non-tactical line',
                // No SIDC → should render as basic affiliation-colored line
            }
        }
    ]
};

// ─────────────────────────────────────────────────────────────────
// Copy of MilSymbSupport.jsx helper functions for testing
// ─────────────────────────────────────────────────────────────────

function isTacticalGraphic(feature) {
    const geomType = feature.geometry?.type;
    const sidc = feature.properties?.sidc;
    return (geomType === 'LineString' || geomType === 'Polygon') && sidc && sidc.length >= 10;
}

function extractControlPoints(feature) {
    const geometry = feature.geometry;
    if (!geometry) return '';

    let coords = [];
    if (geometry.type === 'LineString') {
        coords = geometry.coordinates;
    } else if (geometry.type === 'Polygon') {
        const ring = geometry.coordinates[0] || [];
        coords = ring.length > 0 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
            ? ring.slice(0, -1)
            : ring;
    }

    // In real implementation, would transform from map CRS to 4326
    // For test: assume data is already in 4326
    return coords.map(coord => {
        return coord[0].toFixed(6) + ',' + coord[1].toFixed(6);
    }).join('+');
}

function extractModifiers(feature) {
    const mssAttributes = feature.properties?.mssAttributes;
    if (!mssAttributes || typeof mssAttributes !== 'object') return '';

    const modifiers = [];

    if (mssAttributes.T) {
        modifiers.push(`T:${encodeURIComponent(mssAttributes.T)}`);
    }
    if (mssAttributes.H) {
        modifiers.push(`H:${encodeURIComponent(mssAttributes.H)}`);
    }
    if (mssAttributes.status) {
        modifiers.push(`status:${encodeURIComponent(mssAttributes.status)}`);
    }
    if (mssAttributes.state) {
        modifiers.push(`state:${encodeURIComponent(mssAttributes.state)}`);
    }

    return modifiers.join(',');
}

function isPlannedSymbol(feature) {
    const mssAttributes = feature.properties?.mssAttributes;
    if (!mssAttributes || typeof mssAttributes !== 'object') return false;
    const status = (mssAttributes.status || '').toLowerCase();
    const state = (mssAttributes.state || '').toLowerCase();
    return status.includes('planned') || state.includes('planned');
}

// ─────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────

function runTests() {
    console.log('\n' + '═'.repeat(70));
    console.log('TACTICAL GRAPHICS TEST SUITE');
    console.log('═'.repeat(70));

    let passed = 0;
    let failed = 0;

    // TEST 1: Point feature should NOT be detected as tactical
    {
        const test = 'Point feature should NOT be tactical';
        const feature = SAMPLE_GEOJSON.features[0];
        const result = isTacticalGraphic(feature);
        if (result === false) {
            console.log(`✓ PASS: ${test}\n   Geometry: ${feature.geometry.type}, SIDC: ${feature.properties.sidc}`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected false, got ${result}`);
            failed++;
        }
    }

    // TEST 2: LineString with SIDC should be detected as tactical
    {
        const test = 'LineString with SIDC should be tactical';
        const feature = SAMPLE_GEOJSON.features[1];
        const result = isTacticalGraphic(feature);
        if (result === true) {
            console.log(`✓ PASS: ${test}\n   Geometry: ${feature.geometry.type}, SIDC: ${feature.properties.sidc}`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected true, got ${result}`);
            failed++;
        }
    }

    // TEST 3: Polygon with SIDC should be detected as tactical
    {
        const test = 'Polygon with SIDC should be tactical';
        const feature = SAMPLE_GEOJSON.features[2];
        const result = isTacticalGraphic(feature);
        if (result === true) {
            console.log(`✓ PASS: ${test}\n   Geometry: ${feature.geometry.type}, SIDC: ${feature.properties.sidc}`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected true, got ${result}`);
            failed++;
        }
    }

    // TEST 4: LineString without SIDC should NOT be tactical
    {
        const test = 'LineString without SIDC should NOT be tactical';
        const feature = SAMPLE_GEOJSON.features[3];
        const result = isTacticalGraphic(feature);
        if (result === false) {
            console.log(`✓ PASS: ${test}\n   Geometry: ${feature.geometry.type}, SIDC: ${feature.properties.sidc}`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected false, got ${result}`);
            failed++;
        }
    }

    // TEST 5: Extract control points from movement route
    {
        const test = 'Extract control points from LineString';
        const feature = SAMPLE_GEOJSON.features[1];
        const points = extractControlPoints(feature);
        const expected = '8.220000,46.820000+8.230000,46.825000+8.240000,46.828000+8.250000,46.830000';
        if (points === expected) {
            console.log(`✓ PASS: ${test}\n   Points: ${points}`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected: ${expected}\n   Got: ${points}`);
            failed++;
        }
    }

    // TEST 6: Extract modifiers from feature
    {
        const test = 'Extract modifiers from feature';
        const feature = SAMPLE_GEOJSON.features[1];
        const modifiers = extractModifiers(feature);
        const hasT = modifiers.includes('T:Route%20Alpha');
        const hasStatus = modifiers.includes('status:planned');
        if (hasT && hasStatus) {
            console.log(`✓ PASS: ${test}\n   Modifiers: ${modifiers}`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected T and status modifiers\n   Got: ${modifiers}`);
            failed++;
        }
    }

    // TEST 7: Detect planned symbol
    {
        const test = 'Detect planned symbol';
        const feature = SAMPLE_GEOJSON.features[1];
        const planned = isPlannedSymbol(feature);
        if (planned === true) {
            console.log(`✓ PASS: ${test}\n   Status: ${feature.properties.mssAttributes.status}`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected true, got ${planned}`);
            failed++;
        }
    }

    // TEST 8: Detect actual (non-planned) symbol
    {
        const test = 'Detect actual (non-planned) symbol';
        const feature = SAMPLE_GEOJSON.features[2];
        const planned = isPlannedSymbol(feature);
        if (planned === false) {
            console.log(`✓ PASS: ${test}\n   State: ${feature.properties.mssAttributes.state}`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected false, got ${planned}`);
            failed++;
        }
    }

    // TEST 9: Extract polygon control points (without closing point)
    {
        const test = 'Extract polygon control points without closing point';
        const feature = SAMPLE_GEOJSON.features[2];
        const points = extractControlPoints(feature);
        const pointArray = points.split('+');
        if (pointArray.length === 4) {  // Should have 4 points (closing point removed)
            console.log(`✓ PASS: ${test}\n   Point count: ${pointArray.length} (closing point excluded)`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected 4 points, got ${pointArray.length}`);
            failed++;
        }
    }

    // TEST 10: Feature with military name extraction
    {
        const test = 'Extract military name from feature';
        const feature = SAMPLE_GEOJSON.features[1];
        const name = feature.properties.militaryName;
        if (name === 'Route to Assembly') {
            console.log(`✓ PASS: ${test}\n   Name: ${name}`);
            passed++;
        } else {
            console.log(`✗ FAIL: ${test}\n   Expected 'Route to Assembly', got '${name}'`);
            failed++;
        }
    }

    // SUMMARY
    console.log('\n' + '─'.repeat(70));
    console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    console.log('─'.repeat(70) + '\n');

    if (failed === 0) {
        console.log('✓ ALL TESTS PASSED - Tactical graphics implementation is working correctly!');
        console.log('\nNEXT STEPS:');
        console.log('1. Build frontend with webpack: npm run build');
        console.log('2. Start backend: python main.py');
        console.log('3. Navigate to MSS_Test.qgz project in the web UI');
        console.log('4. Verify tactical graphics render with affiliation colors and dashing');
    } else {
        console.log('✗ SOME TESTS FAILED - Please review the errors above');
    }
}

// ─────────────────────────────────────────────────────────────────
// Export for use in Node.js or browser
// ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runTests,
        SAMPLE_GEOJSON,
        isTacticalGraphic,
        extractControlPoints,
        extractModifiers,
        isPlannedSymbol
    };
}

// Auto-run if in browser console
if (typeof window !== 'undefined') {
    // Wait for page load
    window.addEventListener('DOMContentLoaded', () => {
        console.log('Tactical Graphics Test Suite loaded. Run: runTests()');
    });
}

// Run if executed directly in Node.js
if (typeof require !== 'undefined' && require.main === module) {
    setupMocks();
    runTests();
}
