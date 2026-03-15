/**
 * Dufour.app – Search Providers
 *
 * Provides search using the SwissTopo GeoAdmin REST API.
 * Returns results as GeoJSON features in EPSG:4326.
 */

/**
 * Search provider for SwissTopo GeoAdmin.
 * Uses the api3.geo.admin.ch SearchServer.
 */
function geoAdminSearchProvider(text, requestId, searchParams, dispatch) {
  const limit = 10;
  const url = `https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&searchText=${encodeURIComponent(text)}&limit=${limit}&sr=4326`;

  fetch(url)
    .then(response => response.json())
    .then(data => {
      const results = [];
      if (data && data.results) {
        data.results.forEach(result => {
          if (result.attrs) {
            const attrs = result.attrs;
            // GeoAdmin returns bbox in LV95 or lat/lon depending on sr param
            const item = {
              id: "geoadmin_" + (attrs.featureId || attrs.num),
              text: attrs.label ? attrs.label.replace(/<[^>]+>/g, '') : attrs.detail,
              x: attrs.lon,
              y: attrs.lat,
              crs: "EPSG:4326",
              provider: "geoadmin"
            };
            if (attrs.geom_quadindex) {
              item.bbox = [attrs.lon - 0.01, attrs.lat - 0.01, attrs.lon + 0.01, attrs.lat + 0.01];
            }
            results.push(item);
          }
        });
      }
      dispatch({
        type: "SEARCH_ADD_RESULTS",
        searchId: requestId,
        provider: "geoadmin",
        results: results
      });
    })
    .catch(() => {
      dispatch({
        type: "SEARCH_ADD_RESULTS",
        searchId: requestId,
        provider: "geoadmin",
        results: []
      });
    });
}

/**
 * SwissTopo coordinates search – extracts LV95 / LV03 / WGS84 coordinates.
 */
function coordinateSearchProvider(text, requestId, searchParams, dispatch) {
  // This is handled by QWC2 built-in 'coordinates' provider
  // Just a stub in case it needs to be referenced
}

// Register providers
window.QWC2SearchProviders = {
  geoadmin: {
    label: "GeoAdmin",
    onSearch: geoAdminSearchProvider
  }
};
