#!/usr/bin/env python3
"""Test SQS connection from Docker."""

import boto3
import json

# Test from inside Docker perspective
sqs = boto3.client(
    'sqs',
    endpoint_url='http://archieos-localstack:4566',  # Docker service name
    region_name='us-east-1',
    aws_access_key_id='test',
    aws_secret_access_key='test'
)

queue_url = 'http://archieos-localstack:4566/000000000000/prompt-queue.fifo'

try:
    # Get queue attributes
    attrs = sqs.get_queue_attributes(
        QueueUrl=queue_url,
        AttributeNames=['All']
    )
    print(f"✅ Queue exists! Messages: {attrs['Attributes'].get('ApproximateNumberOfMessages', 0)}")
    
    # Try to receive
    print("Attempting to receive messages...")
    response = sqs.receive_message(
        QueueUrl=queue_url,
        MaxNumberOfMessages=1,
        WaitTimeSeconds=5
    )
    
    if 'Messages' in response:
        print(f"✅ Got {len(response['Messages'])} messages")
        msg = response['Messages'][0]
        body = json.loads(msg['Body'])
        print(f"   Content: {body.get('content', body)}")
        print(f"   Receipt: {msg['ReceiptHandle'][:50]}...")
    else:
        print("❌ No messages received")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
