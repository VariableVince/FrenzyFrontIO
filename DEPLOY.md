# FrenzyFront Deployment Guide

## Server Details

- **IP**: 167.235.146.119
- **Domain**: frenzyfront.io (via Cloudflare)
- **Static files**: `/opt/frenzyfront/static/`
- **Web server**: nginx

## Quick Deploy (Copy & Paste)

```powershell
# 0. Update version and changelog (DON'T FORGET!)
# - Edit resources/version.txt (e.g., v0.03 → v0.04)
# - Add release notes to resources/changelog.md

# 1. Build production bundle (this embeds version.txt and changelog.md into JS!)
npm run build-prod

# 2. Upload files to server
scp static/js/*.js root@167.235.146.119:/opt/frenzyfront/static/js/
scp static/index.html root@167.235.146.119:/opt/frenzyfront/static/
scp static/changelog.md root@167.235.146.119:/opt/frenzyfront/static/
scp static/version.txt root@167.235.146.119:/opt/frenzyfront/static/

# 2a. Upload images (needed when icons/images change)
# Images are bundled with content hashes - upload all to ensure new ones are available
scp -r static/images root@167.235.146.119:/opt/frenzyfront/static/

# IMPORTANT: If release notes don't load after deploy, you MUST rebuild:
# The changelog.md is embedded in the JS bundle at build time.
# Simply uploading a new changelog.md won't work - you need to rebuild first!

# 2b. Upload music files (only needed once, or when music changes)
# Music is NOT bundled by webpack - it's loaded directly from /sounds/music/
scp -r static/sounds/music root@167.235.146.119:/opt/frenzyfront/static/sounds/

# 3. Restart nginx to serve new files
ssh root@167.235.146.119 "systemctl restart nginx"

# 4. Purge Cloudflare cache (via Cloudflare dashboard → Caching → Purge Everything)
# Or wait ~5 minutes for cache to expire
```

## Step-by-Step

### 0. Update Version & Changelog (DON'T FORGET!)

Before deploying, update:

- `resources/version.txt` - Increment version (e.g., v0.03 → v0.04)
- `resources/changelog.md` - Add release notes at the top

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

### Release Notes Not Loading?

**Root Cause**: The changelog.md is bundled into the JavaScript at build time via webpack.

**Solution**:

1. **ALWAYS update `resources/changelog.md` BEFORE building**
2. Run `npm run build-prod` to bundle the changelog into the JS
3. Upload the new JS files: `scp static/js/*.js root@167.235.146.119:/opt/frenzyfront/static/js/`
4. Purge Cloudflare cache (see below)
5. Hard refresh your browser (Ctrl+Shift+R)

**Why this happens**: Simply uploading a new `changelog.md` won't work because the NewsModal fetches the version that was embedded during the build process.

### Still seeing old version or "Loading version..."?

**The version and changelog are bundled into the JS at build time!**
They are NOT loaded dynamically from the server.

1. Make sure you updated `resources/version.txt` and `resources/changelog.md` BEFORE running `npm run build-prod`
2. If you forgot, rebuild: `npm run build-prod` and re-upload JS files
3. Restart nginx: `ssh root@167.235.146.119 "systemctl restart nginx"`
4. **Purge Cloudflare cache**: Cloudflare Dashboard → Caching → Configuration → Purge Everything
5. **Hard refresh browser** (Ctrl+Shift+R / Cmd+Shift+R) - regular F5 is NOT enough!
6. Or try incognito mode to bypass all caches

### ⚠️ IMPORTANT: Soft Refresh vs Hard Refresh

| Refresh Type | Shortcut     | Clears JS Cache?                          |
| ------------ | ------------ | ----------------------------------------- |
| Soft Refresh | F5           | ❌ NO - Uses cached JS even with new HTML |
| Hard Refresh | Ctrl+Shift+R | ✅ YES - Forces re-download of all assets |
| Incognito    | Ctrl+Shift+N | ✅ YES - No cache at all                  |

**Common symptom of stale cache**: New features don't appear, icons are broken/missing, or old bugs persist after deployment.

### Icons/Images Missing In-Game?

**Symptom**: Artillery, defense post, or other icons don't appear in the game UI.

**Root Cause**: Images were not uploaded to the server after a build.

**Solution**:

```powershell
# Upload all images to the server
scp -r static/images root@167.235.146.119:/opt/frenzyfront/static/

# Verify the image exists
ssh root@167.235.146.119 "ls /opt/frenzyfront/static/images/ | grep -i artillery"

# Restart nginx and purge cache
ssh root@167.235.146.119 "systemctl restart nginx"
```

**Prevention**: Always run the image upload step when deploying changes that add or modify icons.

### Why does Cloudflare cache matter?

The site uses Cloudflare CDN. Even after uploading new files:

- Cloudflare may serve cached copies for up to 4 hours
- Purging the cache forces Cloudflare to fetch fresh files from nginx
- Nginx now sends `no-cache` headers for index.html to minimize this issue

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

### Join Button Missing / Games Start Too Fast?

**Symptom**: The "Join Next Game" button doesn't appear on the main menu, or games start after only 5 seconds instead of 60 seconds.

**Root Cause**: The `GAME_ENV` environment variable is not set, so the server defaults to `dev` mode. In dev mode, `gameCreationRate()` is only 5 seconds (vs 60 seconds in production), causing games to start before users can see and join them.

**Diagnosis**:

```powershell
# Check if GAME_ENV is set
ssh root@167.235.146.119 "cat /opt/frenzyfront/.env"

# Check server logs - should say "using frenzy server config"
ssh root@167.235.146.119 "head -20 /var/log/frenzyfront/server.log"
```

**Solution**:

```powershell
# 1. Stop the server
ssh root@167.235.146.119 "pkill -f 'ts-node/esm'"

# 2. Create/update .env file with correct environment
ssh root@167.235.146.119 "echo 'GAME_ENV=frenzy' > /opt/frenzyfront/.env"

# 3. Restart the server with the environment variable
ssh root@167.235.146.119 "cd /opt/frenzyfront && export GAME_ENV=frenzy && nohup /usr/bin/node --loader ts-node/esm --experimental-specifier-resolution=node src/server/Server.ts > /var/log/frenzyfront/server.log 2>&1 &"

# 4. Verify it's using the correct config
ssh root@167.235.146.119 "sleep 3 && head -5 /var/log/frenzyfront/server.log | grep 'using.*config'"
# Should show: "using frenzy server config"
```

**Available environments**:

- `dev` - 5 second game start (for local testing)
- `staging` - Pre-production testing
- `frenzy` - Production Frenzy mode (60 second game start)
- `prod` - Standard production

## Architecture Notes

- nginx serves static files from `/opt/frenzyfront/static/`
- API/WebSocket requests proxy to Node.js on ports 3000-3002
- Node.js runs via ts-node directly (not Docker/PM2)

## fetch statistics

# Fetch the log file to your local machine

scp root@167.235.146.119:/var/log/frenzyfront/games.log C:\Users\hauke\openfront\frenzyfront-games.log

# View it

Get-Content C:\Users\hauke\openfront\frenzyfront-games.log

OR

# View last 20 entries

ssh root@167.235.146.119 "tail -20 /var/log/frenzyfront/games.log"

# View all entries

ssh root@167.235.146.119 "cat /var/log/frenzyfront/games.log"

# Count games today

ssh root@167.235.146.119 "grep GAME_START /var/log/frenzyfront/games.log | wc -l"
