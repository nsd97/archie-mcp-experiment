# Ops Center API (Node 20 + Fastify)

## Monorepo Structure

- packages/frontend → Git submodule (Casakit/operations-center)
- api (this service)

Initialize submodules after clone:

```bash
git submodule update --init --recursive
```

## Quickstart (Local)

1) Copy env

```bash
cp ENV_LOCAL_EXAMPLE.txt .env
```

1) Start LocalStack and init infra

```bash
npm run infra:up
npm run infra:init
```

1) Seed data

```bash
npm run seed
```

1) Run dev server

```bash
npm run dev
```

### Exposing the local server to Slack (ngrok)

Slack needs a publicly reachable URL to deliver Events API callbacks. During local development you can tunnel your Fastify server with [ngrok](https://ngrok.com/):

```bash
# install and authenticate once
brew install ngrok
ngrok config add-authtoken <YOUR_NGROK_TOKEN>

# in a separate terminal while `npm run dev` is running on port 3000
ngrok http 3000
```

ngrok prints an HTTPS forwarding URL such as `https://abc123.ngrok.app`. Set your Slack app’s **Event Subscriptions → Request URL** to `https://abc123.ngrok.app/slack/events` (update it whenever the ngrok URL changes). Leave the tunnel running while testing so Slack can reach your local backend.

1) Run tests

```bash
npm test
```

1) E2E flow only

```bash
npm run e2e
```

1) Reset and reseed

```bash
npm run seed:reset
```

## Scripts

- dev: run Fastify with ts-node + nodemon
- build/start: compile and run from dist
- lint, lint:fix, typecheck
- test, test:watch, e2e
- infra:up, infra:init, infra:down, infra:logs, infra:verify
- seed, seed:reset

## Env keys

- AWS_REGION, LOCALSTACK_ENDPOINT, PORT
- ENTITIES_TABLE, LISTINGS_TABLE, TASKS_TABLE, AUDIT_LOG_TABLE
- ARTIFACTS_BUCKET
- INTAKE_QUEUE_NAME, INTAKE_DLQ_NAME, INTAKE_QUEUE_URL
- INTAKE_EVENTS_TABLE
- USE_CLOUDFRONT, CF_DISTRIBUTION_DOMAIN, CF_KEY_PAIR_ID, CF_PRIVATE_KEY_B64
- CORS_ORIGINS
- RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS

## CORS

- `CORS_ORIGINS` is a comma-separated list of exact origins (including scheme).
- If `CORS_ORIGINS` is empty, all origins are allowed. This is convenient for local development, but you should set explicit origins in production.
- Preflight requests will only echo `Access-Control-Allow-Origin` if the request origin matches an entry in `CORS_ORIGINS` (or if it is empty).

Examples:

```bash
# Allow specific dev frontends
CORS_ORIGINS=http://localhost:5173,http://localhost:8080

# Allow all origins (dev only)
CORS_ORIGINS=
```

After changing `CORS_ORIGINS`, restart the server:

```bash
npm run dev
# or with Docker
npm run docker:down && npm run docker:up
```

## Endpoints

- GET `/health`
- GET `/v1/operations/listings`
- GET `/v1/operations/listings/{id}`
- GET `/v1/operations/listings/{id}/details`
- GET `/v1/operations/queues`
- GET `/v1/operations/queue`
- GET `/v1/operations/tasks/{listingId}`
- GET `/v1/operations/tasks/task/{taskId}`
- POST `/v1/operations/tasks/{taskId}/claim`
- POST `/v1/operations/tasks/{taskId}/unclaim`
- POST `/v1/operations/tasks/{taskId}/complete`
- GET `/v1/operations/my-tasks`
- GET `/v1/operations/stray-queues`
- GET `/v1/operations/board`
- GET `/v1/listings/{id}/documents`
- POST `/files/sign-get`
- POST `/slack/events`
- POST `/slack/interact`
- GET `/entities`
- GET `/openapi.json`
- GET `/docs`

## Docker

```bash
npm run docker:build
npm run docker:up
# visit http://localhost:3000/docs
npm run docker:down
```
