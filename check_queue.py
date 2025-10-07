#!/usr/bin/env python3
"""Check messages in the queue."""

import boto3

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

# Get queue attributes
try:
    attrs = sqs.get_queue_attributes(
        QueueUrl=QUEUE_URL,
        AttributeNames=['All']
    )
    
    print("Queue Attributes:")
    print(f"  Messages Available: {attrs['Attributes'].get('ApproximateNumberOfMessages', 0)}")
    print(f"  Messages In Flight: {attrs['Attributes'].get('ApproximateNumberOfMessagesNotVisible', 0)}")
    print(f"  Messages Delayed: {attrs['Attributes'].get('ApproximateNumberOfMessagesDelayed', 0)}")
    
    # Try to receive a message
    response = sqs.receive_message(
        QueueUrl=QUEUE_URL,
        MaxNumberOfMessages=1,
        WaitTimeSeconds=2
    )
    
    if 'Messages' in response:
        print(f"\nFound {len(response['Messages'])} message(s) in queue")
        for msg in response['Messages']:
            print(f"  Body: {msg['Body'][:100]}...")
    else:
        print("\nNo messages found in queue")
        
except Exception as e:
    print(f"Error: {e}")
