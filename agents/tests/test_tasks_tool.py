"""Tests for Lauren's task CRUD tools."""

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
from tools.tasks import (
    create_task, claim_task, unclaim_task, complete_task,
    update_task, cancel_task, _get_task_name_from_catalog
)


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
    """Test creating a new task."""
    # Mock backend response
    mock_response = Mock(spec=Response)
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "task": {
            "task_id": "task-new-123",
            "listing_id": "listing-123",
            "task_def_id": "SALE::BOOK_PHOTOS@v1",
            "name": "Book Photos",
            "status": "NEW",
            "priority": 8,
            "inputs": {
                "photographer_notes": "Exterior shots important",
                "preferred_time": "Morning"
            },
            "created_at": "2025-10-05T14:00:00Z",
            "updated_at": "2025-10-05T14:00:00Z"
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
            "photographer_notes": "Exterior shots important",
            "preferred_time": "Morning"
        },
        priority=8
    )
    
    # Verify the result
    assert isinstance(result, Task)
    assert result.task_id == "task-new-123"
    assert result.listing_id == "listing-123"
    assert result.priority == 8
    assert result.status == "NEW"
    
    # Verify the backend was called
    mock_context.context.backend_client.post.assert_called_once()
    call_args = mock_context.context.backend_client.post.call_args
    assert call_args[0][0] == "/v1/operations/tasks"
    assert call_args[1]["json"]["listing_id"] == "listing-123"


@pytest.mark.asyncio
async def test_claim_task(mock_context):
    """Test claiming a task."""
    # Mock get response
    get_response = Mock(spec=Response)
    get_response.status_code = 200
    get_response.json.return_value = {
        "task": {
            "task_id": "task-123",
            "status": "OPEN",
            "assigned_to": None
        }
    }
    get_response.raise_for_status = Mock()
    
    # Mock claim response
    claim_response = Mock(spec=Response)
    claim_response.status_code = 200
    claim_response.json.return_value = {
        "task": {
            "task_id": "task-123",
            "status": "CLAIMED",
            "assigned_to": {"userId": "agent:emma"},
            "claimed_at": "2025-10-05T14:00:00Z",
            "created_at": "2025-10-05T12:00:00Z",
            "updated_at": "2025-10-05T14:00:00Z"
        }
    }
    claim_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.get.return_value = get_response
    mock_context.context.backend_client.post.return_value = claim_response
    
    # Call the tool
    result = await claim_task(
        mock_context,
        task_id="task-123",
        user_id="agent:emma",
        notes="Taking this one"
    )
    
    # Verify the result
    assert isinstance(result, Task)
    assert result.task_id == "task-123"
    assert result.status == "CLAIMED"
    assert result.assigned_to["userId"] == "agent:emma"


@pytest.mark.asyncio
async def test_claim_task_already_claimed(mock_context):
    """Test error when claiming an already claimed task."""
    # Mock response showing task is already claimed
    get_response = Mock(spec=Response)
    get_response.status_code = 200
    get_response.json.return_value = {
        "task": {
            "task_id": "task-123",
            "status": "CLAIMED",
            "assigned_to": {"userId": "agent:other"}
        }
    }
    get_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.get.return_value = get_response
    
    # Should raise an error
    with pytest.raises(Exception) as exc_info:
        await claim_task(
            mock_context,
            task_id="task-123",
            user_id="agent:emma"
        )
    
    assert "already claimed" in str(exc_info.value)


@pytest.mark.asyncio
async def test_complete_task(mock_context):
    """Test completing a task with outputs."""
    # Mock get response
    get_response = Mock(spec=Response)
    get_response.status_code = 200
    get_response.json.return_value = {
        "task": {
            "task_id": "task-123",
            "status": "CLAIMED",
            "task_def_id": "SALE::BOOK_PHOTOS@v1",
            "assigned_to": {"userId": "agent:emma"}
        }
    }
    get_response.raise_for_status = Mock()
    
    # Mock complete response
    complete_response = Mock(spec=Response)
    complete_response.status_code = 200
    complete_response.json.return_value = {
        "task": {
            "task_id": "task-123",
            "status": "DONE",
            "completed_at": "2025-10-05T15:00:00Z",
            "completed_by": "agent:emma",
            "outputs": {"photos_url": "s3://bucket/photos/"},
            "created_at": "2025-10-05T12:00:00Z",
            "updated_at": "2025-10-05T15:00:00Z"
        }
    }
    complete_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.get.return_value = get_response
    mock_context.context.backend_client.post.return_value = complete_response
    
    # Call the tool
    result = await complete_task(
        mock_context,
        task_id="task-123",
        outputs={"photos_url": "s3://bucket/photos/"},
        notes="Photos uploaded successfully"
    )
    
    # Verify the result
    assert isinstance(result, Task)
    assert result.task_id == "task-123"
    assert result.status == "DONE"
    assert result.outputs["photos_url"] == "s3://bucket/photos/"


@pytest.mark.asyncio
async def test_cancel_task(mock_context):
    """Test cancelling a task."""
    # Mock response
    mock_response = Mock(spec=Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "task": {
            "task_id": "task-123",
            "status": "CANCELED",
            "cancel_reason": "Property withdrawn from market",
            "canceled_by": "agent:lauren",
            "created_at": "2025-10-05T12:00:00Z",
            "updated_at": "2025-10-05T16:00:00Z"
        }
    }
    mock_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.patch.return_value = mock_response
    
    # Call the tool
    result = await cancel_task(
        mock_context,
        task_id="task-123",
        reason="Property withdrawn from market"
    )
    
    # Verify the result
    assert isinstance(result, Task)
    assert result.task_id == "task-123"
    assert result.status == "CANCELED"


def test_get_task_name_from_catalog():
    """Test extracting task name from catalog ID."""
    assert _get_task_name_from_catalog("SALE::BOOK_PHOTOS@v1") == "Book Photos"
    assert _get_task_name_from_catalog("LEASE::TENANT_SCREENING@v2") == "Tenant Screening"
    assert _get_task_name_from_catalog("INVALID_FORMAT") == "Task"
    assert _get_task_name_from_catalog("") == "Task"
