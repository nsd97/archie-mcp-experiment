"""Tests for the get_task_status tool."""

import sys
import os
import json
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, "/app/external/openai-agents-python/src")

import pytest
from httpx import Response
from agents import RunContextWrapper

from src.context import AgentContext, TaskStatusResponse
from tools.status import get_task_status, _generate_listing_summary, _generate_queue_summary


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
async def test_get_task_status_for_listing(mock_context):
    """Test fetching tasks for a specific listing."""
    # Mock backend response
    mock_response = Mock(spec=Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "tasks": [
            {
                "id": "task-1",
                "name": "Book Photos",
                "status": "OPEN",
                "priority": 5,
                "updated_at": "2025-10-05T12:00:00Z"
            },
            {
                "id": "task-2", 
                "name": "Install Sign",
                "status": "CLAIMED",
                "priority": 8,
                "updated_at": "2025-10-05T13:00:00Z"
            }
        ]
    }
    mock_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.get.return_value = mock_response
    
    # Call the tool
    result = await get_task_status(
        mock_context,
        listing_id="listing-123",
        limit=10
    )
    
    # Verify the result
    assert isinstance(result, TaskStatusResponse)
    assert len(result.items) == 2
    assert "listing-123 has 2 task(s)" in result.summary
    assert "1 OPEN" in result.summary
    assert "1 CLAIMED" in result.summary
    assert "1 urgent task(s) need attention" in result.summary
    
    # Verify the backend was called correctly
    mock_context.context.backend_client.get.assert_called_once_with(
        "/v1/operations/tasks/listing-123",
        params={"limit": 10}
    )


@pytest.mark.asyncio
async def test_get_task_status_global_queue(mock_context):
    """Test fetching the global task queue."""
    # Mock backend response
    mock_response = Mock(spec=Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "listings": [
            {
                "listingId": "listing-1",
                "address": "123 Main St",
                "tasks": [
                    {"id": "task-1", "status": "OPEN", "priority": 5},
                    {"id": "task-2", "status": "DONE", "priority": 3}
                ]
            },
            {
                "listingId": "listing-2",
                "address": "456 Oak Ave",
                "tasks": [
                    {"id": "task-3", "status": "CLAIMED", "priority": 9}
                ]
            }
        ]
    }
    mock_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.get.return_value = mock_response
    
    # Call the tool
    result = await get_task_status(mock_context)
    
    # Verify the result
    assert isinstance(result, TaskStatusResponse)
    assert len(result.items) == 3
    assert "3 task(s) across 2 listing(s)" in result.summary
    assert "1 urgent task(s) require immediate attention" in result.summary
    assert "456 Oak Ave: 1 tasks" in result.summary
    
    # Verify backend call
    mock_context.context.backend_client.get.assert_called_once_with(
        "/v1/operations/queue",
        params={"limit": 20}
    )


@pytest.mark.asyncio
async def test_get_task_status_with_filters(mock_context):
    """Test filtering tasks by status and assignee."""
    mock_response = Mock(spec=Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {"listings": []}
    mock_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.get.return_value = mock_response
    
    # Call with filters
    result = await get_task_status(
        mock_context,
        status="OPEN",
        assignee="user-123",
        limit=50
    )
    
    # Verify filters were passed
    mock_context.context.backend_client.get.assert_called_once_with(
        "/v1/operations/queue",
        params={
            "status": "OPEN",
            "assignedTo": "user-123",
            "limit": 50
        }
    )


@pytest.mark.asyncio 
async def test_get_task_status_error_handling(mock_context):
    """Test error handling when backend fails."""
    # Mock backend error
    mock_context.context.backend_client.get.side_effect = Exception("Backend error")
    
    # Call should not raise, but return error summary
    result = await get_task_status(mock_context)
    
    assert isinstance(result, TaskStatusResponse)
    assert "Error fetching task status" in result.summary
    assert len(result.items) == 0
    assert result.total_count == 0


def test_generate_listing_summary():
    """Test summary generation for a single listing."""
    tasks = [
        {"status": "OPEN", "priority": 5},
        {"status": "OPEN", "priority": 9},
        {"status": "CLAIMED", "priority": 3},
        {"status": "DONE", "priority": 1}
    ]
    
    summary = _generate_listing_summary("listing-123", tasks)
    
    assert "listing-123 has 4 task(s)" in summary
    assert "1 CLAIMED" in summary
    assert "1 DONE" in summary  
    assert "2 OPEN" in summary
    assert "1 urgent task(s) need attention" in summary


def test_generate_queue_summary():
    """Test summary generation for the global queue."""
    listings = [
        {
            "address": "123 Main St",
            "tasks": [
                {"status": "OPEN", "priority": 5},
                {"status": "DONE", "priority": 3}
            ]
        },
        {
            "address": "456 Oak Ave", 
            "tasks": [
                {"status": "CLAIMED", "priority": 10}
            ]
        }
    ]
    
    summary = _generate_queue_summary(listings)
    
    assert "3 task(s) across 2 listing(s)" in summary
    assert "1 CLAIMED" in summary
    assert "1 DONE" in summary
    assert "1 OPEN" in summary
    assert "1 urgent task(s) require immediate attention" in summary
    assert "456 Oak Ave: 1 tasks" in summary
    assert "123 Main St: 2 tasks" in summary
