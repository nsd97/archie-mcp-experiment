"""Example demonstrating queue-based Archie → Lauren → Archie workflow.

This shows SDK async patterns from external/openai-agents-python/docs/multi_agent.md
Using queues for agent-to-agent communication instead of direct handoffs.
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
    """Demo the queue-based workflow between Archie and Lauren."""
    
    print("🤖 Archie → Lauren Queue-Based Workflow Demo")
    print("=" * 60)
    print()
    
    # Create mock backends
    archie_backend = AsyncMock()
    lauren_backend = AsyncMock()
    
    # Mock Archie's status query
    status_response = Mock(spec=Response)
    status_response.status_code = 200
    status_response.json.return_value = {
        "listings": [{
            "listingId": "listing-123",
            "address": "123 Main St, Toronto",
            "tasks": [
                {
                    "id": "task-existing-1",
                    "name": "Initial Assessment",
                    "status": "DONE",
                    "priority": 3
                }
            ]
        }]
    }
    status_response.raise_for_status = Mock()
    archie_backend.get.return_value = status_response
    
    # Mock Lauren's task creation
    create_response = Mock(spec=Response)
    create_response.status_code = 201
    create_response.json.return_value = {
        "task": {
            "task_id": "task-new-456",
            "listing_id": "listing-123",
            "task_def_id": "SALE::BOOK_PHOTOS@v1",
            "name": "Book Photos",
            "status": "OPEN",
            "claim_status": "UNCLAIMED",
            "assigned_to": None,
            "priority": 7,
            "inputs": {
                "photographer_notes": "Book photos for 123 Main St next week",
                "preferred_time": "As soon as possible"
            },
            "created_at": "2025-10-05T17:00:00Z",
            "updated_at": "2025-10-05T17:00:00Z"
        }
    }
    create_response.raise_for_status = Mock()
    lauren_backend.post.return_value = create_response
    
    print("📋 Scenario: User requests a photo booking task\n")
    
    # Step 1: User message arrives at Archie
    print("Step 1: User sends message in Element")
    print('  Message: "Book photos for 123 Main St next week"')
    print()
    
    # Create Archie context
    archie_context = AgentContext(
        user_id="@user:matrix.org",
        room_id="!demo:matrix.org",
        thread_id="thread-abc",
        correlation_id="msg-001",
        db_session=Mock(),
        backend_client=archie_backend
    )
    
    # Mock enqueue_for_lauren to simulate queueing (in reality it would enqueue to SQS)
    with patch('tools.queues.enqueue_for_lauren') as mock_enqueue:
        mock_enqueue.return_value = {"queued": True, "correlation_id": "msg-001"}
        
        # Mock send_matrix_message 
        with patch('tools.matrix.send_matrix_message') as mock_send:
            mock_send.return_value = {
                "event_id": "event-response-1",
                "timestamp": "2025-10-05T17:00:00Z"
            }
            
            print("Step 2: Archie processes message")
            result = await Runner.run(
                archie_agent,
                "Book photos for 123 Main St next week",
                context=archie_context
            )
            
            print(f"  Archie recognized admin task intent")
            print(f"  Archie: {result.final_output}")
            print()
            
    # Step 3: Simulate Lauren processing from queue
    print("Step 3: Lauren processes from Lauren Work Queue")
    
    lauren_context = AgentContext(
        user_id="@user:matrix.org",
        room_id="!demo:matrix.org",
        thread_id="thread-abc",
        correlation_id="msg-001",
        db_session=Mock(),
        backend_client=lauren_backend
    )
    
    # Mock notify_archie_signal
    with patch('tools.tasks.notify_archie_signal') as mock_notify:
        mock_notify.return_value = {"ok": True}
        
        lauren_input = """New admin task request:

User said: "Book photos for 123 Main St next week"

Context:
- Listing hint: 123 Main St
- Priority hint: 7
- Due hint: next week
- Admin channel: ops

Classify this request and create an OPEN/UNCLAIMED task for the admin team."""
        
        print("  Lauren running classification...")
        result = await Runner.run(
            lauren_agent,
            lauren_input,
            context=lauren_context
        )
        
        print(f"  Lauren classified and created task")
        print(f"  Lauren: {result.final_output}")
        print()
        
    # Step 4: Simulate Archie receiving signal
    print("Step 4: Archie receives completion signal from Archie Signal Queue")
    
    # Mock send_matrix_message again
    with patch('tools.matrix.send_matrix_message') as mock_send:
        mock_send.return_value = {
            "event_id": "event-response-2",
            "timestamp": "2025-10-05T17:00:05Z"
        }
        
        archie_signal_input = """Lauren has created a task:
- Task ID: task-new-456
- Task Name: Book Photos
- Listing: listing-123
- Status: OPEN (waiting for admin to claim)

Inform the user that their request has been processed and the task is now
in the admin queue. Be friendly and concise."""
        
        print("  Archie processing signal...")
        result = await Runner.run(
            archie_agent,
            archie_signal_input,
            context=archie_context
        )
        
        print(f"  Archie informed user in Matrix")
        print(f"  Archie: {result.final_output}")
        print()
        
    print("=" * 60)
    print("✅ Queue-based workflow complete!")
    print()
    print("Key observations:")
    print("- Archie enqueues admin tasks (non-blocking)")
    print("- Lauren processes from queue independently")
    print("- Lauren creates OPEN/UNCLAIMED tasks (humans claim via UI)")
    print("- Lauren signals Archie when done")
    print("- Archie informs user in Matrix")
    print("- No direct handoff needed - fully async via queues")


if __name__ == "__main__":
    if not os.getenv("OPENAI_API_KEY"):
        print("⚠️  Warning: OPENAI_API_KEY not set. Using mocked responses only.")
        print("For real agent execution, set OPENAI_API_KEY in your environment.")
        print()
        
    asyncio.run(main())
