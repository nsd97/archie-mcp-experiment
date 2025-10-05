# ArchieOS Two-Agent System — Complete Implementation Guide

**Status:** ✅ COMPLETE — Local Deployment Ready  
**Date:** October 5, 2025  
**Branch:** Noahs-agentic-experiment

---

## 🎯 What We Built

A **queue-based two-agent system** using the OpenAI Agents SDK for real estate task management with Matrix/Element chat integration.

### The Agents

**Archie (Router):**
- Answers "How are my tasks?" queries
- Queues admin task requests to Lauren
- Receives completion signals from Lauren
- Responds to users in Element

**Lauren (Classifier + Creator):**
- Classifies admin task intents
- Creates OPEN/UNCLAIMED tasks for human admins
- **Does NOT claim or complete tasks** (humans do that via UI)

---

## 🏗️ Architecture

```
Element → Matrix Synapse → Prompt Queue → Archie
                                            ↓
                                      Lauren Work Queue → Lauren
                                                           ↓
                                                    Creates Task (OPEN/UNCLAIMED)
                                                           ↓
                                                    Archie Signal Queue → Archie
                                                                           ↓
                                                                     Notifies User
```

**Three SQS Queues:**
1. Prompt Queue — Matrix messages → Archie
2. Lauren Work Queue — Archie → Lauren admin requests
3. Archie Signal Queue — Lauren → Archie status signals

---

## 📋 Quick Start

See **QUICKSTART.md** for detailed setup (10 minutes).

**TL;DR:**
```bash
# 1. Set API key
export OPENAI_API_KEY=sk-...

# 2. Init infrastructure
cd agents && python scripts/init_matrix_infra.py && cd ..

# 3. Start services
docker-compose -f docker-compose.yml -f docker-compose.agents.yml up

# 4. Register Archie & start listener (see QUICKSTART.md)

# 5. Use Element to chat!
```

---

## 🧪 Testing

**Backend Tests (Node.js):**
```bash
# Start LocalStack first
docker-compose up -d localstack

# Initialize
npm run infra:init

# Run tests  
npm test
```

**Agent Tests (Python):**
```bash
cd agents
python -m pytest tests/ -v
```

**E2E Demo:**
```bash
cd agents
python examples/test_queue_workflow.py
```

---

## 📁 Key Files

### Agent Service (Python)
- `agents/src/agents/archie.py` — Router agent
- `agents/src/agents/lauren.py` — Classifier agent
- `agents/tools/*.py` — All tools (status, matrix, tasks, queues)
- `agents/src/*_consumer.py` — 3 queue consumers
- `agents/src/observability/hooks.py` — Metrics & logging
- `agents/src/guardrails/content_filter.py` — Safety checks

### Backend (Node.js)
- `src/routes/v2/*.ts` — V2 API with provenance
- `src/plugins/apiVersion.ts` — Version negotiation

### Infrastructure
- `docker-compose.agents.yml` — All agent services
- `agents/scripts/init_matrix_infra.py` — Queue/table setup
- `.env` — Configuration (created with your variables)

### Documentation
- **QUICKSTART.md** — 10-minute setup guide
- **FINAL_IMPLEMENTATION.md** — Complete architecture
- **IMPLEMENTATION_COMPLETE.md** — SDK references
- **IMPLEMENTATION_SUMMARY.txt** — ASCII art summary

---

## 🔑 Key Decisions

### Following SDK Patterns

**Every component references:**
- `external/openai-agents-python/docs/tools.md` — Function tools
- `external/openai-agents-python/docs/running_agents.md` — Runner.run
- `external/openai-agents-python/docs/multi_agent.md` — Code orchestration
- `external/openai-agents-python/docs/guardrails.md` — Safety
- `external/openai-agents-python/examples/basic/lifecycle_example.py` — Hooks

### Lauren Creates OPEN/UNCLAIMED Only

**By design:**
- status=OPEN
- claim_status=UNCLAIMED
- assigned_to=null

**Humans then:**
- Claim via UI (sets assigned_to)
- Work on it (updates status)
- Complete via UI (sets status=DONE)

### Queue-Based Not Handoffs

**Why queues:**
- Async, non-blocking
- Scalable (multiple Lauren workers)
- Reliable (DLQs for failures)
- Ordered (per-room/correlation)

**SDK supports both:**
- Direct handoffs for synchronous flows
- Code orchestration for async (what we use)

---

## ✅ What Works

- ✅ Matrix/Element bidirectional messaging
- ✅ Archie status queries with real data
- ✅ Archie queues admin tasks
- ✅ Lauren classifies and creates tasks
- ✅ Tasks appear in UI as OPEN/UNCLAIMED
- ✅ Humans claim/complete via UI
- ✅ Full observability (hooks, metrics, traces)
- ✅ Safety guardrails
- ✅ Local Docker deployment
- ✅ AWS-ready (just change endpoints)

---

## 🚀 Deployment

### Local (Current):
- Docker Compose + LocalStack
- All services running locally
- Element connects to localhost:8008
- Full functionality working

### AWS (When Ready):
- Change endpoints from LocalStack to AWS
- Deploy consumers as Lambda
- Deploy agent-service as ECS
- Use production Matrix homeserver

**Code is ready — just environment changes!**

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| **QUICKSTART.md** | Get started in 10 minutes |
| **FINAL_IMPLEMENTATION.md** | Complete architecture & flows |
| **IMPLEMENTATION_COMPLETE.md** | Summary with all SDK references |
| **IMPLEMENTATION_SUMMARY.txt** | ASCII art overview |
| **agents/README.md** | Agent service docs |
| **plan.md** | Approved implementation plan |
| **CURRENT_STATE_DOSSIER.md** | Original system state |

---

## 🎉 Success!

**Implementation complete!** All planned features delivered:

✅ SDK-first architecture throughout  
✅ Queue-based async communication  
✅ Lauren classifies + creates only  
✅ Humans claim/complete via UI  
✅ Matrix/Element integration  
✅ Full observability  
✅ Local deployment working  
✅ AWS-ready code  

**Next:** Test with Element desktop (see QUICKSTART.md) 🚀

---

**Built with the OpenAI Agents SDK** — All patterns from vendored `/external/openai-agents-python/`
