# Gemini Explorer - Deployment Documentation

## 🚨 CRITICAL: Docker Build Context Issue

### The Problem
The `Dockerfile.backend` is located at **PROJECT ROOT**, but `docker-compose.prod.yml` sets the build context to **PROJECT ROOT** (`.`).

This means:
- ❌ **WRONG**: `COPY requirements.txt .` - file not found (it's in `backend/`)
- ✅ **CORRECT**: `COPY backend/requirements.txt .` - copies from backend subdirectory

### File Structure
```
gemini-3-exploration/
├── Dockerfile.backend          # At ROOT (build context is here)
├── docker-compose.prod.yml     # Context: ".", Dockerfile: "Dockerfile.backend"
├── backend/
│   ├── requirements.txt        # Must be referenced as "backend/requirements.txt"
│   ├── main.py
│   ├── routers/
│   └── ...
├── frontend/
│   └── dist/                   # Built locally, committed to git
└── deploy/
    ├── nginx.conf              # HTTP only
    └── nginx-ssl.conf          # HTTPS + WebSocket support
```

### Dockerfile.backend - CORRECT VERSION
```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage cache
COPY backend/requirements.txt .    # ← MUST include "backend/" prefix
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ .                    # ← MUST include "backend/" prefix

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### docker-compose.prod.yml - CORRECT VERSION
```yaml
version: '3.8'

services:
  backend:
    image: gemini-backend:latest
    build:
      context: .                    # ← Build context is PROJECT ROOT
      dockerfile: Dockerfile.backend # ← Dockerfile at ROOT
    command: uvicorn main:app --host 0.0.0.0 --port 8001
    ports:
      - "8001:8001"
    env_file:
      - ./backend/.env
    restart: always

  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"                   # ← HTTPS support
    volumes:
      - ./frontend/dist:/usr/share/nginx/html
      - ./deploy/nginx-ssl.conf:/etc/nginx/nginx.conf:ro  # ← SSL config
    depends_on:
      - backend
    restart: always
```

---

## 📋 Proper Deployment Workflow

### 🔴 NEVER do this:
- ❌ Push code changes → rebuild on server
- ❌ Modify docker-compose without testing locally
- ❌ Assume paths work without checking file structure

### ✅ ALWAYS follow this workflow:

#### 1. Build Frontend Locally
```bash
docker exec -w /workspace/gemini-3-exploration/frontend linux_dev_container npm run build
```

#### 2. Commit Everything (including dist/)
```bash
docker exec -w /workspace/gemini-3-exploration linux_dev_container git add -A
docker exec -w /workspace/gemini-3-exploration linux_dev_container git commit -m "Your message"
docker exec -w /workspace/gemini-3-exploration linux_dev_container git push origin master
```

#### 3. Deploy to Production
```cmd
gcloud compute ssh gemini-server --zone=us-central1-a --project=gemini-explorer-478900 --command="sudo bash /tmp/restart_all.sh"
```

---

## 🐛 Common Errors & Solutions

### Error: `file not found in build context: stat requirements.txt`
**Cause**: Dockerfile trying to copy from wrong path  
**Solution**: Use `COPY backend/requirements.txt .` (with backend/ prefix)

### Error: `'ContainerConfig'` KeyError
**Cause**: Docker Compose trying to recreate containers with corrupted image metadata  
**Solution**: Run full cleanup with `restart_all.sh`:
```bash
cd /opt/gemini-3-exploration
sudo docker-compose -f docker-compose.prod.yml down -v --rmi all
sudo docker-compose -f docker-compose.prod.yml up -d --build
```

### Error: `nginx.conf not found` or `nginx-ssl.conf not found`
**Cause**: Volume mount path incorrect  
**Solution**: Ensure `deploy/nginx-ssl.conf` exists in git and is mounted as:
```yaml
volumes:
  - ./deploy/nginx-ssl.conf:/etc/nginx/nginx.conf:ro
```

### Error: `WebSocket connection failed`
**Cause**: nginx.conf doesn't have WebSocket proxy setup  
**Solution**: Use `nginx-ssl.conf` which includes:
```nginx
location /ws/ {
    proxy_pass http://backend:8001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # ... other headers
}
```

---

## 🔐 HTTPS Setup (Already Done)

### SSL Certificate
- **Domain**: geminiexplorer.duckdns.org
- **Certificate**: Let's Encrypt (auto-renews)
- **Location**: `/etc/letsencrypt/live/geminiexplorer.duckdns.org/`

### Renewal
Certbot timer is enabled and will auto-renew ~60 days before expiration.

**Manual renewal test:**
```bash
sudo certbot renew --dry-run
```

---

## 📁 Deployment Scripts

### `/tmp/restart_all.sh` (on server)
Full clean rebuild and restart:
```bash
#!/bin/bash
set -e

cd /opt/gemini-3-exploration

echo "🧹 Removing all containers, images, and volumes..."
sudo docker-compose -f docker-compose.prod.yml down -v --rmi all

echo "🔧 Rebuilding and starting services..."
sudo docker-compose -f docker-compose.prod.yml up -d --build

echo "✅ All services are up!"
```

### `/tmp/update_frontend.sh` (on server)
Quick update (no rebuild):
```bash
#!/bin/bash
cd /opt/gemini-3-exploration
sudo git fetch --all
sudo git reset --hard origin/master
sudo docker-compose -f docker-compose.prod.yml up -d
```

---

## 🎯 Pre-Deployment Checklist

Before deploying, verify:

- [ ] Frontend built locally: `docker exec ... npm run build`
- [ ] All changes committed and pushed to GitHub
- [ ] `frontend/dist/` directory committed to git
- [ ] `Dockerfile.backend` uses `COPY backend/...` paths
- [ ] `docker-compose.prod.yml` has correct context (`.`) and dockerfile path
- [ ] `nginx-ssl.conf` exists in `deploy/` directory
- [ ] `.env` file exists in `backend/` with `GEMINI_API_KEY`

---

## 🌐 Production URLs

- **HTTP** (redirects to HTTPS): http://geminiexplorer.duckdns.org
- **HTTPS**: https://geminiexplorer.duckdns.org
- **WebSocket (Live Mode)**: wss://geminiexplorer.duckdns.org/ws/live

---

## 📞 Quick Commands Reference

### Check service status
```bash
gcloud compute ssh gemini-server --zone=us-central1-a --project=gemini-explorer-478900 --command="docker ps"
```

### View logs
```bash
gcloud compute ssh gemini-server --zone=us-central1-a --project=gemini-explorer-478900 --command="docker logs gemini-3-exploration_backend_1"
```

### SSH to server
```bash
gcloud compute ssh gemini-server --zone=us-central1-a --project=gemini-explorer-478900
```

---

## 💡 Remember

1. **Build context = PROJECT ROOT**
2. **All COPY commands in Dockerfile must use `backend/` prefix**
3. **Always build frontend locally before pushing**
4. **Use `restart_all.sh` when docker-compose changes**
5. **Use `update_frontend.sh` for code-only updates**
