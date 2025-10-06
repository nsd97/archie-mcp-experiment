# Architecture Verification - Quick Reference

## 🎯 What We're Investigating

**Goal**: Verify the two-agent system is built correctly using OpenAI SDK patterns.

---

## 📊 System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER (Matrix)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROMPT QUEUE (FIFO)                           │
│                 • Preserves message order                        │
│                 • Prevents duplicates                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ARCHIE QUEUE CONSUMER                           │
│              (queue_consumer.py - outer loop)                    │
│                                                                   │
│  while True:                                                     │
│    messages = poll_queue()                                       │
│    for msg in messages:                                          │
│      ╔═══════════════════════════════════════════════╗          │
│      ║         ARCHIE AGENT (SDK inner loop)         ║          │
│      ║      result = await Runner.run(archie)        ║          │
│      ║                                               ║          │
│      ║  Tools:                                       ║          │
│      ║  • get_task_status (READ DB)                  ║          │
│      ║  • send_matrix_message (WRITE Matrix)         ║          │
│      ║  • enqueue_for_lauren (SEND to Lauren)        ║          │
│      ╚═══════════════════════════════════════════════╝          │
└────────────┬────────────────────────────┬───────────────────────┘
             │                            │
             │ (if task creation)         │ (send response)
             ▼                            ▼
┌──────────────────────────────┐   ┌──────────────────────┐
│  LAUREN WORK QUEUE (FIFO)    │   │   USER (Matrix)      │
│  • Task creation requests    │   └──────────────────────┘
└──────────────┬───────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LAUREN QUEUE CONSUMER                           │
│             (lauren_consumer.py - outer loop)                    │
│                                                                   │
│  while True:                                                     │
│    work_items = poll_queue()                                     │
│    for item in work_items:                                       │
│      ╔═══════════════════════════════════════════════╗          │
│      ║         LAUREN AGENT (SDK inner loop)         ║          │
│      ║      result = await Runner.run(lauren)        ║          │
│      ║                                               ║          │
│      ║  Tools:                                       ║          │
│      ║  • classify_and_create_task (WRITE DB)        ║          │
│      ║  • create_task (WRITE DB)                     ║          │
│      ║  • notify_archie_signal (SEND to Archie)      ║          │
│      ╚═══════════════════════════════════════════════╝          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              ARCHIE SIGNAL QUEUE (FIFO)                          │
│            • Completion notifications                            │
│            • Success/error signals                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              ARCHIE SIGNAL CONSUMER                              │
│         (archie_signal_consumer.py - outer loop)                 │
│                                                                   │
│  Invokes Archie again to inform user of task creation           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │ USER (Matrix)│
                      └──────────────┘
```

---

## 🔑 Key Concepts

### Two Types of Loops

#### 1️⃣ OUTER LOOP (Queue Polling)
**Purpose**: Continuously check the queue for new messages

```python
# In queue_consumer.py, lauren_consumer.py, archie_signal_consumer.py
while True:  # ← OUTER LOOP
    messages = await sqs.receive_message(QueueUrl=queue_url)
    for message in messages:
        process_message(message)
```

**This runs forever**, checking the queue every 20 seconds.

#### 2️⃣ INNER LOOP (OpenAI SDK)
**Purpose**: Let the agent think, use tools, and respond

```python
# Inside process_message()
result = await Runner.run(
    agent,        # Archie or Lauren
    input,        # The message or work item
    context=ctx,  # Shared resources (DB, APIs)
    max_turns=10  # Safety limit
)
```

**The SDK loop**:
1. Call LLM → get response
2. If response has tool calls → execute them
3. If response has final answer → DONE
4. Otherwise, go back to step 1

---

## ✅ Verification Checklist (Simplified)

### Archie Setup
- [ ] **File**: `agents/src/agents/archie.py` uses `Agent()` from SDK
- [ ] **File**: `agents/src/queue_consumer.py` has outer loop + `Runner.run()`
- [ ] **Concurrency**: Room-level semaphore (max 2 per room)
- [ ] **Tools**: Read-only + Matrix + Lauren queue
- [ ] **Pattern**: Matches SDK documentation

### Lauren Setup  
- [ ] **File**: `agents/src/agents/lauren.py` uses `Agent()` from SDK
- [ ] **File**: `agents/src/lauren_consumer.py` has outer loop + `Runner.run()`
- [ ] **Concurrency**: Global semaphore (max 5 total)
- [ ] **Tools**: Write DB + Archie queue
- [ ] **Pattern**: Modeled after Archie

### Queue Architecture
- [ ] **3 Queues**: Prompt, Lauren Work, Archie Signal
- [ ] **All FIFO**: Preserves order
- [ ] **Idempotency**: Checks processed_events table
- [ ] **DLQ**: Dead letter queues for failures

### SDK Documentation
- [ ] **File**: `external/openai-agents-python/docs/running_agents.md`
- [ ] **Section**: "The agent loop" explains `Runner.run()`
- [ ] **Code**: `external/openai-agents-python/src/agents/run.py` implements it

---

## 🔍 Where to Look

| What | File | Key Lines |
|------|------|-----------|
| Archie agent definition | `agents/src/agents/archie.py` | 22-78 |
| Archie queue consumer | `agents/src/queue_consumer.py` | 30-146 |
| Lauren agent definition | `agents/src/agents/lauren.py` | 18-67 |
| Lauren queue consumer | `agents/src/lauren_consumer.py` | 27-102 |
| Queue tools | `agents/src/tools/queues.py` | 64-236 |
| Task tools (Lauren) | `agents/src/tools/tasks.py` | 24-100 |
| Status tool (Archie) | `agents/src/tools/status.py` | All |
| SDK loop docs | `external/openai-agents-python/docs/running_agents.md` | 24-43 |
| SDK loop code | `external/openai-agents-python/src/agents/run.py` | 277-351 |

---

## 🎯 What "Properly Put Together" Means

### ✅ Correct Architecture

1. **Queue → Consumer → Agent Loop**
   - Outer loop polls queue
   - Inner loop (SDK) processes each message
   - Agent uses tools, LLM responds

2. **Concurrency Control**
   - Archie: Per-room (prevents out-of-order responses)
   - Lauren: Global (tasks can be parallel)

3. **Clear Separation of Concerns**
   - Archie: User interface (read status, send messages)
   - Lauren: Task executor (create tasks, write DB)

4. **Reliable Communication**
   - FIFO queues preserve order
   - Idempotency prevents duplicates
   - DLQ catches failures

5. **SDK Loop Pattern**
   - Both agents use `Runner.run()`
   - Both follow SDK documentation
   - Both have `max_turns` limits

---

## ⚠️ Common Anti-Patterns (What NOT to Do)

### ❌ Custom Loop Instead of SDK
```python
# WRONG - Don't do this!
while not done:
    response = call_openai_directly()
    if has_tool_calls:
        execute_tools()
```

### ✅ Use SDK Loop
```python
# CORRECT - Use SDK
result = await Runner.run(agent, input, context=ctx)
```

### ❌ No Concurrency Control
```python
# WRONG - Can process messages out of order
for message in messages:
    await process(message)  # All run in parallel!
```

### ✅ Use Semaphores
```python
# CORRECT - Limit concurrency
async with self.semaphore:
    await process(message)
```

### ❌ No Idempotency Check
```python
# WRONG - Could process same message twice
await invoke_agent(message)
```

### ✅ Check for Duplicates
```python
# CORRECT - Skip duplicates
if await is_duplicate(correlation_id):
    return
await invoke_agent(message)
await mark_processed(correlation_id)
```

---

## 🚀 Quick Investigation Steps

### Step 1: Verify SDK Loop (5 min)
```bash
# 1. Open Archie agent
cat agents/src/agents/archie.py | grep "Agent("

# 2. Open Archie consumer
cat agents/src/queue_consumer.py | grep "Runner.run"

# 3. Check SDK docs exist
ls external/openai-agents-python/docs/running_agents.md
```

**Expected**: All files exist, patterns match

### Step 2: Verify Lauren Mirrors Archie (5 min)
```bash
# 1. Open Lauren agent
cat agents/src/agents/lauren.py | grep "Agent("

# 2. Open Lauren consumer  
cat agents/src/lauren_consumer.py | grep "Runner.run"

# 3. Compare structures
diff -u agents/src/queue_consumer.py agents/src/lauren_consumer.py
```

**Expected**: Similar structure, both use `Runner.run()`

### Step 3: Verify Queue Setup (5 min)
```bash
# 1. Check queue tools
cat agents/src/tools/queues.py | grep "def enqueue_for_lauren"
cat agents/src/tools/queues.py | grep "def notify_archie_signal"

# 2. Check environment variables
grep QUEUE docker-compose.agents.yml
```

**Expected**: Two queue communication tools exist

### Step 4: Verify Concurrency (3 min)
```bash
# Check Archie concurrency
cat agents/src/queue_consumer.py | grep "semaphore"

# Check Lauren concurrency
cat agents/src/lauren_consumer.py | grep "semaphore"
```

**Expected**: Both have semaphore-based concurrency control

---

## 📋 Investigation Results Template

After completing the investigation, fill this out:

### Archie
- [ ] ✅ Uses SDK `Agent()` class
- [ ] ✅ Uses SDK `Runner.run()` loop
- [ ] ✅ Has queue consumer with outer loop
- [ ] ✅ Has concurrency control (semaphore)
- [ ] ✅ Has read-only DB tool
- [ ] ✅ Has Matrix communication tool
- [ ] ✅ Has Lauren queue tool

### Lauren
- [ ] ✅ Uses SDK `Agent()` class
- [ ] ✅ Uses SDK `Runner.run()` loop
- [ ] ✅ Has queue consumer with outer loop
- [ ] ✅ Has concurrency control (semaphore)
- [ ] ✅ Has write DB tools
- [ ] ✅ Has Archie queue tool

### SDK Documentation
- [ ] ✅ `running_agents.md` exists and explains loop
- [ ] ✅ `README.md` has agent loop section
- [ ] ✅ `run.py` implements the documented pattern

### Overall Architecture
- [ ] ✅ All 3 queues configured (Prompt, Lauren Work, Archie Signal)
- [ ] ✅ FIFO ordering preserved
- [ ] ✅ Idempotency checks in place
- [ ] ✅ Both agents follow same pattern

---

## 🎓 Summary for Beginners

**Think of it like a restaurant**:

- **User** = Customer placing order
- **Prompt Queue** = Order tickets on the line
- **Archie** = Waiter who takes orders and talks to customers
- **Archie's outer loop** = Waiter checking for new order tickets
- **Archie's inner loop (SDK)** = Waiter thinking about what to do with each order
- **Lauren Work Queue** = Kitchen order tickets
- **Lauren** = Chef who prepares the food (creates tasks)
- **Lauren's outer loop** = Chef checking for new orders
- **Lauren's inner loop (SDK)** = Chef deciding how to prepare each dish
- **Archie Signal Queue** = Bell that rings when food is ready
- **Archie informs user** = Waiter delivers food to customer

**The SDK loop is the "thinking" part** - it lets the agent:
1. Read the request
2. Decide what tools to use
3. Execute those tools
4. Formulate a response
5. Repeat until done

**The outer loop is the "waiting" part** - it keeps checking for new work.

---

## 💡 Key Takeaway

**Two-Loop Architecture**:

```
┌────────────────────────────────────────┐
│      OUTER LOOP (Custom Code)          │
│   while True: check queue for work     │
│                                         │
│   ┌────────────────────────────────┐   │
│   │  INNER LOOP (OpenAI SDK)       │   │
│   │  await Runner.run(agent, ...)  │   │
│   │                                │   │
│   │  1. Call LLM                   │   │
│   │  2. Execute tools if needed    │   │
│   │  3. Get final response         │   │
│   │  4. Return result              │   │
│   └────────────────────────────────┘   │
│                                         │
└────────────────────────────────────────┘
```

**This pattern is CORRECT and follows OpenAI SDK best practices!**

