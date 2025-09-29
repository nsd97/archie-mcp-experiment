#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PREFIX="[start-local]"
PROJECT_NAME="archieos"

# Optional ultra-verbose shell tracing
START_LOCAL_TRACE="${START_LOCAL_TRACE:-1}"
if [[ "$START_LOCAL_TRACE" == "1" ]]; then
  PS4='+ $(date +%H:%M:%S) ${BASH_SOURCE##*/}:${LINENO}: '
  set -x
fi

# Central log file for this run
LOG_FILE="/tmp/start-local.$(date +%Y%m%d-%H%M%S).log"
mkdir -p /tmp
# Mirror all stdout/stderr into the log file
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  printf '\033[1;34m%s\033[0m %s\n' "$LOG_PREFIX" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' is required but was not found in PATH." >&2
    exit 1
  fi
}

require_cmd docker
require_cmd npm
require_cmd curl

log "Script root: $ROOT"
log "Logging to: $LOG_FILE"

export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export LOCALSTACK_ENDPOINT="${LOCALSTACK_ENDPOINT:-http://localhost:4566}"
export NODE_ENV=local

# Enable very verbose backend logs by default in local
export LOG_LEVEL="${LOG_LEVEL:-debug}"
export HTTP_LOG_VERBOSE="${HTTP_LOG_VERBOSE:-true}"
export ENABLE_CORS="${ENABLE_CORS:-true}"

export VITE_OPERATIONS_API_URL="${VITE_OPERATIONS_API_URL:-http://localhost:3000/v1}"
export VITE_OPERATIONS_USER_ID="${VITE_OPERATIONS_USER_ID:-agent:emma.stone}"
export VITE_OPERATIONS_DEBUG_USER="${VITE_OPERATIONS_DEBUG_USER:-{\"userId\":\"agent:emma.stone\",\"name\":\"Emma Stone\",\"email\":\"emma.stone@example.com\"}}"

log "Environment overview:"
printf '%s\n' \
  "- NODE_ENV=$NODE_ENV" \
  "- LOG_LEVEL=$LOG_LEVEL HTTP_LOG_VERBOSE=$HTTP_LOG_VERBOSE ENABLE_CORS=$ENABLE_CORS" \
  "- AWS_REGION=$AWS_REGION LOCALSTACK_ENDPOINT=$LOCALSTACK_ENDPOINT" \
  "- VITE_OPERATIONS_API_URL=$VITE_OPERATIONS_API_URL" \
  "- VITE_OPERATIONS_USER_ID=$VITE_OPERATIONS_USER_ID" \
  "- VITE_OPERATIONS_DEBUG_USER=$VITE_OPERATIONS_DEBUG_USER"

cleanup() {
  local exit_code=$?
  if [[ -n "${backend_pid:-}" ]]; then
    log "Stopping backend process"
    kill "$backend_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "${frontend_pid:-}" ]]; then
    log "Stopping frontend process"
    kill "$frontend_pid" >/dev/null 2>&1 || true
  fi
  wait >/dev/null 2>&1 || true
  exit $exit_code
}
trap cleanup INT TERM

cd "$ROOT"

log "Stopping any existing project processes"
if command -v pkill >/dev/null 2>&1; then
  pkill -f "npm run dev" >/dev/null 2>&1 || true
  pkill -f "vite" >/dev/null 2>&1 || true
fi

if command -v lsof >/dev/null 2>&1; then
  for port in 3000 8080; do
    if lsof -ti :"$port" >/dev/null 2>&1; then
      log "Reclaiming port $port"
      lsof -ti :"$port" | xargs -r kill >/dev/null 2>&1 || true
    fi
  done
fi

if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    log "Docker engine is not running; attempting to start it"
    if command -v colima >/dev/null 2>&1; then
      log "Starting Colima (alternative Docker runtime)"
      colima start >/dev/null 2>&1 || true
    fi
    if command -v orbstack >/dev/null 2>&1; then
      log "Starting OrbStack runtime"
      orbstack start >/dev/null 2>&1 || true
    fi
    if command -v open >/dev/null 2>&1; then
      # Try to bring Docker Desktop UI to foreground
      open -g -a Docker >/dev/null 2>&1 || open -g -a "Docker Desktop" >/dev/null 2>&1 || true
      if command -v osascript >/dev/null 2>&1; then
        osascript -e 'tell application "Docker" to activate' >/dev/null 2>&1 || true
        osascript -e 'tell application "Docker Desktop" to activate' >/dev/null 2>&1 || true
      fi
    fi
    for i in {1..180}; do
      if docker info >/dev/null 2>&1; then
        log "Docker engine is up"
        break
      fi
      sleep 2
    done
    if ! docker info >/dev/null 2>&1; then
      echo "Error: Docker did not become available. Please open Docker Desktop manually, then re-run this script." >&2
      exit 1
    fi
  fi

  # Make sure the Docker Desktop app is visible (purely cosmetic, helps users notice it is launching)
  if command -v osascript >/dev/null 2>&1; then
    osascript -e 'tell application "Docker" to activate' >/dev/null 2>&1 || true
    osascript -e 'tell application "Docker Desktop" to activate' >/dev/null 2>&1 || true
  fi

  if docker compose ps --status running 2>/dev/null | grep -qi "$PROJECT_NAME-localstack"; then
    log "Ensuring previous LocalStack container is down"
    docker compose rm -sf localstack >/dev/null 2>&1 || true
  fi
fi

log "Ensuring LocalStack container is running"
docker compose up -d localstack >/dev/null

log "Waiting for LocalStack to report healthy"
localstack_ready=false
health_url="$LOCALSTACK_ENDPOINT/_localstack/health"
required_services=("s3" "dynamodb" "sqs" "cloudwatch")
for _ in {1..180}; do
  http_code=$(curl -sS -m 3 -o /dev/null -w "%{http_code}" "$health_url" || true)
  body=$(curl -sS -m 3 "$health_url" || true)
  log "Health check: $health_url -> $http_code (body preview: ${body:0:100})"
  if [ "$http_code" = "200" ]; then
    ok_count=0
    for svc in "${required_services[@]}"; do
      if echo "$body" | grep -Eq '"'"$svc"'"[[:space:]]*:[[:space:]]*"(running|available)"'; then
        ok_count=$((ok_count+1))
      else
        log "Service $svc not ready yet"
        break
      fi
    done
    if [ "$ok_count" -eq "${#required_services[@]}" ]; then
      localstack_ready=true
      break
    fi
  fi
  if (( ${SECONDS:-0} % 10 == 0 )); then
    log "LocalStack not ready yet (last http=$http_code)"
  fi
  sleep 1
done

if [[ "$localstack_ready" != true ]]; then
  echo "Error: timed out waiting for LocalStack at $LOCALSTACK_ENDPOINT" >&2
  exit 1
fi

log "Provisioning DynamoDB/SQS resources"
npm run infra:init || { echo "Error: infra:init failed" >&2; docker compose logs --no-color --tail=120 localstack || true; exit 1; }

log "Seeding LocalStack with starter data"
npx ts-node scripts/seed.ts || { echo "Error: seed failed" >&2; exit 1; }

log "Starting backend API (port 3000)"
(
  cd "$ROOT"
  npm run dev >/tmp/backend.log 2>&1
) &
backend_pid=$!

# Wait for backend to be ready
log "Waiting for backend to become available on http://localhost:3000/health"
backend_ready=false
for _ in {1..90}; do
  code=$(curl -sS -m 1 -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo 000)
  if [ "$code" = "200" ]; then
    backend_ready=true
    break
  fi
  sleep 1
done
if [[ "$backend_ready" != true ]]; then
  log "Backend did not respond within expected time; recent backend logs:"
  tail -n 120 /tmp/backend.log 2>/dev/null || true
fi

sleep 3

log "Starting frontend (Vite on port 5173)"
(
  cd "$ROOT/packages/frontend"
  VITE_OPERATIONS_API_URL="$VITE_OPERATIONS_API_URL" \
  VITE_OPERATIONS_USER_ID="$VITE_OPERATIONS_USER_ID" \
  VITE_OPERATIONS_DEBUG_USER="$VITE_OPERATIONS_DEBUG_USER" \
  npm run dev >/tmp/frontend.log 2>&1
) &
frontend_pid=$!

log "Waiting for frontend to become available"
frontend_ready=false
for _ in {1..90}; do
  if curl -s "http://localhost:5173" >/dev/null; then
    frontend_ready=true
    break
  fi
  sleep 1
done

if [[ "$frontend_ready" != true ]]; then
  log "Frontend did not respond on http://localhost:5173 within expected time"
fi

# Connectivity diagnostics matrix (FE <-> BE, proxy, direct)
log "Running connectivity diagnostics"
diag() {
  local name=$1; shift
  local url=$1; shift
  local extra=(-H "X-Debug-User: $VITE_OPERATIONS_DEBUG_USER")
  local code
  code=$(curl -sS -m 3 -o /dev/null -w "%{http_code}" "${url}" "${extra[@]}" || echo 000)
  printf '%s %s -> %s\n' "$LOG_PREFIX" "$name" "$code"
}

diag "BE /health" "http://localhost:3000/health"
diag "BE /openapi.json" "http://localhost:3000/openapi.json"
diag "FE / (vite)" "http://localhost:5173/"
diag "FE proxy /v1/openapi.json" "http://localhost:5173/v1/openapi.json"
diag "FE proxy /v1/operations/my-tasks" "http://localhost:5173/v1/operations/my-tasks"
if [[ -n "$VITE_OPERATIONS_API_URL" ]]; then
  diag "FE direct API /operations/my-tasks" "${VITE_OPERATIONS_API_URL%/}/operations/my-tasks"
fi

if command -v open >/dev/null 2>&1; then
  open "http://localhost:5173/operations-center" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:5173/operations-center" >/dev/null 2>&1 || true
fi

log "All services started. Press Ctrl+C to stop. Logs: /tmp/backend.log, /tmp/frontend.log, $LOG_FILE"
wait
