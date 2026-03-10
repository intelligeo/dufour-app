# 🎖️ Dufour Milsymbol Server

Embedded military symbol rendering server for the Dufour-App backend. Based on [milsymbol-server](https://github.com/spatialillusions/milsymbol-server) by Måns Beckman (MIT License), modernized for Node.js 18+ and APP-6D support.

## Features

- **Dual SIDC format**: APP-6D (20 chars) + MIL-STD-2525C (15 chars)
- **SVG & PNG output**: Scalable vectors for web, rasters for export
- **All dimensions**: Ground, Air, Sea Surface, Subsurface, Space, Cyberspace, SOF
- **Full milsymbol modifiers**: `uniqueDesignation`, `higherFormation`, `direction`, etc.
- **Health check**: `GET /health` for monitoring
- **CORS enabled**: Cross-origin requests allowed
- **24h cache headers**: Browser/CDN-friendly

## Usage (standalone)

```bash
cd milsymbol-server
npm install
node index.js
# → http://localhost:2525/SFG-UCI---.svg
```

## Usage (Docker / embedded)

The milsymbol-server runs as a sidecar process inside the backend container. The FastAPI API proxies requests via `GET /api/symbols/{SIDC}.{svg|png}`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MILSYMBOL_PORT` | `2525` | Listening port |
| `MILSYMBOL_DEFAULT_SIZE` | `100` | Default symbol size (px) |
| `MILSYMBOL_MAX_CANVAS` | `2000` | Max canvas dimension for PNG |
| `BIND_ADDRESS` | `0.0.0.0` | Bind address |

## API Examples

```
GET /health                                    → JSON status
GET /SFG-UCI---.svg                           → SVG (2525C)
GET /10031000001101001500.svg                 → SVG (APP-6D)
GET /SFG-UCI---.png?uniqueDesignation=BA01    → PNG with modifier
GET /10061000001102001600.svg?size=120        → Hostile armor, 120px
```

## Credits

- Original: [spatialillusions/milsymbol-server](https://github.com/spatialillusions/milsymbol-server) (MIT)
- Symbol library: [milsymbol](https://www.npmjs.com/package/milsymbol) by Måns Beckman
