#!/usr/bin/env python3
"""Test script to send a message to the prompt queue."""

import boto3
import json
import uuid
from datetime import datetime

# Configure SQS client for LocalStack
sqs = boto3.client(
    'sqs',
    endpoint_url='http://localhost:4566',
    region_name='us-east-1',
    aws_access_key_id='test',
    aws_secret_access_key='test'
)

# Queue URL
QUEUE_URL = 'http://localhost:4566/000000000000/prompt-queue.fifo'

# Create a test message
message = {
    "event_id": f"test_{uuid.uuid4()}",
    "sender": "@testuser:localhost",
    "room_id": "!testroom:localhost",
    "thread_id": None,
    "content": "Show me open tasks",
    "timestamp": datetime.utcnow().isoformat() + "Z",
    "correlation_id": str(uuid.uuid4())
}

# Send the message
try:
    response = sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=json.dumps(message),
        MessageGroupId="testroom",  # FIFO queue requires this
        MessageDeduplicationId=f"test_{uuid.uuid4()}"  # Ensure uniqueness
    )
    
    print(f"✅ Test message sent successfully!")
    print(f"Message ID: {response['MessageId']}")
    print(f"Message content: {message['content']}")
    print(f"Correlation ID: {message['correlation_id']}")
    print("\n🔍 Check the queue consumer logs to see Archie's response:")
    print("   docker logs archieos-queue-consumer --tail 20")
    
except Exception as e:
    print(f"❌ Error sending message: {e}")
