#!/bin/bash
# Start the Matrix listener inside the agent-service container

echo "Starting Matrix listener inside Docker container..."

# Export the Matrix access token
export MATRIX_ACCESS_TOKEN=syt_YXJjaGll_gmulrSbJJjEIKXscSQCX_09kKXY

# Run the Matrix listener inside the agent-service container
docker-compose -f docker-compose.yml -f docker-compose.agents.yml exec -d agent-service python /app/scripts/matrix_listener.py

echo "Matrix listener started. Check logs with:"
echo "docker-compose -f docker-compose.yml -f docker-compose.agents.yml logs -f agent-service | grep -i matrix"
