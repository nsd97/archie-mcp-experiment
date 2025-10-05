# Complete Element + Matrix Setup Guide

## Current Issue

Matrix Synapse has a configuration issue in `docker-compose.agents.yml`. Here's how to fix it and get everything working.

---

## Quick Fix: Use Element Web Instead

**Easiest solution** — Use Element Web (browser version) which is more forgiving with local homeservers:

### 1. Open Element Web

Go to: https://app.element.io/

### 2. Configure Homeserver

- Click **"Sign In"**
- Click **"Edit"** next to "matrix.org"
- Enter: `http://localhost:8008`
- If it says invalid, that's because Matrix isn't running yet — see Step 3

### 3. Start Matrix Synapse (Simplified)

Instead of the complex docker-compose setup, run Matrix Synapse standalone:

```bash
# Run Matrix Synapse with simple config
docker run -d \
  --name matrix-synapse-simple \
  -p 8008:8008 \
  -p 8448:8448 \
  -e SYNAPSE_SERVER_NAME=localhost \
  -e SYNAPSE_REPORT_STATS=no \
  -e SYNAPSE_ENABLE_REGISTRATION=yes \
  -e SYNAPSE_NO_TLS=yes \
  matrixdotorg/synapse:latest \
  generate

# Wait 10 seconds for config generation
sleep 10

# Start it
docker start matrix-synapse-simple

# Wait 20 seconds for startup
sleep 20

# Test it
curl http://localhost:8008/_matrix/client/versions
```

If you see JSON output with "versions", it's working!

### 4. Now Try Element Web Again

- Go to https://app.element.io/
- Click "Sign In" → "Edit" → `http://localhost:8008`
- Should now work!

---

## Alternative: Element Desktop with Correct URL

Element Desktop is stricter. Try these URL formats:

### Format 1: Just the domain (let Element discover)
```
localhost:8008
```

### Format 2: Explicit HTTP
```
http://localhost:8008
```

### Format 3: With Matrix client API path
```
http://localhost:8008/_matrix/client
```

---

## Verify Matrix is Working

Before trying Element, verify Matrix is accessible:

```bash
# Test 1: Check if port is open
curl http://localhost:8008

# Should return: "404: Not Found" or "405: Method Not Allowed" (that's GOOD - means it's running!)

# Test 2: Check Matrix API
curl http://localhost:8008/_matrix/client/versions

# Should return JSON like:
# {"versions":["r0.0.1","r0.1.0",...]}

# Test 3: Try to register a test user
curl -X POST http://localhost:8008/_matrix/client/r0/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test","auth":{"type":"m.login.dummy"}}'

# Should return user_id and access_token
```

If all three work, Matrix is healthy and Element should connect!

---

## Complete Working Setup (Step by Step)

### Step 1: Start LocalStack (Already Done ✅)

```bash
# Check it's running
curl http://localhost:4566/_localstack/health
```

### Step 2: Start Matrix Synapse (Simple Version)

```bash
# Stop any existing Matrix containers
docker stop archieos-matrix-synapse 2>/dev/null || true
docker rm archieos-matrix-synapse 2>/dev/null || true

# Run simplified Matrix Synapse
docker run -d \
  --name archieos-matrix-synapse \
  --network archieos-backend_default \
  -p 8008:8008 \
  -v /tmp/matrix-data:/data \
  -e SYNAPSE_SERVER_NAME=localhost \
  -e SYNAPSE_REPORT_STATS=no \
  -e SYNAPSE_ENABLE_REGISTRATION=yes \
  -e SYNAPSE_NO_TLS=yes \
  matrixdotorg/synapse:latest

# Wait for it to start
echo "Waiting for Matrix Synapse to start (30 seconds)..."
sleep 30

# Verify it's working
curl http://localhost:8008/_matrix/client/versions
```

### Step 3: Register Archie

```bash
curl -X POST http://localhost:8008/_matrix/client/r0/register \
  -H "Content-Type: application/json" \
  -d '{"username":"archie","password":"archie123","auth":{"type":"m.login.dummy"}}'

# SAVE THE ACCESS_TOKEN!
```

### Step 4: Configure Element

**Option A: Element Web (Recommended for testing)**
- Go to: https://app.element.io/
- Sign In → Edit → `http://localhost:8008`
- Create account
- Create room
- Invite `@archie:localhost`

**Option B: Element Desktop**
- Download from: https://element.io/download
- Install and launch
- Sign In → Edit → Try these in order:
  1. `http://localhost:8008`
  2. `localhost:8008`
  3. `http://localhost:8008/_matrix/client`
- Whichever works, use it!

### Step 5: Start Backend and Agent Services

```bash
cd /Users/noahdeskin/ArchieOS\ Backend.worktrees/Noahs-agetnic-experiment

# Start backend
docker-compose -f docker-compose.yml up -d backend

# Or run backend locally:
npm run dev
```

The agent services can wait — for now, just test that Matrix + Element work!

---

## 🐛 Troubleshooting Element Connection

### Error: "Invalid homeserver URL"

**Cause:** Matrix Synapse isn't running or isn't accessible

**Fix:**
```bash
# Check if Matrix is running
docker ps | grep matrix-synapse

# Check if port 8008 responds
curl http://localhost:8008

# Check Matrix API
curl http://localhost:8008/_matrix/client/versions

# If any of these fail, Matrix isn't running properly
```

### Error: "Unable to connect"

**Cause:** Firewall or network issue

**Fix:**
- Make sure you're using `http://` not `https://`
- Try `localhost:8008` without http://
- Try `127.0.0.1:8008`

### Error: "Homeserver not found"

**Cause:** URL format issue

**Fix:** Try these formats in order:
1. `localhost:8008`
2. `http://localhost:8008`  
3. `http://127.0.0.1:8008`

---

## ✅ Success Checklist

Before trying Element:
- [ ] LocalStack is running (port 4566)
- [ ] Matrix Synapse is running (port 8008)
- [ ] `curl http://localhost:8008/_matrix/client/versions` returns JSON
- [ ] You can register a test user via curl

For Element:
- [ ] Downloaded Element Desktop OR using app.element.io
- [ ] Configured homeserver URL correctly
- [ ] Can create account
- [ ] Can create room
- [ ] Can invite `@archie:localhost` (may not join yet - that's okay)

For Full System:
- [ ] Backend running (port 3000)
- [ ] Agent services running (Docker)
- [ ] Queue consumers running
- [ ] Can chat with Archie and get responses

---

## 🎯 Simplified Test (No Agents Yet)

Just to verify Matrix + Element work:

```bash
# 1. Start Matrix
docker run -d --name test-matrix -p 8008:8008 \
  -e SYNAPSE_SERVER_NAME=localhost \
  -e SYNAPSE_REPORT_STATS=no \
  -e SYNAPSE_ENABLE_REGISTRATION=yes \
  -e SYNAPSE_NO_TLS=yes \
  matrixdotorg/synapse:latest

# 2. Wait
sleep 30

# 3. Test
curl http://localhost:8008/_matrix/client/versions

# 4. Open Element Web: https://app.element.io/
#    Configure homeserver: http://localhost:8008
#    Create account and test messaging

# 5. Once that works, integrate with agents!
```

---

## 📞 Need Help?

If Matrix still won't start:

1. Check Docker logs: `docker logs archieos-matrix-synapse`
2. Try the simplified standalone container above
3. Use Element Web instead of Desktop (more forgiving)
4. Verify nothing else is using port 8008: `lsof -i :8008`

Once Matrix + Element work, we can connect the agents!

---

**Next:** Get Matrix responding, then start agent services with `docker-compose up`!

