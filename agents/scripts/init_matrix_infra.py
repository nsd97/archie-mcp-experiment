"""Initialize infrastructure for Matrix integration.

Creates the necessary DynamoDB tables and SQS queues.
"""

import os
import sys
import asyncio
import aioboto3


async def create_dynamodb_tables(dynamodb):
    """Create DynamoDB tables for Matrix integration."""
    
    # Table 1: matrix_events
    try:
        table = await dynamodb.create_table(
            TableName='matrix_events',
            KeySchema=[
                {'AttributeName': 'room_id', 'KeyType': 'HASH'},
                {'AttributeName': 'event_id', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'room_id', 'AttributeType': 'S'},
                {'AttributeName': 'event_id', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        await table.wait_until_exists()
        print("✓ Created matrix_events table")
    except Exception as e:
        if "ResourceInUseException" in str(e):
            print("✓ matrix_events table already exists")
        else:
            raise
            
    # Table 2: processed_events (for idempotency)
    try:
        table = await dynamodb.create_table(
            TableName='processed_events',
            KeySchema=[
                {'AttributeName': 'event_id', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'event_id', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        await table.wait_until_exists()
        print("✓ Created processed_events table")
    except Exception as e:
        if "ResourceInUseException" in str(e):
            print("✓ processed_events table already exists")
        else:
            raise
            
    # Table 3: agent_message_correlation
    try:
        table = await dynamodb.create_table(
            TableName='agent_message_correlation',
            KeySchema=[
                {'AttributeName': 'correlation_id', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'correlation_id', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        await table.wait_until_exists()
        print("✓ Created agent_message_correlation table")
    except Exception as e:
        if "ResourceInUseException" in str(e):
            print("✓ agent_message_correlation table already exists")
        else:
            raise


async def create_sqs_queues(sqs):
    """Create SQS queues for agent communication."""
    
    queues_to_create = [
        ('prompt-queue', 'prompt-queue-dlq', "Prompt Queue (Matrix → Archie)"),
        ('lauren-work-queue', 'lauren-work-queue-dlq', "Lauren Work Queue (Archie → Lauren)"),
        ('archie-signal-queue', 'archie-signal-queue-dlq', "Archie Signal Queue (Lauren → Archie)")
    ]
    
    for queue_name, dlq_name, description in queues_to_create:
        # Create main queue
        try:
            response = await sqs.create_queue(
                QueueName=queue_name,
                Attributes={
                    'MessageRetentionPeriod': '1209600',  # 14 days
                    'VisibilityTimeout': '300',  # 5 minutes
                    'ReceiveMessageWaitTimeSeconds': '20'  # Long polling
                }
            )
            print(f"✓ Created {queue_name}: {response['QueueUrl']}")
        except Exception as e:
            if "QueueAlreadyExists" in str(e) or "QueueAlreadyExists" in str(type(e)):
                print(f"✓ {queue_name} already exists")
            else:
                print(f"⚠️  Could not create {queue_name}: {e}")
                
        # Create DLQ
        try:
            response = await sqs.create_queue(
                QueueName=dlq_name,
                Attributes={
                    'MessageRetentionPeriod': '1209600'  # 14 days
                }
            )
            print(f"✓ Created {dlq_name}: {response['QueueUrl']}")
        except Exception as e:
            if "QueueAlreadyExists" in str(e) or "QueueAlreadyExists" in str(type(e)):
                print(f"✓ {dlq_name} already exists")
            else:
                print(f"⚠️  Could not create {dlq_name}: {e}")


async def main():
    """Initialize all Matrix integration infrastructure."""
    print("🚀 Initializing Matrix integration infrastructure...")
    
    # Get endpoint from environment
    endpoint_url = os.getenv("LOCALSTACK_ENDPOINT", os.getenv("AWS_ENDPOINT"))
    region = os.getenv("AWS_REGION", "us-east-1")
    
    # Create session
    session = aioboto3.Session()
    
    # Initialize DynamoDB tables
    if endpoint_url:
        # LocalStack
        async with session.resource(
            'dynamodb',
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id='test',
            aws_secret_access_key='test'
        ) as dynamodb:
            await create_dynamodb_tables(dynamodb)
    else:
        # Real AWS
        async with session.resource('dynamodb', region_name=region) as dynamodb:
            await create_dynamodb_tables(dynamodb)
            
    # Initialize SQS queues
    if endpoint_url:
        # LocalStack
        async with session.client(
            'sqs',
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id='test',
            aws_secret_access_key='test'
        ) as sqs:
            await create_sqs_queues(sqs)
    else:
        # Real AWS
        async with session.client('sqs', region_name=region) as sqs:
            await create_sqs_queues(sqs)
            
    print("\n✅ Matrix infrastructure initialization complete!")
    
    # Print connection info
    if endpoint_url:
        print(f"\nLocalStack endpoint: {endpoint_url}")
        print(f"Prompt queue URL: {endpoint_url}/000000000000/prompt-queue")
        print(f"DLQ URL: {endpoint_url}/000000000000/prompt-queue-dlq")
    else:
        print("\nUsing real AWS infrastructure")


if __name__ == "__main__":
    asyncio.run(main())
