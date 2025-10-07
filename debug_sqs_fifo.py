#!/usr/bin/env python3
"""Debug SQS FIFO queue issues."""

import asyncio
import aioboto3
import json
import os

async def test_fifo_queue():
    """Test FIFO queue specifics."""
    session = aioboto3.Session()
    
    async with session.client(
        'sqs',
        endpoint_url='http://localhost:4566',
        region_name='us-east-1',
        aws_access_key_id='test',
        aws_secret_access_key='test'
    ) as sqs:
        queue_url = 'http://localhost:4566/000000000000/prompt-queue.fifo'
        
        print("Testing FIFO queue operations...")
        
        # 1. Check queue attributes
        try:
            attrs = await sqs.get_queue_attributes(
                QueueUrl=queue_url,
                AttributeNames=['All']
            )
            print("\n✅ Queue Attributes:")
            for key, value in attrs['Attributes'].items():
                print(f"   {key}: {value}")
        except Exception as e:
            print(f"❌ Error getting attributes: {e}")
            
        # 2. Try long polling with FIFO parameters
        print("\n🔍 Testing long polling (20s wait)...")
        try:
            response = await sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=20,  # Long polling
                VisibilityTimeout=300,
                MessageAttributeNames=['All'],
                AttributeNames=['All']  # Include all message attributes
            )
            
            messages = response.get('Messages', [])
            print(f"✅ Received {len(messages)} messages")
            
            if messages:
                msg = messages[0]
                print(f"\nFirst message:")
                print(f"   MessageId: {msg.get('MessageId')}")
                print(f"   Body: {msg.get('Body')[:100]}...")
                print(f"   Attributes: {msg.get('Attributes', {})}")
                
                # For FIFO queues, check MessageGroupId
                if 'MessageGroupId' in msg.get('Attributes', {}):
                    print(f"   MessageGroupId: {msg['Attributes']['MessageGroupId']}")
                    
        except Exception as e:
            print(f"❌ Error receiving messages: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_fifo_queue())
