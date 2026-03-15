#!/bin/bash
set -e

echo "=== Starting Dufour Backend ==="
echo "QGIS Server base image: qgis/qgis-server:ltr-noble"

# ---- QGIS Server (from base image) ----
# The base image provides:
#   - /usr/bin/Xvfb
#   - /usr/sbin/nginx (config at /etc/nginx/nginx.conf, proxy port 80 -> fcgi 9993)
#   - /usr/bin/spawn-fcgi + /usr/lib/cgi-bin/qgis_mapserv.fcgi

rm -f /tmp/.X99-lock
fc-cache 2>/dev/null || true

# Start virtual display
/usr/bin/Xvfb :99 -ac -screen 0 1280x1024x16 +render -noreset >/dev/null 2>&1 &
XVFB_PID=$!
sleep 1
echo "✅ Xvfb started (PID=$XVFB_PID)"

# Start nginx (QGIS HTTP proxy on port 80)
nginx 2>&1 || true
echo "✅ nginx started on port 80"

# Start QGIS Server via spawn-fcgi on port 9993
spawn-fcgi -n -d /var/lib/qgis -P /run/qgis.pid -p 9993 -- /usr/lib/cgi-bin/qgis_mapserv.fcgi > /var/log/qgis/server.log 2>&1 &
QGIS_PID=$!
echo "✅ QGIS Server (FastCGI) started (PID=$QGIS_PID) on port 9993"

# Wait for QGIS Server to respond via nginx on port 80
# Base image nginx location /ows/ rewrites to QGIS FastCGI
QGIS_READY=0
for i in $(seq 1 15); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:80/ows/?SERVICE=WMS&REQUEST=GetCapabilities" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" != "000" ]; then
    QGIS_READY=1
    echo "✅ QGIS Server responding via nginx /ows/ (HTTP $HTTP_CODE) after ${i}s"
    break
  fi
  sleep 1
done
if [ "$QGIS_READY" -eq 0 ]; then
  echo "⚠️  WARNING: QGIS Server not responding on port 80 after 15s"
  echo "  QGIS log:"
  tail -20 /var/log/qgis/server.log 2>/dev/null || true
  echo "  nginx error log:"
  cat /var/log/nginx/error.log 2>/dev/null | tail -10 || true
  echo "  spawn-fcgi alive: $(kill -0 $QGIS_PID 2>/dev/null && echo yes || echo no)"
fi

# ---- Milsymbol Server ----
cd /milsymbol && node index.js > /var/log/milsymbol.log 2>&1 &
MILSYMBOL_PID=$!
echo "🎖️  Milsymbol Server PID=$MILSYMBOL_PID starting on port ${MILSYMBOL_PORT:-2525}"

MILSYMBOL_READY=0
for i in $(seq 1 20); do
  if ! kill -0 $MILSYMBOL_PID 2>/dev/null; then
    echo "❌ Milsymbol Server process died! Log:"
    cat /var/log/milsymbol.log
    echo "--- Attempting restart ---"
    cd /milsymbol && node index.js > /var/log/milsymbol.log 2>&1 &
    MILSYMBOL_PID=$!
  fi
  if curl -sf http://localhost:${MILSYMBOL_PORT:-2525}/health > /dev/null 2>&1; then
    echo "✅ Milsymbol Server ready (attempt $i)"
    MILSYMBOL_READY=1
    break
  fi
  sleep 0.5
done
if [ "$MILSYMBOL_READY" -eq 0 ]; then
  echo "⚠️  WARNING: Milsymbol Server not ready after 10s. Log:"
  cat /var/log/milsymbol.log
  echo "--- Continuing anyway ---"
fi

# ---- FastAPI (foreground) ----
API_PORT="${PORT:-3000}"
echo "🚀 Starting FastAPI on port $API_PORT"
cd /app && exec uvicorn main:app --host 0.0.0.0 --port "$API_PORT"
