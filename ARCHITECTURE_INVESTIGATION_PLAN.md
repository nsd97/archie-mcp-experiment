# Architecture Investigation Plan
## ArchieOS Two-Agent System Verification

**Purpose**: Verify that Archie and Lauren agents are properly set up with correct queue patterns, loops, and tools according to the OpenAI SDK guidance.

---

## 📋 Executive Summary

This plan investigates whether:
1. **Archie** gets inputs from a queue with proper concurrency control
2. **Archie** runs on a loop pattern from the OpenAI SDK
3. **Archie** has read-only DB access and Matrix communication tools
4. **Lauren** is modeled similarly to Archie with her own queue
5. **Lauren** has tools to read DB, write DB, and communicate with Archie
6. Both agents follow the SDK's loop patterns with proper `Runner.run()` usage

---

## 🎯 Investigation Areas

### 1. ARCHIE'S QUEUE INPUT SYSTEM

**What to verify**: Archie receives work from a queue that respects concurrency

#### 1.1 Queue Configuration
- [ ] **Location**: Check `agents/src/queue_consumer.py`
- [ ] **Verify**: PromptQueueConsumer class exists
- [ ] **Verify**: Uses SQS FIFO queue for ordering
- [ ] **Check**: Queue URL environment variable (`PROMPT_QUEUE_URL`)
- [ ] **Check**: DLQ (Dead Letter Queue) configured for failures

**Key Questions**:
- Is the queue FIFO (First-In-First-Out)?
- Does it use `MessageGroupId` for ordering?
- Is there a Dead Letter Queue for failed messages?

#### 1.2 Concurrency Control
- [ ] **Location**: `agents/src/queue_consumer.py` lines 49-124
- [ ] **Verify**: Room-level semaphore exists (`max_concurrent_per_room = 2`)
- [ ] **Verify**: Messages processed one-at-a-time per room
- [ ] **Check**: `self.room_semaphores` dictionary manages per-room locks

**Key Pattern**:
```python
async with self.room_semaphores[room_id]:
    # Only 2 messages per room processed concurrently
    await self._invoke_agent(prompt_msg)
```

**What this means**: Archie won't process a new message from a room until the current one finishes (or until concurrency limit allows).

#### 1.3 Idempotency (Duplicate Prevention)
- [ ] **Location**: `agents/src/queue_consumer.py` lines 114-117
- [ ] **Verify**: `_is_duplicate()` method checks processed_events table
- [ ] **Verify**: `_mark_processed()` writes to DynamoDB after completion
- [ ] **Check**: Uses `correlation_id` as unique key

**Why this matters**: Prevents processing the same message twice if there's a retry.

---

### 2. ARCHIE'S AGENT LOOP (OpenAI SDK Pattern)

**What to verify**: Archie uses `Runner.run()` loop from the SDK

#### 2.1 Agent Definition
- [ ] **Location**: `agents/src/agents/archie.py`
- [ ] **Verify**: Uses `Agent()` class from SDK
- [ ] **Verify**: Has `name`, `instructions`, `model`, `tools` parameters
- [ ] **Check**: Model is set to "gpt-5"
- [ ] **Check**: Tools array includes: `get_task_status`, `send_matrix_message`, `enqueue_for_lauren`

#### 2.2 SDK Loop Invocation
- [ ] **Location**: `agents/src/queue_consumer.py` (search for `Runner.run`)
- [ ] **Verify**: Consumer calls `await Runner.run(archie_agent, input, context=...)`
- [ ] **Check**: `max_turns` parameter limits loop iterations
- [ ] **Check**: Context is passed for tool access

**SDK Loop Pattern** (from `external/openai-agents-python/docs/running_agents.md`):
```python
result = await Runner.run(
    agent,           # The agent to run
    input,           # User's message
    context=ctx,     # Shared context
    max_turns=10     # Safety limit
)
```

**How the loop works** (from SDK docs):
1. Call LLM with current input
2. LLM returns response (may include tool calls)
3. If response has final output → DONE
4. If response has tool calls → execute tools, add results to conversation, GOTO 1
5. If `max_turns` exceeded → raise exception

#### 2.3 SDK Documentation Reference
- [ ] **Location**: `external/openai-agents-python/README.md` lines 127-161
- [ ] **Verify**: Section titled "The agent loop" exists
- [ ] **Verify**: Explains the loop runs until final output
- [ ] **Key Quote**: "When you call `Runner.run()`, we run a loop until we get a final output"

**Loop Steps** (from README.md):
1. Call LLM with model settings and message history
2. LLM returns response (may have tool calls)
3. If final output → return and end loop
4. If handoff → switch to new agent and restart loop
5. Process tool calls, append responses, restart loop

---

### 3. ARCHIE'S TOOLS & CAPABILITIES

**What to verify**: Archie has the right tools for his job

#### 3.1 Read-Only Database Access
- [ ] **Location**: `agents/src/tools/status.py`
- [ ] **Tool**: `get_task_status()`
- [ ] **Verify**: Marked as `@function_tool` (SDK pattern)
- [ ] **Verify**: Takes `RunContextWrapper[AgentContext]` for context
- [ ] **Verify**: Uses `context.backend_client` to read from API (read-only)
- [ ] **Check**: Does NOT create, update, or delete tasks

**Pattern**:
```python
@function_tool
async def get_task_status(ctx: RunContextWrapper[AgentContext], ...):
    # Read from backend API
    response = await ctx.context.backend_client.get("/v1/operations/tasks")
```

#### 3.2 Matrix Communication (MCP)
- [ ] **Location**: `agents/src/tools/matrix.py`
- [ ] **Tool**: `send_matrix_message()`
- [ ] **Verify**: Uses Matrix MCP server
- [ ] **Verify**: Can send messages to rooms and threads
- [ ] **Check**: Environment variable `MATRIX_ACCESS_TOKEN` is set

**What MCP means**: Model Context Protocol - a standard way to give agents access to external services (like Matrix chat)

#### 3.3 Lauren Communication Queue
- [ ] **Location**: `agents/src/tools/queues.py`
- [ ] **Tool**: `enqueue_for_lauren()`
- [ ] **Verify**: Sends messages to Lauren's work queue
- [ ] **Verify**: Uses SQS with FIFO (MessageGroupId)
- [ ] **Check**: Environment variable `LAUREN_WORK_QUEUE_URL` is set

**Message Flow**:
```
Archie → enqueue_for_lauren() → SQS → Lauren Work Queue → Lauren Consumer → Lauren Agent
```

---

### 4. LAUREN'S QUEUE INPUT SYSTEM

**What to verify**: Lauren has her own queue modeled like Archie's

#### 4.1 Queue Consumer
- [ ] **Location**: `agents/src/lauren_consumer.py`
- [ ] **Class**: `LaurenWorkConsumer`
- [ ] **Verify**: Similar structure to `PromptQueueConsumer`
- [ ] **Check**: Polls from `LAUREN_WORK_QUEUE_URL`
- [ ] **Check**: Has DLQ configured

#### 4.2 Concurrency Control
- [ ] **Location**: `agents/src/lauren_consumer.py` lines 45-47
- [ ] **Verify**: Has `max_concurrent = 5` semaphore
- [ ] **Verify**: Uses `asyncio.Semaphore` to limit parallel processing
- [ ] **Check**: Can process up to 5 tasks at once

**Why different from Archie?**
- Archie: Per-room concurrency (2 per room) - preserves conversation order
- Lauren: Global concurrency (5 total) - task creation can be parallel

#### 4.3 Loop Pattern
- [ ] **Location**: `agents/src/lauren_consumer.py` lines 56-65
- [ ] **Verify**: `while True:` loop polling SQS
- [ ] **Verify**: Long polling with `WaitTimeSeconds=20`
- [ ] **Verify**: Calls `await self._poll_and_process()` repeatedly

**The outer loop**: Keeps checking the queue forever (until stopped)
**The inner loop**: OpenAI SDK's `Runner.run()` for each work item

---

### 5. LAUREN'S AGENT LOOP (OpenAI SDK Pattern)

**What to verify**: Lauren uses the same SDK loop pattern as Archie

#### 5.1 Agent Definition
- [ ] **Location**: `agents/src/agents/lauren.py`
- [ ] **Verify**: Uses `Agent()` class from SDK
- [ ] **Verify**: Has `name="Lauren"`, `instructions`, `model="gpt-5"`
- [ ] **Check**: Tools array includes: `classify_and_create_task`, `create_task`, `notify_archie_signal`

#### 5.2 SDK Loop Invocation
- [ ] **Location**: `agents/src/lauren_consumer.py` lines 174-182
- [ ] **Verify**: Consumer calls `await Runner.run(lauren_agent, input, context=...)`
- [ ] **Verify**: Uses `max_turns=5` to limit iterations
- [ ] **Check**: Context includes DB session and backend client

**Pattern Comparison**:
```python
# Archie invocation (from queue_consumer.py)
result = await Runner.run(archie_agent, input, context=ctx, max_turns=10)

# Lauren invocation (from lauren_consumer.py)
result = await Runner.run(lauren_agent, input, context=ctx, max_turns=5)
```

**Both use the SAME SDK loop mechanism!**

---

### 6. LAUREN'S TOOLS & CAPABILITIES

**What to verify**: Lauren has task creation and signaling tools

#### 6.1 Database Write Access (via Backend API)
- [ ] **Location**: `agents/src/tools/tasks.py`
- [ ] **Tool**: `classify_and_create_task()`
- [ ] **Verify**: Marked as `@function_tool`
- [ ] **Verify**: Calls `POST /v1/operations/tasks` to create tasks
- [ ] **Check**: Sets `status=OPEN`, `claim_status=UNCLAIMED`
- [ ] **Check**: Never sets `assigned_to` (humans claim via UI)

#### 6.2 Task Classification Logic
- [ ] **Location**: `agents/src/tools/tasks.py` (search for `_classify_admin_intent`)
- [ ] **Verify**: Has classification rules for different task types
- [ ] **Examples**: "Book photos" → SALE::BOOK_PHOTOS@v1
- [ ] **Fallback**: Unknown → ADMIN::GENERIC_TASK@v1

#### 6.3 Archie Communication (Signal Queue)
- [ ] **Location**: `agents/src/tools/queues.py` lines 159-236
- [ ] **Tool**: `notify_archie_signal()`
- [ ] **Verify**: Sends messages to Archie Signal Queue
- [ ] **Check**: Environment variable `ARCHIE_SIGNAL_QUEUE_URL` is set
- [ ] **Verify**: Signals: "created", "skipped", "error"

**Signal Flow**:
```
Lauren → notify_archie_signal() → SQS → Archie Signal Queue → Archie Signal Consumer → Archie Agent
```

---

### 7. QUEUE ARCHITECTURE VERIFICATION

**What to verify**: Complete bidirectional communication

#### 7.1 Queue Inventory
- [ ] **Prompt Queue**: User messages → Archie
- [ ] **Lauren Work Queue**: Archie → Lauren
- [ ] **Archie Signal Queue**: Lauren → Archie

#### 7.2 FIFO Configuration
- [ ] **Check**: All queues use `.fifo` suffix in URLs
- [ ] **Verify**: `MessageGroupId` used for ordering
- [ ] **Verify**: Deduplication ID used for idempotency

#### 7.3 Environment Variables
- [ ] `PROMPT_QUEUE_URL` - for incoming user messages
- [ ] `LAUREN_WORK_QUEUE_URL` - for Archie→Lauren tasks
- [ ] `ARCHIE_SIGNAL_QUEUE_URL` - for Lauren→Archie signals
- [ ] `LOCALSTACK_ENDPOINT` or `SQS_ENDPOINT` - local dev
- [ ] `AWS_REGION` - default "us-east-1"

---

### 8. SDK LOOP DOCUMENTATION VERIFICATION

**What to verify**: SDK has clear documentation about agent loops

#### 8.1 Primary Documentation
- [ ] **Location**: `external/openai-agents-python/docs/running_agents.md`
- [ ] **Section**: "The agent loop" (lines 24-36)
- [ ] **Verify**: Explains 3-step loop pattern
- [ ] **Verify**: Mentions `max_turns` parameter

**Key Documentation Quote**:
> "The runner then runs a loop:
> 1. We call the LLM for the current agent, with the current input.
> 2. The LLM produces its output.
>    a. If the LLM returns a `final_output`, the loop ends and we return the result.
>    b. If the LLM does a handoff, we update the current agent and input, and re-run the loop.
>    c. If the LLM produces tool calls, we run those tool calls, append the results, and re-run the loop.
> 3. If we exceed the `max_turns` passed, we raise a `MaxTurnsExceeded` exception."

#### 8.2 README Documentation
- [ ] **Location**: `external/openai-agents-python/README.md`
- [ ] **Section**: "The agent loop" (lines 131-154)
- [ ] **Verify**: Explains loop mechanics
- [ ] **Verify**: Shows tool call processing

#### 8.3 Source Code Reference
- [ ] **Location**: `external/openai-agents-python/src/agents/run.py`
- [ ] **Class**: `Runner` (line 277)
- [ ] **Method**: `async def run()` (line 279)
- [ ] **Verify**: Implements the loop described in docs

---

## 🔍 INVESTIGATION CHECKLIST

### Step 1: Verify Archie's Setup
1. Read `agents/src/agents/archie.py` - confirm SDK Agent pattern
2. Read `agents/src/queue_consumer.py` - confirm queue polling loop
3. Check concurrency control (room semaphores)
4. Verify tools: `get_task_status`, `send_matrix_message`, `enqueue_for_lauren`
5. Confirm `Runner.run()` is used to invoke Archie

### Step 2: Verify Lauren's Setup
1. Read `agents/src/agents/lauren.py` - confirm SDK Agent pattern
2. Read `agents/src/lauren_consumer.py` - confirm queue polling loop
3. Check concurrency control (global semaphore)
4. Verify tools: `classify_and_create_task`, `create_task`, `notify_archie_signal`
5. Confirm `Runner.run()` is used to invoke Lauren

### Step 3: Verify Queue Communication
1. Check `agents/src/tools/queues.py` for queue message structures
2. Verify FIFO configuration in environment or infra code
3. Trace message flow: User → Archie → Lauren → Archie → User
4. Check idempotency with processed_events table

### Step 4: Verify SDK Loop Documentation
1. Read `external/openai-agents-python/docs/running_agents.md`
2. Read `external/openai-agents-python/README.md` (agent loop section)
3. Check source code in `external/openai-agents-python/src/agents/run.py`
4. Confirm both agents follow the documented pattern

### Step 5: Test the Flow End-to-End
1. Send a message to Archie via Matrix
2. Verify message appears in Prompt Queue
3. Verify PromptQueueConsumer processes it
4. Verify Archie runs through SDK loop
5. If task creation requested, verify Lauren Work Queue gets message
6. Verify Lauren processes it through SDK loop
7. Verify Archie Signal Queue gets completion signal
8. Verify Archie responds to user in Matrix

---

## 📊 EXPECTED FINDINGS

### ✅ What Should Be True

1. **Both agents use `Agent()` from SDK**: 
   - Archie: `agents/src/agents/archie.py`
   - Lauren: `agents/src/agents/lauren.py`

2. **Both agents invoked with `Runner.run()`**:
   - Archie: in `queue_consumer.py`
   - Lauren: in `lauren_consumer.py`

3. **SDK loop documentation exists**:
   - `external/openai-agents-python/docs/running_agents.md`
   - `external/openai-agents-python/README.md`

4. **Queue concurrency control**:
   - Archie: Per-room semaphore (max 2 concurrent per room)
   - Lauren: Global semaphore (max 5 concurrent total)

5. **Proper tool separation**:
   - Archie: Read-only (`get_task_status`)
   - Lauren: Write access (`classify_and_create_task`)

6. **Bidirectional communication**:
   - Archie → Lauren: via `enqueue_for_lauren()` → Lauren Work Queue
   - Lauren → Archie: via `notify_archie_signal()` → Archie Signal Queue

### ⚠️ Potential Issues to Look For

1. **Queue not FIFO**: Check if queues have `.fifo` suffix
2. **Missing concurrency control**: Verify semaphores exist and are used
3. **No idempotency check**: Verify `_is_duplicate()` is called
4. **Tool overlap**: Check if Archie has write access (shouldn't)
5. **Missing error handling**: Check for DLQ configuration
6. **Loop not using SDK**: Verify `Runner.run()` is used (not custom loop)

---

## 🎓 TERMINOLOGY EXPLAINED

For beginners, here are key terms:

- **Agent**: An AI assistant with specific instructions and tools
- **Agent Loop**: The cycle where the agent thinks, calls tools, and responds
- **Queue**: A line of messages waiting to be processed (like a to-do list)
- **FIFO**: First-In-First-Out - messages processed in order received
- **Concurrency**: How many things can run at the same time
- **Semaphore**: A lock that limits how many tasks run simultaneously
- **Idempotency**: Processing the same message multiple times has the same result as processing once
- **Tool**: A function the agent can call to do something (read DB, send message, etc.)
- **Context**: Shared data available to the agent (DB connection, user info, etc.)
- **SDK**: Software Development Kit - pre-built code from OpenAI
- **Runner**: The SDK component that runs the agent loop
- **max_turns**: Safety limit on how many times the loop can run

---

## 📁 KEY FILES TO REVIEW

### Agent Definitions
- `agents/src/agents/archie.py` - Archie's agent configuration
- `agents/src/agents/lauren.py` - Lauren's agent configuration

### Queue Consumers
- `agents/src/queue_consumer.py` - Archie's message consumer
- `agents/src/lauren_consumer.py` - Lauren's work consumer
- `agents/src/archie_signal_consumer.py` - Archie's signal consumer

### Tools
- `agents/src/tools/status.py` - Archie's read tool
- `agents/src/tools/tasks.py` - Lauren's write tools
- `agents/src/tools/queues.py` - Queue communication tools
- `agents/src/tools/matrix.py` - Matrix communication tools

### SDK Documentation
- `external/openai-agents-python/README.md` - Main SDK docs
- `external/openai-agents-python/docs/running_agents.md` - Loop documentation
- `external/openai-agents-python/src/agents/run.py` - Runner implementation

### Infrastructure
- `agents/scripts/init_matrix_infra.py` - Queue and table setup
- `docker-compose.agents.yml` - Service definitions

---

## 🎯 SUCCESS CRITERIA

The investigation is successful if we can confirm:

1. ✅ Archie gets input from a queue with concurrency control
2. ✅ Archie runs on OpenAI SDK's `Runner.run()` loop
3. ✅ Archie has read-only DB access via `get_task_status`
4. ✅ Archie can send messages via Matrix MCP
5. ✅ Archie can enqueue work for Lauren
6. ✅ Lauren has her own queue modeled like Archie's
7. ✅ Lauren runs on the same SDK loop pattern
8. ✅ Lauren can create tasks (write to DB)
9. ✅ Lauren can signal Archie when done
10. ✅ SDK documentation explains the loop pattern
11. ✅ Both queues use FIFO ordering
12. ✅ Idempotency prevents duplicate processing

---

## 🚦 NEXT STEPS AFTER INVESTIGATION

Once investigation is complete, if issues are found:

1. **Document findings** in a separate `INVESTIGATION_RESULTS.md`
2. **Create fix plan** for any architectural issues
3. **Update documentation** if SDK loop usage is unclear
4. **Test end-to-end** to verify the system works correctly

If everything looks good:
1. **Document confirmation** that architecture is correct
2. **Create system diagram** showing the verified flow
3. **Write user guide** for how to interact with the system

