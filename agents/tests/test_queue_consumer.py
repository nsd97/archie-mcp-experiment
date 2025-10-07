"""Tests for PromptQueueConsumer behavior (serialization + MCP usage)."""

import os
import sys
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# Ensure src modules are importable
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
VENDORED_SDK = os.path.join(PROJECT_ROOT, "external", "openai-agents-python", "src")
if VENDORED_SDK not in sys.path:
    sys.path.insert(0, VENDORED_SDK)

from src.queue_consumer import PromptQueueConsumer
from src.context import AgentContext


class DummySession:
    """Helper to mimic aioboto3 Session resources/clients."""

    def __init__(self, resource=None, client=None):
        self._resource = resource
        self._client = client

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def resource(self, *_args, **_kwargs):
        return self._resource

    def client(self, *_args, **_kwargs):
        return self._client


@pytest.mark.asyncio
async def test_prompt_consumer_serializes_per_room():
    """Ensure only one concurrent run per room when consuming prompts."""

    # Arrange queue consumer with mocked dependencies
    sqs_client = AsyncMock()
    sqs_client.receive_message.return_value = {
        "Messages": [
            {
                "Body": "{\"room_id\": \"!room:localhost\", \"sender\": \"@alice:localhost\", \"thread_id\": null, \"correlation_id\": \"msg-1\", \"content\": \"First message\"}",
                "ReceiptHandle": "receipt-1",
                "Attributes": {"ApproximateReceiveCount": "1"},
            },
            {
                "Body": "{\"room_id\": \"!room:localhost\", \"sender\": \"@bob:localhost\", \"thread_id\": null, \"correlation_id\": \"msg-2\", \"content\": \"Second message\"}",
                "ReceiptHandle": "receipt-2",
                "Attributes": {"ApproximateReceiveCount": "1"},
            },
        ]
    }

    sqs_client.delete_message = AsyncMock()

    db_session = AsyncMock()
    processed_table = AsyncMock()
    db_session.Table.return_value = processed_table
    processed_table.get_item.return_value = {}  # not duplicates

    consumer = PromptQueueConsumer(
        queue_url="queue-url",
        dlq_url="dlq-url",
        db_session=db_session,
        sqs_client=sqs_client,
        backend_url="http://backend:3000",
    )

    # Track simultaneous runs by patching Runner.run
    active_runs = 0
    max_active = 0

    async def fake_runner_run(agent, content, context, max_turns=3):  # pylint: disable=unused-argument
        nonlocal active_runs, max_active
        active_runs += 1
        max_active = max(max_active, active_runs)
        # Ensure context is an AgentContext with matching room
        assert isinstance(context, AgentContext)
        assert context.room_id == "!room:localhost"
        await asyncio.sleep(0.01)
        active_runs -= 1
        FakeResult = MagicMock()
        FakeResult.final_output = "done"
        return FakeResult

    with patch("src.queue_consumer.create_matrix_adapter", new=AsyncMock(return_value=None)), \
        patch("src.queue_consumer.create_archie_with_mcp", new=AsyncMock(return_value=(MagicMock(), MagicMock()))), \
        patch("agents.Runner.run", new=fake_runner_run):

        # Act: process a batch
        await consumer._poll_and_process()  # pylint: disable=protected-access

    # Assert: only one concurrent run for the same room
    assert max_active == 1


@pytest.mark.asyncio
async def test_prompt_consumer_uses_mcp(monkeypatch):
    """Ensure prompt consumer invokes MCP-enabled Archie and not direct HTTP."""

    sqs_client = AsyncMock()
    sqs_client.receive_message.return_value = {
        "Messages": [
            {
                "Body": "{\"room_id\": \"!room:localhost\", \"sender\": \"@user:localhost\", \"thread_id\": null, \"correlation_id\": \"msg-1\", \"content\": \"Test\"}",
                "ReceiptHandle": "receipt-1",
                "Attributes": {"ApproximateReceiveCount": "1"},
            }
        ]
    }
    sqs_client.delete_message = AsyncMock()

    db_session = AsyncMock()
    processed_table = AsyncMock()
    db_session.Table.return_value = processed_table
    processed_table.get_item.return_value = {}

    consumer = PromptQueueConsumer(
        queue_url="queue-url",
        dlq_url="dlq-url",
        db_session=db_session,
        sqs_client=sqs_client,
        backend_url="http://backend:3000",
    )

    fake_agent = MagicMock()
    fake_mcp_context = AsyncMock()
    fake_mcp_context.__aenter__.return_value = None
    fake_mcp_context.__aexit__.return_value = False

    archie_with_mcp = AsyncMock(return_value=(fake_agent, fake_mcp_context))
    runner_run = AsyncMock()
    runner_run.return_value.final_output = "done"

    monkeypatch.setattr("src.queue_consumer.create_matrix_adapter", AsyncMock(return_value=None))
    monkeypatch.setattr("src.queue_consumer.create_archie_with_mcp", archie_with_mcp)
    monkeypatch.setattr("agents.Runner.run", runner_run)

    with patch.object(consumer, "_send_to_dlq", new=AsyncMock()):
        await consumer._poll_and_process()  # pylint: disable=protected-access

    # Ensure MCP path used
    archie_with_mcp.assert_called_once()
    runner_run.assert_awaited()


