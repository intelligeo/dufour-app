#!/bin/bash
# Script to initialize QGIS projects for testing

PROJECTS_DIR="/data/projects"
mkdir -p "$PROJECTS_DIR"

# If no projects exist, create a minimal test project
if [ ! -f "$PROJECTS_DIR/test.qgs" ]; then
    cat > "$PROJECTS_DIR/test.qgs" << 'EOF'
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis projectname="Test Project" version="3.28.0-Firenze">
  <title>Test Project</title>
  <mapcanvas name="theMapCanvas" annotationsVisible="1">
    <units>meters</units>
    <extent>
      <xmin>664577</xmin>
      <ymin>5752993</ymin>
      <xmax>1167741</xmax>
      <ymax>6075303</ymax>
    </extent>
    <rotation>0</rotation>
    <destinationsrs>
      <spatialrefsys>
        <wkt></wkt>
        <proj4>+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs</proj4>
        <srsid>47</srsid>
        <srid>2056</srid>
        <authid>EPSG:2056</authid>
        <description>CH1903+ / LV95</description>
        <projectionacronym>somerc</projectionacronym>
        <ellipsoidacronym>bessel</ellipsoidacronym>
        <geographicflag>false</geographicflag>
      </spatialrefsys>
    </destinationsrs>
  </mapcanvas>
  <projectlayers></projectlayers>
</qgis>
EOF
    echo "✅ Created test.qgs"
fi

echo "Projects in $PROJECTS_DIR:"
ls -lh "$PROJECTS_DIR"
