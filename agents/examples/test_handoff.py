"""Example demonstrating handoff from Archie to Lauren.

This shows SDK handoff patterns from external/openai-agents-python/docs/handoffs.md
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
from agents.lauren import lauren_agent
from context import AgentContext
from httpx import Response


async def main():
    """Demo handoff from Archie to Lauren for task creation."""
    
    # Create mock backend
    backend_client = AsyncMock()
    
    # Mock responses for Archie's status check
    status_response = Mock(spec=Response)
    status_response.status_code = 200
    status_response.json.return_value = {
        "listings": [{
            "listingId": "listing-789",
            "address": "789 Elm St, Toronto",
            "tasks": []
        }]
    }
    status_response.raise_for_status = Mock()
    
    # Mock response for Lauren's task creation
    create_response = Mock(spec=Response)
    create_response.status_code = 201
    create_response.json.return_value = {
        "task": {
            "task_id": "task-new-456",
            "listing_id": "listing-789",
            "task_def_id": "SALE::BOOK_PHOTOS@v1",
            "name": "Book Photos",
            "status": "NEW",
            "priority": 7,
            "due_date": "2025-10-10T00:00:00Z",
            "inputs": {
                "photographer_notes": "Focus on curb appeal",
                "preferred_time": "Afternoon"
            },
            "created_at": "2025-10-05T17:00:00Z",
            "updated_at": "2025-10-05T17:00:00Z"
        }
    }
    create_response.raise_for_status = Mock()
    
    # Set up mock responses
    backend_client.get.return_value = status_response
    backend_client.post.return_value = create_response
    
    # Create context
    context = AgentContext(
        user_id="demo-user",
        room_id="!demo:matrix.org",
        thread_id="thread-123",
        correlation_id="handoff-demo-001",
        db_session=Mock(),
        backend_client=backend_client
    )
    
    print("🤖 Archie → Lauren Handoff Demo")
    print("=" * 50)
    
    # Example 1: Simple task creation request
    print("\n📋 Example 1: Task creation via handoff")
    print("User: Please create a photo booking task for listing-789, priority 7, due next week")
    
    result = await Runner.run(
        archie_agent,
        "Please create a photo booking task for listing-789, priority 7, due October 10th. Tell the photographer to focus on curb appeal.",
        context=context
    )
    
    print(f"\nArchie/Lauren: {result.final_output}")
    
    # Show what happened behind the scenes
    print("\n🔧 Behind the scenes:")
    print("1. Archie recognized this as a task creation request")
    print("2. Archie handed off to Lauren with the request details")  
    print("3. Lauren created the task using create_task tool")
    print("4. Result returned through the handoff chain")
    
    # Example 2: Multiple operations
    print("\n\n📋 Example 2: Multiple task operations")
    print("User: Create a sign installation task for listing-789 and claim it for agent:noah")
    
    # Mock claim response
    claim_response = Mock(spec=Response)
    claim_response.status_code = 200
    claim_response.json.return_value = {
        "task": {
            "task_id": "task-new-789",
            "status": "CLAIMED",
            "assigned_to": {"userId": "agent:noah"},
            "claimed_at": "2025-10-05T17:05:00Z",
            "created_at": "2025-10-05T17:00:00Z",
            "updated_at": "2025-10-05T17:05:00Z"
        }
    }
    claim_response.raise_for_status = Mock()
    
    # Mock get response for claim validation
    get_response = Mock(spec=Response)
    get_response.status_code = 200
    get_response.json.return_value = {
        "task": {
            "task_id": "task-new-789",
            "status": "NEW",
            "assigned_to": None
        }
    }
    get_response.raise_for_status = Mock()
    
    # Update mocks for this scenario
    backend_client.post.side_effect = [
        create_response,  # First call creates task
        claim_response    # Second call claims it
    ]
    backend_client.get.side_effect = [
        status_response,  # Status check by Archie
        get_response      # Task check before claim
    ]
    
    result = await Runner.run(
        archie_agent,
        "Create a sign installation task for listing-789 and claim it for agent:noah",
        context=context
    )
    
    print(f"\nArchie/Lauren: {result.final_output}")
    
    # Example 3: Status check (no handoff needed)
    print("\n\n📋 Example 3: Status check (no handoff)")
    print("User: How many tasks does listing-789 have now?")
    
    # Reset mock for status query
    backend_client.get.side_effect = None
    backend_client.get.return_value = status_response
    
    result = await Runner.run(
        archie_agent,
        "How many tasks does listing-789 have now?",
        context=context
    )
    
    print(f"\nArchie: {result.final_output}")
    print("(Note: This was handled by Archie alone, no handoff needed)")
    
    print("\n" + "=" * 50)
    print("✅ Handoff demo complete!")
    print("\nKey observations:")
    print("- Archie routes task mutations to Lauren automatically")
    print("- Lauren has all the tools needed for task CRUD operations")
    print("- The handoff is seamless from the user's perspective")
    print("- Status queries stay with Archie (no handoff needed)")


if __name__ == "__main__":
    if not os.getenv("OPENAI_API_KEY"):
        print("⚠️  Warning: OPENAI_API_KEY not set. Agents will not run.")
        print("Set it in your environment or .env file")
    else:
        asyncio.run(main())
