#!/bin/bash
# QGIS Server startup script for Render.com

set -e

echo "Starting QGIS Server..."

# Set environment variables
export QGIS_SERVER_LOG_LEVEL=${QGIS_SERVER_LOG_LEVEL:-0}
export QGIS_SERVER_PARALLEL_RENDERING=${QGIS_SERVER_PARALLEL_RENDERING:-true}
export QGIS_SERVER_MAX_THREADS=${QGIS_SERVER_MAX_THREADS:-4}
export QGIS_SERVER_LOG_FILE=${QGIS_SERVER_LOG_FILE:-/dev/stdout}

# Start QGIS Server with spawn-fcgi
echo "Starting QGIS FastCGI..."
spawn-fcgi -n -p 9993 -u www-data -g www-data -- /usr/lib/cgi-bin/qgis_mapserv.fcgi &

# Wait for QGIS Server to start
sleep 2

# Start Nginx as reverse proxy
echo "Starting Nginx..."
nginx -g 'daemon off;' &

# Keep container running
wait
