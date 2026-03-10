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
const { createCanvas } = require("canvas");
const url = require("url");

// Configuration via environment variables
const hostname = os.hostname();
const bindAddress = process.env.BIND_ADDRESS || "0.0.0.0";
const port = parseInt(process.env.MILSYMBOL_PORT || "2525", 10);
const defaultSize = parseInt(process.env.MILSYMBOL_DEFAULT_SIZE || "100", 10);
const maxCanvasSize = parseInt(process.env.MILSYMBOL_MAX_CANVAS || "2000", 10);

/**
 * Extend milsymbol Symbol prototype for Node.js canvas rendering (PNG)
 */
ms.Symbol.prototype.asNodeCanvas = function () {
  ms._brokenPath2D = true;
  const ratio = 1;
  const canvas = createCanvas(
    Math.min(this.width, maxCanvasSize),
    Math.min(this.height, maxCanvasSize)
  );
  const ctx = canvas.getContext("2d");
  ctx.scale(
    (ratio * this.style.size) / 100,
    (ratio * this.style.size) / 100
  );
  ctx.translate(
    -(this.bbox.x1 - this.style.strokeWidth - this.style.outlineWidth),
    -(this.bbox.y1 - this.style.strokeWidth - this.style.outlineWidth)
  );
  this.canvasDraw.call(this, ctx, this.drawInstructions);
  return canvas;
};

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
      version: "1.0.0",
      milsymbol_version: ms.version || "2.x",
      supported_formats: ["SVG", "PNG"],
      supported_sidc: ["APP-6D (20 chars)", "MIL-STD-2525C (15 chars)"],
      default_size: defaultSize,
      uptime_seconds: Math.floor((Date.now() - stats.startTime) / 1000),
      stats: {
        total_requests: stats.requests,
        svg_rendered: stats.svgRendered,
        png_rendered: stats.pngRendered,
        errors: stats.errors
      },
      usage: {
        svg: `GET /{SIDC}.svg?size=100&uniqueDesignation=HQ`,
        png: `GET /{SIDC}.png?size=100&uniqueDesignation=HQ`,
        example_app6d: `GET /10031000001211000000.svg`,
        example_2525c: `GET /SFG-UCI---.svg?uniqueDesignation=BA01`
      }
    }));
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
      const canvas = symbol.asNodeCanvas();
      const stream = canvas.createPNGStream();
      
      stats.pngRendered++;
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400"); // 24h cache
      res.setHeader("X-SIDC-Format", validation.format);
      stream.pipe(res);
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
});
