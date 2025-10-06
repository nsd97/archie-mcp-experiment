# ArchieOS Two-Agent System - Fixes Summary

## Overview
This document summarizes the fixes implemented to get the ArchieOS two-agent system working properly, following OpenAI SDK best practices and the user's requirements.

## Completed Fixes

### 1. Matrix MCP Server Integration ✅
- **What**: Cloned and integrated matrix-mcp-server for Archie's output
- **Changes**:
  - Cloned `https://github.com/mjknowles/matrix-mcp-server.git` to `external/matrix-mcp-server`
  - Created `archie_with_mcp.py` that uses `MCPServerStreamableHttp` for Matrix output
  - Added Matrix MCP server to `docker-compose.agents.yml`
  - Updated queue consumers to use MCP-enabled Archie
- **Result**: Archie can now send messages to Matrix using MCP tools instead of direct API calls

### 2. Python Package Layout Normalization ✅
- **What**: Fixed Python import structure to follow best practices
- **Changes**:
  - Moved `agents/tools/` to `agents/src/tools/`
  - Updated all imports from relative to absolute (e.g., `from src.tools.status import ...`)
  - Created proper `__init__.py` files
- **Result**: Clean Python package structure that works in Docker

### 3. Consumer Resilience ✅
- **What**: Made Matrix adapter optional and improved error handling
- **Changes**:
  - Made Matrix adapter initialization optional in queue consumers
  - Added try/catch blocks with graceful degradation
  - Ensured httpx clients are properly closed in finally blocks
  - Updated both queue consumers to use MCP-enabled Archie
- **Result**: Services can start even if Matrix is temporarily unavailable

### 4. SQS FIFO Queue Configuration ✅
- **What**: Converted all queues to FIFO with proper DLQ setup
- **Changes**:
  - Updated `init_matrix_infra.py` to create `.fifo` queues with `ContentBasedDeduplication`
  - Added `MessageGroupId` to all SQS send operations (using `room_id` for ordering)
  - Updated all queue URLs in environment files to include `.fifo`
  - Aligned environment variables (prefer `SQS_ENDPOINT` over `LOCALSTACK_ENDPOINT`)
- **Result**: Guaranteed message ordering per room and automatic deduplication

### 5. Agent Capabilities Alignment ✅
- **What**: Updated documentation and API to reflect actual agent capabilities
- **Changes**:
  - Updated `/agents` endpoint to show correct tools for each agent
  - Added Agent Capabilities section to README
  - Fixed Lauren's role from "task_executor" to "task_classifier"
- **Result**: Clear documentation of what each agent can actually do

### 6. Test Scope Limiting ✅
- **What**: Limited pytest to local tests and updated for Lauren's new role
- **Changes**:
  - Created `pytest.ini` to exclude vendored SDK tests
  - Updated `test_tasks_tool.py` to remove CRUD tests (only create remains)
  - Updated `test_agents.py` to reflect actual tool counts
  - Kept `test_lauren_classify.py` as-is (already tests the right functionality)
- **Result**: Tests now match actual implementation

## Environment Variables Added

```bash
# Matrix MCP Configuration
MATRIX_MCP_URL=http://matrix-mcp-server:3001/mcp

# FIFO Queue URLs (all updated to .fifo)
SQS_QUEUE_URL=http://localstack:4566/000000000000/prompt-queue.fifo
SQS_DLQ_URL=http://localstack:4566/000000000000/prompt-queue-dlq.fifo
LAUREN_WORK_QUEUE_URL=http://localstack:4566/000000000000/lauren-work-queue.fifo
LAUREN_WORK_DLQ_URL=http://localstack:4566/000000000000/lauren-work-queue-dlq.fifo
ARCHIE_SIGNAL_QUEUE_URL=http://localstack:4566/000000000000/archie-signal-queue.fifo
ARCHIE_SIGNAL_DLQ_URL=http://localstack:4566/000000000000/archie-signal-queue-dlq.fifo
```

## Key Architecture Improvements

1. **MCP for Matrix Output**: Archie now uses the standardized MCP protocol for Matrix communication, following OpenAI SDK patterns.

2. **Queue-Based Communication**: All inter-agent communication uses FIFO SQS queues with proper ordering and deduplication.

3. **Graceful Degradation**: Services can start and operate partially even if some dependencies are unavailable.

4. **Clear Separation of Concerns**: 
   - Archie: User interaction, status queries, routing
   - Lauren: Task classification and creation only
   - Humans: Task claiming, completion, updates via UI

## Remaining Tasks

1. **Matrix Setup**: Start Synapse, register @archie user, configure Element
2. **Backend Connectivity**: Verify agent-service can reach backend API
3. **End-to-End Testing**: Manual smoke test of the full flow

## How to Run Everything

1. Start infrastructure:
   ```bash
   docker-compose up -d localstack
   cd agents && python scripts/init_matrix_infra.py && cd ..
   ```

2. Start backend:
   ```bash
   docker-compose up -d backend
   ```

3. Start Matrix and agents:
   ```bash
   docker-compose -f docker-compose.agents.yml up
   ```

4. Configure Matrix (see remaining tasks)

5. Test via Element client
