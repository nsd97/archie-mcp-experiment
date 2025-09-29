# Operations Center API Contract (Draft)

Status: Draft

This contract reflects the current mock server endpoints and the data shapes used by the frontend. Backend should implement equivalent routes and response shapes. All responses are JSON.

- Base path: `/v1`
- Content-Type: `application/json`
- Authentication: None in mock server. Production will use JWT (see `docs/backend/technical-design.md`).
- Envelope: Most endpoints return `{ data: <OperationsData> }`.

References:
- Mock routes: `mock-server/server.js`
- Types: `src/components/operations-center/types.ts`

---

## Quick Reference

| Method | Path | Description | Request Body | Response |
| --- | --- | --- | --- | --- |
| GET | /v1/operations/state | Get full snapshot | — | `{ data: OperationsData }` |
| POST | /v1/operations/reset | Reset to initial dataset | `{}` | `{ data: OperationsData }` |
| POST | /v1/operations/listings/:listingId/status | Update listing status | `{ status: ListingStatus }` | `{ data: OperationsData }` |
| POST | /v1/operations/listings/:listingId/notes | Add a note | `{ authorId: UUID, body: string }` | `{ data: OperationsData }` |
| POST | /v1/operations/tasks/:taskId/claim | Claim task | `{ agentId: UUID }` | `{ data: OperationsData }` |
| POST | /v1/operations/tasks/:taskId/unclaim | Unclaim task | `{}` | `{ data: OperationsData }` |
| POST | /v1/operations/tasks/:taskId/done | Mark task done | `{}` | `{ data: OperationsData }` |
| POST | /v1/operations/tasks/:taskId/defer | Defer task due date | `{ days: number }` | `{ data: OperationsData }` |
| POST | /v1/operations/tasks/:taskId/queue | Move stray task between queues | `{ queue: StrayQueue }` | `{ data: OperationsData }` |
| POST | /v1/operations/tasks/:taskId/outputs | Update one output field | `{ key: string, value: string }` | `{ data: OperationsData }` |
| POST | /v1/operations/tasks/:taskId/status | Update task status | `{ status: TaskStatus }` | `{ data: OperationsData }` |
| GET | /v1/tasks/:taskId/ui | Demo task-screen definition (legacy) | — | `TaskScreenDraft` |

Notes:
- The frontend client uses `VITE_OPERATIONS_API_URL` to override the base URL. Default is `http://localhost:8080/v1` (`src/components/operations-center/api.ts`).
- In production, `GET /v1/operations/snapshot` may replace `/state` per `docs/backend/technical-design.md`.

---

## Response Envelope

```json
{
  "data": { /* OperationsData */ }
}
```

Errors use:
```json
{ "error": "message" }
```
Common 4xx causes in the mock server: missing `status`, `agentId`, `days`, or `key` fields.

---

## Entities and Enums (authoritative from frontend types)

- `UUID`: string
- `ListingStatus`: "NEW" | "IN_PROGRESS" | "DONE_POSTED"
- `TaskStatus`: "NEW" | "IN_PROGRESS" | "DONE"
- `StrayQueue`: "ADMIN" | "MARKETING"
- `WorkItemType`:
  - "STRAY"
  - "LEASE_LISTING_ACTIVE"
  - "SALES_LISTING_ACTIVE"
  - "SALE_LISTING_CLOSING"
  - "SALE_LISTING_SOLD"
  - "LEASE_LISTING_LEASED"
  - "LEASE_LISTING_CLOSING"
  - "BUYER_DEAL_CLOSING"
  - "LEASE_TENANT_DEAL_CLOSING"
  - "RELIST_LISTING_DEAL"
- `HistoryEventType`: "CREATED" | "STATUS_CHANGED" | "CLAIMED" | "UNCLAIMED" | "DONE" | "NOTE_ADDED"

---

## JSON Schemas (Draft 2020-12)

### OperationsData
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "#/schemas/OperationsData",
  "type": "object",
  "required": ["agents", "playbooks", "listings", "tasks", "notes", "attachments", "history", "workItems"],
  "properties": {
    "agents": { "type": "array", "items": { "$ref": "#/schemas/Agent" } },
    "playbooks": { "type": "array", "items": { "$ref": "#/schemas/Playbook" } },
    "listings": { "type": "array", "items": { "$ref": "#/schemas/Listing" } },
    "tasks": { "type": "array", "items": { "$ref": "#/schemas/Task" } },
    "notes": { "type": "array", "items": { "$ref": "#/schemas/Note" } },
    "attachments": { "type": "array", "items": { "$ref": "#/schemas/Attachment" } },
    "history": { "type": "array", "items": { "$ref": "#/schemas/HistoryEvent" } },
    "workItems": { "type": "array", "items": { "$ref": "#/schemas/WorkItem" } }
  },
  "$defs": {}
}
```

### Agent
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "#/schemas/Agent",
  "type": "object",
  "required": ["id", "name", "email"],
  "properties": {
    "id": { "type": "string" },
    "name": { "type": "string" },
    "email": { "type": "string" },
    "avatarUrl": { "type": "string" }
  }
}
```

### Playbook
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "#/schemas/Playbook",
  "type": "object",
  "required": ["id", "name"],
  "properties": {
    "id": { "type": "string" },
    "name": { "type": "string" }
  }
}
```

### Listing
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "#/schemas/Listing",
  "type": "object",
  "required": ["id", "address", "status", "agentId", "dueDate"],
  "properties": {
    "id": { "type": "string" },
    "address": { "type": "string" },
    "status": { "type": "string", "enum": ["NEW", "IN_PROGRESS", "DONE_POSTED"] },
    "agentId": { "type": "string" },
    "dueDate": { "type": "string" },
    "dealType": { "type": "string" },
    "propertyType": { "type": "string" },
    "squareFootage": { "type": "number" },
    "location": { "type": "string" }
  }
}
```

### Task
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "#/schemas/Task",
  "type": "object",
  "required": ["id", "title", "status", "dueDate", "urgencyScore", "type"],
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "listingId": { "type": "string" },
    "playbookId": { "type": "string" },
    "status": { "type": "string", "enum": ["NEW", "IN_PROGRESS", "DONE"] },
    "dueDate": { "type": "string" },
    "claimedById": { "type": "string" },
    "urgencyScore": { "type": "number" },
    "type": { "type": "string", "enum": ["COPYWRITING", "PHOTO_EDIT", "DOCS", "REVIEW", "PUBLISH", "OTHER"] },
    "queue": { "type": "string", "enum": ["ADMIN", "MARKETING"] },
    "agentId": { "type": "string" },
    "address": { "type": "string" },
    "templateKey": { "type": "string" },
    "inputs": { "type": "object", "additionalProperties": { "type": "string" } },
    "outputs": { "type": "object", "additionalProperties": { "type": "string" } },
    "template": { "type": "string" }
  }
}
```

### Note
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "#/schemas/Note",
  "type": "object",
  "required": ["id", "listingId", "authorId", "createdAt", "body"],
  "properties": {
    "id": { "type": "string" },
    "listingId": { "type": "string" },
    "authorId": { "type": "string" },
    "createdAt": { "type": "string" },
    "body": { "type": "string" }
  }
}
```

### Attachment
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "#/schemas/Attachment",
  "type": "object",
  "required": ["id", "listingId", "name", "url"],
  "properties": {
    "id": { "type": "string" },
    "listingId": { "type": "string" },
    "name": { "type": "string" },
    "url": { "type": "string" }
  }
}
```

### HistoryEvent
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "#/schemas/HistoryEvent",
  "type": "object",
  "required": ["id", "listingId", "type", "timestamp", "summary"],
  "properties": {
    "id": { "type": "string" },
    "listingId": { "type": "string" },
    "type": { "type": "string", "enum": ["CREATED", "STATUS_CHANGED", "CLAIMED", "UNCLAIMED", "DONE", "NOTE_ADDED"] },
    "timestamp": { "type": "string" },
    "summary": { "type": "string" }
  }
}
```

### WorkItem
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "#/schemas/WorkItem",
  "type": "object",
  "required": ["id", "type", "title", "taskIds"],
  "properties": {
    "id": { "type": "string" },
    "type": { "type": "string", "enum": [
      "STRAY",
      "LEASE_LISTING_ACTIVE",
      "SALES_LISTING_ACTIVE",
      "SALE_LISTING_CLOSING",
      "SALE_LISTING_SOLD",
      "LEASE_LISTING_LEASED",
      "LEASE_LISTING_CLOSING",
      "BUYER_DEAL_CLOSING",
      "LEASE_TENANT_DEAL_CLOSING",
      "RELIST_LISTING_DEAL"
    ] },
    "title": { "type": "string" },
    "listingId": { "type": "string" },
    "taskIds": { "type": "array", "items": { "type": "string" } },
    "metadata": { "type": "object", "additionalProperties": true }
  }
}
```

---

## Endpoint Details

### GET /v1/operations/state
- Description: Return full snapshot for UI.
- Response: `{ data: OperationsData }`

### POST /v1/operations/reset
- Description: Reset in-memory dataset to fresh seed.
- Body: `{}`
- Response: `{ data: OperationsData }`

### POST /v1/operations/listings/:listingId/status
- Body:
```json
{ "status": "NEW" | "IN_PROGRESS" | "DONE_POSTED" }
```
- Response: `{ data: OperationsData }`

### POST /v1/operations/listings/:listingId/notes
- Body:
```json
{ "authorId": "<UUID>", "body": "<text>" }
```
- Response: `{ data: OperationsData }`

### POST /v1/operations/tasks/:taskId/claim
- Body:
```json
{ "agentId": "<UUID>" }
```
- Response: `{ data: OperationsData }`

### POST /v1/operations/tasks/:taskId/unclaim
- Body: `{}`
- Response: `{ data: OperationsData }`

### POST /v1/operations/tasks/:taskId/done
- Body: `{}`
- Response: `{ data: OperationsData }`

### POST /v1/operations/tasks/:taskId/defer
- Body:
```json
{ "days": 1 }
```
- Response: `{ data: OperationsData }`

### POST /v1/operations/tasks/:taskId/queue
- Body:
```json
{ "queue": "ADMIN" | "MARKETING" }
```
- Response: `{ data: OperationsData }`

### POST /v1/operations/tasks/:taskId/outputs
- Body:
```json
{ "key": "<string>", "value": "<string>" }
```
- Response: `{ data: OperationsData }`

### POST /v1/operations/tasks/:taskId/status
- Body:
```json
{ "status": "NEW" | "IN_PROGRESS" | "DONE" }
```
- Response: `{ data: OperationsData }`

### GET /v1/tasks/:taskId/ui
- Description: Returns a task screen draft for demo purposes (legacy).
- Response shape (example fields):
```json
{
  "version": 1,
  "id": "task-id",
  "name": "Task Name",
  "department": "marketing",
  "taskGroupId": "listing-123",
  "order": 0,
  "screen": {
    "id": "scr-id",
    "title": "Screen Title",
    "components": [
      { "id": "comp-1", "kind": "input", "type": "text", "label": "...", "binding": "..." },
      { "id": "comp-2", "kind": "output", "type": "badge", "label": "...", "binding": "..." }
    ]
  },
  "actions": [
    { "id": "save", "label": "Save Progress", "intent": "secondary", "handler": "tasks/update" }
  ]
}
```

---

## Error Handling
- Status codes: `200` on success; `400` when required fields are missing/invalid.
- Error payload: `{ "error": "message" }`

---

## Versioning & Migration Notes
- The frontend currently calls `/v1/operations/state`. Backend may surface `/v1/operations/snapshot` (see `docs/backend/technical-design.md`). Ensure response remains `{ data: OperationsData }`.
- All mutations should return the updated snapshot to keep the UI in sync without an extra fetch.

---

## Known Gaps and Next Steps (for backend integration)

- Archive semantics and endpoints
  - No server-side archive; UI treats listings with `status = DONE_POSTED` older than 7 days as archived (client-side filter).
    - Evidence: `src/components/operations-center/views/ListingsBoard.tsx` L19-L20; `src/pages/ArchivePage.tsx` L17-L29.
  - Consider adding listing statuses `LIVE`, `ARCHIVED` (design references ARCHIVED) and/or fields like `archivedAt`, plus optional endpoints:
    - `GET /v1/operations/archive` (list archived resources)
    - `POST /v1/operations/listings/:id/archive` / `.../unarchive`
    - Evidence: `docs/backend/technical-design.md` L69-L73.

- Status alignment (enums)
  - Listings: FE contract uses `NEW | IN_PROGRESS | DONE_POSTED`; design includes `LIVE` and `ARCHIVED`.
  - Tasks: FE contract uses `NEW | IN_PROGRESS | DONE`; design also mentions `BLOCKED`, `CANCELED`.
  - Action: align enums in API+FE and document migration.
    - Evidence: `docs/backend/technical-design.md` L69-L73, L79-L86; `src/components/operations-center/types.ts` L5-L7.

- File presign endpoints
  - Missing here but present in design: `POST /v1/files/presign-put`, `POST /v1/files/presign-get`.
  - Define request/response structure and auth requirements.
    - Evidence: `docs/backend/technical-design.md` L175-L176.

- Authentication and authorization
  - Mock has no auth; production needs JWT (Cognito) with 401/403 semantics and role scopes.
  - Specify header format (e.g., `Authorization: Bearer <token>`), error codes, and role mapping.
    - Evidence: `docs/backend/technical-design.md` L40-L43, L231-L235.

- List endpoints, filtering, pagination
  - Only snapshot endpoint is defined. Add list endpoints with query params and pagination:
    - `GET /v1/listings?status=...&agentId=...&page=...`
    - `GET /v1/tasks?status=...&claimedBy=...&queue=...&page=...`
  - Evidence: future endpoints hinted in `docs/backend/technical-design.md` L178-L181; query patterns L221-L226.

- Error model
  - Mock returns generic `{ error: string }` with 400 for missing fields.
  - Define error envelope, codes, and validation schema errors (e.g., `code`, `message`, `details`).
    - Evidence: `mock-server/server.js` validations L107-L177.

- Task UI schema
  - `GET /v1/tasks/:taskId/ui` returns a demo task-screen; not formalized as a schema.
  - Define JSON Schema for Task Screens aligned with `src/lib/tasks/core.ts` types (inputs/outputs, visibleWhen, actions, dataSources, transforms).
    - Evidence: `mock-server/server.js` L24-L92, L181-L184; `src/lib/tasks/core.ts`.

- “My Tasks” semantics
  - FE computes "my tasks" client-side by filtering `claimedById`.
  - Consider `GET /v1/tasks?claimedBy=me` or `GET /v1/me/tasks`.
    - Evidence: `src/components/operations-center/views/MyTasksView.tsx` L12-L18.

- Observability and limits
  - Logging, tracing, metrics, and rate limits are not defined in this contract.
  - Align with design: structured logs, X-Ray/OTel, error budgets.
    - Evidence: `docs/backend/technical-design.md` §12.

- Slack intake endpoints (out of scope here)
  - Not included in this contract; design specifies `POST /v1/slack/events` and intake replay.
    - Evidence: `docs/backend/technical-design.md` L164-L166.

