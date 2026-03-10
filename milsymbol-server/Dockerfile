FROM node:18-slim

# Install canvas native dependencies (libpng, libjpeg, etc.)
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY index.js .

# Non-root user for security
USER node

EXPOSE 2525

HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "const h=require('http');h.get('http://localhost:2525/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
