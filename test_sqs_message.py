#!/usr/bin/env python3
"""Send a test message directly to the SQS queue."""

import json
import aioboto3
import asyncio
import uuid
from datetime import datetime

async def send_test_message():
    room_id = '!hhfJmqVMIVFwNvVynl:localhost'
    
    message = {
        'type': 'matrix_message',
        'correlation_id': f'test-{uuid.uuid4()}',
        'room_id': room_id,
        'sender': '@test:localhost',
        'content': 'Hi Archie, can you check my task status please?',
        'thread_id': None,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'retries': 0,
        'provenance': {
            'source': 'matrix',
            'event_id': f'$test-{uuid.uuid4()}'
        }
    }
    
    async with aioboto3.Session().resource(
        'sqs',
        endpoint_url='http://localhost:4566',
        region_name='us-east-1',
        aws_access_key_id='test',
        aws_secret_access_key='test'
    ) as sqs:
        queue = await sqs.get_queue_by_name(QueueName='prompt-queue.fifo')
        
        await queue.send_message(
            MessageBody=json.dumps(message),
            MessageGroupId=room_id
        )
        
        print(f'✅ Test message sent to queue')
        print(f'   Room: {room_id}')
        print(f'   Content: {message["content"]}')

if __name__ == '__main__':
    asyncio.run(send_test_message())
