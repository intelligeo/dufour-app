/**
 * Dufour Milsymbol Server
 * 
 * Modernized military symbol rendering server based on milsymbol-server
 * by spatialillusions (MIT License).
 * 
 * Supports:
 * - APP-6D (20-char SIDC) and MIL-STD-2525C (15-char SIDC)
 * - SVG and PNG output
 * - All milsymbol modifier options via query string
 * - Health check endpoint
 * - Configurable via environment variables
 * 
 * Original: https://github.com/spatialillusions/milsymbol-server
 * License: MIT (Copyright (c) 2018 Måns Beckman)
 */

const os = require("os");
const http = require("http");
const ms = require("milsymbol");
const { createCanvas, loadImage } = require("canvas");
const url = require("url");

// mil-sym-ts: tactical graphics (n-point) renderer — MIL-STD-2525D/E
// Loaded lazily to avoid startup failures if the package is not yet installed.
let milsymts = null;
let WebRenderer = null;

function loadMilSymTs() {
  if (milsymts !== null) return milsymts;
  try {
    milsymts = require("@armyc2.c5isr.renderer/mil-sym-ts");
    WebRenderer = milsymts.WebRenderer;
    console.log("✅  mil-sym-ts loaded (MIL-STD-2525D/E tactical graphics)");
  } catch (e) {
    console.warn("⚠️  mil-sym-ts not available:", e.message);
    milsymts = false;
  }
  return milsymts;
}

// Configuration via environment variables
const hostname = os.hostname();
const bindAddress = process.env.BIND_ADDRESS || "0.0.0.0";
const port = parseInt(process.env.MILSYMBOL_PORT || "2525", 10);
const defaultSize = parseInt(process.env.MILSYMBOL_DEFAULT_SIZE || "100", 10);
const maxCanvasSize = parseInt(process.env.MILSYMBOL_MAX_CANVAS || "2000", 10);

/**
 * Render a milsymbol Symbol to a PNG canvas via SVG-to-Canvas.
 * 
 * The CJS build of milsymbol 1.3.3 does not expose canvasDraw on
 * Symbol.prototype, so the old asNodeCanvas() approach crashes with
 * "Cannot read properties of undefined (reading 'call')".
 * 
 * Instead we render SVG first (which works perfectly), then use
 * node-canvas's loadImage() to rasterize the SVG into a PNG canvas.
 */
async function renderSymbolToPngCanvas(symbol) {
  const svg = symbol.asSVG();
  const svgBuffer = Buffer.from(svg);
  const img = await loadImage(svgBuffer);

  const width = Math.min(img.width, maxCanvasSize);
  const height = Math.min(img.height, maxCanvasSize);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Build a milsymbol options object, only allowing valid milsymbol properties.
 * Handles booleans, numbers, and strings.
 */
const sampleSymbol = new ms.Symbol();
const validOptions = Object.assign({}, sampleSymbol.options, sampleSymbol.style);

function queryToOptions(queryParams) {
  const opts = {};
  for (const key in queryParams) {
    if (Object.prototype.hasOwnProperty.call(validOptions, key)) {
      const refVal = validOptions[key];
      if (typeof refVal === "boolean") {
        opts[key] = String(queryParams[key]).toUpperCase() === "TRUE";
      } else if (typeof refVal === "number") {
        opts[key] = Number(queryParams[key]);
      } else {
        opts[key] = queryParams[key];
      }
    }
  }
  // Apply default size if not specified
  if (!opts.size) {
    opts.size = defaultSize;
  }
  return opts;
}

/**
 * Validate SIDC format
 * APP-6D: 20 alphanumeric characters
 * 2525C:  15 characters (letters, digits, dashes)
 */
function validateSIDC(sidc) {
  if (!sidc || sidc.length === 0) {
    return { valid: false, format: null, error: "Empty SIDC" };
  }
  // APP-6D: exactly 20 alphanumeric characters
  if (/^[A-Za-z0-9]{20}$/.test(sidc)) {
    return { valid: true, format: "APP-6D" };
  }
  // 2525C: 15 characters (letters, digits, dashes, asterisks)
  if (/^[A-Za-z0-9\-\*]{10,15}$/.test(sidc)) {
    return { valid: true, format: "2525C" };
  }
  return { valid: false, format: null, error: `Invalid SIDC format: ${sidc}` };
}

/**
 * Stats tracking
 */
const stats = {
  startTime: Date.now(),
  requests: 0,
  svgRendered: 0,
  pngRendered: 0,
  tacticalRendered: 0,
  errors: 0
};

/**
 * HTTP Server
 */
const server = http.createServer((req, res) => {
  stats.requests++;

  const urlParts = url.parse(req.url, true);
  const pathname = urlParts.pathname;

  // CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Health check endpoint
  if (pathname === "/health" || pathname === "/") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      status: "online",
      service: "dufour-milsymbol-server",
      version: "1.1.0",
      milsymbol_version: ms.version || "unknown",
      milsymts_available: loadMilSymTs() !== false,
      supported_formats: ["SVG", "PNG"],
      supported_sidc: ["APP-6D (20 chars)", "MIL-STD-2525C (15 chars)"],
      tactical_graphics: "GET /tactical?sidc=...&points=lon,lat+lon,lat&bbox=minLon,minLat,maxLon,maxLat&scale=50000",
      default_size: defaultSize,
      uptime_seconds: Math.floor((Date.now() - stats.startTime) / 1000),
      stats: {
        total_requests: stats.requests,
        svg_rendered: stats.svgRendered,
        png_rendered: stats.pngRendered,
        tactical_rendered: stats.tacticalRendered,
        errors: stats.errors
      },
      usage: {
        svg: `GET /{SIDC}.svg?size=100&uniqueDesignation=HQ`,
        png: `GET /{SIDC}.png?size=100&uniqueDesignation=HQ`,
        tactical: `GET /tactical?sidc=SIDC&points=lon1,lat1+lon2,lat2&bbox=minLon,minLat,maxLon,maxLat&scale=50000`,
        example_app6d: `GET /10031000001211000000.svg`,
        example_2525c: `GET /SFG-UCI---.svg?uniqueDesignation=BA01`,
        example_tactical: `GET /tactical?sidc=GHGPGLA-------X&points=7.0,47.0+7.1,47.05+7.05,47.1&bbox=6.9,46.95,7.2,47.15&scale=50000`
      }
    }));
    return;
  }

  // ─── Tactical graphics endpoint (n-point, MIL-STD-2525D/E via mil-sym-ts) ───
  // GET /tactical?sidc=GHGPGLA-------X
  //              &points=lon1,lat1+lon2,lat2+...   (space-separated: use + or %20)
  //              &bbox=minLon,minLat,maxLon,maxLat
  //              &scale=50000                       (map scale denominator, metres/pixel)
  //              &width=800&height=600              (pixel dimensions of viewport, optional)
  //              &format=geosvg|geojson             (default: geosvg)
  //              &modifiers=KEY:VALUE,...           (optional, e.g. T:Alpha,H:area1)
  if (pathname === "/tactical") {
    const lib = loadMilSymTs();
    if (!lib) {
      stats.errors++;
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "mil-sym-ts not available on this server" }));
      return;
    }

    const q = urlParts.query;
    const sidc = q.sidc || q.SIDC || "";
    const pointsRaw = (q.points || "").replace(/\+/g, " ").trim();
    const bbox = (q.bbox || "").trim();
    const scale = parseFloat(q.scale || "50000");
    const pixelWidth = parseInt(q.width || "800", 10);
    const pixelHeight = parseInt(q.height || "600", 10);
    const formatStr = (q.format || "geosvg").toLowerCase();
    const modifiersRaw = (q.modifiers || "").trim();

    if (!sidc) {
      stats.errors++;
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing required parameter: sidc" }));
      return;
    }

    if (!pointsRaw) {
      stats.errors++;
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing required parameter: points (format: lon1,lat1+lon2,lat2+...)" }));
      return;
    }

    // Build modifiers Map
    const modifiersMap = new Map();
    if (modifiersRaw) {
      for (const pair of modifiersRaw.split(",")) {
        const idx = pair.indexOf(":");
        if (idx > 0) {
          modifiersMap.set(pair.substring(0, idx).trim(), pair.substring(idx + 1).trim());
        }
      }
    }

    // Build attributes Map
    const attributesMap = new Map();

    // Choose output format constant
    // WebRenderer constants: OUTPUT_FORMAT_KML=0, OUTPUT_FORMAT_GEOJSON=1, OUTPUT_FORMAT_GEOSVG=2, OUTPUT_FORMAT_JSON=3
    let outputFormat;
    let contentType;
    if (formatStr === "geojson") {
      outputFormat = WebRenderer.OUTPUT_FORMAT_GEOJSON;
      contentType = "application/geo+json";
    } else {
      // geosvg (default) — SVG with embedded geographic anchor coordinates
      outputFormat = WebRenderer.OUTPUT_FORMAT_GEOSVG;
      contentType = "image/svg+xml";
    }

    try {
      const result = WebRenderer.RenderSymbol2D(
        "tac-" + sidc,      // id
        sidc,               // name
        "",                 // description
        sidc,               // symbolCode
        pointsRaw,          // controlPoints: "lon1,lat1 lon2,lat2 ..."
        pixelWidth,         // pixelWidth
        pixelHeight,        // pixelHeight
        bbox || null,       // bbox: "minLon,minLat,maxLon,maxLat"
        modifiersMap,       // symbolModifiers
        attributesMap,      // symbolAttributes
        outputFormat        // format
      );

      stats.tacticalRendered++;
      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("X-SIDC", sidc);
      res.end(result);
    } catch (err) {
      stats.errors++;
      console.error(`[tactical] Error rendering ${sidc}: ${err.message}`);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        error: "Tactical graphic rendering failed",
        sidc,
        message: err.message
      }));
    }
    return;
  }

  // Parse filename: /SIDC.format
  const pathSegments = pathname.split("/");
  const filename = pathSegments[pathSegments.length - 1];
  const dotIndex = filename.lastIndexOf(".");
  
  if (dotIndex === -1) {
    stats.errors++;
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      error: "Invalid request. Use /{SIDC}.svg or /{SIDC}.png",
      example: "/SFG-UCI---.svg" 
    }));
    return;
  }

  const sidc = filename.substring(0, dotIndex);
  const format = filename.substring(dotIndex + 1).toUpperCase();

  // Validate SIDC
  const validation = validateSIDC(sidc);
  if (!validation.valid) {
    stats.errors++;
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      error: validation.error,
      hint: "APP-6D: 20 alphanumeric chars, 2525C: 10-15 chars with dashes"
    }));
    return;
  }

  // Parse options from query string
  const options = queryToOptions(urlParts.query);

  try {
    if (format === "SVG") {
      const symbol = new ms.Symbol(sidc, options);
      const svg = symbol.asSVG();
      
      stats.svgRendered++;
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=86400"); // 24h cache
      res.setHeader("X-SIDC-Format", validation.format);
      res.end(svg);
      return;
    }

    if (format === "PNG") {
      const symbol = new ms.Symbol(sidc, options);
      renderSymbolToPngCanvas(symbol).then((canvas) => {
        const stream = canvas.createPNGStream();
        stats.pngRendered++;
        res.statusCode = 200;
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400"); // 24h cache
        res.setHeader("X-SIDC-Format", validation.format);
        stream.pipe(res);
      }).catch((err) => {
        stats.errors++;
        console.error(`Error rendering PNG for ${sidc}: ${err.message}`);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          error: "PNG rendering failed",
          sidc: sidc,
          message: err.message
        }));
      });
      return;
    }

    // Unsupported format
    stats.errors++;
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      error: `Unsupported format: ${format}. Use 'svg' or 'png'` 
    }));

  } catch (err) {
    stats.errors++;
    console.error(`Error rendering symbol ${sidc}: ${err.message}`);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      error: "Symbol rendering failed",
      sidc: sidc,
      message: err.message 
    }));
  }
});

server.listen(port, bindAddress, () => {
  console.log(`🎖️  Dufour Milsymbol Server running at http://${hostname}:${port}`);
  console.log(`   APP-6D example: http://${hostname}:${port}/10031000001211000000.svg`);
  console.log(`   2525C example:  http://${hostname}:${port}/SFG-UCI---.svg?uniqueDesignation=BA01`);
  console.log(`   Health check:   http://${hostname}:${port}/health`);
  console.log(`   Tactical (n-pt): http://${hostname}:${port}/tactical?sidc=GHGPGLA-------X&points=7.0,47.0+7.1,47.05+7.05,47.1&bbox=6.9,46.95,7.2,47.15&scale=50000`);
  // Try to preload mil-sym-ts at startup so errors are visible early
  loadMilSymTs();
});
