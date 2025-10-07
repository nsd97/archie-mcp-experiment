#!/usr/bin/env python3
"""Test SQS connection from inside the container."""

import asyncio
import aioboto3
import os

async def test_connection():
    # Use the same configuration as the container
    session = aioboto3.Session()
    
    async with session.client(
        'sqs',
        endpoint_url='http://localhost:4566',  # From host
        region_name='us-east-1',
        aws_access_key_id='test',
        aws_secret_access_key='test'
    ) as sqs:
        queue_url = 'http://localhost:4566/000000000000/prompt-queue.fifo'
        
        print(f"Testing connection to: {queue_url}")
        
        try:
            # Get queue attributes
            attrs = await sqs.get_queue_attributes(
                QueueUrl=queue_url,
                AttributeNames=['All']
            )
            print(f"✅ Queue exists! Messages available: {attrs['Attributes'].get('ApproximateNumberOfMessages', 0)}")
            
            # Try to receive
            print("Attempting to receive messages...")
            response = await sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=5
            )
            
            if 'Messages' in response:
                print(f"✅ Successfully received {len(response['Messages'])} messages")
            else:
                print("No messages received (queue might be empty)")
                
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
