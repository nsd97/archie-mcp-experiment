"""Tests for Lauren's task tools (create only, no CRUD).

Note: Lauren only creates tasks. Claiming, completing, updating, and canceling
are done by human admins via the frontend UI.
"""

import sys
import os
import json
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, "/app/external/openai-agents-python/src")

import pytest
from httpx import Response
from agents import RunContextWrapper

from src.context import AgentContext, Task
from src.tools.tasks import create_task


@pytest.fixture
def mock_context():
    """Create a mock agent context."""
    backend_client = AsyncMock()
    db_session = Mock()
    
    context = AgentContext(
        user_id="test-user",
        room_id="!test:matrix.org",
        thread_id=None,
        correlation_id="test-123",
        db_session=db_session,
        backend_client=backend_client
    )
    
    return RunContextWrapper(context=context)


@pytest.mark.asyncio
async def test_create_task(mock_context):
    """Test creating a new task (always OPEN/UNCLAIMED)."""
    # Mock backend response
    mock_response = Mock(spec=Response)
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "task": {
            "task_id": "task-new-123",
            "listing_id": "listing-123",
            "task_def_id": "SALE::BOOK_PHOTOS@v1",
            "name": "Book Photos",
            "description": "Book professional photos",
            "status": "OPEN",
            "claim_status": "UNCLAIMED",
            "assigned_to": None,
            "priority": 7,
            "created_at": "2025-01-01T12:00:00Z",
            "updated_at": "2025-01-01T12:00:00Z",
            "inputs": {
                "photographer_notes": "Exterior and interior shots"
            }
        }
    }
    mock_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.post.return_value = mock_response
    
    # Call the tool
    result = await create_task(
        mock_context,
        listing_id="listing-123",
        task_def_id="SALE::BOOK_PHOTOS@v1",
        inputs={
            "photographer_notes": "Exterior and interior shots"
        },
        name="Book Photos",
        description="Book professional photos",
        priority=7
    )
    
    # Verify result
    assert isinstance(result, Task)
    assert result.task_id == "task-new-123"
    assert result.status == "OPEN"
    assert result.claim_status == "UNCLAIMED"
    assert result.assigned_to is None
    
    # Verify backend was called correctly
    mock_context.context.backend_client.post.assert_called_once_with(
        "/v1/operations/tasks",
        json={
            "listing_id": "listing-123",
            "task_def_id": "SALE::BOOK_PHOTOS@v1",
            "name": "Book Photos", 
            "description": "Book professional photos",
            "priority": 7,
            "inputs": {
                "photographer_notes": "Exterior and interior shots"
            },
            "status": "OPEN",
            "claim_status": "UNCLAIMED",
            "assigned_to": None,
            "created_by": "agent:lauren",
            "agent_metadata": {
                "room_id": "!test:matrix.org",
                "thread_id": None,
                "correlation_id": "test-123"
            }
        }
    )


@pytest.mark.asyncio
async def test_create_task_backend_error(mock_context):
    """Test handling backend errors during task creation."""
    # Mock backend error response
    mock_response = Mock(spec=Response)
    mock_response.status_code = 400
    mock_response.json.return_value = {
        "error": "Invalid task definition"
    }
    mock_response.raise_for_status.side_effect = Exception("HTTP 400")
    
    mock_context.context.backend_client.post.return_value = mock_response
    
    # Call should raise exception
    with pytest.raises(Exception) as exc_info:
        await create_task(
            mock_context,
            listing_id="listing-123",
            task_def_id="INVALID::TASK@v1",
            inputs={}
        )
    
    assert "HTTP 400" in str(exc_info.value)


@pytest.mark.asyncio
async def test_create_task_with_due_date(mock_context):
    """Test creating a task with a due date."""
    # Mock backend response
    mock_response = Mock(spec=Response)
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "task": {
            "task_id": "task-due-456",
            "status": "OPEN",
            "claim_status": "UNCLAIMED",
            "assigned_to": None,
            "due_date": "2025-01-15T17:00:00Z",
            "created_at": "2025-01-01T12:00:00Z",
            "updated_at": "2025-01-01T12:00:00Z"
        }
    }
    mock_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.post.return_value = mock_response
    
    # Call with due_date
    result = await create_task(
        mock_context,
        listing_id="listing-123",
        task_def_id="SALE::POST_TO_MLS@v1",
        inputs={"listing_notes": "Ready to post"},
        due_date="2025-01-15T17:00:00Z"
    )
    
    # Verify due date was set
    assert result.due_date == "2025-01-15T17:00:00Z"
    
    # Verify backend request included due_date
    call_args = mock_context.context.backend_client.post.call_args
    assert call_args[1]["json"]["due_date"] == "2025-01-15T17:00:00Z"


# Note: Tests for claim_task, unclaim_task, complete_task, update_task, and
# cancel_task have been removed as Lauren no longer performs these operations.
# These are now done by human admins via the frontend UI.