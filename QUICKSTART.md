# ArchieOS Two-Agent System — Quick Start Guide

Get the complete system running in under 10 minutes!

---

## Prerequisites

- Docker and Docker Compose installed
- OpenAI API key (e.g., for GPT-4)
- Element desktop client (https://element.io/)
- Terminal access

---

## Setup (5 minutes)

### 1. Set Your API Key

```bash
export OPENAI_API_KEY=sk-...
```

Add to `.env` file for persistence:
```bash
echo "OPENAI_API_KEY=sk-..." >> .env
```

### 2. Initialize Infrastructure

```bash
# Create all SQS queues and DynamoDB tables
cd agents
python scripts/init_matrix_infra.py
cd ..
```

**This creates:**
- 3 SQS queues (+ 3 DLQs)
- 3 DynamoDB tables for Matrix integration
- All in LocalStack (local AWS simulator)

### 3. Start All Services

```bash
docker-compose -f docker-compose.yml -f docker-compose.agents.yml up
```

**Services starting:**
- ✓ LocalStack (mock AWS)
- ✓ Backend (Node.js API)
- ✓ Agent Service (FastAPI health server)
- ✓ Matrix Synapse (homeserver)
- ✓ Queue Consumer (Archie - Prompt Queue)
- ✓ Lauren Consumer (Lauren - Work Queue)
- ✓ Archie Signal Consumer (Archie - Signal Queue)

**Wait for:** All services to show "healthy" (30-60 seconds)

### 4. Register Archie on Matrix

```bash
# In a new terminal
curl -X POST http://localhost:8008/_matrix/client/r0/register \
  -H "Content-Type: application/json" \
  -d '{"username":"archie","password":"archie","auth":{"type":"m.login.dummy"}}'
```

**Save the `access_token` from the response!**

### 5. Start Matrix Listener

```bash
cd agents

# Set environment
export MATRIX_HOMESERVER_URL=http://localhost:8008
export MATRIX_ACCESS_TOKEN=<token_from_step_4>
export SQS_QUEUE_URL=http://localhost:4566/000000000000/prompt-queue

# Start listening
python scripts/matrix_listener.py
```

**You should see:** `✅ Connected to Matrix! 📨 Listening for messages...`

---

## Using Element (2 minutes)

### 1. Download & Install Element

- Download from: https://element.io/download
- Install and launch

### 2. Connect to Local Matrix

- Click "Sign In"
- Click "Edit" next to homeserver
- Enter: `http://localhost:8008`
- Create a new account (any username/password)
- Login

### 3. Invite Archie

- Create a new room (or use existing)
- Click "Invite"
- Enter: `@archie:localhost`
- Archie should join automatically

### 4. Start Chatting!

Try these commands:

**Status Query (immediate response):**
```
How are my tasks?
```

**Admin Task Request (queued, async):**
```
Book photos for 123 Main St next week
```

You'll get two responses:
1. Immediate: "I've queued your photo booking request..."
2. A few seconds later: "Your photo booking task is ready in the admin queue!"

### 5. Check the Frontend UI

Open `http://localhost:5173` (if frontend is running)

- You should see the task in the operations board
- Status: **OPEN**
- Claim Status: **UNCLAIMED**
- Click "Claim" to assign it to yourself
- Work on it and mark it complete!

---

## Example Interactions

### Status Queries (Handled by Archie directly)

```
You: "How are my tasks?"
Archie: "You have 3 tasks across 2 listings: 2 OPEN, 1 CLAIMED..."

You: "What's the status of listing-123?"
Archie: "Listing listing-123 has 2 tasks: 1 OPEN, 1 CLAIMED. 
        ⚠️ 1 urgent task needs attention"

You: "Show me all open tasks"
Archie: [Lists all open tasks with details]
```

### Admin Task Requests (Queued to Lauren)

```
You: "Book photos for 123 Main St"
Archie: "I've queued your photo booking request for the admin team..."
[~5 seconds later]
Archie: "✅ Your photo booking task is now in the admin queue!"

You: "Install a for sale sign at the property"
Archie: "I've queued your sign installation request..."
[~5 seconds later]
Archie: "✅ Your sign installation task is ready for the admin team!"
```

### Mixed Queries

```
You: "How are tasks for 123 Main St? And please book photos there."
Archie: "Listing 123 Main St has 1 task: DONE. I've also queued a photo booking request..."
[~5 seconds later]
Archie: "✅ Photo booking task created for 123 Main St!"
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

### View Metrics

```bash
# Prometheus metrics
curl http://localhost:8000/metrics
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

### View Traces

OpenAI Platform: https://platform.openai.com/traces

---

## Troubleshooting

### "Archie doesn't respond"

1. Check Matrix listener is running
2. Verify `access_token` is correct
3. Check queue-consumer logs: `docker logs archieos-queue-consumer`

### "Task not appearing in UI"

1. Check Lauren consumer logs: `docker logs archieos-lauren-consumer`
2. Verify backend is running: `curl http://localhost:3000/health`
3. Check DynamoDB table: `aws --endpoint-url=http://localhost:4566 dynamodb scan --table-name tasks`

### "Queues backing up"

1. Check DLQs: `aws --endpoint-url=http://localhost:4566 sqs receive-message --queue-url http://localhost:4566/000000000000/lauren-work-queue-dlq`
2. Check consumer logs for errors
3. Verify OPENAI_API_KEY is set correctly

### "Frontend shows old data"

1. Re-seed database: `npm run seed`
2. Refresh browser
3. Check backend logs

---

## Testing

### Run Unit Tests

```bash
cd agents
python -m pytest tests/ -v
```

### Run Queue Workflow Demo

```bash
cd agents
python examples/test_queue_workflow.py
```

### Manual E2E Test

1. Send message in Element
2. Watch logs in real-time:
   ```bash
   docker-compose logs -f queue-consumer lauren-consumer archie-signal-consumer
   ```
3. Verify task appears in UI
4. Claim and complete task in UI

---

## Next Steps

Once everything is working:

1. **Experiment with different admin tasks:**
   - "Install sign at 456 Oak Ave"
   - "Schedule showing for Tuesday"
   - "Post listing to MLS"

2. **Test error handling:**
   - Invalid listing addresses
   - Malformed requests
   - Check DLQs for poison messages

3. **Monitor performance:**
   - View metrics at `/metrics`
   - Check traces at platform.openai.com
   - Monitor queue depths

4. **Ready for AWS?**
   - See `FINAL_IMPLEMENTATION.md` for deployment guide
   - Update endpoints to real AWS
   - Deploy Lambda consumers

---

## Getting Help

- **Documentation**: See `FINAL_IMPLEMENTATION.md` for complete details
- **SDK Reference**: Check `/external/openai-agents-python/docs/`
- **Logs**: `docker-compose logs -f <service-name>`
- **Metrics**: `http://localhost:8000/metrics`

---

**Happy testing!** 🎉
