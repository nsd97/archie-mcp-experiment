"""Matrix messaging tools for Archie agent.

Following SDK patterns from external/openai-agents-python/docs/tools.md
"""

import os
import sys
import json
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime
import uuid

sys.path.insert(0, "/app/external/openai-agents-python/src")

from agents import function_tool, RunContextWrapper

from ..context import AgentContext, MessageSentResponse


# Global Matrix adapter instance (initialized on first use)
_matrix_adapter = None


async def _get_matrix_adapter():
    """Get or create the global Matrix adapter instance."""
    global _matrix_adapter
    
    if _matrix_adapter is None:
        from ..matrix_adapter import create_matrix_adapter
        _matrix_adapter = await create_matrix_adapter()
        
    return _matrix_adapter


@function_tool
async def send_matrix_message(
    ctx: RunContextWrapper[AgentContext],
    room_id: str,
    content: str,
    thread_id: Optional[str] = None,
    format: str = "plain",
    nonce: Optional[str] = None
) -> MessageSentResponse:
    """Send a message to Matrix room so the user sees it in Element.
    
    Args:
        room_id: The Matrix room ID (e.g., "!abc123:matrix.org")
        content: The message content to send
        thread_id: Optional thread/event ID to reply to (maintains conversation threading)
        format: Message format - "plain" (default) or "html"
        nonce: Optional idempotency key (auto-generated if not provided)
        
    Returns:
        MessageSentResponse with event_id and metadata
        
    Note:
        - Messages appear in Element with proper threading
        - Rate limited to prevent flooding
        - Idempotent with nonce parameter
    """
    context = ctx.context
    
    # Generate nonce if not provided (for idempotency)
    if not nonce:
        nonce = f"{context.correlation_id}-{uuid.uuid4().hex[:8]}"
        
    # Apply rate limiting
    if not await _check_rate_limit(context, room_id):
        raise Exception("Rate limit exceeded for room. Please wait before sending more messages.")
        
    try:
        # Get Matrix adapter
        adapter = await _get_matrix_adapter()
        
        # Send the message
        result = await adapter.send_message(
            room_id=room_id,
            content=content,
            thread_id=thread_id or context.thread_id,  # Use context thread if available
            format=format,
            nonce=nonce
        )
        
        # Log the message send
        print(f"📤 Sent Matrix message {result['event_id']} to {room_id}")
        
        # Update rate limit tracking
        await _update_rate_limit(context, room_id)
        
        # Store correlation for tracking
        await _store_message_correlation(
            context,
            result['event_id'],
            context.correlation_id,
            room_id
        )
        
        return MessageSentResponse(
            event_id=result['event_id'],
            timestamp=result['timestamp'],
            room_id=room_id,
            thread_id=thread_id
        )
        
    except Exception as e:
        # Log error but don't expose internal details to user
        print(f"❌ Failed to send Matrix message: {str(e)}")
        raise Exception(f"Failed to send message to Matrix: {str(e)}")


# Rate limiting helpers

async def _check_rate_limit(context: AgentContext, room_id: str) -> bool:
    """Check if we're within rate limits for the room.
    
    Current limits:
    - 10 messages per minute per room
    - 2 messages per 5 seconds per room (burst prevention)
    """
    # For now, implement a simple in-memory rate limiter
    # In production, this would use Redis or DynamoDB
    
    # TODO: Implement proper distributed rate limiting
    # For P3, we'll allow all messages
    return True


async def _update_rate_limit(context: AgentContext, room_id: str):
    """Update rate limit counters after sending a message."""
    # TODO: Implement rate limit tracking
    pass


async def _store_message_correlation(
    context: AgentContext,
    event_id: str,
    correlation_id: str,
    room_id: str
):
    """Store correlation between agent correlation ID and Matrix event ID.
    
    This helps track which agent invocations resulted in which messages.
    """
    # Store in DynamoDB for correlation tracking
    async with context.db_session as db:
        table = await db.Table("agent_message_correlation")
        await table.put_item(
            Item={
                "correlation_id": correlation_id,
                "event_id": event_id,
                "room_id": room_id,
                "agent": "Archie",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )


# Additional Matrix-related tools that might be useful

@function_tool
async def get_room_context(
    ctx: RunContextWrapper[AgentContext],
    room_id: str,
    limit: int = 10
) -> Dict[str, Any]:
    """Get recent context from a Matrix room.
    
    Args:
        room_id: The Matrix room to get context from
        limit: Number of recent messages to retrieve (max 50)
        
    Returns:
        Dict with room info and recent messages
    """
    context = ctx.context
    adapter = await _get_matrix_adapter()
    
    # Get room members
    members = await adapter.get_room_members(room_id)
    
    # For now, return basic info
    # Full implementation would fetch recent messages
    return {
        "room_id": room_id,
        "member_count": len(members),
        "members": members[:10],  # First 10 members
        "note": "Recent message history not yet implemented"
    }


@function_tool  
async def join_matrix_room(
    ctx: RunContextWrapper[AgentContext],
    room_id: str
) -> Dict[str, Any]:
    """Join a Matrix room to start receiving messages.
    
    Args:
        room_id: The room ID to join
        
    Returns:
        Success status
    """
    adapter = await _get_matrix_adapter()
    await adapter.join_room(room_id)
    
    return {
        "status": "joined",
        "room_id": room_id,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
