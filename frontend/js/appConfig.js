/**
 * Dufour.app QWC2 Application Configuration
 * Plugin registration aligned with qwc2-demo-app.
 * Custom additions: coordinateFormatter (MGRS/DMS/DM), MilSymb plugins.
 */

/* eslint-disable new-cap */

import {transform as olTransform} from 'ol/proj';

import {forward as mgrsForward} from 'mgrs';

import AppMenu from 'qwc2/components/AppMenu';
import FullscreenSwitcher from 'qwc2/components/FullscreenSwitcher';
import SearchBox from 'qwc2/components/SearchBox';
import Toolbar from 'qwc2/components/Toolbar';
import APIPlugin from 'qwc2/plugins/API';
import AttributeTablePlugin from 'qwc2/plugins/AttributeTable';
import AuthenticationPlugin from 'qwc2/plugins/Authentication';
import BackgroundSwitcherPlugin from 'qwc2/plugins/BackgroundSwitcher';
import BookmarkPlugin from 'qwc2/plugins/Bookmark';
import BottomBarPlugin from 'qwc2/plugins/BottomBar';
import CookiePopupPlugin from 'qwc2/plugins/CookiePopup';
import CyclomediaPlugin from 'qwc2/plugins/Cyclomedia';
import EditingPlugin from 'qwc2/plugins/Editing';
import FeatureFormPlugin from 'qwc2/plugins/FeatureForm';
import FeatureSearchPlugin from 'qwc2/plugins/FeatureSearch';
import GeometryDigitizerPlugin from 'qwc2/plugins/GeometryDigitizer';
import HeightProfilePlugin from 'qwc2/plugins/HeightProfile';
import HelpPlugin from 'qwc2/plugins/Help';
import HomeButtonPlugin from 'qwc2/plugins/HomeButton';
import IdentifyPlugin from 'qwc2/plugins/Identify';
import LayerCatalogPlugin from 'qwc2/plugins/LayerCatalog';
import LayerTreePlugin from 'qwc2/plugins/LayerTree';
import LocateButtonPlugin from 'qwc2/plugins/LocateButton';
import MapPlugin from 'qwc2/plugins/Map';
import MapComparePlugin from 'qwc2/plugins/MapCompare';
import MapCopyrightPlugin from 'qwc2/plugins/MapCopyright';
import MapExportPlugin from 'qwc2/plugins/MapExport';
import MapFilterPlugin from 'qwc2/plugins/MapFilter';
import MapInfoTooltipPlugin from 'qwc2/plugins/MapInfoTooltip';
import MapLegendPlugin from 'qwc2/plugins/MapLegend';
import MapTipPlugin from 'qwc2/plugins/MapTip';
import MeasurePlugin from 'qwc2/plugins/Measure';
import NewsPopupPlugin from 'qwc2/plugins/NewsPopup';
import ObjectListPlugin from 'qwc2/plugins/ObjectList';
import ObliqueViewPlugin from 'qwc2/plugins/ObliqueView';
import OverviewMapPlugin from 'qwc2/plugins/OverviewMap';
import PanoramaxPlugin from 'qwc2/plugins/Panoramax';
import PortalPlugin from 'qwc2/plugins/Portal';
import PrintPlugin from 'qwc2/plugins/Print';
import RedliningPlugin from 'qwc2/plugins/Redlining';
import ReportsPlugin from 'qwc2/plugins/Reports';
import ScratchDrawingPlugin from 'qwc2/plugins/ScratchDrawing';
import SettingsPlugin from 'qwc2/plugins/Settings';
import SharePlugin from 'qwc2/plugins/Share';
import StartupMarkerPlugin from 'qwc2/plugins/StartupMarker';
import TaskButtonPlugin from 'qwc2/plugins/TaskButton';
import ThemeSwitcherPlugin from 'qwc2/plugins/ThemeSwitcher';
import TimeManagerPlugin from 'qwc2/plugins/TimeManager';
import TopBarPlugin from 'qwc2/plugins/TopBar';
import {ZoomInPlugin, ZoomOutPlugin} from 'qwc2/plugins/ZoomButtons';
import EditingSupport from 'qwc2/plugins/map/EditingSupport';
import LocateSupport from 'qwc2/plugins/map/LocateSupport';
import MeasurementSupport from 'qwc2/plugins/map/MeasurementSupport';
import RedliningPickSupport from 'qwc2/plugins/map/RedliningPickSupport';
import RedliningSupport from 'qwc2/plugins/map/RedliningSupport';
import SnappingSupport from 'qwc2/plugins/map/SnappingSupport';
import BufferSupport from 'qwc2/plugins/redlining/RedliningBufferSupport';

import defaultLocaleData from '../static/translations/en-US.json';
import {customAttributeCalculator, attributeTransform, customExporters} from './IdentifyExtensions';
import CustomEditingInterface from './CustomEditingInterface';
import MilSymbSizeSlider from './plugins/MilSymbSizeSlider';
import MilSymbSupport from './plugins/MilSymbSupport';
import CoordinatesUtils from 'qwc2/utils/CoordinatesUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';

const SWISSTOPO_HEIGHT_URL = 'https://api3.geo.admin.ch/rest/services/height';
const ASLM_DWELL_MS = 2000;
const ASLM_ERROR_RETRY_MS = 10000;
const WGS84_PSEUDO_CRS = new Set(['MGRS', 'WGS84-DMS', 'WGS84-DM']);

const aslmState = {
    lastFetchTs: 0,
    lastFetchKey: null,
    hoverKey: null,
    hoverSinceTs: 0,
    pending: false,
    value: null,
    status: 'idle'
};

function resolveSourceCrs(crs) {
    if (!crs) {
        return 'EPSG:3857';
    }
    return WGS84_PSEUDO_CRS.has(crs) ? 'EPSG:4326' : crs;
}

function toLv95Coordinate(coordinate, crs) {
    try {
        const sourceCrs = resolveSourceCrs(crs);
        if (sourceCrs === 'EPSG:2056') {
            return coordinate;
        }
        return olTransform(coordinate, sourceCrs, 'EPSG:2056');
    } catch (e) {
        return null;
    }
}

function formatAslmLabel() {
    if (typeof aslmState.value === 'number' && !isNaN(aslmState.value)) {
        return 'ASLM: ' + LocaleUtils.toLocaleFixed(aslmState.value, 1) + ' m';
    }
    if (aslmState.pending) {
        return 'ASLM: …';
    }
    if (aslmState.status === 'error') {
        return 'ASLM: n/d';
    }
    return 'ASLM: —';
}

function maybeFetchAslm(coordinate, crs) {
    const now = Date.now();

    const lv95 = toLv95Coordinate(coordinate, crs);
    if (!lv95 || lv95.length < 2 || isNaN(lv95[0]) || isNaN(lv95[1])) {
        return;
    }

    const locationKey = `${Math.round(lv95[0])}:${Math.round(lv95[1])}`;
    if (aslmState.hoverKey !== locationKey) {
        aslmState.hoverKey = locationKey;
        aslmState.hoverSinceTs = now;
        return;
    }

    if (aslmState.pending) {
        return;
    }

    if ((now - aslmState.hoverSinceTs) < ASLM_DWELL_MS) {
        return;
    }

    if (aslmState.lastFetchKey === locationKey) {
        if (aslmState.status === 'ok') {
            return;
        }
        if ((now - aslmState.lastFetchTs) < ASLM_ERROR_RETRY_MS) {
            return;
        }
    }

    aslmState.pending = true;
    aslmState.lastFetchTs = now;
    aslmState.lastFetchKey = locationKey;

    const url = `${SWISSTOPO_HEIGHT_URL}?easting=${encodeURIComponent(lv95[0])}&northing=${encodeURIComponent(lv95[1])}&sr=2056`;
    fetch(url)
        .then((response) => {
            if (!response.ok) {
                throw new Error('height request failed');
            }
            return response.json();
        })
        .then((payload) => {
            const height = payload && payload.height;
            const heightNum = Number(height);
            if (!isNaN(heightNum)) {
                aslmState.value = heightNum;
                aslmState.status = 'ok';
            } else {
                aslmState.status = 'error';
            }
        })
        .catch(() => {
            aslmState.status = 'error';
        })
        .finally(() => {
            aslmState.pending = false;
        });
}

function formatCoordinateValue(coordinate, crs) {
    if (!coordinate || coordinate.length < 2) {
        return "";
    }
    if (crs === "MGRS") {
        try {
            return mgrsForward([coordinate[0], coordinate[1]], 5);
        } catch (e) {
            return "—";
        }
    }
    if (crs === "WGS84-DMS" || crs === "WGS84-DM" || crs === "EPSG:4326") {
        if (!isNaN(coordinate[0]) && !isNaN(coordinate[1])) {
            return CoordinatesUtils.getFormattedCoordinate(coordinate, crs);
        }
        return "";
    }
    if (!isNaN(coordinate[0]) && !isNaN(coordinate[1])) {
        const decimals = CoordinatesUtils.getPrecision(crs);
        return LocaleUtils.toLocaleFixed(coordinate[0], decimals) + " " + LocaleUtils.toLocaleFixed(coordinate[1], decimals);
    }
    return "";
}

/**
 * Custom coordinate formatter for the BottomBar.
 *
 * Handles pseudo-CRS:
 *  - "MGRS"      → converts WGS84 lon/lat to MGRS string
 *  - "WGS84-DMS" → degrees ° minutes ' seconds " with N/S E/W suffix
 *  - "WGS84-DM"  → degrees ° minutes ' with N/S E/W suffix
 *
 * For EPSG:4326 (DD) and all other CRS, uses the native QWC2 formatting
 * via CoordinatesUtils.getFormattedCoordinate which reads format/addDirection/
 * swapLonLat from the projection config in config.json.
 */
function coordinateFormatter(coordinate, crs) {
    const baseValue = formatCoordinateValue(coordinate, crs);
    if (!baseValue) {
        return baseValue;
    }

    maybeFetchAslm(coordinate, crs);
    return baseValue + ' | ' + formatAslmLabel();
}

export default {
    defaultLocaleData: defaultLocaleData,
    initialState: {
        defaultState: {},
        mobile: {}
    },
    pluginsDef: {
        plugins: {
            MapPlugin: MapPlugin({
                EditingSupport: EditingSupport,
                MeasurementSupport: MeasurementSupport,
                LocateSupport: LocateSupport,
                RedliningPickSupport: RedliningPickSupport,
                RedliningSupport: RedliningSupport,
                SnappingSupport: SnappingSupport,
                MilSymbSupport: MilSymbSupport
            }),
            APIPlugin: APIPlugin,
            AttributeTablePlugin: AttributeTablePlugin(CustomEditingInterface),
            AuthenticationPlugin: AuthenticationPlugin,
            BackgroundSwitcherPlugin: BackgroundSwitcherPlugin,
            BookmarkPlugin: BookmarkPlugin,
            BottomBarPlugin: BottomBarPlugin,
            CookiePopupPlugin: CookiePopupPlugin,
            CyclomediaPlugin: CyclomediaPlugin,
            EditingPlugin: EditingPlugin(CustomEditingInterface),
            FeatureFormPlugin: FeatureFormPlugin(CustomEditingInterface),
            GeometryDigitizerPlugin: GeometryDigitizerPlugin,
            HeightProfilePlugin: HeightProfilePlugin,
            HelpPlugin: HelpPlugin(),
            HomeButtonPlugin: HomeButtonPlugin,
            IdentifyPlugin: IdentifyPlugin,
            LayerCatalogPlugin: LayerCatalogPlugin,
            LayerTreePlugin: LayerTreePlugin,
            LocateButtonPlugin: LocateButtonPlugin,
            MapComparePlugin: MapComparePlugin,
            MapCopyrightPlugin: MapCopyrightPlugin,
            MapExportPlugin: MapExportPlugin,
            MapFilterPlugin: MapFilterPlugin,
            MapInfoTooltipPlugin: MapInfoTooltipPlugin(),
            MapLegendPlugin: MapLegendPlugin,
            MapTipPlugin: MapTipPlugin,
            MeasurePlugin: MeasurePlugin,
            NewsPopupPlugin: NewsPopupPlugin,
            ObjectListPlugin: ObjectListPlugin(CustomEditingInterface),
            ObliqueViewPlugin: ObliqueViewPlugin,
            OverviewMapPlugin: OverviewMapPlugin,
            PanoramaxPlugin: PanoramaxPlugin,
            PortalPlugin: PortalPlugin,
            PrintPlugin: PrintPlugin,
            RedliningPlugin: RedliningPlugin({
                BufferSupport: BufferSupport
            }),
            ReportsPlugin: ReportsPlugin,
            FeatureSearchPlugin: FeatureSearchPlugin,
            ScratchDrawingPlugin: ScratchDrawingPlugin,
            SettingsPlugin: SettingsPlugin,
            SharePlugin: SharePlugin,
            StartupMarkerPlugin: StartupMarkerPlugin,
            TaskButtonPlugin: TaskButtonPlugin,
            ThemeSwitcherPlugin: ThemeSwitcherPlugin,
            TimeManagerPlugin: TimeManagerPlugin,
            TopBarPlugin: TopBarPlugin({
                AppMenu: AppMenu,
                Search: SearchBox,
                Toolbar: Toolbar,
                FullscreenSwitcher: FullscreenSwitcher
            }),
            ZoomInPlugin: ZoomInPlugin,
            ZoomOutPlugin: ZoomOutPlugin,
            MilSymbSizeSliderPlugin: MilSymbSizeSlider
        },
        cfg: {
            BottomBarPlugin: {
                coordinateFormatter: coordinateFormatter
            },
            IdentifyPlugin: {
                customAttributeCalculator: customAttributeCalculator,
                attributeTransform: attributeTransform,
                customExporters: customExporters
            }
        }
    },
    actionLogger: (action) => {
        /* Do something with action, i.e. Piwik/Mamoto event tracking */
    }
};
