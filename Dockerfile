# Multi-stage production build 
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY frontend/ ./

# Build arguments for environment variables
ARG VITE_API_URL=https://dufour-api.onrender.com
ARG VITE_QGIS_SERVER_URL=https://dufour-qgis.onrender.com

# Set as environment variables for Vite build
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_QGIS_SERVER_URL=${VITE_QGIS_SERVER_URL}

# Build the application
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine

# Copy custom nginx config (for Render.com - no upstream proxy)
COPY nginx/nginx-render.conf /etc/nginx/nginx.conf

# Copy built frontend from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Add health check script
RUN echo '#!/bin/sh' > /healthcheck.sh && \
    echo 'wget -q --spider http://localhost/ || exit 1' >> /healthcheck.sh && \
    chmod +x /healthcheck.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /healthcheck.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
