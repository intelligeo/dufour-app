FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for volumes
RUN mkdir -p /projects /qwc-config/themes

# Initialize with test project
RUN echo '<!DOCTYPE qgis PUBLIC '\''http://mrcc.com/qgis.dtd'\'' '\''SYSTEM'\''>' > /projects/test.qgs && \
    echo '<qgis projectname="Test" version="3.28.0">' >> /projects/test.qgs && \
    echo '  <title>Test Project</title>' >> /projects/test.qgs && \
    echo '  <mapcanvas><extent><xmin>664577</xmin><ymin>5752993</ymin><xmax>1167741</xmax><ymax>6075303</ymax></extent>' >> /projects/test.qgs && \
    echo '  <destinationsrs><spatialrefsys><authid>EPSG:2056</authid></spatialrefsys></destinationsrs></mapcanvas>' >> /projects/test.qgs && \
    echo '</qgis>' >> /projects/test.qgs

# Expose port
EXPOSE 3000

# Run FastAPI with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--reload"]
