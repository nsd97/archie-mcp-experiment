"""Matrix adapter for ArchieOS agents.

Implements Matrix bridge/appservice pattern following the plan requirements.
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict

import aioboto3
from nio import AsyncClient, RoomMessageText, RoomMessage, LoginResponse
from nio.responses import RoomMessagesResponse
from nio.events import Event


@dataclass
class MatrixEvent:
    """Matrix event for storage in DynamoDB."""
    room_id: str      # PK
    event_id: str     # SK
    sender: str
    content: str
    thread_id: Optional[str]
    timestamp: str
    processed: bool = False
    agent_response_id: Optional[str] = None
    
    def to_dynamodb(self) -> Dict[str, Any]:
        """Convert to DynamoDB item format."""
        item = {
            "room_id": self.room_id,
            "event_id": self.event_id,
            "sender": self.sender,
            "content": self.content,
            "timestamp": self.timestamp,
            "processed": self.processed
        }
        if self.thread_id:
            item["thread_id"] = self.thread_id
        if self.agent_response_id:
            item["agent_response_id"] = self.agent_response_id
        return item


@dataclass
class PromptQueueMessage:
    """Message format for the prompt queue."""
    type: str = "matrix_prompt"
    correlation_id: str = ""
    room_id: str = ""
    sender: str = ""
    content: str = ""
    thread_id: Optional[str] = None
    timestamp: str = ""
    provenance: Dict[str, Any] = None
    retries: int = 0
    
    def __post_init__(self):
        if not self.provenance:
            self.provenance = {"source": "matrix"}
            
    def to_json(self) -> str:
        """Convert to JSON for SQS."""
        return json.dumps(asdict(self))


class MatrixAdapter:
    """Adapter for Matrix homeserver integration.
    
    This implements the shared database mandate by writing Matrix events
    to DynamoDB and enqueueing them for agent processing.
    """
    
    def __init__(
        self,
        homeserver_url: str,
        access_token: str,
        db_session: Any,  # aioboto3 Session (not resource)
        sqs_client: Any,  # aioboto3 SQS client
        queue_url: str,
        user_id: str = "@archie:matrix.org"
    ):
        self.homeserver_url = homeserver_url
        self.access_token = access_token
        self.user_id = user_id
        self.db_session = db_session  # Store the session, not resource
        self.sqs_client = sqs_client
        self.queue_url = queue_url
        self.client: Optional[AsyncClient] = None
        self.matrix_events_table = os.getenv("MATRIX_EVENTS_TABLE", "matrix_events")
        self.processed_events_table = os.getenv("PROCESSED_EVENTS_TABLE", "processed_events")
        self.db_endpoint = os.getenv("DYNAMODB_ENDPOINT", os.getenv("LOCALSTACK_ENDPOINT"))
        self.db_region = os.getenv("AWS_REGION", "us-east-1")
        
    async def connect(self):
        """Connect to Matrix homeserver."""
        self.client = AsyncClient(self.homeserver_url, self.user_id)
        self.client.access_token = self.access_token
        
        # Verify connection
        response = await self.client.whoami()
        if hasattr(response, 'user_id'):
            print(f"✓ Connected to Matrix as {response.user_id}")
        else:
            raise Exception("Failed to connect to Matrix homeserver")
            
    async def disconnect(self):
        """Disconnect from Matrix."""
        if self.client:
            await self.client.close()
            
    async def listen_for_messages(self, room_id: Optional[str] = None):
        """Listen for messages in Matrix rooms.
        
        Args:
            room_id: Specific room to listen to, or None for all rooms
        """
        if not self.client:
            raise Exception("Not connected to Matrix")
            
        # Set up message callback
        self.client.add_event_callback(self._on_room_message, RoomMessageText)
        
        # Start syncing
        print(f"🎧 Listening for Matrix messages...")
        await self.client.sync_forever(timeout=30000)
        
    async def _on_room_message(self, room: Any, event: RoomMessageText):
        """Handle incoming room messages."""
        print(f"\n🔍 DEBUG: Message event received!")
        print(f"   Event type: {type(event)}")
        print(f"   Sender: {event.sender}")
        print(f"   Room ID: {room.room_id}")
        print(f"   Our user ID: {self.user_id}")
        
        # Skip our own messages
        if event.sender == self.user_id:
            print(f"   ⏭️  Skipping our own message")
            return
            
        # Skip messages that aren't text
        if not isinstance(event, RoomMessageText):
            print(f"   ⏭️  Skipping non-text message")
            return
            
        print(f"📩 Received message from {event.sender} in {room.room_id}")
        print(f"   Content: {event.body}")
        
        # Extract thread ID if this is a threaded message
        thread_id = None
        if hasattr(event, 'content') and isinstance(event.content, dict):
            relates_to = event.content.get('m.relates_to', {})
            if relates_to.get('rel_type') == 'm.thread':
                thread_id = relates_to.get('event_id')
                
        # Create Matrix event for storage
        matrix_event = MatrixEvent(
            room_id=room.room_id,
            event_id=event.event_id,
            sender=event.sender,
            content=event.body,
            thread_id=thread_id,
            timestamp=datetime.utcnow().isoformat() + "Z"
        )
        
        # Check for duplicate processing
        if await self._is_duplicate(event.event_id):
            print(f"⚠️  Duplicate event {event.event_id}, skipping")
            return
            
        # Store event in DynamoDB
        await self._store_matrix_event(matrix_event)
        
        # Enqueue for agent processing
        await self._enqueue_prompt(matrix_event)
        
    async def _is_duplicate(self, event_id: str) -> bool:
        """Check if we've already processed this event."""
        async with self.db_session.resource(
            "dynamodb",
            endpoint_url=self.db_endpoint,
            region_name=self.db_region
        ) as db:
            table = await db.Table(self.processed_events_table)
            try:
                response = await table.get_item(Key={"event_id": event_id})
                return "Item" in response
            except Exception:
                return False
                
    async def _store_matrix_event(self, event: MatrixEvent):
        """Store Matrix event in DynamoDB."""
        async with self.db_session.resource(
            "dynamodb",
            endpoint_url=self.db_endpoint,
            region_name=self.db_region
        ) as db:
            table = await db.Table(self.matrix_events_table)
            await table.put_item(Item=event.to_dynamodb())
            
        print(f"💾 Stored Matrix event {event.event_id}")
        
    async def _enqueue_prompt(self, event: MatrixEvent):
        """Enqueue prompt for agent processing."""
        # Create prompt queue message
        message = PromptQueueMessage(
            correlation_id=event.event_id,
            room_id=event.room_id,
            sender=event.sender,
            content=event.content,
            thread_id=event.thread_id,
            timestamp=event.timestamp,
            provenance={
                "source": "matrix",
                "event_id": event.event_id,
                "room_id": event.room_id
            }
        )
        
        # Send to SQS with deduplication
        print(f"\n📤 Sending to SQS queue...")
        print(f"   Queue URL: {self.queue_url}")
        print(f"   Message ID: {event.event_id}")
        print(f"   Message Group: {event.room_id}")
        print(f"   Message body: {message.to_json()[:200]}...")
        
        try:
            response = await self.sqs_client.send_message(
                QueueUrl=self.queue_url,
                MessageBody=message.to_json(),
                MessageDeduplicationId=event.event_id,
                MessageGroupId=event.room_id  # Preserve ordering per room
            )
            
            print(f"✅ Successfully enqueued prompt {event.event_id} -> {response['MessageId']}")
        except Exception as e:
            print(f"❌ Failed to send to SQS: {e}")
            raise
        
    async def send_message(
        self,
        room_id: str,
        content: str,
        thread_id: Optional[str] = None,
        format: str = "plain",
        nonce: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send a message to a Matrix room.
        
        This is called by the send_matrix_message tool.
        
        Args:
            room_id: The room to send to
            content: Message content
            thread_id: Optional thread to reply in
            format: "plain" or "html"
            nonce: Idempotency key
            
        Returns:
            Dict with event_id and timestamp
        """
        if not self.client:
            raise Exception("Not connected to Matrix")
            
        # Build message content
        msg_content = {
            "msgtype": "m.text",
            "body": content
        }
        
        if format == "html":
            msg_content["format"] = "org.matrix.custom.html"
            msg_content["formatted_body"] = content
            
        # Add threading if specified
        if thread_id:
            msg_content["m.relates_to"] = {
                "rel_type": "m.thread",
                "event_id": thread_id
            }
            
        # Send with idempotency
        response = await self.client.room_send(
            room_id=room_id,
            message_type="m.room.message",
            content=msg_content,
            tx_id=nonce  # Transaction ID for idempotency
        )
        
        if hasattr(response, 'event_id'):
            return {
                "event_id": response.event_id,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "room_id": room_id,
                "thread_id": thread_id
            }
        else:
            raise Exception(f"Failed to send message: {response}")
            
    async def mark_event_processed(self, event_id: str, response_event_id: Optional[str] = None):
        """Mark a Matrix event as processed."""
        async with self.db_session.resource(
            "dynamodb",
            endpoint_url=self.db_endpoint,
            region_name=self.db_region
        ) as db:
            # Update matrix_events table
            events_table = await db.Table(self.matrix_events_table)
            update_expr = "SET processed = :true"
            expr_values = {":true": True}
            
            if response_event_id:
                update_expr += ", agent_response_id = :resp"
                expr_values[":resp"] = response_event_id
                
            # Need to get the room_id first since it's part of the key
            # This is a limitation - we might want to add a GSI on event_id
            # For now, we'll track in the processed_events table
            
            # Mark in processed_events table
            processed_table = await db.Table(self.processed_events_table)
            await processed_table.put_item(
                Item={
                    "event_id": event_id,
                    "processed_at": datetime.utcnow().isoformat() + "Z",
                    "response_event_id": response_event_id
                }
            )
            
    async def get_room_members(self, room_id: str) -> List[str]:
        """Get members of a Matrix room."""
        if not self.client:
            raise Exception("Not connected to Matrix")
            
        response = await self.client.joined_members(room_id)
        if hasattr(response, 'members'):
            return list(response.members.keys())
        return []
        
    async def join_room(self, room_id: str):
        """Join a Matrix room."""
        if not self.client:
            raise Exception("Not connected to Matrix")
            
        response = await self.client.join(room_id)
        if hasattr(response, 'room_id'):
            print(f"✓ Joined room {response.room_id}")
        else:
            print(f"⚠️  Failed to join room {room_id}: {response}")


# Standalone functions for Lambda/worker usage

async def create_matrix_adapter(
    homeserver_url: Optional[str] = None,
    access_token: Optional[str] = None
) -> MatrixAdapter:
    """Factory function to create a Matrix adapter with environment config."""
    # Get config from environment
    homeserver_url = homeserver_url or os.getenv("MATRIX_HOMESERVER_URL")
    access_token = access_token or os.getenv("MATRIX_ACCESS_TOKEN")
    queue_url = os.getenv("SQS_QUEUE_URL")
    user_id = os.getenv("MATRIX_USER_ID", "@archie:matrix.org")
    
    if not all([homeserver_url, access_token, queue_url]):
        raise ValueError("Missing required Matrix/SQS configuration")
        
    # Create AWS session (not resource)
    session = aioboto3.Session()
    
    # Create SQS client
    sqs_client = await session.client(
        "sqs",
        endpoint_url=os.getenv("SQS_ENDPOINT", os.getenv("LOCALSTACK_ENDPOINT")),
        region_name=os.getenv("AWS_REGION", "us-east-1")
    ).__aenter__()
    
    # Create adapter
    adapter = MatrixAdapter(
        homeserver_url=homeserver_url,
        access_token=access_token,
        db_session=session,  # Pass the session, not resource
        sqs_client=sqs_client,
        queue_url=queue_url,
        user_id=user_id
    )
    
    await adapter.connect()
    return adapter
