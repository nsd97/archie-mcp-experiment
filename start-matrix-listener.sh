#!/bin/bash
# Start the Matrix listener inside the agent-service container

echo "Starting Matrix listener inside Docker container..."

# Export the Matrix access token
export MATRIX_ACCESS_TOKEN=syt_YXJjaGll_gmulrSbJJjEIKXscSQCX_09kKXY

# Run the Matrix listener inside the agent-service container
# Check if the container is running
if ! docker-compose -f docker-compose.yml -f docker-compose.agents.yml ps agent-service | grep -q "Up"; then
  echo "Error: agent-service container is not running"
  exit 1
fi

# Run the Matrix listener inside the agent-service container
if ! docker-compose -f docker-compose.yml -f docker-compose.agents.yml exec -d agent-service python /app/scripts/matrix_listener.py; then
  echo "Error: Failed to start Matrix listener"
  exit 1
fi

echo "Matrix listener started. Check logs with:"
echo "docker-compose -f docker-compose.yml -f docker-compose.agents.yml logs -f agent-service | grep -i matrix"
