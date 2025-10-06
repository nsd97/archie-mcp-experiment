"""Queue communication tools for async agent-to-agent messaging.

Following SDK async patterns from external/openai-agents-python/docs/multi_agent.md
and external/openai-agents-python/docs/tools.md (async function tools).
"""

import sys
import json
import os
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict, field
from datetime import datetime

sys.path.insert(0, "/app/external/openai-agents-python/src")

from agents import function_tool, RunContextWrapper

from src.context import AgentContext


@dataclass
class LaurenWorkMessage:
    """Message for Lauren Work Queue (Archie → Lauren)."""
    type: str = "admin_task_intent"
    correlation_id: str = ""
    room_id: str = ""
    thread_id: Optional[str] = None
    sender: str = ""
    raw_text: str = ""
    attachments: list[dict] = field(default_factory=list)
    listing_hint: Optional[str] = None
    admin_channel: str = "ops"
    priority_hint: Optional[int] = None
    due_hint: Optional[str] = None
    provenance: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = ""
    
    def to_json(self) -> str:
        return json.dumps(asdict(self))


@dataclass
class ArchieSignalMessage:
    """Message for Archie Signal Queue (Lauren → Archie)."""
    type: str = "task_status"
    correlation_id: str = ""
    from_agent: str = "Lauren"
    to_agent: str = "Archie"
    kind: str = ""  # "created", "skipped", "error"
    task_id: Optional[str] = None
    task_name: Optional[str] = None
    listing_id: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)
    room_id: str = ""
    thread_id: Optional[str] = None
    timestamp: str = ""
    
    def to_json(self) -> str:
        return json.dumps(asdict(self))


# Archie's tool to enqueue work for Lauren

@function_tool
async def enqueue_for_lauren(
    ctx: RunContextWrapper[AgentContext],
    raw_text: str,
    listing_hint: Optional[str] = None,
    priority_hint: Optional[int] = None,
    due_hint: Optional[str] = None,
    attachments: Optional[list[dict]] = None,
    admin_channel: str = "ops"
) -> Dict[str, Any]:
    """Enqueue an admin task intent for Lauren to process.
    
    Use this when the user's request needs an admin to handle a task.
    Lauren will classify the request and create an OPEN/UNCLAIMED task
    that appears in the UI for human admins to claim and complete.
    
    Args:
        raw_text: The user's original request text
        listing_hint: Address or listing ID hint (e.g., "123 Main St")
        priority_hint: Suggested priority 0-10 (8+ is urgent)
        due_hint: Suggested due date (e.g., "next week", "2025-10-15")
        attachments: Optional file attachments
        admin_channel: Which admin team ("ops" or "marketing")
        
    Returns:
        Dict with queued:true and correlation_id for tracking
    """
    context = ctx.context
    
    # Build message
    message = LaurenWorkMessage(
        correlation_id=context.correlation_id,
        room_id=context.room_id,
        thread_id=context.thread_id,
        sender=context.user_id,
        raw_text=raw_text,
        listing_hint=listing_hint,
        priority_hint=priority_hint,
        due_hint=due_hint,
        attachments=attachments or [],
        admin_channel=admin_channel,
        provenance={
            "source": "matrix",
            "room_id": context.room_id,
            "thread_id": context.thread_id,
            "correlation_id": context.correlation_id
        },
        timestamp=datetime.utcnow().isoformat() + "Z"
    )
    
    # Get SQS client from context
    queue_url = os.getenv("LAUREN_WORK_QUEUE_URL")
    if not queue_url:
        raise Exception("LAUREN_WORK_QUEUE_URL not configured")
        
    # Create SQS client if not in context
    import aioboto3
    session = aioboto3.Session()
    
    endpoint_url = os.getenv("SQS_ENDPOINT") or os.getenv("LOCALSTACK_ENDPOINT")
    async with session.client(
        'sqs',
        endpoint_url=endpoint_url,
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
    ) as sqs_client:
        # Send message to queue
        await sqs_client.send_message(
            QueueUrl=queue_url,
            MessageBody=message.to_json(),
            MessageGroupId=context.room_id,  # FIFO queue requires this
            MessageAttributes={
                'correlation_id': {
                    'StringValue': context.correlation_id,
                    'DataType': 'String'
                },
                'room_id': {
                    'StringValue': context.room_id,
                    'DataType': 'String'
                }
            }
        )
    
    print(f"📤 Enqueued work for Lauren: {context.correlation_id}")
    
    return {
        "queued": True,
        "correlation_id": context.correlation_id,
        "queue": "lauren-work-queue"
    }


# Lauren's tool to signal Archie

@function_tool
async def notify_archie_signal(
    ctx: RunContextWrapper[AgentContext],
    kind: str,  # "created", "skipped", "error"
    task_id: Optional[str] = None,
    task_name: Optional[str] = None,
    listing_id: Optional[str] = None,
    message: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, bool]:
    """Send a signal to Archie about task processing completion.
    
    Use this after creating (or failing to create) a task to notify Archie
    so he can inform the user in Matrix.
    
    Args:
        kind: Type of signal - "created", "skipped", or "error"
        task_id: The created task ID (if kind="created")
        task_name: The created task name
        listing_id: The listing ID if applicable
        message: Human-friendly message for the user
        details: Additional details about the operation
        
    Returns:
        Dict with ok:true if signal was queued
    """
    context = ctx.context
    
    # Build signal message
    signal = ArchieSignalMessage(
        correlation_id=context.correlation_id,
        kind=kind,
        task_id=task_id,
        task_name=task_name,
        listing_id=listing_id,
        details=details or {"message": message} if message else {},
        room_id=context.room_id,
        thread_id=context.thread_id,
        timestamp=datetime.utcnow().isoformat() + "Z"
    )
    
    # Get queue URL
    queue_url = os.getenv("ARCHIE_SIGNAL_QUEUE_URL")
    if not queue_url:
        raise Exception("ARCHIE_SIGNAL_QUEUE_URL not configured")
        
    # Create SQS client
    import aioboto3
    session = aioboto3.Session()
    
    endpoint_url = os.getenv("SQS_ENDPOINT") or os.getenv("LOCALSTACK_ENDPOINT")
    async with session.client(
        'sqs',
        endpoint_url=endpoint_url,
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
    ) as sqs_client:
        # Send signal to Archie's queue
        await sqs_client.send_message(
            QueueUrl=queue_url,
            MessageBody=signal.to_json(),
            MessageGroupId=context.room_id,  # FIFO queue requires this
            MessageAttributes={
                'correlation_id': {
                    'StringValue': context.correlation_id,
                    'DataType': 'String'
                },
                'kind': {
                    'StringValue': kind,
                    'DataType': 'String'
                }
            }
        )
    
    print(f"📤 Sent signal to Archie: {kind} for {context.correlation_id}")
    
    return {"ok": True}
