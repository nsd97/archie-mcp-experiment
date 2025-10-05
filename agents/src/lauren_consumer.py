"""Lauren Work Queue consumer.

Processes admin task intents from Archie and invokes Lauren to classify+create tasks.

Following SDK patterns from external/openai-agents-python/docs/running_agents.md
"""

import os
import sys
import json
import asyncio
import traceback
from datetime import datetime

sys.path.insert(0, "/app/external/openai-agents-python/src")

import aioboto3
import httpx
from agents import Runner

from .agents.lauren import lauren_agent
from .context import AgentContext
from .observability.hooks import RunObservabilityHooks


class LaurenWorkConsumer:
    """Consumer for processing Archie's admin task requests."""
    
    def __init__(
        self,
        queue_url: str,
        dlq_url: str,
        db_session: Any,
        sqs_client: Any,
        backend_url: str = "http://localhost:3000"
    ):
        self.queue_url = queue_url
        self.dlq_url = dlq_url
        self.db_session = db_session
        self.sqs_client = sqs_client
        self.backend_url = backend_url
        self.processed_table = os.getenv("PROCESSED_EVENTS_TABLE", "processed_events")
        
        # Concurrency control
        self.max_concurrent = 5  # Lauren can process multiple tasks in parallel
        self.semaphore = asyncio.Semaphore(self.max_concurrent)
        
    async def start(self):
        """Start consuming messages from Lauren Work Queue."""
        print(f"🚀 Starting Lauren Work Queue consumer")
        print(f"   Queue: {self.queue_url}")
        print(f"   DLQ: {self.dlq_url}")
        print(f"   Concurrency: {self.max_concurrent}")
        
        while True:
            try:
                await self._poll_and_process()
            except KeyboardInterrupt:
                print("\n👋 Shutting down Lauren consumer")
                break
            except Exception as e:
                print(f"❌ Consumer error: {e}")
                traceback.print_exc()
                await asyncio.sleep(5)  # Back off on errors
                
    async def _poll_and_process(self):
        """Poll SQS and process work messages."""
        # Receive messages from SQS
        response = await self.sqs_client.receive_message(
            QueueUrl=self.queue_url,
            MaxNumberOfMessages=10,
            WaitTimeSeconds=20,  # Long polling
            VisibilityTimeout=300,  # 5 minutes to process
            MessageAttributeNames=['All']
        )
        
        messages = response.get('Messages', [])
        if not messages:
            return
            
        print(f"📥 Lauren received {len(messages)} work items")
        
        # Process messages with concurrency control
        tasks = []
        for message in messages:
            task = asyncio.create_task(self._process_work_item(message))
            tasks.append(task)
            
        # Wait for all to complete
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Delete successfully processed messages
        for i, (message, result) in enumerate(zip(messages, results)):
            if not isinstance(result, Exception):
                await self._delete_message(message)
            else:
                print(f"⚠️  Failed to process message: {result}")
                # Message will return to queue after visibility timeout
                
    async def _process_work_item(self, sqs_message: Dict[str, Any]):
        """Process a single work item."""
        async with self.semaphore:  # Limit concurrency
            try:
                # Parse message body
                body = json.loads(sqs_message['Body'])
                
                # Extract work details
                correlation_id = body.get("correlation_id")
                raw_text = body.get("raw_text")
                room_id = body.get("room_id")
                thread_id = body.get("thread_id")
                sender = body.get("sender")
                
                # Check for duplicate processing
                if await self._is_duplicate(correlation_id):
                    print(f"⏭️  Skipping duplicate {correlation_id}")
                    return True
                    
                print(f"🤖 Lauren processing: {raw_text[:50]}...")
                
                # Invoke Lauren agent
                await self._invoke_lauren(body)
                
                # Mark as processed
                await self._mark_processed(correlation_id)
                return True
                
            except Exception as e:
                print(f"❌ Error processing work item: {e}")
                traceback.print_exc()
                
                # Check if we should send to DLQ
                receive_count = int(sqs_message.get('Attributes', {}).get('ApproximateReceiveCount', 0))
                if receive_count >= 5:
                    await self._send_to_dlq(sqs_message, str(e))
                    
                raise
                
    async def _invoke_lauren(self, work_message: Dict[str, Any]):
        """Invoke Lauren agent with the work item.
        
        Following SDK pattern: Runner.run with context injection.
        """
        # Create HTTP client for this invocation
        backend_client = httpx.AsyncClient(
            base_url=self.backend_url,
            timeout=30.0
        )
        
        # Build agent context
        context = AgentContext(
            user_id=work_message.get("sender", "unknown"),
            room_id=work_message.get("room_id", ""),
            thread_id=work_message.get("thread_id"),
            correlation_id=work_message.get("correlation_id", ""),
            db_session=self.db_session,
            backend_client=backend_client
        )
        
        # Build input for Lauren (structured prompt)
        lauren_input = f"""New admin task request:

User said: "{work_message.get('raw_text')}"

Context:
- Listing hint: {work_message.get('listing_hint', 'None')}
- Priority hint: {work_message.get('priority_hint', 'None')}
- Due hint: {work_message.get('due_hint', 'None')}
- Admin channel: {work_message.get('admin_channel', 'ops')}

Classify this request and create an OPEN/UNCLAIMED task for the admin team."""
        
        try:
            # Run Lauren with observability hooks
            result = await Runner.run(
                lauren_agent,
                lauren_input,
                context=context,
                hooks=RunObservabilityHooks(),
                max_turns=5  # Limit turns for safety
            )
            
            print(f"✅ Lauren completed: {result.final_output}")
            
            # Lauren's tools will have called notify_archie_signal
            # No need to do anything else here
            
        finally:
            await backend_client.aclose()
            
    async def _is_duplicate(self, correlation_id: str) -> bool:
        """Check if we've already processed this work item."""
        async with self.db_session as db:
            table = await db.Table(self.processed_table)
            try:
                response = await table.get_item(Key={"event_id": correlation_id})
                return "Item" in response
            except Exception:
                return False
                
    async def _mark_processed(self, correlation_id: str):
        """Mark a work item as processed."""
        async with self.db_session as db:
            table = await db.Table(self.processed_table)
            await table.put_item(
                Item={
                    "event_id": correlation_id,
                    "processed_at": datetime.utcnow().isoformat() + "Z",
                    "processor": "lauren"
                }
            )
            
    async def _delete_message(self, message: Dict[str, Any]):
        """Delete a message from SQS after successful processing."""
        await self.sqs_client.delete_message(
            QueueUrl=self.queue_url,
            ReceiptHandle=message['ReceiptHandle']
        )
        print(f"🗑️  Deleted processed message from Lauren Work Queue")
        
    async def _send_to_dlq(self, message: Dict[str, Any], error: str):
        """Send a poison message to the DLQ."""
        await self.sqs_client.send_message(
            QueueUrl=self.dlq_url,
            MessageBody=message['Body'],
            MessageAttributes={
                'OriginalMessageId': {
                    'StringValue': message['MessageId'],
                    'DataType': 'String'
                },
                'Error': {
                    'StringValue': error[:256],
                    'DataType': 'String'
                },
                'FailedAt': {
                    'StringValue': datetime.utcnow().isoformat(),
                    'DataType': 'String'
                }
            }
        )
        print(f"⚠️  Sent poison message to DLQ")


# Standalone worker for local development
async def run_worker():
    """Run the Lauren Work Queue consumer."""
    print("🎯 Starting Lauren Work Queue Consumer...")
    
    # Get configuration
    endpoint_url = os.getenv("LOCALSTACK_ENDPOINT", "http://localhost:4566")
    region = os.getenv("AWS_REGION", "us-east-1")
    queue_url = os.getenv("LAUREN_WORK_QUEUE_URL", f"{endpoint_url}/000000000000/lauren-work-queue")
    dlq_url = os.getenv("LAUREN_WORK_QUEUE_DLQ_URL", f"{endpoint_url}/000000000000/lauren-work-queue-dlq")
    backend_url = os.getenv("BACKEND_URL", "http://localhost:3000")
    
    # Create session
    session = aioboto3.Session()
    
    db_session = session.resource(
        "dynamodb",
        endpoint_url=endpoint_url,
        region_name=region,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
    )
    
    sqs_client = await session.client(
        "sqs",
        endpoint_url=endpoint_url,
        region_name=region,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
    ).__aenter__()
    
    # Create and start consumer
    consumer = LaurenWorkConsumer(
        queue_url=queue_url,
        dlq_url=dlq_url,
        db_session=db_session,
        sqs_client=sqs_client,
        backend_url=backend_url
    )
    
    await consumer.start()


if __name__ == "__main__":
    # Run as standalone worker
    asyncio.run(run_worker())
