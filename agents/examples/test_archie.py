"""Example of running Archie agent with the status tool.

This demonstrates SDK usage patterns from external/openai-agents-python/docs/running_agents.md
"""

import asyncio
import os
import sys
from unittest.mock import AsyncMock, Mock

# Setup paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, "/app/external/openai-agents-python/src")

from agents import Runner, RunContextWrapper
from agents.archie import archie_agent
from context import AgentContext, TaskStatusResponse
from httpx import Response


async def main():
    """Demo running Archie with mocked backend responses."""
    
    # Create a mock context for testing
    backend_client = AsyncMock()
    
    # Mock a response for task status
    mock_response = Mock(spec=Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "listings": [
            {
                "listingId": "listing-123",
                "address": "123 Main St, Toronto",
                "status": "IN_PROGRESS",
                "tasks": [
                    {
                        "id": "task-1",
                        "name": "Book Photos",
                        "status": "OPEN",
                        "priority": 8,
                        "dueDate": "2025-10-08T00:00:00Z"
                    },
                    {
                        "id": "task-2",
                        "name": "Install Sign",
                        "status": "CLAIMED",
                        "priority": 5,
                        "assignedTo": {"userId": "agent:emma"}
                    }
                ]
            },
            {
                "listingId": "listing-456",
                "address": "456 Oak Ave, Toronto",
                "status": "NEW",
                "tasks": [
                    {
                        "id": "task-3",
                        "name": "Initial Assessment",
                        "status": "DONE",
                        "priority": 3
                    }
                ]
            }
        ]
    }
    mock_response.raise_for_status = Mock()
    backend_client.get.return_value = mock_response
    
    # Create agent context
    context = AgentContext(
        user_id="demo-user",
        room_id="!demo:matrix.org",
        thread_id=None,
        correlation_id="demo-001",
        db_session=Mock(),  # Not used in this example
        backend_client=backend_client
    )
    
    print("🤖 Running Archie Agent Demo")
    print("=" * 50)
    
    # Example 1: Ask about overall task status
    print("\n📋 Example 1: Overall task status")
    print("User: How are my tasks going?")
    
    result = await Runner.run(
        archie_agent,
        "How are my tasks going?",
        context=context
    )
    
    print(f"Archie: {result.final_output}")
    
    # Example 2: Ask about a specific listing
    print("\n\n📋 Example 2: Specific listing status")
    print("User: What's the status of tasks for 123 Main St?")
    
    # Update mock for listing-specific query
    mock_response.json.return_value = {
        "tasks": [
            {
                "id": "task-1",
                "name": "Book Photos",
                "status": "OPEN",
                "priority": 8,
                "dueDate": "2025-10-08T00:00:00Z"
            },
            {
                "id": "task-2",
                "name": "Install Sign", 
                "status": "CLAIMED",
                "priority": 5,
                "assignedTo": {"userId": "agent:emma"}
            }
        ]
    }
    
    result = await Runner.run(
        archie_agent,
        "What's the status of tasks for listing listing-123?",
        context=context
    )
    
    print(f"Archie: {result.final_output}")
    
    # Example 3: Filter by status
    print("\n\n📋 Example 3: Filter by status")
    print("User: Show me all open tasks")
    
    result = await Runner.run(
        archie_agent,
        "Show me all open tasks",
        context=context
    )
    
    print(f"Archie: {result.final_output}")
    
    # Show what would happen with task creation request (no Lauren yet)
    print("\n\n📋 Example 4: Task creation request (Lauren not yet available)")
    print("User: Please create a task to book photos for 789 Elm St")
    
    result = await Runner.run(
        archie_agent,
        "Please create a task to book photos for 789 Elm St",
        context=context
    )
    
    print(f"Archie: {result.final_output}")
    
    print("\n" + "=" * 50)
    print("✅ Demo complete!")
    print("\nNote: In production, responses would be sent to Matrix via")
    print("the send_matrix_message tool (coming in P3)")


if __name__ == "__main__":
    # Note: This requires OPENAI_API_KEY to be set
    if not os.getenv("OPENAI_API_KEY"):
        print("⚠️  Warning: OPENAI_API_KEY not set. Agent will not run.")
        print("Set it in your environment or .env file")
    else:
        asyncio.run(main())
