# ArchieOS Agent Service

Python-based agent service using the OpenAI Agents SDK for task management and Matrix integration.

## Architecture (Revised — Queue-Based)

- **Archie**: User-facing router agent that:
  - Answers status queries directly
  - Queues admin task requests to Lauren Work Queue
  - Processes completion signals from Lauren
  - Responds to users in Matrix/Element
  
- **Lauren**: Task classifier and creator agent that:
  - Processes admin task intents from Lauren Work Queue
  - Classifies using legacy rules
  - Creates OPEN/UNCLAIMED tasks for human admins
  - Signals Archie when done
  - **Does NOT claim or complete tasks** (humans do that via UI)

### Three-Queue System

1. **Prompt Queue** — Matrix → Archie (user messages)
2. **Lauren Work Queue** — Archie → Lauren (admin task intents)
3. **Archie Signal Queue** — Lauren → Archie (completion signals)

## Setup

### Prerequisites

- Python 3.12+
- Docker and Docker Compose
- OpenAI API key
- Access to the vendored OpenAI Agents SDK at `/external/openai-agents-python/`

### Environment Variables

Create a `.env` file in the project root with:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5

# AWS Configuration (LocalStack for local dev)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# Service URLs
BACKEND_URL=http://backend:3000
DYNAMODB_ENDPOINT=http://localstack:4566

# Matrix Configuration (P3)
MATRIX_HOMESERVER_URL=http://matrix-synapse:8008
MATRIX_ACCESS_TOKEN=syt_...
MATRIX_APP_SERVICE_TOKEN=as_...

# SQS Configuration (P3)
SQS_QUEUE_URL=http://localstack:4566/000000000000/prompt-queue
```

## Running Locally

### With Docker Compose (Full Stack)

```bash
# Initialize Matrix infrastructure (first time only)
cd agents && python scripts/init_matrix_infra.py && cd ..

# Start all services including agents and Matrix
docker-compose -f docker-compose.yml -f docker-compose.agents.yml up

# Or start services individually:
docker-compose -f docker-compose.yml up -d localstack backend
docker-compose -f docker-compose.agents.yml up agent-service matrix-synapse queue-consumer
```

### Running Matrix Components

1. **Register a Matrix user for Archie:**
```bash
# Register user on local Synapse
curl -X POST http://localhost:8008/_matrix/client/r0/register \
  -H "Content-Type: application/json" \
  -d '{"username":"archie","password":"archie-password","auth":{"type":"m.login.dummy"}}'
```

2. **Start the Matrix listener (separate terminal):**
```bash
cd agents
export MATRIX_HOMESERVER_URL=http://localhost:8008
export MATRIX_ACCESS_TOKEN=<token-from-registration>
export SQS_QUEUE_URL=http://localhost:4566/000000000000/prompt-queue
python scripts/matrix_listener.py
```

3. **Use Element to interact:**
- Download Element desktop: https://element.io/
- Connect to `http://localhost:8008`
- Create a room and invite `@archie:localhost`
- Send messages like "How are my tasks going?"

### Without Docker (Development)

```bash
cd agents

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Add SDK to Python path
export PYTHONPATH=/path/to/external/openai-agents-python/src:$PYTHONPATH

# Run the service
python -m uvicorn src.main:app --reload --port 8000
```

## API Endpoints

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health with dependency status
- `GET /agents` - List available agents and capabilities
- `GET /metrics` - Prometheus metrics

## Testing

```bash
cd agents

# Run all tests
python -m pytest tests/

# Run specific test file
python -m pytest tests/test_status_tool.py -v

# Run with coverage
python -m pytest --cov=src tests/

# Test Archie with example script (requires OPENAI_API_KEY)
python examples/test_archie.py
```

### Testing the Status Tool

The `get_task_status` tool can be tested in several ways:

1. **Unit tests**: Run `pytest tests/test_status_tool.py`
2. **Integration example**: Run `python examples/test_archie.py` 
3. **Live testing**: Start the service and use the health endpoints

Example queries Archie can now handle:
- "How are my tasks going?"
- "What's the status of tasks for listing-123?"
- "Show me all open tasks"
- "Are there any urgent tasks?"
- "What tasks are assigned to agent:emma?"

## Implementation Status

### P0 - SDK Integration Spine ✅
- [x] Python service container
- [x] Basic Archie and Lauren agents
- [x] Health check endpoints
- [x] SDK tracing configuration

### P1 - Archie DB-Read Tool ✅
- [x] `get_task_status` tool implementation
- [x] Backend API integration
- [x] Rate limiting and authz (via backend)
- [x] Unit tests for status tool
- [x] Integration example

### P2 - Lauren Classify+Create (Revised) ✅
- [x] `classify_and_create_task` tool with legacy rule classification
- [x] `create_task` tool for direct creation
- [x] `notify_archie_signal` tool for completion signaling
- [x] Tasks always created as OPEN/UNCLAIMED (humans claim via UI)
- [x] Lauren Work Queue and Archie Signal Queue created
- [x] `enqueue_for_lauren` tool for Archie
- [x] Queue-based async communication (no direct handoffs)
- [x] Unit tests for classification and creation
- [x] Integration example with queue workflow

### P3 - Matrix Integration ✅
- [x] Matrix adapter with shared DynamoDB storage
- [x] SQS prompt queue with FIFO ordering per room
- [x] `send_matrix_message` tool with threading support
- [x] Queue consumer (Lambda-ready + local worker)
- [x] Idempotency and duplicate detection
- [x] Matrix Synapse container for local testing
- [x] Infrastructure initialization script

## Tracing

When `OPENAI_API_KEY` is configured, traces are automatically sent to the OpenAI platform.
View traces at: https://platform.openai.com/traces

## Architecture Decisions

1. **SDK-First**: We use the vendored OpenAI Agents SDK patterns throughout
2. **Shared Database**: Agents access the same DynamoDB instance as the backend
3. **Tool-Based**: All capabilities are exposed as SDK function tools
4. **Context Injection**: `AgentContext` provides dependencies to all tools

## Next Steps

1. Implement P1 tools for Archie (DB read capabilities)
2. Implement P2 tools for Lauren (task mutations)
3. Add Matrix integration and prompt queue (P3)
4. Configure handoffs between Archie and Lauren
