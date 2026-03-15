# Dufour Backend: QGIS Server + Milsymbol Server + FastAPI
# Based on the official QGIS Server Docker image (pre-built, tested, maintained)
# https://hub.docker.com/r/qgis/qgis-server
FROM qgis/qgis-server:ltr-noble

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 18 (for milsymbol-server) and build deps for canvas
RUN apt-get update && apt-get install -y \
    curl \
    python3-pip \
    libpq-dev \
    gcc \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install milsymbol-server
WORKDIR /milsymbol
COPY milsymbol-server/package.json milsymbol-server/package-lock.json* ./
RUN npm install --production

# Verify canvas native module loads correctly
RUN node -e "const { createCanvas, loadImage } = require('canvas'); const ms = require('milsymbol'); const sym = new ms.Symbol('SFG-UCI---', { size: 50 }); const svg = sym.asSVG(); if (!svg || svg.length < 100) throw new Error('SVG broken'); console.log('milsymbol OK');"

COPY milsymbol-server/index.js .

# Install Python dependencies for API
WORKDIR /app
COPY backend/api/requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Copy application code
COPY backend/api/ .

# Create directories
RUN mkdir -p /tmp/qgis_projects /var/log/qgis

# Override QGIS Server environment
ENV QGIS_SERVER_LOG_LEVEL=0 \
    QGIS_SERVER_PARALLEL_RENDERING=1 \
    QGIS_SERVER_MAX_THREADS=2 \
    QGIS_SERVER_CACHE_DIRECTORY=/tmp/qgis_cache \
    QGIS_SERVER_CACHE_SIZE=50 \
    QGIS_SERVER_IGNORE_BAD_LAYERS=1

# Milsymbol server configuration
ENV MILSYMBOL_PORT=2525 \
    MILSYMBOL_DEFAULT_SIZE=100 \
    MILSYMBOL_MAX_CANVAS=2000 \
    MILSYMBOL_SERVER_URL=http://localhost:2525

# QGIS Server via base image nginx on port 80
# The base image nginx exposes /ows/ location that rewrites to FastCGI
# Use 127.0.0.1 instead of localhost to avoid DNS resolution issues in containers
ENV QGIS_SERVER_URL=http://127.0.0.1:80/ows/

# Copy startup script
COPY backend/api/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3000 80 9993 2525

CMD ["/start.sh"]
