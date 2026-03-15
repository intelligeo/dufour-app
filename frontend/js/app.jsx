/**
 * Dufour.app QWC2 Application Entry Point
 * Web GIS based on QGIS Web Client 2
 */

import React from 'react';
import {createRoot} from 'react-dom/client';
import {register as olProj4Register} from 'ol/proj/proj4';
import Proj4js from 'proj4';
import StandardApp from 'qwc2/components/StandardApp';
import appConfig from './appConfig';
import '../icons/build/qwc2-icons.css';

// Register pseudo-CRS for WGS84 format variants before StandardApp loads.
// These share the EPSG:4326 proj4 definition but have distinct codes so that
// CoordinatesUtils.getProjectionConfig() can look up their format/addDirection/
// swapLonLat settings from config.json and BottomBar can display them separately.
const wgs84Proj = '+proj=longlat +datum=WGS84 +no_defs';
['WGS84-DMS', 'WGS84-DM'].forEach(code => {
    if (Proj4js.defs(code) === undefined) {
        Proj4js.defs(code, wgs84Proj);
    }
});
olProj4Register(Proj4js);

const container = document.getElementById('container');
const root = createRoot(container);
root.render(<StandardApp appConfig={appConfig}/>);

