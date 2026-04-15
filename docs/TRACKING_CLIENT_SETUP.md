# Tracking Client Setup Guide

Connect your GNSS device or smartphone to the Dufour.app live tracking system.

---

## Architecture — two separate endpoints

> ⚠️ **Important:** Render.com (where the Dufour backend lives) only routes
> **HTTP/HTTPS** traffic. Raw TCP ports such as 5055, 5001, 5013, etc. are
> **not reachable** on `api.intelligeo.net`. Traccar must run on a separate
> VPS that can bind arbitrary TCP ports.

```
 GPS devices / smartphone apps
        │
        │  raw TCP (5055 / 5001 / 5013 …)
        ▼
 ┌─────────────────────────────┐
 │  Traccar VPS                │  e.g. traccar.intelligeo.net
 │  traccar/traccar:latest     │  managed separately from Render
 │  ports: 8082 (web/REST)     │
 │         5055 5001 5013 …    │
 └────────────┬────────────────┘
              │ HTTP (internal)
              ▼
 ┌─────────────────────────────┐
 │  Dufour backend             │  api.intelligeo.net  (Render)
 │  FastAPI /api/tracking/*    │  HTTP/HTTPS only
 │  WebSocket /api/tracking/ws │
 └────────────┬────────────────┘
              │ WSS / HTTPS
              ▼
     Dufour Map (browser)
     QWC2 + Fleet Manager
```

| Endpoint | Hostname | Purpose |
|---|---|---|
| **Dufour API** | `api.intelligeo.net` (Render) | Fleet UI, REST management, live map WebSocket |
| **Traccar server** | `traccar.intelligeo.net` (VPS) | Receives GPS positions from devices |

Set `TRACCAR_URL=http://traccar.intelligeo.net:8082` on the Dufour backend so
the two services can communicate.

---

## Prerequisites

- A Dufour.app account with at least the **user** role
- Access to the **Fleet Manager** panel (toolbar icon on the map)
- The Traccar VPS hostname agreed with your infrastructure team (e.g. `traccar.intelligeo.net`)

---

## Step 1 – Create a device in Fleet Manager

1. Open the map and click the **Fleet Manager** icon in the side toolbar.
2. *(Optional)* Click **+ New fleet** to create a group for the device.
3. Click **+ New device**.
4. Fill in:
   | Field | Description |
   |---|---|
   | **Device name** | Human-readable label shown on the map |
   | **IMEI / Unique ID** | The identifier your GPS tracker will send (see below) |
   | **Fleet group** | Optional – assign to a fleet |
   | **Category** | Icon shown on the map (`car`, `truck`, `pedestrian` …) |
5. Click **Save**. The device now appears in the list.

> The **Unique ID** must exactly match what the client sends as its device identifier.
> For hardware trackers this is usually the 15-digit IMEI printed on the label.
> For mobile apps you choose it yourself (see Step 2).

---

## Step 2 – Configure the client

### Option A – Smartphone (OsmAnd / TraccarClient)

Smartphone apps send positions via HTTP on **port 5055** directly to the
**Traccar VPS** — not to the Dufour Render backend.

#### Traccar Client (Android / iOS)

1. Install **Traccar Client** from [Google Play](https://play.google.com/store/apps/details?id=org.traccar.client) or the App Store.
2. Open the app → **Settings**:
   | Setting | Value |
   |---|---|
   | **Device identifier** | The Unique ID you entered in Fleet Manager |
   | **Server URL** | `http://traccar.intelligeo.net` ⚠️ **Traccar VPS, not api.intelligeo.net** |
   | **Server port** | `5055` |
   | **Frequency** | 30 s (recommended) |
3. Tap the **toggle** to start sending positions.

> `api.intelligeo.net` is the Dufour FastAPI backend on Render.com.
> It does **not** listen on port 5055. GPS data must go to the Traccar VPS.

#### OsmAnd (Android / iOS)

1. Open OsmAnd → **Plugins** → enable **Trip Recording**.
2. Go to **Settings → OsmAnd Live Tracking**:
   | Setting | Value |
   |---|---|
   | **Server** | `traccar.intelligeo.net` ⚠️ Traccar VPS |
   | **Port** | `5055` |
   | **Device ID** | Your Unique ID from Fleet Manager |
3. Enable **Live Tracking** in the OsmAnd top bar.

---

### Option B – Hardware GPS tracker (common families)

> All commands below use `traccar.intelligeo.net` — the **Traccar VPS**.
> Do **not** use `api.intelligeo.net` here; Render.com does not expose raw TCP ports.

#### Teltonika FMB / FMT series (port 5001)

Send the following SMS to the tracker SIM card (or use the Teltonika Configurator):

```
setparam 2004:traccar.intelligeo.net;2005:5001;2006:0
```

The Device ID is the tracker IMEI (printed on the label).

#### GPS103 / TK102 family (port 5013)

Send by SMS:

```
adminip123456 traccar.intelligeo.net 5013
```

Replace `123456` with the device admin password (default varies by model).
The Device ID is the tracker IMEI.

#### H02 cheap trackers (port 10001)

Send by SMS:

```
*HQ,{IMEI},IP,traccar.intelligeo.net,10001,APN#
```

#### Generic OsmAnd-compatible trackers (port 5055 HTTP)

Configure the tracker to GET:

```
http://traccar.intelligeo.net:5055/?id={DEVICE_ID}&lat={LAT}&lon={LON}&speed={SPEED}&bearing={COURSE}&altitude={ALT}&accuracy={ACC}
```

Replace `{DEVICE_ID}` with the Unique ID registered in Fleet Manager.

---

### Option C – Custom application (HTTP / REST)

Report positions via the OsmAnd HTTP protocol **to the Traccar VPS**:

```http
GET http://traccar.intelligeo.net:5055/?id=MY-DEVICE-001&lat=46.9481&lon=7.4474&speed=0&bearing=0&altitude=550
```

Or POST JSON directly to the Traccar REST API on the VPS:

```bash
curl -X POST "http://traccar.intelligeo.net:8082/api/positions" \
     -u "admin:password" \
     -H "Content-Type: application/json" \
     -d '{"deviceId":1,"protocol":"osmand","fixTime":"2026-04-15T12:00:00Z",
          "latitude":46.9481,"longitude":7.4474,"altitude":550,
          "speed":0,"course":0,"valid":true}'
```

> The Dufour FastAPI backend at `api.intelligeo.net` also exposes
> `/api/tracking/positions` (read) and `/api/tracking/ws` (live WebSocket)
> for the **map viewer** — but these are read endpoints, not ingest endpoints.

---

## Step 3 – Verify on the map

1. Return to the Dufour.app map.
2. Open **Fleet Manager** → find your device in the list.
3. The row should show the device status dot:
   - 🟢 **green** → online (position received within the last few minutes)
   - 🔴 **red** → offline
   - 🟡 **yellow** → unknown (never connected)
4. Click the 📍 **pin** icon to pan the map to the device's last known position.
5. The device appears on the map as a coloured arrow. Arrow colour indicates speed:
   - **blue** → stationary
   - **green** → slow (< 20 km/h)
   - **orange** → moderate (20–60 km/h)
   - **red** → fast (> 60 km/h)

---

## Supported GPS protocols (default port assignments)

All ports below must be opened **on the Traccar VPS** — they are never exposed by the
Dufour Render.com backend.

| Protocol | Port | Typical device family |
|---|---|---|
| OsmAnd (HTTP) | `5055` TCP/UDP | Smartphone apps, custom clients |
| Teltonika | `5001` TCP | FMB, FMC, FMT |
| Wialon IPS | `5006` TCP | Various industrial trackers |
| GPS103 / TK102 | `5013` TCP | Low-cost SMS/GPRS trackers |
| H02 | `10001` TCP | Coban, similar cheap trackers |
| Traccar web/REST | `8082` TCP | Admin UI, REST API, WebSocket |

> **Firewall / VPS note:** open the ports above in your VPS security group or
> `iptables` rules on `traccar.intelligeo.net`. In the Docker Compose local-dev
> stack they are already published via the `traccar:` service definition.

> **Render.com note:** `api.intelligeo.net` runs as a Render Web Service and
> accepts **only HTTPS (443)**. Raw TCP port binding is not possible on Render.com.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Device shows 🟡 unknown | Never received a position | Verify client points to `traccar.intelligeo.net`, not `api.intelligeo.net` |
| Device shows 🔴 offline | Position older than ~5 min | Check network on client; verify Traccar VPS is running |
| Connection refused on 5055 | Wrong host **or** Render.com used | GPS data must go to the Traccar VPS, not the Render backend |
| Position on map is stale | Browser WebSocket reconnecting | Reload page; check Dufour backend logs for `TRACCAR_URL` errors |
| "Traccar error: 502" in Fleet UI | Dufour backend cannot reach Traccar VPS | Verify `TRACCAR_URL` env var on Render points to the Traccar VPS |
| Port refused on VPS | Firewall / security group | Open the required port(s) on the Traccar VPS firewall |

---

## Related resources

- [Traccar documentation](https://www.traccar.org/documentation/)
- [Traccar supported protocols](https://www.traccar.org/protocols/)
- [Traccar Client app (official)](https://www.traccar.org/client/)
- [Fleet Manager plugin source](../frontend/js/plugins/FleetManager.jsx)
- [Backend tracking API](../backend/api/routers/tracking.py)
