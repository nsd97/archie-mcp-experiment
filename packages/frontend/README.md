# Archie Operations Center Frontend

A React + Vite frontend for exploring the Operations Center experience. It now integrates with the new Node/TypeScript backend (Tasks, Listings, Queues, Slack intake) while still offering a legacy mock server for quick demos.

## Overview

- **Listings board** with drag-and-drop between status buckets.
- **Queue views** for listings, stray tasks, and "My Tasks" with claim/unclaim flows.
- **Listing detail** pane showing tasks, notes, history, and attachments.
- **Task detail** modal that renders config-driven screens from the Tasks & Screens library.
- **Backend bridge** that stitches data from the REST API into the legacy snapshot contract the UI expects (with a graceful fallback to the mock snapshot endpoint).

## Prerequisites

- Node.js 20+
- npm 9+

## 1. Start the backend

Launch the Operations Center API (see the backend repo for exact commands). In local development the service typically runs on port `8080` and exposes the `/v1/operations/*` routes described in `docs/backend/technical-design.md`.

> Tip: If you’re still iterating on the backend and want a quick demo, you can fall back to the legacy mock server by running `npm run mock-server`. Reads will work automatically; writes require the new service.

## 2. Configure the frontend

Create a `.env.local` file (or copy the provided `.env.example`) and set:

```bash
VITE_OPERATIONS_API_URL=http://localhost:8080/v1
VITE_OPERATIONS_USER_ID=agent-noah
# VITE_OPERATIONS_DEBUG_USER={"userId":"agent-noah","email":"agent-noah@example.com","name":"Noah Agent"}
```

- `VITE_OPERATIONS_API_URL` — base URL of the new backend.
- `VITE_OPERATIONS_USER_ID` — the acting user ID; used in the debug header and for optimistic UI decisions.
- `VITE_OPERATIONS_DEBUG_USER` (optional) — raw value for the `X-Debug-User` header if you need a richer JSON payload.

## 3. Install & run the frontend

```bash
npm install
npm run dev
```

Open `http://localhost:5173/operations-center` in the browser.

## Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Produce a production build |
| `npm run preview` | Preview the built app |
| `npm run lint` | Lint the codebase |
| `npm run mock-server` | Launch the legacy Express mock API on port 8080 |
| `npm run generate:task-md` | Regenerate task Markdown files from the mock data |
| `npm run concat:task-md` | Concatenate generated task Markdown into `docs/tasks.md` |

## Project structure

```text
src/
├── components/operations-center/   # Core Ops Center views, state, helpers
├── lib/tasks/                      # Inference-first Tasks & Screens library + renderer
├── pages/                          # Route-level components
└── ...
mock-server/                        # Legacy Express mock API + dataset
scripts/                            # Task markdown utilities
```

## Documentation

- `docs/backend/technical-design.md` — backend architecture, intake flow, and REST contract.
- `docs/code-tour.md` — guided walkthrough of the frontend.
- `docs/tasks/` — generated Markdown for each seeded task.

This repository is private and intended for Archie Ops Center exploration. Reach out to the core team for questions or onboarding support.
