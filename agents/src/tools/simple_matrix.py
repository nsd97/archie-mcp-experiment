"""Simple Matrix reply tool for Archie - direct integration."""

import os
import sys
import httpx
from typing import Optional
import uuid

# Add vendored SDK to path
sys.path.insert(0, "/app/external/openai-agents-python/src")

from agents import function_tool, RunContextWrapper
from src.context import AgentContext, MessageSentResponse


@function_tool
async def send_matrix_reply(
    ctx: RunContextWrapper[AgentContext],
    content: str,
    room_id: Optional[str] = None,
    format: str = "plain"
) -> MessageSentResponse:
    """Send a reply to the Matrix room."""
    
    # Get room_id from context if not provided
    if not room_id:
        room_id = ctx.get().room_id
    
    if not room_id:
        return MessageSentResponse(
            event_id="error",
            timestamp="",
            room_id="",
            error="No room_id provided or found in context"
        )
    
    # Matrix credentials
    homeserver = os.getenv("MATRIX_HOMESERVER_URL", "http://matrix-synapse:8008")
    access_token = os.getenv("MATRIX_ACCESS_TOKEN")
    
    if not access_token:
        return MessageSentResponse(
            event_id="error",
            timestamp="",
            room_id=room_id,
            error="No Matrix access token configured"
        )
    
    # Send message
    async with httpx.AsyncClient() as client:
        try:
            # Generate transaction ID for idempotency
            txn_id = str(uuid.uuid4())
            
            # Prepare message content
            msg_content = {
                "msgtype": "m.text",
                "body": content
            }
            
            if format == "html":
                msg_content["format"] = "org.matrix.custom.html"
                msg_content["formatted_body"] = content
            
            # Send to Matrix
            response = await client.put(
                f"{homeserver}/_matrix/client/r0/rooms/{room_id}/send/m.room.message/{txn_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                json=msg_content
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Sent Matrix reply to {room_id}")
                return MessageSentResponse(
                    event_id=result.get("event_id", txn_id),
                    timestamp=str(response.headers.get("Date", "")),
                    room_id=room_id
                )
            else:
                print(f"❌ Failed to send Matrix reply: {response.status_code} - {response.text}")
                return MessageSentResponse(
                    event_id="error",
                    timestamp="",
                    room_id=room_id,
                    error=f"HTTP {response.status_code}: {response.text}"
                )
                
        except Exception as e:
            print(f"❌ Error sending Matrix reply: {e}")
            return MessageSentResponse(
                event_id="error",
                timestamp="",
                room_id=room_id,
                error=str(e)
            )
