# Complete Setup & Run Guide

## Step 1: Start LocalStack and Backend

```bash
# Start LocalStack (required for all tests and services)
docker-compose -f docker-compose.yml up -d localstack

# Wait for LocalStack to be ready (30 seconds)
sleep 30

# Initialize infrastructure (DynamoDB tables, SQS queues, S3)
npm run infra:init

# Seed sample data
npm run seed
```

## Step 2: Initialize Agent Infrastructure

```bash
# Create Matrix queues and tables
cd agents
python scripts/init_matrix_infra.py
cd ..
```

## Step 3: Start All Agent Services

```bash
# Start all services (backend, agents, Matrix)
docker-compose -f docker-compose.yml -f docker-compose.agents.yml up -d

# Or run in foreground to see logs:
# docker-compose -f docker-compose.yml -f docker-compose.agents.yml up
```

## Step 4: Register Archie User on Matrix

```bash
# Register @archie:localhost user
curl -X POST http://localhost:8008/_matrix/client/v3/register \
  -H "Content-Type: application/json" \
  -d '{"username":"archie","password":"archie123","auth":{"type":"m.login.dummy"}}'

# SAVE THE ACCESS_TOKEN from the response!
```

## Step 5: Configure Element Desktop

### Download Element
- Go to https://element.io/download
- Download for your OS (Mac, Windows, Linux)
- Install and launch

### Add Matrix Server
1. Click **"Sign In"**
2. Click **"Edit"** next to the homeserver URL
3. Enter: `http://localhost:8008`
4. Click **"Continue"**

### Create Account or Login
- **Option A:** Create new account (any username/password)
- **Option B:** Login with existing account

### Create Room and Invite Archie
1. Click **"+"** or **"Create Room"**
2. Give it a name (e.g., "ArchieOS Test")
3. Click **"Invite"** button
4. Type: `@archie:localhost`
5. Send invite

Archie should auto-join (if Matrix listener is running - see Step 6)

## Step 6: Start Matrix Listener

In a **separate terminal**:

```bash
cd agents

# Set environment (use access_token from Step 4)
export MATRIX_HOMESERVER_URL=http://localhost:8008
export MATRIX_ACCESS_TOKEN=syt_YourTokenHere
export SQS_QUEUE_URL=http://localhost:4566/000000000000/prompt-queue

# Start listening
python scripts/matrix_listener.py
```

You should see:
```
✅ Connected to Matrix!
📨 Listening for messages...
```

## Step 7: Start Chatting in Element!

In your Element room, try:

**Status Query:**
```
How are my tasks?
```

**Admin Task Request:**
```
Book photos for 123 Main St next week
```

You should get TWO responses:
1. Immediate: "I've queued your request..."
2. After ~5-10s: "Your task is ready in the admin queue!"

## Step 8: Verify in Frontend UI

Open: http://localhost:5173

You should see the task in the operations board:
- Status: **OPEN**
- Claim Status: **UNCLAIMED**
- Ready for a human admin to claim!

---

## Running Tests

### Backend Tests (Node.js)

```bash
# Make sure LocalStack is running
docker-compose up -d localstack

# Initialize infrastructure
npm run infra:init

# Run all tests
npm test

# Run specific test
npm test tests/tasks.routes.test.ts
```

### Agent Tests (Python)

```bash
cd agents

# Install dependencies
pip install -r requirements.txt

# Run tests
python -m pytest tests/ -v

# Run specific test
python -m pytest tests/test_lauren_classify.py -v
```

---

## Monitoring

### Check Service Health

```bash
# Agent service
curl http://localhost:8000/health

# Backend
curl http://localhost:3000/health

# Matrix
curl http://localhost:8008/_matrix/client/versions
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker logs -f archieos-queue-consumer
docker logs -f archieos-lauren-consumer
docker logs -f archieos-archie-signal-consumer
```

### Check Queue Depths

```bash
# Prompt Queue
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/prompt-queue \
  --attribute-names ApproximateNumberOfMessages

# Lauren Work Queue
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/lauren-work-queue \
  --attribute-names ApproximateNumberOfMessages

# Archie Signal Queue  
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/archie-signal-queue \
  --attribute-names ApproximateNumberOfMessages
```

---

## Troubleshooting

### Element Can't Connect
- Make sure Matrix Synapse is running: `docker ps | grep synapse`
- Check logs: `docker logs archieos-matrix-synapse`
- Verify port 8008 is accessible: `curl http://localhost:8008/_matrix/client/versions`

### Archie Doesn't Respond
- Check Matrix listener is running
- Verify access_token is correct
- Check queue-consumer logs: `docker logs archieos-queue-consumer`

### Task Not Created
- Check Lauren consumer logs: `docker logs archieos-lauren-consumer`
- Check Archie signal consumer logs: `docker logs archieos-archie-signal-consumer`
- Verify backend is running: `curl http://localhost:3000/health`

### Tests Failing
- Start LocalStack: `docker-compose up -d localstack`
- Initialize infrastructure: `npm run infra:init`
- Check .env file has correct values
- For DynamoDB tests, LocalStack must be running

---

## Services and Ports

| Service | Port | URL |
|---------|------|-----|
| Backend | 3000 | http://localhost:3000 |
| Frontend | 5173 | http://localhost:5173 |
| LocalStack | 4566 | http://localhost:4566 |
| Matrix Synapse | 8008 | http://localhost:8008 |
| Agent Service | 8000 | http://localhost:8000 |

---

## Complete Startup Script

Save this as `start-all.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Starting ArchieOS Two-Agent System..."

# Step 1: Start LocalStack
echo "1️⃣  Starting LocalStack..."
docker-compose -f docker-compose.yml up -d localstack
sleep 30

# Step 2: Initialize infrastructure  
echo "2️⃣  Initializing backend infrastructure..."
npm run infra:init

# Step 3: Seed data
echo "3️⃣  Seeding sample data..."
npm run seed

# Step 4: Initialize agent infrastructure
echo "4️⃣  Initializing agent infrastructure..."
cd agents
python scripts/init_matrix_infra.py
cd ..

# Step 5: Start all services
echo "5️⃣  Starting all services..."
docker-compose -f docker-compose.yml -f docker-compose.agents.yml up -d

# Step 6: Wait for services
echo "6️⃣  Waiting for services to be ready..."
sleep 45

# Check health
echo "✅ Checking service health..."
curl -s http://localhost:3000/health | jq . || echo "Backend not ready"
curl -s http://localhost:8000/health | jq . || echo "Agent service not ready"
curl -s http://localhost:8008/_matrix/client/versions | jq . || echo "Matrix not ready"

echo ""
echo "✅ System is running!"
echo ""
echo "Next steps:"
echo "1. Register Archie: See SETUP_AND_RUN.md Step 4"
echo "2. Start Matrix listener: cd agents && python scripts/matrix_listener.py"
echo "3. Open Element and connect to http://localhost:8008"
echo "4. Start chatting!"
```

Make executable: `chmod +x start-all.sh`
Run: `./start-all.sh`

