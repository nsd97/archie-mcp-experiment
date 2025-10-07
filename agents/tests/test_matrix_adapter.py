"""Tests for Matrix adapter MCP integration expectations."""

import os
import sys
from unittest.mock import AsyncMock

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
VENDORED_SDK = os.path.join(PROJECT_ROOT, "external", "openai-agents-python", "src")
if VENDORED_SDK not in sys.path:
    sys.path.insert(0, VENDORED_SDK)

from src.matrix_adapter import MatrixAdapter


@pytest.mark.asyncio
async def test_matrix_adapter_send_message_requires_connection():
    """Adapter should raise if not connected (client missing)."""

    adapter = MatrixAdapter(
        homeserver_url="http://matrix",
        access_token="token",
        db_session=AsyncMock(),
        sqs_client=AsyncMock(),
        queue_url="queue",
        user_id="@archie:localhost",
    )

    with pytest.raises(Exception, match="Not connected to Matrix"):
        await adapter.send_message("!room:localhost", "hello")


@pytest.mark.asyncio
async def test_matrix_adapter_connect_initializes_async_client(monkeypatch):
    """Verify connect() creates AsyncClient and validates identity."""

    fake_client = AsyncMock()
    fake_client.whoami.return_value.user_id = "@archie:localhost"

    monkeypatch.setattr("src.matrix_adapter.AsyncClient", lambda url, user: fake_client)

    adapter = MatrixAdapter(
        homeserver_url="http://matrix",
        access_token="token",
        db_session=AsyncMock(),
        sqs_client=AsyncMock(),
        queue_url="queue",
        user_id="@archie:localhost",
    )

    await adapter.connect()
    assert adapter.client is fake_client
    fake_client.whoami.assert_awaited_once()

