# Operations Center Backend Technical Design

Status: Draft

Date: 2025-09-20

Owners: Backend/Infra + Ops Center team

## 1) Purpose and scope

This document specifies the backend design for Operations Center (OC) with Slack-driven task intake, listing lifecycle task orchestration, document handling, and a thin API surface for the existing frontend (`src/pages/OperationsCenterPage.tsx` and views under `src/components/operations-center/views/`).

It consolidates the product decisions from the discussion into a concrete, implementable plan. The design favors simplicity and velocity while leaving room for scale-out.

Out of scope (for v1):

- External MLS ingestion, calendar syncing, and fully automated vendor booking
- Google Drive two-way sync (we’ll start with S3 and a simple viewer)
- Agent/client-facing portal beyond basic document viewing

## 2) Goals and key use-cases

- Create listings (sale or lease) from Slack messages; generate the required listing task set automatically.
- Track tasks, assignees, due dates, status, notes, and outputs/attachments.
- Support “stray” tasks that may or may not be linked to a listing.
- Capture required inputs/outputs for each task type (e.g., booking photos → availability, photographer, final time; lockbox → code + location; sign install → target date; MPAC report → uploaded PDF/link).
- Store and serve listing documents via S3 with pre-signed URLs and a simple document viewer in OC.
- Keep OC UI in sync via simple, well-indexed queries and CRUD APIs.

Non-functional:

- Idempotent Slack ingestion (no duplicate listings/tasks).
- Safe-by-default authz (role/entity scoped), auditability, and metrics.

## 3) High-level architecture

- **Core data**: AWS DynamoDB tables/backed views for entities, listings, tasks, notes, attachments, and timeline events. ULIDs provide sortable IDs.
- **Intake**: Slack Events → API Gateway → Lambda (signature verified) → SQS (`intake-queue`). Downstream Intake Lambda validates JSON payloads, enforces idempotency, writes DynamoDB, and emits history events.
- **LLM**: Event classifier (OpenAI-compatible) runs inside intake Lambda; produces normalized payload (no direct writes).
- **API surface**: API Gateway REST API (base `/v1`) handled by Lambda (Node). Endpoints expose listings/tasks state, mutation hooks, and S3 presign functions. Cognito JWT authorizer secures routes.
- **Storage**: S3 buckets (`archie-ops-artifacts-{env}`) for documents/photos. CloudFront (optional) for signed GETs.
- **Auth**: Amazon Cognito with Google IdP + username/password fallback. Slack user ↔ entity mapping maintained in DynamoDB.
- **Frontend**: OC UI (React) calls REST endpoints. Until production backend lands, local mock server (`mock-server/`) mimics the same contract, hydrating the UI.

Component summary:

- Slack Events → `POST /v1/slack/events` (verify + enqueue).
- Classifier Lambda → SQS message with normalized JSON (see §9).
- Intake Lambda → DynamoDB writes (entities/listings/tasks/notes) + timeline events + Slack notifications.
- REST API Lambdas → fetch aggregated snapshot (`/v1/operations/snapshot`) or mutate tasks/listings.
- S3/CloudFront → document upload/download via pre-signed URLs.

## 4) Data model (DynamoDB + S3)

**Conventions**

- ULID strings for all identifiers (`entity_id`, `listing_id`, `task_id`, `note_id`, `attachment_id`).
- `tenant` attribute reserved for future multi-tenant split.
- `created_at` / `updated_at` ISO strings kept in each record; updates handled in Lambda (no triggers).

**Tables / indexes**

1. **`entities`**
   - **PK**: `entity_id`
   - Fields: `type` (`AGENT`, `ADMIN_OPS`, `ADMIN_MARKETING`, `CLIENT`), `name`, `email`, `slack_user_id`, `role_subtype`, `status`, `metadata` (map), `external_ids` (map).
   - **GSI1**: `slack_user_id` → `entity_id` for quick lookup.

2. **`listings`**
   - **PK**: `listing_id`
   - Fields: `agent_id`, `deal_type`, `address` (structured), `status` (`NEW`, `IN_PROGRESS`, `LIVE`, `DONE_POSTED`, `ARCHIVED`), `primary_work_item_type`, `due_at`, `details`, `tags`, `task_template_version`.
   - **GSI1**: `agent_id` → `status#due_at` (agent dashboards).
   - **GSI2**: `status` → `due_at#listing_id` (Ops board buckets).

3. **`listing_work_items`** (drives board and completeness chips)
   - **PK**: `listing_id`
   - **SK**: `work_item_id` (e.g., `LEASE_LISTING_ACTIVE`)
   - Fields: `type`, `title`, `task_ids` (list), `metadata` (phase, channel), `summary_status`.

4. **`tasks`**
   - **PK**: `scope_id` – `LISTING#<listing_id>` or `STRAY#<queue>` (queue ∈ `ADMIN`, `MARKETING`).
   - **SK**: `task_id`
   - Fields: `listing_id?`, `title`, `task_type`, `status` (`NEW`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELED`), `claimed_by`, `claimed_at`, `due_at`, `urgency_score`, `inputs` (map), `outputs` (map), `template_key`, `agent_id?`, `address?`.
   - **GSI1**: `status` → `due_at#task_id` (queues).
   - **GSI2**: `claimed_by` → `status#due_at` (“My Tasks”).
   - **GSI3**: `task_type` → `created_at` (analytics/bulk ops).

5. **`notes`**
   - **PK**: `listing_id`
   - **SK**: `note_id`
   - Fields: `author_id`, `body`, `created_at`.

6. **`attachments`**
   - **PK**: `listing_id`
   - **SK**: `attachment_id`
   - Fields: `task_id?`, `doc_type`, `object_key`, `filename`, `mime_type`, `size_bytes`, `uploaded_by`, `visibility` (`ADMIN_OPS`, `ADMIN_MARKETING`, `CLIENT`).
   - **GSI1**: `task_id` → `created_at` for task detail view.

7. **`task_events`**
   - **PK**: `task_id`
   - **SK**: `event_ts`
   - Fields: `event_type`, `actor_id`, `summary`, `payload`.

8. **`listing_events`**
   - **PK**: `listing_id`
   - **SK**: `event_ts`
   - Fields: `event_type`, `actor_id`, `summary`, `payload`.

9. **`intake_events`** (idempotency ledger)
   - **PK**: `idempotency_key` (`channel_id#ts`)
   - Fields: `source`, `processed_at`, `status`, `last_error`.
   - TTL: 30 days.

10. **`task_catalog`** (optional table or S3 JSON versioned artifact)
    - For v1 we ship static JSON in repo and deploy alongside backend. Dynamo table only needed when enabling runtime edits.

**S3 layout**

```
archie-ops-artifacts-{env}/
  listings/<listing_id>/
    docs/<doc_type>/<filename>
    photos/<subfolders>
  stray/<task_id>/<filename>
```

## 5) Storage and document viewer

- Upload flow: UI requests `POST /v1/files/presign-put` with listing/task context. Lambda returns S3 pre-signed PUT and canonical `object_key` (scoped prefix, content-type, size limits).
- Download flow: `POST /v1/files/presign-get` returns short-lived GET or CloudFront signed URL.
- OC “Documents” tab lists records from `attachments`. Client-only filtering for doc_type/visibility.
- Client document view (lite v1): read-only HTML page served via `/v1/listings/{id}/client-docs` with presigned links filtered to `visibility = CLIENT`.

## 6) Slack + LLM flow

1. **Slack Event**
   - App subscribes to `message.channels`, `app_mention`, `message.im`.
   - API Gateway validates Slack signature (HMAC SHA256 over timestamp + body). Reject requests older than ±5 minutes.

2. **Classification**
   - Lambda prompts LLM to classify as `listing_init`, `listing_task`, or `stray_task` and extract structured fields (see §9).
   - Output includes `idempotency_key`, `agent`, `address`, `deal_type`, and proposed tasks.

3. **Queue**
   - Payload enqueued on SQS (`intake-queue`). Dead-letter queue configured for retries/monitoring.

4. **Intake Lambda**
   - Enforces idempotency via `intake_events`.
   - Resolves/creates `entities`, `listings`, and tasks using catalog templates.
   - Emits timeline events (`task_events`, `listing_events`).
   - (Optional) posts confirmation back to Slack via response URL or chat.postMessage.

## 7) Task catalog

- Versioned JSON files in repo (mirrored to S3 on deploy). Keys align with frontend templates (`sale-active-book-photos`, etc.).
- Each entry stores inputs/outputs schema, default SLA offset, visibility, required docs, and UI hints.
- Backend loads catalog at cold start; caches in-memory with periodic refresh (or use S3 version + ETag).

## 8) API surface (REST / API Gateway)

Base path: `/v1`.

Public endpoints (require Cognito JWT except Slack routes):

- `POST /slack/events` — verify, normalize, enqueue (no auth header).
- `POST /intake/replay` — manual replay of specific idempotency key (admin-only).
- `GET /operations/snapshot` — aggregated state for OC (listings, tasks, notes, attachments, work items, agents).
- `POST /operations/listings/{listingId}/status` — change listing status (includes audit event).
- `POST /operations/listings/{listingId}/notes` — append note.
- `POST /operations/tasks/{taskId}/claim` — claim task.
- `POST /operations/tasks/{taskId}/unclaim` — unclaim task.
- `POST /operations/tasks/{taskId}/status` — update task status.
- `POST /operations/tasks/{taskId}/outputs` — update single output field.
- `POST /operations/tasks/{taskId}/defer` — push due date by N days.
- `POST /operations/tasks/{taskId}/queue` — move stray task between queues.
- `POST /files/presign-put` — presign upload.
- `POST /files/presign-get` — presign download.

Additional REST endpoints (future): `GET /listings`, `GET /tasks`, `PATCH /listings/{id}` to support finer grained fetching once frontend migrates off snapshot.

All mutations return the refreshed snapshot slice (or full snapshot) to keep the UI in sync without extra fetches.

## 9) LLM output schema (v1)

```json
{
  "schema_version": 1,
  "intent": "listing_init" | "listing_task" | "stray_task",
  "idempotency_key": "<channel>#<ts>",
  "source": {
    "slack_user_id": "U123",
    "channel_id": "C456",
    "ts": "1727042500.123456"
  },
  "listing": {
    "address": "123 Main St, Toronto, ON",
    "type": "SALE" | "LEASE" | null,
    "agent_hint": "Name from text or Slack profile"
  },
  "tasks": [
    {
      "task_type": "SALE::BOOK_PHOTOS",
      "notes": "optional rationale",
      "inputs": {
        "availability_windows": ["2025-09-25T09:00/2025-09-25T12:00"]
      }
    }
  ],
  "stray": {
    "summary": "Free-form description for stray task"
  }
}
```

Validation:

- All payloads checked against JSON Schema before enqueue.
- Intake Lambda re-validates; unknown fields ignored; missing required fields create `INFO_REQUEST` task + Slack follow-up.

## 10) Query patterns and indexes

- **Board columns**: Query `listings` GSI2 by status bucket; join with `listing_work_items` for completeness badges.
- **Queue view**: Query `tasks` GSI1 with `status IN (NEW, IN_PROGRESS)`; filter to unclaimed; compute urgency server-side.
- **My Tasks**: Query `tasks` GSI2 by `claimed_by`.
- **Listing detail**: Batch-get tasks (partition `LISTING#...`), notes, attachments, work-item row, plus latest events.
- **Stray queues**: Direct query on `scope_id = STRAY#ADMIN` etc.
- **Idempotency**: `intake_events` prevents duplicate writes even if SQS replays.
- **Search** (future): Optionally mirror listings into OpenSearch for fuzzy address/agent queries.

## 11) Security and permissions

- Slack HMAC verification (timestamp drift ±5 min).
- Cognito JWT authorizer with role claims mapping to `entities` entries.
- Agents limited to their listings/tasks; Admin Ops/Marketing have broader scopes; clients read-only doc manifest.
- IAM: Lambdas use least-privileged roles for DynamoDB/S3 actions; presigns scoped to listing/task prefixes with TTL ≤ 15 minutes.
- Audit trail: `task_events` and `listing_events` capture every mutation with actor metadata. Critical actions mirrored to CloudWatch Logs + optional Kinesis Firehose for retention.

## 12) Observability and reliability

- Structured logging (JSON) with correlation ids (`request_id`, `listing_id`, `task_id`).
- X-Ray traces for API Gateway → Lambda → Dynamo/S3.
- SQS DLQ monitors ingestion failures; CloudWatch alarms on DLQ length and Lambda error rates.
- Metrics: queue depth, intake latency, mutation latency, presign success rate, Slack classification errors.

## 13) Deployment and environments

- Environments: `dev`, `stg`, `prod` (isolated AWS accounts or prefixes).
- IaC: CDK/Terraform module provisioning SQS, Lambdas, API Gateway, Cognito, Dynamo tables, S3 buckets, CloudFront.
- Secrets: AWS Secrets Manager for Slack signing secret, LLM API key, Google API credentials.
- CI/CD: GitHub Actions builds Lambdas (esbuild), deploys infrastructure, runs contract tests against mock server.

## 14) Migration plan (incremental)

- **M0**: Infra skeleton (SQS, Dynamo tables, S3 buckets, Cognito stub, API Gateway). Publish OpenAPI 3.1 + mock server.
- **M1**: Slack intake path (HMAC, classifier, SQS, Dynamo writes, idempotency).
- **M2**: Operations API snapshot endpoint + listing/task mutations hitting Dynamo.
- **M3**: Documents pipeline (presigned upload/download, attachment metadata, OC viewer).
- **M4**: Notes, history timeline, stray tasks.
- **M5**: Metrics, alerts, dashboards, Slack confirmations.

## 15) Open questions / next decisions

1. **Catalog storage**: Keep Git-managed JSON or migrate to admin-editable table?
2. **Address matching**: Start with conservative fuzzy match (exact street + city). Need ops validation flow for ambiguous matches.
3. **Client document view**: Ship in v1 (read-only) or defer to v1.1?
4. **Calendar hooks**: When to integrate Google/Microsoft for scheduling tasks (photos, sign install)?
5. **Notes enhancements**: Support @mentions and Slack cross-links in v1?
6. **Analytics**: Do we need Redshift/Snowflake export in v1, or nightly Dynamo → S3 snapshots suffice?

## 16) Appendix: Example task catalog entry

```json
{
  "task_def_id": "LEASE::BOOK_PHOTOS",
  "version": 1,
  "title": "Book Photography",
  "inputs_schema": {
    "type": "object",
    "required": ["availability_windows"],
    "properties": {
      "availability_windows": {
        "type": "array",
        "items": { "type": "string", "format": "date-time-range" }
      },
      "access_instructions": { "type": "string" },
      "preferred_vendor": { "type": "string" }
    }
  },
  "outputs_schema": {
    "type": "object",
    "required": ["scheduled_start", "scheduled_end", "photographer_name"],
    "properties": {
      "scheduled_start": { "type": "string", "format": "date-time" },
      "scheduled_end": { "type": "string", "format": "date-time" },
      "photographer_name": { "type": "string" },
      "confirmation_url": { "type": "string", "format": "uri" }
    }
  },
  "required_docs": ["PHOTO_SET"],
  "default_due_offset": "+3d",
  "ui_hints": {
    "visibility_group": "ADMIN_MARKETING",
    "checklist": ["Confirm access", "Notify client", "Upload photos"]
  },
  "active": true
}
```

## 17) Rationale summary

- DynamoDB + SQS keeps intake idempotent and scalable while remaining simple to reason about.
- S3 is the single source for artifacts; presigned URLs avoid proxying large files through Lambdas.
- Local mock server mirrors the final contract, allowing frontend iteration without backend availability.
- LLM restricted to classification/normalization ensures human-audited, deterministic writes in v1.
