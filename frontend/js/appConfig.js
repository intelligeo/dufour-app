/**
 * Dufour.app QWC2 Application Configuration
 * Plugin registration aligned with qwc2-demo-app.
 * Custom additions: coordinateFormatter (MGRS/DMS/DM), MilSymb plugins.
 */

/* eslint-disable new-cap */

import {lazy} from 'react';

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
import RoutingPlugin from 'qwc2/plugins/Routing';
import ScratchDrawingPlugin from 'qwc2/plugins/ScratchDrawing';
import SettingsPlugin from 'qwc2/plugins/Settings';
import SharePlugin from 'qwc2/plugins/Share';
import StartupMarkerPlugin from 'qwc2/plugins/StartupMarker';
import TaskButtonPlugin from 'qwc2/plugins/TaskButton';
import ThemeSwitcherPlugin from 'qwc2/plugins/ThemeSwitcher';
import TimeManagerPlugin from 'qwc2/plugins/TimeManager';
import TopBarPlugin from 'qwc2/plugins/TopBar';
import View3DPlugin from 'qwc2/plugins/View3D';
import {ZoomInPlugin, ZoomOutPlugin} from 'qwc2/plugins/ZoomButtons';
import EditingSupport from 'qwc2/plugins/map/EditingSupport';
import LocateSupport from 'qwc2/plugins/map/LocateSupport';
import MeasurementSupport from 'qwc2/plugins/map/MeasurementSupport';
import RedliningSupport from 'qwc2/plugins/map/RedliningSupport';
import SnappingSupport from 'qwc2/plugins/map/SnappingSupport';
import BufferSupport from 'qwc2/plugins/redlining/RedliningBufferSupport';

import defaultLocaleData from '../static/translations/en-US.json';
import {customAttributeCalculator, attributeTransform, customExporters} from './IdentifyExtensions';
import MilSymbSizeSlider from './plugins/MilSymbSizeSlider';
import MilSymbSupport from './plugins/MilSymbSupport';

import CoordinatesUtils from 'qwc2/utils/CoordinatesUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';

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
    if (crs === "MGRS") {
        try {
            // coordinate is already [lon, lat] in WGS84 (MGRS pseudo-CRS = EPSG:4326)
            return mgrsForward([coordinate[0], coordinate[1]], 5);
        } catch (e) {
            return "—";
        }
    }
    // WGS84-DMS and WGS84-DM are pseudo-CRS sharing EPSG:4326 proj4 definition.
    // Use CoordinatesUtils.getFormattedCoordinate which reads format/addDirection/
    // swapLonLat from config.json projections automatically.
    if (crs === "WGS84-DMS" || crs === "WGS84-DM" || crs === "EPSG:4326") {
        if (!isNaN(coordinate[0]) && !isNaN(coordinate[1])) {
            // coordinate is already in the target CRS (lon, lat)
            return CoordinatesUtils.getFormattedCoordinate(coordinate, crs);
        }
        return "";
    }
    // Default formatting for other CRS (metric projections etc.)
    if (!isNaN(coordinate[0]) && !isNaN(coordinate[1])) {
        const decimals = CoordinatesUtils.getPrecision(crs);
        return LocaleUtils.toLocaleFixed(coordinate[0], decimals) + " " + LocaleUtils.toLocaleFixed(coordinate[1], decimals);
    }
    return "";
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
                RedliningSupport: RedliningSupport,
                SnappingSupport: SnappingSupport,
                MilSymbSupport: MilSymbSupport
            }),
            APIPlugin: APIPlugin,
            AttributeTablePlugin: AttributeTablePlugin(/* CustomEditingInterface */),
            AuthenticationPlugin: AuthenticationPlugin,
            BackgroundSwitcherPlugin: BackgroundSwitcherPlugin,
            BookmarkPlugin: BookmarkPlugin,
            BottomBarPlugin: BottomBarPlugin,
            CookiePopupPlugin: CookiePopupPlugin,
            CyclomediaPlugin: CyclomediaPlugin,
            EditingPlugin: EditingPlugin(/* CustomEditingInterface */),
            FeatureFormPlugin: FeatureFormPlugin(/* CustomEditingInterface */),
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
            ObjectListPlugin: ObjectListPlugin(/* CustomEditingInterface */),
            ObliqueViewPlugin: ObliqueViewPlugin,
            OverviewMapPlugin: OverviewMapPlugin,
            PanoramaxPlugin: PanoramaxPlugin,
            PortalPlugin: PortalPlugin,
            PrintPlugin: PrintPlugin,
            RedliningPlugin: RedliningPlugin({
                BufferSupport: BufferSupport
            }),
            ReportsPlugin: ReportsPlugin,
            RoutingPlugin: RoutingPlugin,
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
            View3DPlugin: View3DPlugin({
                BackgroundSwitcher3D: lazy(() => import('qwc2/plugins/map3d/BackgroundSwitcher3D')),
                BottomBar3D: lazy(() => import('qwc2/plugins/map3d/BottomBar3D')),
                Compare3D: lazy(() => import('qwc2/plugins/map3d/Compare3D')),
                Draw3D: lazy(() => import('qwc2/plugins/map3d/Draw3D')),
                ExportObjects3D: lazy(() => import('qwc2/plugins/map3d/ExportObjects3D')),
                HideObjects3D: lazy(() => import('qwc2/plugins/map3d/HideObjects3D')),
                Identify3D: lazy(() => import('qwc2/plugins/map3d/Identify3D')),
                LayerTree3D: lazy(() => import('qwc2/plugins/map3d/LayerTree3D')),
                MapCopyright3D: lazy(() => import('qwc2/plugins/map3d/MapCopyright3D')),
                MapExport3D: lazy(() => import('qwc2/plugins/map3d/MapExport3D')),
                MapLight3D: lazy(() => import('qwc2/plugins/map3d/MapLight3D')),
                Measure3D: lazy(() => import('qwc2/plugins/map3d/Measure3D')),
                OverviewMap3D: lazy(() => import('qwc2/plugins/map3d/OverviewMap3D')),
                Settings3D: lazy(() => import('qwc2/plugins/map3d/Settings3D')),
                TopBar3D: lazy(() => import('qwc2/plugins/map3d/TopBar3D'))
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
                attributeCalculator: customAttributeCalculator,
                attributeTransform: attributeTransform,
                customExporters: customExporters
            }
        }
    },
    actionLogger: (action) => {
        /* Do something with action, i.e. Piwik/Mamoto event tracking */
    }
};
