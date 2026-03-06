# Deployment su Render.com - Guida Completa

## 📋 Prerequisiti

1. Account Render.com (gratuito)
2. Repository GitHub con codice Dufour-app
3. Git configurato localmente

## 🚀 Setup Iniziale

### 1. Preparazione Repository

```bash
cd c:\Users\Public\Documents\intelligeo\dufour-app

# Assicurati che tutti i file siano committati
git status
git add .
git commit -m "Setup per deployment Render.com"
git push origin main
```

### 2. Connetti Render.com a GitHub

1. Accedi a https://render.com
2. Dashboard → New → Blueprint
3. Connetti repository GitHub `mlanini/dufour-app`
4. Seleziona branch `main`
5. Render rileverà automaticamente `render.yaml`

## 🗄️ Setup Database (Fase 1)

### Crea PostgreSQL con PostGIS

1. **Dashboard Render → New → PostgreSQL**
   - Name: `dufour-postgis`
   - Database: `gisdb`
   - User: `gisuser`
   - Region: Frankfurt
   - Plan: Free (500 MB, per test)

2. **Attendi creazione database** (2-3 minuti)

3. **Abilita PostGIS Extension**
   ```bash
   # Dalla dashboard del database, usa PSQL Connection String
   psql postgres://gisuser:[PASSWORD]@[HOST]/gisdb
   
   # Nel prompt psql:
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS postgis_topology;
   \dx  # Verifica extensions
   \q
   ```

4. **Salva credenziali**
   - Host: `dpg-xxxxx.frankfurt-postgres.render.com`
   - Port: `5432`
   - Database: `gisdb`
   - User: `gisuser`
   - Password: [generata automaticamente]
   - Connection String: `postgres://gisuser:...`

## 🔧 Deploy Backend API (Fase 2)

### Modifica Dockerfile Backend per Render

Il Dockerfile in `backend/api/Dockerfile` è già pronto, ma verifica:

```dockerfile
# Assicurati che esponga la porta corretta
EXPOSE 3000

# E che usi variabili d'ambiente
ENV POSTGIS_HOST=${POSTGIS_HOST}
ENV POSTGIS_PORT=${POSTGIS_PORT}
```

### Deploy via Render Dashboard

1. **Dashboard → New → Web Service**
2. **Configurazione**:
   - Name: `dufour-api`
   - Runtime: Docker
   - Docker Context: `./backend/api`
   - Dockerfile Path: `./backend/api/Dockerfile`
   - Branch: `main`
   - Region: Frankfurt
   - Plan: Free

3. **Environment Variables** (Auto-configured da render.yaml):
   - `POSTGIS_HOST` → from database
   - `POSTGIS_PORT` → from database
   - `POSTGIS_DB` → from database
   - `POSTGIS_USER` → from database
   - `POSTGIS_PASSWORD` → from database
   - `QGIS_SERVER_URL` → `https://dufour-qgis.onrender.com`
   - `PROJECTS_DIR` → `/data/projects`
   - `QWC_CONFIG_DIR` → `/qwc-config`

4. **Deploy**: Click "Create Web Service"

5. **Attendi build** (5-10 minuti prima deploy)

6. **Verifica**:
   ```bash
   # Health check
   curl https://dufour-api.onrender.com/
   
   # API status
   curl https://dufour-api.onrender.com/api/status
   ```

## 🗺️ Deploy QGIS Server (Fase 3)

### Nota: Piano a pagamento richiesto

QGIS Server richiede più risorse del free tier. Opzioni:

**Opzione A: Piano Starter ($7/mese)**
- 512 MB RAM
- Sufficiente per test/dev

**Opzione B: Skip QGIS Server (per ora)**
- Testa solo backend API
- Usa WMS esterno temporaneo

### Deploy QGIS Server (se Starter plan)

1. **Dashboard → New → Web Service**
2. **Configurazione**:
   - Name: `dufour-qgis`
   - Runtime: Docker
   - Dockerfile Path: `./Dockerfile.qgis`
   - Branch: `main`
   - Region: Frankfurt
   - Plan: Starter

3. **Environment Variables**:
   - `QGIS_SERVER_LOG_LEVEL` → `0`
   - `QGIS_SERVER_PARALLEL_RENDERING` → `true`

4. **Deploy**

5. **Verifica**:
   ```bash
   curl "https://dufour-qgis.onrender.com/cgi-bin/qgis_mapserv.fcgi?SERVICE=WMS&REQUEST=GetCapabilities"
   ```

## 🎨 Deploy Frontend (Fase 4)

### Aggiorna Dockerfile per variabili runtime

Il Dockerfile root è già configurato. Verifica che usi ARG per build-time:

```dockerfile
ARG VITE_API_URL
ARG VITE_QGIS_SERVER_URL
```

### Deploy Frontend

1. **Dashboard → New → Web Service**
2. **Configurazione**:
   - Name: `dufour-frontend`
   - Runtime: Docker
   - Dockerfile Path: `./Dockerfile`
   - Branch: `main`
   - Region: Frankfurt
   - Plan: Free

3. **Environment Variables**:
   - `NODE_ENV` → `production`
   - `VITE_API_URL` → `https://dufour-api.onrender.com`
   - `VITE_QGIS_SERVER_URL` → `https://dufour-qgis.onrender.com`

4. **Deploy**

5. **Accedi**: https://dufour-frontend.onrender.com

## ✅ Test Sistema (Fase 5)

### Test Backend API

```bash
# Base URL
export API_URL="https://dufour-api.onrender.com"

# 1. Health check
curl $API_URL/

# 2. Status (verifica connessione DB e QGIS)
curl $API_URL/api/status

# 3. Lista progetti (inizialmente vuoto)
curl $API_URL/api/projects

# 4. Lista temi
curl $API_URL/api/v1/themes
```

### Upload Progetto Test

Crea un semplice progetto QGIS:

```bash
# Upload progetto
curl -X POST $API_URL/api/projects \
  -F "name=test_tactical" \
  -F "title=Test Tactical Operations" \
  -F "description=Progetto di test" \
  -F "file=@test_project.qgs"

# Verifica tema generato
curl $API_URL/api/v1/themes/test_tactical

# Lista progetti aggiornata
curl $API_URL/api/projects
```

### Test Frontend

1. **Accedi**: https://dufour-frontend.onrender.com

2. **Verifica ProjectSelector**:
   - Appare nella StatusBar?
   - Mostra "Nessun progetto" inizialmente?
   - Dropdown popolato dopo upload?

3. **Test caricamento progetto**:
   - Seleziona progetto dal dropdown
   - Mappa carica layer?
   - Vista si adatta all'extent?

4. **Test LayerTreePanel**:
   - Apri Ribbon → Layers
   - Mostra layer del progetto?
   - Toggle visibilità funziona?

### Browser DevTools

```javascript
// Console checks
console.log('API URL:', import.meta.env.VITE_API_URL);
console.log('QGIS URL:', import.meta.env.VITE_QGIS_SERVER_URL);

// Fetch projects
fetch('https://dufour-api.onrender.com/api/projects')
  .then(r => r.json())
  .then(console.log);

// Redux store
window.store?.getState().app;
```

## 🐛 Troubleshooting Render.com

### Backend API non risponde

```bash
# 1. Check logs
# Dashboard → dufour-api → Logs

# 2. Check environment variables
# Dashboard → dufour-api → Environment

# 3. Riavvia servizio
# Dashboard → dufour-api → Manual Deploy → Deploy latest commit
```

### Frontend errori CORS

Aggiungi al backend `main.py`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://dufour-frontend.onrender.com",
        "http://localhost:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Database connection failed

```bash
# Verifica extension PostGIS
psql $DATABASE_URL -c "\dx"

# Verifica connettività
psql $DATABASE_URL -c "SELECT version();"

# Test query PostGIS
psql $DATABASE_URL -c "SELECT PostGIS_version();"
```

### QGIS Server 502 Bad Gateway

- QGIS Server richiede piano Starter o superiore
- Verifica logs per errori memoria
- Considera aumentare plan

### Build failures

```bash
# Frontend: cache npm
# Dashboard → Settings → Clear build cache

# Backend: dependency issues
# Verifica requirements.txt versioni compatibili

# QGIS: base image timeout
# Potrebbe richiedere più tempo, attendi 10-15 minuti
```

## 💰 Costi Stimati

### Free Tier (Test)
- ✅ PostgreSQL Free: 500 MB
- ✅ Backend API Free: 750h/mese
- ✅ Frontend Free: 750h/mese
- ❌ QGIS Server: richiede Starter

**Totale**: $0/mese (senza QGIS Server)

### Starter Tier (Production)
- 💵 PostgreSQL Starter: $7/mese (25 GB)
- 💵 Backend API Starter: $7/mese
- 💵 QGIS Server Starter: $7/mese
- ✅ Frontend Free: 750h/mese

**Totale**: $21/mese

### Professional Tier (High Traffic)
- 💵 PostgreSQL Pro: $20/mese (100 GB)
- 💵 Backend API Pro: $20/mese
- 💵 QGIS Server Pro: $20/mese
- 💵 Frontend Pro: $20/mese

**Totale**: $80/mese

## 🔄 CI/CD Automatico

### Auto-deploy su push

Render.com auto-deploya su ogni push a `main`:

```bash
# Local development
git add .
git commit -m "Fix: ProjectSelector styling"
git push origin main

# Render rileva push e avvia deploy automaticamente
# Logs visibili in dashboard
```

### Deploy Hooks (Webhook)

```bash
# Trigger manual deploy via API
curl -X POST "https://api.render.com/deploy/srv-xxxxx?key=xxxxx"
```

## 📊 Monitoring

### Dashboard Render

- **Metrics**: CPU, Memory, Response time
- **Logs**: Real-time streaming
- **Events**: Deploy history, restarts
- **Alerts**: Email su failures

### Custom Monitoring

Aggiungi health check endpoint al backend:

```python
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(),
        "database": await check_db_connection(),
        "qgis_server": await check_qgis_server()
    }
```

## 🔐 Sicurezza

### Secrets Management

1. **Non committare secrets** in git
2. Usa Environment Variables su Render
3. Rotate database password periodicamente

### HTTPS

- ✅ HTTPS automatico su Render (Let's Encrypt)
- ✅ Custom domain supportato

### Database Security

- ✅ SSL/TLS per connessioni
- ✅ Network isolation
- ✅ Automatic backups (Starter+)

## 🎯 Checklist Deployment

### Pre-deployment
- [ ] Codice pushed su GitHub
- [ ] `render.yaml` configurato
- [ ] Dockerfile testati localmente (opzionale)
- [ ] Environment variables documentate

### Database
- [ ] PostgreSQL creato
- [ ] PostGIS extension abilitata
- [ ] Connection string salvato

### Backend API
- [ ] Web service creato
- [ ] Environment variables configurate
- [ ] Build successful
- [ ] Health check passa
- [ ] `/api/status` risponde

### QGIS Server (opzionale)
- [ ] Web service creato (Starter plan)
- [ ] Build successful
- [ ] GetCapabilities funziona

### Frontend
- [ ] Web service creato
- [ ] Build variabili ambiente corrette
- [ ] Build successful
- [ ] App accessibile
- [ ] ProjectSelector visibile

### Test End-to-End
- [ ] Upload progetto via API
- [ ] Theme generato correttamente
- [ ] Frontend carica progetti
- [ ] Cambio progetto funziona
- [ ] Layer appaiono su mappa
- [ ] LayerTree controlla visibilità

## 📚 Risorse

- **Render Docs**: https://render.com/docs
- **Blueprint Spec**: https://render.com/docs/blueprint-spec
- **PostgreSQL**: https://render.com/docs/databases
- **Docker Deploy**: https://render.com/docs/docker
- **Environment Variables**: https://render.com/docs/environment-variables

## 🆘 Support

- **Render Community**: https://community.render.com
- **Status Page**: https://status.render.com
- **Dufour-app Issues**: https://github.com/mlanini/dufour-app/issues
