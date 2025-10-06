"""Main entry point for the ArchieOS agent service."""

import os
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import aioboto3  # pyright: ignore[reportMissingImports]
import httpx  # pyright: ignore[reportMissingImports]
from dotenv import load_dotenv  # pyright: ignore[reportMissingImports]
from fastapi import FastAPI, HTTPException  # pyright: ignore[reportMissingImports]
from fastapi.responses import JSONResponse  # pyright: ignore[reportMissingImports]
from prometheus_client import Counter, Histogram, generate_latest  # pyright: ignore[reportMissingImports]

# Add vendored SDK to path
sys.path.insert(0, "/app/external/openai-agents-python/src")

from agents import set_tracing_export_api_key

from .agents.archie import archie_agent
from .agents.lauren import lauren_agent
from .context import AgentContext

# Load environment variables
load_dotenv()

# Metrics
agent_invocations = Counter(
    "agent_invocations_total",
    "Total number of agent invocations",
    ["agent_name", "status"]
)

agent_duration = Histogram(
    "agent_duration_seconds",
    "Duration of agent invocations",
    ["agent_name"]
)

# Global resources
db_session = None
backend_client = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Manage application lifecycle."""
    global db_session, backend_client
    
    # Initialize resources
    print("Starting ArchieOS Agent Service...")
    
    # Set up SDK tracing
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        set_tracing_export_api_key(api_key)
        print("✓ OpenAI tracing enabled")
    else:
        print("⚠ OpenAI API key not found, tracing disabled")
    
    # Initialize DynamoDB session
    session = aioboto3.Session()
    endpoint_url = os.getenv("DYNAMODB_ENDPOINT")
    if endpoint_url:
        # Local development with LocalStack
        db_session = session.resource(
            "dynamodb",
            endpoint_url=endpoint_url,
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
        )
    else:
        # Production AWS
        db_session = session.resource(
            "dynamodb",
            region_name=os.getenv("AWS_REGION", "us-east-1")
        )
    
    # Initialize backend HTTP client
    backend_url = os.getenv("BACKEND_URL", "http://localhost:3000")
    backend_client = httpx.AsyncClient(
        base_url=backend_url,
        timeout=30.0,
        headers={
            "User-Agent": "ArchieOS-Agent-Service/1.0",
            "X-Service": "agents"
        }
    )
    
    print(f"✓ Connected to backend at {backend_url}")
    print(f"✓ DynamoDB endpoint: {endpoint_url or 'AWS'}")
    
    # Verify agents are loaded
    print(f"✓ Archie agent loaded: {archie_agent.name}")
    print(f"✓ Lauren agent loaded: {lauren_agent.name}")
    
    yield
    
    # Cleanup
    await backend_client.aclose()
    await db_session.__aexit__(None, None, None)
    print("Agent service shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="ArchieOS Agent Service",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/health")
async def health_check():
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "service": "archieos-agents",
        "agents": {
            "archie": "ready",
            "lauren": "ready"
        }
    }


@app.get("/health/detailed")
async def detailed_health():
    """Detailed health check with dependency status."""
    health_status = {
        "status": "healthy",
        "service": "archieos-agents",
        "dependencies": {}
    }
    
    # Check backend connectivity
    try:
        response = await backend_client.get("/health")
        health_status["dependencies"]["backend"] = {
            "status": "healthy" if response.status_code == 200 else "unhealthy",
            "url": str(backend_client.base_url)
        }
    except Exception as e:
        health_status["dependencies"]["backend"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "degraded"
    
    # Check DynamoDB connectivity
    try:
        async with db_session as db:
            # Try to describe a table
            tables = await db.tables.all()
            health_status["dependencies"]["dynamodb"] = {
                "status": "healthy",
                "table_count": len(list(tables))
            }
    except Exception as e:
        health_status["dependencies"]["dynamodb"] = {
            "status": "unhealthy", 
            "error": str(e)
        }
        health_status["status"] = "degraded"
    
    # Check OpenAI API key
    health_status["dependencies"]["openai"] = {
        "status": "configured" if os.getenv("OPENAI_API_KEY") else "not_configured",
        "model": os.getenv("OPENAI_MODEL", "gpt-5")
    }
    
    return health_status


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return generate_latest()


@app.get("/agents")
async def list_agents():
    """List available agents and their capabilities."""
    return {
        "agents": [
            {
                "name": "Archie",
                "role": "user_facing_router",
                "capabilities": [
                    "get_task_status",
                    "enqueue_for_lauren",
                    "Matrix MCP tools (send-message, send-direct-message)"
                ],
                "description": "User-facing agent that answers questions and routes task requests"
            },
            {
                "name": "Lauren",
                "role": "task_classifier",
                "capabilities": [
                    "classify_and_create_task",
                    "create_task",
                    "notify_archie_signal"
                ],
                "description": "Task classification agent that creates OPEN/UNCLAIMED tasks for human admins"
            }
        ]
    }


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle uncaught exceptions."""
    import traceback
    
    error_id = os.urandom(8).hex()
    print(f"Error {error_id}: {exc}")
    print(traceback.format_exc())
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "error_id": error_id,
            "message": str(exc) if os.getenv("ENV") == "local" else "An error occurred"
        }
    )


# For local testing
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
