# Fase 3: Test Sistema Completo su Render.com

## ⚠️ Aggiornamento: Test su Render.com

Questa fase è stata aggiornata per deployment e test su **Render.com** invece di Docker locale.

## 📚 Documentazione Deployment

### Guide Complete

1. **[DEPLOY-QUICK-START.md](DEPLOY-QUICK-START.md)** - Setup rapido (10 minuti)
2. **[RENDER-DEPLOYMENT.md](RENDER-DEPLOYMENT.md)** - Guida completa e dettagliata
3. **[render.yaml](render.yaml)** - Blueprint Render.com (auto-deploy)

### File Configurazione Creati

- `render.yaml` - Blueprint per deploy automatico
- `Dockerfile.qgis` - Container QGIS Server
- `qgis-server/nginx.conf` - Reverse proxy per QGIS Server
- `qgis-server/supervisord.conf` - Process manager
- `qgis-server/run_qgis_server.sh` - Startup script

## 🎯 Obiettivi Fase 3

## 🎯 Obiettivi Fase 3

1. **Deploy su Render.com**: Tutti i servizi in produzione
2. **Test Backend API**: Verificare endpoints in production
3. **Test Frontend**: Caricamento dinamico progetti su ambiente reale
4. **Test Workflow Completo**: Upload progetto QGIS → visualizzazione web
5. **Monitoring**: Verificare logs e performance

## 🚀 Procedura Test Render.com

### Prerequisiti

- ✅ Account Render.com creato
- ✅ Repository GitHub configurato
- ✅ Codice pushed su `main` branch
- ✅ File deployment creati (render.yaml, Dockerfile.qgis, ecc.)

### Step-by-Step

Segui le guide nell'ordine:

1. **[DEPLOY-QUICK-START.md](DEPLOY-QUICK-START.md)** (10 min)
   - Push codice GitHub
   - Crea database PostgreSQL
   - Deploy backend API
   - Deploy frontend

2. **[RENDER-DEPLOYMENT.md](RENDER-DEPLOYMENT.md)** (dettagli)
   - Configurazione avanzata
   - Environment variables
   - QGIS Server (opzionale)
   - Troubleshooting

## ✅ Test Production API

### Base Tests

```bash
# 1. Avvia tutti i servizi
cd c:\Users\Public\Documents\intelligeo\dufour-app
docker-compose up -d

# Verifica servizi attivi
docker-compose ps

# Servizi attesi:
# - postgis (porta 5432)
# - qgis-server (porta 8080)
# - dufour-api (porta 3000)
# - frontend-dev (porta 5173)
```

### Test Endpoints API

#### Health Check
```bash
# Verifica API attiva
curl http://localhost:3000/

# Verifica status servizi
curl http://localhost:3000/api/status
```

#### Test Progetti

**Lista progetti (vuota inizialmente)**:
```bash
curl http://localhost:3000/api/projects
# Expected: []
```

**Upload progetto di test** (serve file .qgs):
```bash
# Crea progetto QGIS test o usa esempio
curl -X POST http://localhost:3000/api/projects \
  -F "name=test_project" \
  -F "title=Test Project" \
  -F "description=Progetto di test per Dufour-app" \
  -F "file=@path/to/project.qgs"

# Expected:
# {
#   "success": true,
#   "message": "Project published successfully",
#   "project": {...},
#   "wms_url": "http://qgis-server:80/...",
#   "wms_capabilities": "..."
# }
```

**Recupera progetto**:
```bash
curl http://localhost:3000/api/projects/test_project

# Expected: Project metadata con extent, CRS, layers
```

**Elimina progetto**:
```bash
curl -X DELETE http://localhost:3000/api/projects/test_project

# Expected:
# {
#   "success": true,
#   "message": "Project deleted successfully"
# }
```

#### Test QWC Themes

**Lista temi**:
```bash
curl http://localhost:3000/api/v1/themes
# Expected: Array di temi disponibili
```

**Ottieni tema specifico**:
```bash
curl http://localhost:3000/api/v1/themes/test_project

# Expected: JSON con themeLayers, extent, backgroundLayers
```

#### Test Database Operations

**Crea tabella PostGIS**:
```bash
curl -X POST http://localhost:3000/api/databases/gisdb/tables \
  -H "Content-Type: application/json" \
  -d '{
    "schema_name": "public",
    "table_name": "test_features",
    "columns": [
      {"name": "id", "type": "SERIAL PRIMARY KEY"},
      {"name": "name", "type": "VARCHAR(255)"},
      {"name": "description", "type": "TEXT"}
    ],
    "geometry_column": "geom",
    "geometry_type": "POINT",
    "srid": 3857
  }'

# Expected: {"success": true, "table_created": true}
```

**Upload features CSV** (richiede file CSV formato COPY):
```bash
curl -X POST http://localhost:3000/api/databases/gisdb/tables/test_features/upload \
  -F "schema=public" \
  -F "file=@data.csv"

# Expected: {"success": true, "rows_inserted": N}
```

### Verifica QGIS Server

```bash
# GetCapabilities
curl "http://localhost:8080/cgi-bin/qgis_mapserv.fcgi?SERVICE=WMS&REQUEST=GetCapabilities&MAP=/data/projects/test_project.qgs"

# Expected: XML con layer definitions
```

### Verifica PostGIS

```bash
# Connect al database
docker exec -it dufour-postgis psql -U gisuser -d gisdb

# Comandi SQL:
\dt public.*              # Lista tabelle
SELECT * FROM test_features LIMIT 5;
SELECT ST_AsText(geom) FROM test_features LIMIT 1;
\q
```

## 2️⃣ Test Frontend

### Avvio Frontend Development

```bash
cd frontend
npm install
npm run dev

# Accedi a: http://localhost:5173
```

### Test Checklist

#### ✅ ProjectSelector Component
- [ ] Appare nella StatusBar (in basso a sinistra)
- [ ] Mostra "Nessun progetto" se API restituisce array vuoto
- [ ] Dropdown popolato dopo upload progetto
- [ ] Cambio progetto trigger caricamento theme
- [ ] Bottone refresh funziona
- [ ] Gestione errori (API offline, progetto non trovato)

#### ✅ MapComponent Dynamic Loading
- [ ] Mappa inizializza con SwissTopo background
- [ ] Selezionare progetto carica layer WMS da QGIS Server
- [ ] Vista si adatta all'extent del progetto
- [ ] Layer appaiono sulla mappa
- [ ] Layer visibili/nascosti in base a theme config

#### ✅ LayerTreePanel
- [ ] Panel accessibile da Ribbon → Layers
- [ ] Mostra layer caricati dal progetto
- [ ] Base maps con radio button
- [ ] Overlay layers con checkbox
- [ ] Toggle visibilità funziona
- [ ] Layer tree si aggiorna al cambio progetto

#### ✅ Redux Store
- [ ] State `app.projects` popolato
- [ ] State `app.currentProject` aggiornato
- [ ] State `app.themeConfig` contiene theme JSON
- [ ] State `app.layers` sincronizzato con OpenLayers

### Test con Browser DevTools

```javascript
// Console comandi per debug:

// 1. Verifica Redux store
window.store.getState().app

// 2. Verifica progetti caricati
window.store.getState().app.projects

// 3. Verifica theme config
window.store.getState().app.themeConfig

// 4. Verifica layer OpenLayers
window.mapInstance?.getLayers().getArray()

// 5. Test cambio progetto
window.store.dispatch(setCurrentProject('test_project'))
```

## 3️⃣ Workflow Completo (Simulato)

### Scenario: Pubblicare progetto "Tactical Operations"

#### Step 1: Preparare progetto QGIS
```
1. Apri QGIS Desktop
2. Crea nuovo progetto
3. Aggiungi layer:
   - SwissTopo WMS base
   - PostGIS layer "military_units"
   - Shapefile "operational_zones.shp"
4. Configura stili e labels
5. Salva come tactical_ops.qgs
```

#### Step 2: Upload via API (simula plugin)
```bash
curl -X POST http://localhost:3000/api/projects \
  -F "name=tactical_ops" \
  -F "title=Tactical Operations" \
  -F "description=Military tactical planning map" \
  -F "file=@tactical_ops.qgs"
```

#### Step 3: Verifica generazione theme
```bash
# Check tema generato
curl http://localhost:3000/api/v1/themes/tactical_ops

# Verifica file system
ls backend/api/qwc-config/themes/tactical_ops.json
cat backend/api/qwc-config/themes/tactical_ops.json
```

#### Step 4: Test frontend
```
1. Accedi a http://localhost:5173
2. ProjectSelector mostra "Tactical Operations"
3. Seleziona progetto
4. Mappa carica layer
5. LayerTree mostra struttura progetto
6. Toggle layer funziona
```

#### Step 5: Upload dati PostGIS (opzionale)
```bash
# Crea tabella
curl -X POST http://localhost:3000/api/databases/gisdb/tables \
  -H "Content-Type: application/json" \
  -d '{...}'

# Upload features
curl -X POST http://localhost:3000/api/databases/gisdb/tables/military_units/upload \
  -F "schema=public" \
  -F "file=@units.csv"
```

## 4️⃣ Docker Deployment

### Build Containers

```bash
# Build backend API
docker build -t dufour-api:latest backend/api

# Build frontend (production)
docker build -t dufour-frontend:latest frontend

# Verifica images
docker images | grep dufour
```

### Test Production Setup

```bash
# Stop development containers
docker-compose down

# Start production
docker-compose -f docker-compose.prod.yml up -d

# Verifica
docker-compose -f docker-compose.prod.yml ps
curl http://localhost:3000/api/status
curl http://localhost/  # Frontend via nginx
```

### Resource Monitoring

```bash
# CPU/Memory usage
docker stats

# Logs
docker-compose logs -f dufour-api
docker-compose logs -f qgis-server
docker-compose logs -f postgis

# Disk usage
docker system df
```

## 5️⃣ Performance Testing

### Load Testing API

```bash
# Install Apache Bench
# Test concurrent requests
ab -n 1000 -c 10 http://localhost:3000/api/projects

# Test theme endpoint
ab -n 500 -c 5 http://localhost:3000/api/v1/themes/tactical_ops
```

### Frontend Performance

- [ ] Lighthouse score (Performance, Accessibility, SEO)
- [ ] Time to Interactive < 3s
- [ ] Layer loading time < 1s per project
- [ ] Memory usage stable dopo 10 cambios progetto

## 6️⃣ Troubleshooting

### API non risponde
```bash
# Check logs
docker logs dufour-api

# Check network
docker network inspect dufour-app_default

# Test database connection
docker exec dufour-api python -c "import psycopg2; conn = psycopg2.connect('postgresql://gisuser:gispassword@postgis:5432/gisdb'); print('OK')"
```

### QGIS Server errori
```bash
# Check logs
docker logs qgis-server

# Test GetCapabilities
curl "http://localhost:8080/cgi-bin/qgis_mapserv.fcgi?SERVICE=WMS&REQUEST=GetCapabilities"

# Verifica progetti directory
docker exec qgis-server ls -la /data/projects
```

### Frontend build errors
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### PostGIS connection issues
```bash
# Restart container
docker-compose restart postgis

# Check port
netstat -an | grep 5432

# Test connection
psql -h localhost -U gisuser -d gisdb -p 5432
```

## 7️⃣ Acceptance Criteria

### ✅ Sistema funzionante se:
- [ ] Backend API risponde a tutti gli endpoints
- [ ] QGIS Server serve WMS correttamente
- [ ] PostGIS accetta connessioni e query
- [ ] Frontend carica senza errori
- [ ] ProjectSelector mostra progetti
- [ ] Cambio progetto carica layer sulla mappa
- [ ] LayerTree mostra e controlla layer
- [ ] Upload progetto funziona via API
- [ ] Theme config generato correttamente
- [ ] WMS GetMap funziona per layer progetto
- [ ] Docker containers avviano senza errori
- [ ] Logs non mostrano errori critici

## 8️⃣ Next Steps dopo Fase 3

### Fase 0: QGIS Desktop Plugin (opzionale)
- Fork qgis-cloud-plugin
- Modifica endpoint da qgiscloud.com a localhost:3000
- Test upload progetto da QGIS Desktop
- Packaging plugin per distribuzione

### Miglioramenti Sistema
- [ ] Authentication/Authorization (JWT tokens)
- [ ] Multi-tenancy (progetti per utente)
- [ ] Versioning progetti (git-like)
- [ ] Thumbnails progetti (preview images)
- [ ] Search/filter progetti
- [ ] Project templates
- [ ] Backup/restore automatico

### Deployment Production
- [ ] Setup SSL/TLS (Let's Encrypt)
- [ ] Domain configuration
- [ ] CDN per static assets
- [ ] Database backups automatici
- [ ] Monitoring (Prometheus/Grafana)
- [ ] Log aggregation (ELK stack)
- [ ] CI/CD pipeline (GitHub Actions)

## 📊 Test Report Template

```markdown
## Test Results - [Data]

### Environment
- Docker version: X.X.X
- Node version: X.X.X
- PostgreSQL version: 15
- QGIS Server version: 3.X

### Backend API
- ✅/❌ Health check
- ✅/❌ Project list
- ✅/❌ Project upload
- ✅/❌ Theme generation
- ✅/❌ Database operations

### Frontend
- ✅/❌ App loads
- ✅/❌ ProjectSelector works
- ✅/❌ Layer loading
- ✅/❌ LayerTree controls

### Performance
- API response time: X ms
- Frontend load time: X s
- Layer load time: X s

### Issues Found
1. [Description]
2. [Description]

### Notes
- [Additional observations]
```

## 🎯 Success Metrics

- **Uptime**: > 99%
- **API Response Time**: < 200ms
- **Frontend Load**: < 3s
- **Layer Switch**: < 1s
- **Error Rate**: < 1%
- **Docker Build**: < 5min
- **Test Coverage**: > 80%
