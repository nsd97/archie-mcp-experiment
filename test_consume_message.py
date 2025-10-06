#!/usr/bin/env python3
"""Test consuming messages from the SQS queue."""

import json
import aioboto3
import asyncio

async def consume_test_message():
    async with aioboto3.Session().client(
        'sqs',
        endpoint_url='http://localhost:4566',
        region_name='us-east-1',
        aws_access_key_id='test',
        aws_secret_access_key='test'
    ) as sqs:
        # Receive a message
        response = await sqs.receive_message(
            QueueUrl='http://localhost:4566/000000000000/prompt-queue.fifo',
            MaxNumberOfMessages=1,
            WaitTimeSeconds=5,
            MessageAttributeNames=['All']
        )
        
        messages = response.get('Messages', [])
        if not messages:
            print('❌ No messages in queue')
            return
            
        message = messages[0]
        body = json.loads(message['Body'])
        
        print(f'✅ Received message:')
        print(f'   From: {body.get("sender")}')
        print(f'   Room: {body.get("room_id")}')
        print(f'   Content: {body.get("content")}')
        print(f'   Receipt Handle: {message["ReceiptHandle"][:20]}...')
        
        # Delete the message
        await sqs.delete_message(
            QueueUrl='http://localhost:4566/000000000000/prompt-queue.fifo',
            ReceiptHandle=message['ReceiptHandle']
        )
        print('✅ Message deleted from queue')

if __name__ == '__main__':
    asyncio.run(consume_test_message())
