# FrenzyFront Deployment Guide

## Server Details

- **IP**: 167.235.146.119
- **Domain**: frenzyfront.io (via Cloudflare)
- **Static files**: `/opt/frenzyfront/static/`
- **Web server**: nginx

## Quick Deploy (Copy & Paste)

```powershell
# 1. Build production bundle
npm run build-prod

# 2. Upload files to server
scp static/js/*.js root@167.235.146.119:/opt/frenzyfront/static/js/
scp static/index.html root@167.235.146.119:/opt/frenzyfront/static/

# 3. Restart nginx to serve new files
ssh root@167.235.146.119 "systemctl restart nginx"
```

## Step-by-Step

### 1. Build Production Bundle

```powershell
npm run build-prod
```

This creates optimized files in `static/` with hashed filenames.

### 2. Upload JavaScript Files

```powershell
scp static/js/*.js root@167.235.146.119:/opt/frenzyfront/static/js/
```

### 3. Upload index.html

```powershell
scp static/index.html root@167.235.146.119:/opt/frenzyfront/static/
```

The new `index.html` references the new JS bundle hashes.

### 4. Restart nginx (Required!)

```powershell
ssh root@167.235.146.119 "systemctl restart nginx"
```

**Important**: nginx caches file handles. Without restart, it may serve old files.

### 5. Verify Deployment

```powershell
ssh root@167.235.146.119 "ls -la /opt/frenzyfront/static/js/ | tail -5"
```

Check that timestamps match your build time.

## Troubleshooting

### Still seeing old version?

1. Restart nginx: `ssh root@167.235.146.119 "systemctl restart nginx"`
2. Clear browser cache (Ctrl+Shift+R)
3. Try incognito/different browser

### Check nginx config

```powershell
ssh root@167.235.146.119 "cat /etc/nginx/sites-enabled/default"
```

### Check running processes

```powershell
ssh root@167.235.146.119 "ps aux | grep node"
```

## Architecture Notes

- nginx serves static files from `/opt/frenzyfront/static/`
- API/WebSocket requests proxy to Node.js on ports 3000-3002
- Node.js runs via ts-node directly (not Docker/PM2)
