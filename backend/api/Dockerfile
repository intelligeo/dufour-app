# Multi-stage build: Backend API + QGIS Server embedded
FROM ubuntu:22.04 AS qgis-server

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install QGIS Server and dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    software-properties-common \
    && wget -qO - https://qgis.org/downloads/qgis-2022.gpg.key | gpg --no-default-keyring --keyring gnupg-ring:/etc/apt/trusted.gpg.d/qgis-archive.gpg --import \
    && chmod a+r /etc/apt/trusted.gpg.d/qgis-archive.gpg \
    && add-apt-repository "deb https://qgis.org/ubuntu-ltr jammy main" \
    && apt-get update \
    && apt-get install -y \
        qgis-server \
        python3-qgis \
        python3-pip \
        libpq-dev \
        gcc \
        spawn-fcgi \
        xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for API
WORKDIR /app
COPY backend/api/requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application code
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

# Create startup script
RUN echo '#!/bin/bash\n\
# Start QGIS Server via spawn-fcgi\n\
Xvfb :99 -screen 0 1024x768x24 -nolisten tcp &\n\
export DISPLAY=:99\n\
spawn-fcgi -n -p 8080 -f /usr/lib/cgi-bin/qgis_mapserv.fcgi &\n\
\n\
# Start FastAPI\n\
exec uvicorn main:app --host 0.0.0.0 --port 3000\n\
' > /start.sh && chmod +x /start.sh

EXPOSE 3000 8080

CMD ["/start.sh"]
