## REST API

All endpoints return a JSON envelope `{ data: OperationsData }` unless noted. See `src/components/operations-center/types.ts` for the `OperationsData` schema.

Base URL: `http://localhost:8080/v1` (configurable via `VITE_OPERATIONS_API_URL`).

### GET /v1/operations/state

Purpose: return the current snapshot used by the UI.

Request: none

Response:

```ts
interface ApiResponse<T> { data: T }
```

Example:

```bash
curl -s http://localhost:8080/v1/operations/state | jq .
```

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/reset

Purpose: reset the store back to its initial state.

Request body:

```ts
interface ResetBody {}
```

Response: `{ data: OperationsData }`

Example:

```bash
curl -X POST http://localhost:8080/v1/operations/reset
```

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/listings/:listingId/status

Purpose: change a listing's status (columns in the Listings board).

Request body:

```ts
interface UpdateListingStatusBody { status: "NEW" | "IN_PROGRESS" | "DONE_POSTED" }
```

Response: `{ data: OperationsData }`

Examples:

```bash
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"status":"IN_PROGRESS"}' \
  http://localhost:8080/v1/operations/listings/lst-1/status
```

```ts
await apiUpdateListingStatus("lst-1", "IN_PROGRESS");
```

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/listings/:listingId/notes

Purpose: append a note to a listing and history.

Request body:

```ts
interface AddNoteBody { authorId: string; body: string }
```

Response: `{ data: OperationsData }`

Example:

```bash
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"authorId":"agent-noah","body":"Called homeowner"}' \
  http://localhost:8080/v1/operations/listings/lst-1/notes
```

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/tasks/:taskId/claim

Purpose: mark a task as claimed by an agent (and move to IN_PROGRESS if NEW).

Request body:

```ts
interface ClaimTaskBody { agentId: string }
```

Response: `{ data: OperationsData }`

Examples:

```bash
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"agent-noah"}' \
  http://localhost:8080/v1/operations/tasks/tsk-1/claim
```

```ts
await apiClaimTask(taskId, "agent-noah");
```

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/tasks/:taskId/unclaim

Purpose: clear the claimedBy field (and reset status to NEW if not DONE).

Request body: `{}`

Response: `{ data: OperationsData }`

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/tasks/:taskId/done

Purpose: mark a task as DONE.

Request body: `{}`

Response: `{ data: OperationsData }`

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/tasks/:taskId/defer

Purpose: push a task's due date forward by N days.

Request body:

```ts
interface DeferTaskBody { days: number }
```

Response: `{ data: OperationsData }`

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/tasks/:taskId/queue

Purpose: assign a stray task into a logical queue.

Request body:

```ts
interface MoveTaskToQueueBody { queue: "ADMIN" | "MARKETING" }
```

Response: `{ data: OperationsData }`

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/tasks/:taskId/outputs

Purpose: update a single output field on a task (used by the Task Detail form).

Request body:

```ts
interface UpdateTaskOutputBody { key: string; value: string }
```

Response: `{ data: OperationsData }`

Examples:

```bash
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"key":"notes_sale-active-draft-mls","value":"Ready for review"}' \
  http://localhost:8080/v1/operations/tasks/tsk-1/outputs
```

```ts
await apiUpdateTaskOutput(taskId, key, value);
```

Where implemented: `mock-server/server.js`

---

### POST /v1/operations/tasks/:taskId/status

Purpose: set a task's status (used by My Tasks board drag/drop).

Request body:

```ts
interface UpdateTaskStatusBody { status: "NEW" | "IN_PROGRESS" | "DONE" }
```

Response: `{ data: OperationsData }`

Where implemented: `mock-server/server.js`

---

### GET /v1/tasks/:taskId/ui

Purpose: return a demo task-screen JSON used by the renderer (not wired end-to-end yet).

Request: none

Response: a `DefinedTask`-like JSON draft used for demo purposes.

Where implemented: `mock-server/server.js`

---

### State snapshot shape

- The UI expects `GET /v1/operations/state` to return `{ data: OperationsData }`.
- See `src/components/operations-center/types.ts` for the canonical TypeScript types.

