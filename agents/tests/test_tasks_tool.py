"""Tests for Lauren's task tools (create only, no CRUD).

Note: Lauren only creates tasks. Claiming, completing, updating, and canceling
are done by human admins via the frontend UI.
"""

import sys
import os
import json
from unittest.mock import AsyncMock, Mock, patch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
VENDORED_SDK = os.path.join(PROJECT_ROOT, "external", "openai-agents-python", "src")
if VENDORED_SDK not in sys.path:
    sys.path.insert(0, VENDORED_SDK)

import pytest
from httpx import Response
from agents import RunContextWrapper

from src.context import AgentContext, Task
from src.tools.tasks import _create_task_impl


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
async def test_create_task(mock_context, monkeypatch):
    """Test creating a new task (always OPEN/UNCLAIMED)."""
    # Set required environment variable
    monkeypatch.setenv("ARCHIE_SIGNAL_QUEUE_URL", "http://test-queue-url")
    
    # Mock SQS client
    mock_sqs_client = AsyncMock()
    mock_sqs_client.send_message = AsyncMock(return_value={"MessageId": "test-msg-id"})
    
    with patch('src.tools.queues._create_sqs_client', new=AsyncMock(return_value=mock_sqs_client)):
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
        result = await _create_task_impl(
        mock_context,
        listing_id="listing-123",
        task_def_id="SALE::BOOK_PHOTOS@v1",
        inputs={
            "photographer_notes": "Exterior and interior shots",
            "preferred_time": "Morning"
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
                    "photographer_notes": "Exterior and interior shots",
                    "preferred_time": "Morning"
                },
                "status": "OPEN",
                "claim_status": "UNCLAIMED",
                "assigned_to": None,
                "created_by": "agent:lauren",
                "is_stray": False,
                "metadata": {
                    "provenance": {
                        "source": "matrix",
                        "room_id": "!test:matrix.org",
                        "correlation_id": "test-123"
                    },
                    "agent_metadata": {
                        "created_by_agent": "Lauren"
                    }
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
    
    with patch('src.tools.tasks.notify_archie_signal_impl', new=AsyncMock()):
        # Call should raise exception
        with pytest.raises(Exception) as exc_info:
            await _create_task_impl(
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
            "name": "Post to MLS",
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
    
    with patch('src.tools.tasks.notify_archie_signal_impl', new=AsyncMock()):
        # Create task directly
        result = await _create_task_impl(
            mock_context,
            listing_id="listing-123",
            task_def_id="SALE::POST_TO_MLS@v1",
            inputs={"listing_notes": "Test listing"},
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