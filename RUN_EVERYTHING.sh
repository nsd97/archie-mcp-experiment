#!/bin/bash
# Complete startup script for ArchieOS Two-Agent System
set -e

# Detect project root (assumes script is at project root)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Starting ArchieOS Two-Agent System..."
echo "===================================================================="

# Step 1: Start LocalStack
echo ""
echo "1️⃣  Starting LocalStack (AWS simulator)..."
# Check dependencies
command -v docker-compose >/dev/null 2>&1 || { echo "❌ docker-compose is required but not installed."; exit 1; }
command -v curl >/dev/null 2>&1   || { echo "❌ curl is required but not installed."; exit 1; }

echo ""
echo "1️⃣  Starting LocalStack (AWS simulator)..."
docker-compose -f docker-compose.yml up -d localstack

echo "   Waiting for LocalStack to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0
until curl -s http://localhost:4566/_localstack/health | grep -q "running"; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "   ❌ LocalStack failed to become healthy after ${MAX_ATTEMPTS}s"
    exit 1
  fi
  sleep 1
done
echo "   ✅ LocalStack is healthy"

# Step 2: Initialize backend infrastructure  
echo ""
echo "2️⃣  Initializing backend infrastructure (DynamoDB, SQS, S3)..."
npm run infra:init

# Step 3: Seed sample data
echo ""
echo "3️⃣  Seeding sample data..."
npm run seed

# Step 4: Initialize agent infrastructure
echo ""
echo "4️⃣  Initializing agent infrastructure (Matrix queues + tables)..."
echo "   Note: This requires Python dependencies in Docker..."
echo "   Creating queues via AWS CLI instead..."

# Create agent queues using AWS CLI
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name prompt-queue 2>/dev/null || echo "   prompt-queue exists"
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name prompt-queue-dlq 2>/dev/null || echo "   prompt-queue-dlq exists"
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name lauren-work-queue 2>/dev/null || echo "   lauren-work-queue exists"
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name lauren-work-queue-dlq 2>/dev/null || echo "   lauren-work-queue-dlq exists"
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name archie-signal-queue 2>/dev/null || echo "   archie-signal-queue exists"
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name archie-signal-queue-dlq 2>/dev/null || echo "   archie-signal-queue-dlq exists"

echo "   ✅ Agent queues created"

# Create Matrix tables
aws --endpoint-url=http://localhost:4566 dynamodb create-table \
  --table-name matrix_events \
  --attribute-definitions AttributeName=room_id,AttributeType=S AttributeName=event_id,AttributeType=S \
  --key-schema AttributeName=room_id,KeyType=HASH AttributeName=event_id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST 2>/dev/null || echo "   matrix_events exists"

aws --endpoint-url=http://localhost:4566 dynamodb create-table \
  --table-name processed_events \
  --attribute-definitions AttributeName=event_id,AttributeType=S \
  --key-schema AttributeName=event_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST 2>/dev/null || echo "   processed_events exists"

aws --endpoint-url=http://localhost:4566 dynamodb create-table \
  --table-name agent_message_correlation \
  --attribute-definitions AttributeName=correlation_id,AttributeType=S \
  --key-schema AttributeName=correlation_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST 2>/dev/null || echo "   agent_message_correlation exists"

echo "   ✅ Matrix tables created"

# Step 5: Verify infrastructure
echo ""
echo "5️⃣  Verifying infrastructure..."
npm run infra:verify

# Step 6: Show queue URLs
echo ""
echo "6️⃣  Queue URLs:"
echo "   Prompt Queue: http://localhost:4566/000000000000/prompt-queue"
echo "   Lauren Work Queue: http://localhost:4566/000000000000/lauren-work-queue"
echo "   Archie Signal Queue: http://localhost:4566/000000000000/archie-signal-queue"

echo ""
echo "===================================================================="
echo "✅ Infrastructure Ready!"
echo "===================================================================="
echo ""
echo "Next steps:"
echo ""
echo "A. To run backend tests:"
echo "   npm test"
echo ""
echo "B. To start all agent services:"
echo "   docker-compose -f docker-compose.yml -f docker-compose.agents.yml up"
echo ""
echo "C. To connect Element desktop:"
echo "   1. Download from https://element.io/"
echo "   2. In Element: Sign In → Edit homeserver → http://localhost:8008"
echo "   3. Create account (any username/password)"
echo "   4. Create room and invite @archie:localhost"
echo ""
echo "D. To register Archie on Matrix:"
echo "   curl -X POST http://localhost:8008/_matrix/client/r0/register \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"username\":\"archie\",\"password\":\"archie123\",\"auth\":{\"type\":\"m.login.dummy\"}}'"
echo ""
echo "See QUICKSTART.md for complete instructions!"
echo ""

