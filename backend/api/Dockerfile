# Multi-stage build: Backend API + QGIS Server + Milsymbol Server embedded
FROM ubuntu:22.04 AS qgis-server

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install QGIS Server, Node.js 18, and dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    software-properties-common \
    curl \
    && wget -qO - https://qgis.org/downloads/qgis-2022.gpg.key | gpg --no-default-keyring --keyring gnupg-ring:/etc/apt/trusted.gpg.d/qgis-archive.gpg --import \
    && chmod a+r /etc/apt/trusted.gpg.d/qgis-archive.gpg \
    && add-apt-repository "deb https://qgis.org/ubuntu-ltr jammy main" \
    # Add NodeSource repo for Node.js 18
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get update \
    && apt-get install -y \
        qgis-server \
        python3-qgis \
        python3-pip \
        libpq-dev \
        gcc \
        spawn-fcgi \
        xvfb \
        # Node.js for milsymbol-server
        nodejs \
        # Canvas native dependencies for milsymbol PNG rendering
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        pkg-config \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for API
WORKDIR /app
COPY backend/api/requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Install milsymbol-server
WORKDIR /milsymbol
COPY milsymbol-server/package.json milsymbol-server/package-lock.json* ./
RUN npm install --production

# Verify canvas native module loads correctly (fail build early if broken)
RUN node -e "require('canvas'); require('milsymbol'); console.log('✅ milsymbol + canvas OK')"

COPY milsymbol-server/index.js .

# Copy application code
WORKDIR /app
COPY backend/api/ .

# Create directories
RUN mkdir -p /tmp/qgis_projects /var/log/qgis

# Set QGIS Server environment variables
ENV QGIS_SERVER_LOG_LEVEL=0 \
    QGIS_SERVER_LOG_STDERR=1 \
    QGIS_SERVER_PARALLEL_RENDERING=1 \
    QGIS_SERVER_MAX_THREADS=2 \
    QGIS_SERVER_CACHE_DIRECTORY=/tmp/qgis_cache \
    QGIS_SERVER_CACHE_SIZE=50 \
    QGIS_PREFIX_PATH=/usr \
    QGIS_SERVER_IGNORE_BAD_LAYERS=1 \
    PYTHONPATH=/usr/share/qgis/python \
    LD_LIBRARY_PATH=/usr/lib

# Milsymbol server configuration
ENV MILSYMBOL_PORT=2525 \
    MILSYMBOL_DEFAULT_SIZE=100 \
    MILSYMBOL_MAX_CANVAS=2000 \
    MILSYMBOL_SERVER_URL=http://localhost:2525

# Create startup script (QGIS Server + Milsymbol Server + FastAPI)
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "=== Starting Dufour Backend ==="\n\
\n\
# Start QGIS Server via spawn-fcgi\n\
Xvfb :99 -screen 0 1024x768x24 -nolisten tcp &\n\
export DISPLAY=:99\n\
spawn-fcgi -n -p 8080 -f /usr/lib/cgi-bin/qgis_mapserv.fcgi &\n\
echo "✅ QGIS Server started on port 8080"\n\
\n\
# Start Milsymbol Server (sidecar) with log capture\n\
cd /milsymbol && node index.js > /var/log/milsymbol.log 2>&1 &\n\
MILSYMBOL_PID=$!\n\
echo "🎖️  Milsymbol Server PID=$MILSYMBOL_PID starting on port ${MILSYMBOL_PORT:-2525}"\n\
\n\
# Wait for milsymbol server to be ready (up to 10s)\n\
MILSYMBOL_READY=0\n\
for i in $(seq 1 20); do\n\
  # Check if process is still alive\n\
  if ! kill -0 $MILSYMBOL_PID 2>/dev/null; then\n\
    echo "❌ Milsymbol Server process died! Log output:"\n\
    cat /var/log/milsymbol.log\n\
    echo "--- Attempting restart ---"\n\
    cd /milsymbol && node index.js > /var/log/milsymbol.log 2>&1 &\n\
    MILSYMBOL_PID=$!\n\
  fi\n\
  if curl -sf http://localhost:${MILSYMBOL_PORT:-2525}/health > /dev/null 2>&1; then\n\
    echo "✅ Milsymbol Server ready (attempt $i)"\n\
    MILSYMBOL_READY=1\n\
    break\n\
  fi\n\
  sleep 0.5\n\
done\n\
\n\
if [ "$MILSYMBOL_READY" -eq 0 ]; then\n\
  echo "⚠️  WARNING: Milsymbol Server not ready after 10s. Log:"\n\
  cat /var/log/milsymbol.log\n\
  echo "--- Continuing anyway (symbol endpoints will return errors) ---"\n\
fi\n\
\n\
# Start FastAPI (foreground) on PORT from Render, fallback to 3000\n\
API_PORT="${PORT:-3000}"\n\
echo "🚀 Starting FastAPI on port $API_PORT"\n\
exec uvicorn main:app --host 0.0.0.0 --port "$API_PORT"\n\
' > /start.sh && chmod +x /start.sh

EXPOSE 3000 8080 2525

CMD ["/start.sh"]
