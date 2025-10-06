#!/usr/bin/env python3
"""Direct Message listener for Archie - simplified version."""

import os
import sys
import asyncio
import json
from datetime import datetime
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from nio import AsyncClient, RoomMessageText, LoginResponse, InviteEvent
import aioboto3
from botocore.exceptions import ClientError


class DirectMessageListener:
    def __init__(self):
        self.homeserver = os.getenv("MATRIX_HOMESERVER_URL", "http://matrix-synapse:8008")
        self.user_id = os.getenv("MATRIX_USER_ID", "@archie:localhost")
        self.access_token = os.getenv("MATRIX_ACCESS_TOKEN")
        self.sqs_queue_url = os.getenv("SQS_QUEUE_URL")
        
        self.client = AsyncClient(self.homeserver, self.user_id)
        self.client.access_token = self.access_token
        self.client.user_id = self.user_id
        
    async def message_callback(self, room, event):
        """Handle incoming messages."""
        # Skip our own messages
        if event.sender == self.user_id:
            return
            
        print(f"📨 DM from {event.sender} in {room.room_id}: {event.body}")
        
        # Create message for queue
        message = {
            'type': 'matrix_message',
            'correlation_id': f'dm-{uuid.uuid4()}',
            'room_id': room.room_id,
            'sender': event.sender,
            'content': event.body,
            'thread_id': None,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'retries': 0,
            'provenance': {
                'source': 'matrix',
                'event_id': event.event_id
            }
        }
        
        # Send to SQS
        await self.send_to_queue(message)
        
    async def invite_callback(self, room, event):
        """Auto-accept invites."""
        print(f"🎉 Received invite to {room.room_id} from {event.sender}")
        await self.client.join(room.room_id)
        print(f"✅ Joined room {room.room_id}")
        
    async def send_to_queue(self, message):
        """Send message to SQS queue."""
        async with aioboto3.Session().client(
            'sqs',
            endpoint_url=os.getenv("LOCALSTACK_ENDPOINT", "http://archieos-localstack:4566"),
            region_name='us-east-1',
            aws_access_key_id='test',
            aws_secret_access_key='test'
        ) as sqs:
            try:
                await sqs.send_message(
                    QueueUrl=self.sqs_queue_url,
                    MessageBody=json.dumps(message),
                    MessageGroupId=message['room_id']
                )
                print(f"✅ Message sent to queue for processing")
            except Exception as e:
                print(f"❌ Failed to send to queue: {e}")
                
    async def start(self):
        """Start the listener."""
        print(f"🚀 Starting DM listener for {self.user_id}")
        print(f"   Homeserver: {self.homeserver}")
        
        # Add callbacks
        self.client.add_event_callback(self.message_callback, RoomMessageText)
        self.client.add_event_callback(self.invite_callback, InviteEvent)
        
        # Sync forever
        print("👂 Listening for DMs...")
        await self.client.sync_forever(timeout=30000)


async def main():
    listener = DirectMessageListener()
    await listener.start()


if __name__ == "__main__":
    asyncio.run(main())
