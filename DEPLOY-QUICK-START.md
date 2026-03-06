# Quick Start - Deploy su Render.com

Guida rapida per deployment Dufour-app su Render.com.

## 🚀 Setup Rapido (10 minuti)

### 1. Push su GitHub

```bash
cd c:\Users\Public\Documents\intelligeo\dufour-app

git add .
git commit -m "Setup deployment Render.com"
git push origin main
```

### 2. Crea Servizi su Render.com

Accedi a https://dashboard.render.com

#### Database (Step 1)
1. New → PostgreSQL
2. Name: `dufour-postgis`
3. Database: `gisdb`
4. Region: Frankfurt
5. Plan: Free
6. Create Database
7. Attendi provisioning (2-3 min)
8. Connetti e abilita PostGIS:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

#### Backend API (Step 2)
1. New → Web Service
2. Connect repository: `mlanini/dufour-app`
3. Name: `dufour-api`
4. Runtime: Docker
5. Docker Context: `./backend/api`
6. Dockerfile Path: `./backend/api/Dockerfile`
7. Plan: Free
8. Environment Variables:
   - Link database `dufour-postgis` (auto)
   - Add: `QGIS_SERVER_URL` = `https://dufour-qgis.onrender.com`
   - Add: `PROJECTS_DIR` = `/data/projects`
   - Add: `QWC_CONFIG_DIR` = `/qwc-config`
9. Create Web Service
10. Attendi build (5-10 min)

#### Frontend (Step 3)
1. New → Web Service
2. Connect repository: `mlanini/dufour-app`
3. Name: `dufour-frontend`
4. Runtime: Docker
5. Dockerfile Path: `./Dockerfile`
6. Plan: Free
7. Environment Variables:
   - `NODE_ENV` = `production`
   - `VITE_API_URL` = `https://dufour-api.onrender.com`
   - `VITE_QGIS_SERVER_URL` = `https://dufour-qgis.onrender.com`
8. Create Web Service
9. Attendi build (3-5 min)

## ✅ Test Veloce

```bash
# Test API
curl https://dufour-api.onrender.com/
curl https://dufour-api.onrender.com/api/status

# Accedi frontend
# Apri: https://dufour-frontend.onrender.com
```

## 📋 URLs Finali

- **Frontend**: https://dufour-frontend.onrender.com
- **Backend API**: https://dufour-api.onrender.com
- **API Docs**: https://dufour-api.onrender.com/docs
- **Database**: Internal (via environment variables)

## ⚠️ Note Import<br/>
- **Free tier**: servizi in sleep dopo 15min inattività
- **Primo request**: può richiedere 30-60s (cold start)
- **QGIS Server**: richiede piano Starter ($7/mese)
- **Storage progetti**: temporaneo su free tier (resetta a deploy)

## 📚 Documentazione Completa

Vedi [RENDER-DEPLOYMENT.md](RENDER-DEPLOYMENT.md) per:
- Setup dettagliato
- Troubleshooting
- Monitoring
- Costi
- QGIS Server deployment
