"""Tests for Lauren's classify+create workflow."""

import sys
import os
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
from src.tools.tasks import (
    _classify_and_create_task_impl,
    _create_task_impl,
    _classify_admin_intent,
    _get_task_name_from_catalog,
)


@pytest.fixture
def mock_context():
    """Create a mock agent context."""
    backend_client = AsyncMock()
    db_session = Mock()
    
    context = AgentContext(
        user_id="test-user",
        room_id="!test:matrix.org",
        thread_id="thread-123",
        correlation_id="test-corr-456",
        db_session=db_session,
        backend_client=backend_client
    )
    
    return RunContextWrapper(context=context)


@pytest.mark.asyncio
async def test_classify_and_create_photo_task(mock_context):
    """Test classifying and creating a photo booking task."""
    # Mock backend response
    mock_response = Mock(spec=Response)
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "task": {
            "task_id": "task-new-123",
            "listing_id": "listing-456",
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
            "created_at": "2025-10-05T14:00:00Z",
            "updated_at": "2025-10-05T14:00:00Z"
        }
    }
    mock_response.raise_for_status = Mock()
    
    mock_context.context.backend_client.post.return_value = mock_response
    
    # Mock notify_archie_signal (will be called automatically)
    with patch('src.tools.tasks.notify_archie_signal_impl', new=AsyncMock()) as mock_signal:
        mock_signal.return_value = {"ok": True}
        
        # Call the tool
        result = await _classify_and_create_task_impl(
            mock_context,
            raw_text="Book photos for 123 Main St next week",
            listing_hint="123 Main St",
            priority_hint=7
        )
        
        # Verify task was created correctly
        assert isinstance(result, Task)
        assert result.task_id == "task-new-123"
        assert result.status == "OPEN"
        assert result.claim_status == "UNCLAIMED"
        assert result.assigned_to is None
        
        # Verify backend was called with correct data
        call_args = mock_context.context.backend_client.post.call_args
        assert call_args[0][0] == "/v1/operations/tasks"
        task_data = call_args[1]["json"]
        assert task_data["status"] == "OPEN"
        assert task_data["claim_status"] == "UNCLAIMED"
        assert task_data["assigned_to"] is None
        assert task_data["created_by"] == "agent:lauren"
        
        # Verify Archie was signaled
        mock_signal.assert_called_once()
        signal_call = mock_signal.call_args
        assert signal_call[1]["kind"] == "created"
        assert signal_call[1]["task_id"] == "task-new-123"


@pytest.mark.asyncio
async def test_classify_admin_intent_photos():
    """Test classification of photo booking request."""
    context = Mock()
    
    task_def_id, inputs = await _classify_admin_intent(
        context,
        "Book photos for the property",
        listing_hint="123 Main St",
        attachments=None
    )
    
    assert task_def_id == "SALE::BOOK_PHOTOS@v1"
    assert "photographer_notes" in inputs
    assert inputs["photographer_notes"] == "Book photos for the property"


@pytest.mark.asyncio
async def test_classify_admin_intent_sign():
    """Test classification of sign installation request."""
    context = Mock()
    
    task_def_id, inputs = await _classify_admin_intent(
        context,
        "Install a for sale sign at the property",
        listing_hint=None,
        attachments=None
    )
    
    assert task_def_id == "SALE::INSTALL_SIGN@v1"
    assert "sign_type" in inputs
    assert "location_notes" in inputs


@pytest.mark.asyncio
async def test_classify_admin_intent_unknown():
    """Test classification fallback for unknown intent."""
    context = Mock()
    
    task_def_id, inputs = await _classify_admin_intent(
        context,
        "Do something weird with the listing",
        listing_hint=None,
        attachments=None
    )
    
    assert task_def_id == "ADMIN::GENERIC_TASK@v1"
    assert "task_description" in inputs
    assert inputs["needs_review"] is True


def test_get_task_name_from_catalog():
    """Test extracting task name from catalog ID."""
    assert _get_task_name_from_catalog("SALE::BOOK_PHOTOS@v1") == "Book Photos"
    assert _get_task_name_from_catalog("SALE::INSTALL_SIGN@v1") == "Install Sign"
    assert _get_task_name_from_catalog("ADMIN::GENERIC_TASK@v1") == "Generic Task"


@pytest.mark.asyncio
async def test_create_task_always_unclaimed(mock_context):
    """Test that created tasks are always OPEN and UNCLAIMED."""
    # Mock backend response
    mock_response = Mock(spec=Response)
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "task": {
            "task_id": "task-direct-789",
            "name": "Post to MLS",
            "status": "OPEN",
            "claim_status": "UNCLAIMED",
            "assigned_to": None,
            "created_at": "2025-10-05T14:00:00Z",
            "updated_at": "2025-10-05T14:00:00Z"
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
            inputs={"listing_notes": "Test listing"}
        )
        
        # Verify task properties
        assert result.status == "OPEN"
        assert result.claim_status == "UNCLAIMED"
        assert result.assigned_to is None
        
        # Verify request data
        call_args = mock_context.context.backend_client.post.call_args
        task_data = call_args[1]["json"]
        assert task_data["status"] == "OPEN"
        assert task_data["claim_status"] == "UNCLAIMED"
        assert task_data["assigned_to"] is None
