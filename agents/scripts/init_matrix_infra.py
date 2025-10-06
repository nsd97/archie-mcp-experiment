"""
Initialize infrastructure for Matrix (chat) integration — explained in plain English.

WHAT THIS SCRIPT DOES (big picture)
-----------------------------------
This script sets up two kinds of resources your chatbot/agent system needs:
  1) DynamoDB tables (NoSQL databases) to store message/event info.
  2) SQS queues (First-In-First-Out message queues) so different parts of the
     system can talk to each other reliably and in order.

It works in TWO MODES depending on your environment variables:
  • LocalStack mode (local emulator for AWS) — great for development on your laptop.
  • Real AWS mode — when you're deploying to an actual AWS account.

WHY WE NEED THESE THINGS
------------------------
• DynamoDB tables: keep track of chat events, which events we've already handled
  (so we don't double-process), and a correlation ID so we can match up
  messages across components.
• SQS queues: let services pass messages to each other without losing them and
  in the right order. They also have a “DLQ” (Dead Letter Queue) to park bad
  messages that failed multiple times so they don’t block everything else.

HOW TO RUN (quick start)
------------------------
Local development with LocalStack (recommended for testing):
    export LOCALSTACK_ENDPOINT=http://localhost:4566
    export SQS_ENDPOINT=http://localhost:4566
    export AWS_REGION=us-east-1
    export AWS_ACCESS_KEY_ID=test    # LocalStack accepts dummy creds
    export AWS_SECRET_ACCESS_KEY=test
    python agents/scripts/init_matrix_infra.py

If you DON'T set LOCALSTACK_ENDPOINT or SQS_ENDPOINT, the script will try to
use real AWS with your normal credentials (e.g., from AWS CLI or env vars).

READ THIS BEFORE EDITING
------------------------
This file is intentionally **idempotent** — you can run it as many times as you
want. If a table/queue already exists, it will simply say so and keep going.
This protects you from breaking things while iterating.
"""

import os
import sys
import asyncio
import json
import aioboto3
from botocore.exceptions import ClientError

# ---------------------------------------------------------------------------
# HIGH-LEVEL TOUR (for learners)
# ---------------------------------------------------------------------------
# • We define two helper functions:
#     1) create_dynamodb_tables(dynamodb)  → makes three DynamoDB tables.
#     2) create_sqs_queues(sqs)            → makes three FIFO queues and their DLQs.
# • Then we define main() which decides whether to connect to LocalStack or
#   real AWS, and calls those helpers.
# • At the bottom, `if __name__ == "__main__":` runs main() with asyncio.
# ---------------------------------------------------------------------------

async def create_dynamodb_tables(dynamodb):
    """Create (or confirm) the DynamoDB tables we need.

    Parameters
    ----------
    dynamodb : aioboto3.resource("dynamodb")
        An *already configured* DynamoDB resource. In LocalStack mode, this
        points at your local emulator. In real AWS mode, it points at AWS.

    What gets created
    -----------------
    1) matrix_events
       • Primary (partition) key: room_id  (string)
       • Sort (range) key:       event_id (string)
       Why: lets us store multiple events per Matrix room in time/order.

    2) processed_events
       • Primary key: event_id (string)
       Why: we log which events we already processed so we don't do them twice.

    3) agent_message_correlation
       • Primary key: correlation_id (string)
       Why: lets different services match messages that belong together.

    Notes
    -----
    • This function is **idempotent**. If a table already exists, we print a
      friendly message and move on. That way re-running the script is safe.
    """

    # --- TABLE 1: matrix_events ------------------------------------------------
    # Try to create the table; if it already exists, catch the AWS error and
    # keep going. PAY_PER_REQUEST means you don't have to pre-provision capacity.
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
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceInUseException':
            print("✓ matrix_events table already exists")
        else:
            raise

    # --------------------------------------------------------------------------
    # If we reach this point, either the table was created successfully or it
    # already existed. Now we repeat the same pattern for the next tables.
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
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceInUseException':
            print("✓ processed_events table already exists")
        else:
            raise

    # --------------------------------------------------------------------------
    # TABLE 3: agent_message_correlation
    # Stores a correlation_id so different components can match related
    # messages. Same idempotent create-or-already-exists behavior.
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
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceInUseException':
            print("✓ agent_message_correlation table already exists")
        else:
            raise


async def create_sqs_queues(sqs):
    """Create (or confirm) SQS FIFO queues used for agent communication.

    Parameters
    ----------
    sqs : aioboto3.client("sqs")
        An *already configured* SQS client (LocalStack or AWS).

    What gets created (pairs of main queue + DLQ)
    --------------------------------------------
    • prompt-queue.fifo           ↔ prompt-queue-dlq.fifo
      Purpose: Matrix → Archie (incoming prompts/messages)

    • lauren-work-queue.fifo      ↔ lauren-work-queue-dlq.fifo
      Purpose: Archie → Lauren (classification/work items)

    • archie-signal-queue.fifo    ↔ archie-signal-queue-dlq.fifo
      Purpose: Lauren → Archie (signals back to the router)

    Why FIFO and DLQ?
    -----------------
    • FIFO guarantees **ordering** and **exactly-once per content** (with
      ContentBasedDeduplication).
    • DLQ (Dead Letter Queue) catches messages that fail too many times so they
      don't block the main queue. We link them with a RedrivePolicy.

    Notes
    -----
    • Long polling (ReceiveMessageWaitTimeSeconds=20) reduces empty receives.
    • VisibilityTimeout=300 gives consumers 5 minutes to process a message
      before it becomes visible again.
    • The function is **idempotent** and safe to re-run.
    """

    # We'll build each queue in two steps:
    #   1) Create the DLQ first and read its ARN.
    #   2) Create the main FIFO queue and attach a RedrivePolicy pointing at the DLQ.

    queues_to_create = [
        ('prompt-queue.fifo', 'prompt-queue-dlq.fifo', "Prompt Queue (Matrix → Archie)"),
        ('lauren-work-queue.fifo', 'lauren-work-queue-dlq.fifo', "Lauren Work Queue (Archie → Lauren)"),
        ('archie-signal-queue.fifo', 'archie-signal-queue-dlq.fifo', "Archie Signal Queue (Lauren → Archie)")
    ]

    for queue_name, dlq_name, description in queues_to_create:
        # Step 1: Ensure the DLQ exists. We also enable FIFO + content-based
        # deduplication so duplicate payloads are auto-deduped within 5 minutes.
        dlq_url = None
        dlq_arn = None
        try:
            response = await sqs.create_queue(
                QueueName=dlq_name,
                Attributes={
                    'MessageRetentionPeriod': '1209600',  # 14 days
                    'FifoQueue': 'true',
                    'ContentBasedDeduplication': 'true'
                }
            )
            dlq_url = response['QueueUrl']
            print(f"✓ Created {dlq_name}: {dlq_url}")
        except ClientError as e:
            if e.response['Error']['Code'] == 'QueueAlreadyExists':
                print(f"✓ {dlq_name} already exists")
                try:
                    get_url_resp = await sqs.get_queue_url(QueueName=dlq_name)
                    dlq_url = get_url_resp['QueueUrl']
                except ClientError as e2:
                    print(f"⚠️  Could not retrieve URL for {dlq_name}: {e2}")
            else:
                print(f"⚠️  Could not create {dlq_name}: {e}")
        # We need the DLQ's ARN in order to link it via RedrivePolicy later.
        if dlq_url:
            try:
                attrs = await sqs.get_queue_attributes(QueueUrl=dlq_url, AttributeNames=['QueueArn'])
                dlq_arn = attrs.get('Attributes', {}).get('QueueArn')
                if not dlq_arn:
                    print(f"⚠️  Missing ARN for {dlq_name}")
            except ClientError as e:
                print(f"⚠️  Could not get attributes for {dlq_name}: {e}")
        else:
            print(f"⚠️  Skipping RedrivePolicy for {queue_name} because DLQ URL could not be determined")

        redrive_policy = None
        if dlq_arn:
            redrive_policy = json.dumps({
                'deadLetterTargetArn': dlq_arn,
                'maxReceiveCount': '3'
            })

        # Step 2: Create the main FIFO queue. If we already know the DLQ ARN,
        # include a RedrivePolicy so failed messages move there after retries.
        main_queue_url = None
        try:
            create_attrs = {
                'MessageRetentionPeriod': '1209600',  # 14 days
                'VisibilityTimeout': '300',  # 5 minutes
                'ReceiveMessageWaitTimeSeconds': '20',  # Long polling
                'FifoQueue': 'true',
                'ContentBasedDeduplication': 'true'
            }
            if redrive_policy:
                create_attrs['RedrivePolicy'] = redrive_policy
            response = await sqs.create_queue(
                QueueName=queue_name,
                Attributes=create_attrs
            )
            main_queue_url = response['QueueUrl']
            print(f"✓ Created {queue_name}: {main_queue_url}")
        except ClientError as e:
            if e.response['Error']['Code'] == 'QueueAlreadyExists':
                print(f"✓ {queue_name} already exists")
                try:
                    get_url_resp = await sqs.get_queue_url(QueueName=queue_name)
                    main_queue_url = get_url_resp['QueueUrl']
                except ClientError as e2:
                    print(f"⚠️  Could not retrieve URL for {queue_name}: {e2}")
            else:
                print(f"⚠️  Could not create {queue_name}: {e}")

        # Ensure RedrivePolicy is applied for existing queues
        if main_queue_url and redrive_policy:
            try:
                await sqs.set_queue_attributes(
                    QueueUrl=main_queue_url,
                    Attributes={'RedrivePolicy': redrive_policy}
                )
                print(f"✓ Linked {queue_name} → DLQ {dlq_name} via RedrivePolicy")
            except ClientError as e:
                print(f"⚠️  Could not set RedrivePolicy for {queue_name}: {e}")


async def main():
    """Set everything up, choosing LocalStack or real AWS automatically.

    Steps (in order):
    1) Print a banner so it's obvious what's happening.
    2) Read environment variables to figure out where to connect:
       • LOCALSTACK_ENDPOINT / AWS_ENDPOINT → use LocalStack if set.
       • SQS_ENDPOINT                       → allows SQS to have its own URL.
       • AWS_REGION                          → defaults to "us-east-1".
    3) Create an aioboto3 Session (async-friendly AWS SDK).
    4) Create/confirm DynamoDB tables.
    5) Create/confirm SQS queues (and link them to their DLQs).
    6) Print human-friendly connection info at the end.

    Safety: Everything is idempotent — safe to run repeatedly.
    """
    print("🚀 Initializing Matrix integration infrastructure...")

    # Get endpoint from environment
    endpoint_url = os.getenv("LOCALSTACK_ENDPOINT", os.getenv("AWS_ENDPOINT"))
    sqs_endpoint = os.getenv("SQS_ENDPOINT", endpoint_url)
    region = os.getenv("AWS_REGION", "us-east-1")

    # If endpoint_url (or SQS_ENDPOINT) is set, we're in LocalStack mode.
    # Otherwise, we use real AWS with your configured credentials.

    # Create session
    session = aioboto3.Session()

    # --- Create/confirm DynamoDB tables --------------------------------------
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

    # --- Create/confirm SQS queues -------------------------------------------
    if sqs_endpoint:
        # LocalStack
        async with session.client(
            'sqs',
            endpoint_url=sqs_endpoint,
            region_name=region,
            aws_access_key_id='test',
            aws_secret_access_key='test'
        ) as sqs:
            await create_sqs_queues(sqs)
    else:
        # Real AWS
        async with session.client('sqs', region_name=region) as sqs:
            await create_sqs_queues(sqs)

    # --- Show the user what we connected to ----------------------------------
    print("\n✅ Matrix infrastructure initialization complete!")

    if endpoint_url:
        print(f"\nLocalStack endpoint: {endpoint_url}")
        print(f"Prompt queue URL: {endpoint_url}/000000000000/prompt-queue")
        print(f"DLQ URL: {endpoint_url}/000000000000/prompt-queue-dlq")
    else:
        print("\nUsing real AWS infrastructure")


# ----------------------------------------------------------------------------
# Python convention: only run main() when this file is executed directly.
# If someone `imports` this module from another script, the code below will
# NOT run. This makes the file reusable as a library.
# ----------------------------------------------------------------------------
if __name__ == "__main__":
    asyncio.run(main())
