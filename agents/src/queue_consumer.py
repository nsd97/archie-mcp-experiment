"""Prompt queue consumer for processing Matrix messages.

This implements the queue consumer as specified in the plan:
- AWS Lambda handler for production
- Standalone worker for local development
- Shared database access
- Idempotency and ordering guarantees
"""

import os
import sys
import json
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime
import traceback

sys.path.insert(0, "/app/external/openai-agents-python/src")

import aioboto3
from agents import Runner, RunContextWrapper

import httpx
from .agents.archie_with_mcp import create_archie_with_mcp
from .context import AgentContext
from .matrix_adapter import PromptQueueMessage, create_matrix_adapter


class PromptQueueConsumer:
    """Consumer for processing prompts from the SQS queue."""
    
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
        self.matrix_adapter = None
        
        # Concurrency control (serialize Archie per Matrix room)
        self.max_concurrent_per_room = 1
        self.room_semaphores: Dict[str, asyncio.Semaphore] = {}
        
    async def start(self):
        """Start consuming messages from the queue."""
        print(f"🚀 Starting prompt queue consumer")
        print(f"   Queue: {self.queue_url}")
        print(f"   DLQ: {self.dlq_url}")

        # Skip Matrix adapter - Archie uses Matrix MCP for sending messages
        print("ℹ️  Skipping Matrix adapter (using Matrix MCP instead)")
        self.matrix_adapter = None
        
        print("🔄 Starting polling loop...")
        poll_count = 0
        while True:
            try:
                poll_count += 1
                print(f"\n🔄 Poll #{poll_count}")
                await self._poll_and_process()
            except KeyboardInterrupt:
                print("\n👋 Shutting down queue consumer")
                break
            except Exception as e:
                print(f"❌ Consumer error: {e}")
                import traceback
                traceback.print_exc()
                await asyncio.sleep(5)  # Back off on errors
                
    async def _poll_and_process(self):
        """Poll SQS and process messages."""
        print(f"\n🔍 Polling queue: {self.queue_url}")
        
        try:
            # Receive messages from SQS
            print(f"   Calling receive_message with:")
            print(f"     QueueUrl: {self.queue_url}")
            print(f"     WaitTimeSeconds: 20")
            print(f"     MaxNumberOfMessages: 10")
            
            response = await self.sqs_client.receive_message(
                QueueUrl=self.queue_url,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=20,  # Long polling
                VisibilityTimeout=300,  # 5 minutes to process
                MessageAttributeNames=['All'],
                AttributeNames=['All']  # Include message attributes for FIFO
            )
            
            messages = response.get('Messages', [])
            print(f"📊 Received response with {len(messages)} messages")
            
            if not messages:
                print("   No messages received (queue might be empty)")
                return
        except Exception as e:
            print(f"❌ Error receiving messages: {e}")
            raise
            
        print(f"📥 Received {len(messages)} messages")
        
        # Process messages with concurrency control
        tasks = []
        for message in messages:
            task = asyncio.create_task(self._process_message(message))
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
                
    async def _process_message(self, sqs_message: Dict[str, Any]):
        """Process a single message from the queue."""
        try:
            # Parse message body
            body = json.loads(sqs_message['Body'])
            prompt_msg = PromptQueueMessage(**body)
            
            # Check for duplicate processing
            if await self._is_duplicate(prompt_msg.correlation_id):
                print(f"⏭️  Skipping duplicate {prompt_msg.correlation_id}")
                return True
                
            # Get semaphore for room-level concurrency control
            room_id = prompt_msg.room_id
            if room_id not in self.room_semaphores:
                self.room_semaphores[room_id] = asyncio.Semaphore(
                    self.max_concurrent_per_room
                )

            async with self.room_semaphores[room_id]:
                print(f"🤖 Processing prompt from {prompt_msg.sender} in {room_id} (serialized)")
                await self._invoke_agent(prompt_msg)
                
            # Mark as processed
            await self._mark_processed(prompt_msg.correlation_id)
            return True
            
        except Exception as e:
            print(f"❌ Error processing message: {e}")
            traceback.print_exc()
            
            # Check if we should send to DLQ
            receive_count = int(sqs_message.get('Attributes', {}).get('ApproximateReceiveCount', 0))
            if receive_count >= 5:
                await self._send_to_dlq(sqs_message, str(e))
                
            raise
            
    async def _invoke_agent(self, prompt_msg: PromptQueueMessage):
        """Invoke Archie agent with the prompt."""
        # Create agent context
        backend_client = httpx.AsyncClient(
            base_url=self.backend_url,
            timeout=30.0
        )
        
        context = AgentContext(
            user_id=prompt_msg.sender,
            room_id=prompt_msg.room_id,
            thread_id=prompt_msg.thread_id,
            correlation_id=prompt_msg.correlation_id,
            db_session=self.db_session,
            backend_client=backend_client,
            matrix_client=self.matrix_adapter
        )

        try:
            archie_agent, matrix_mcp_server = await create_archie_with_mcp()

            print("🤖 Running Archie agent with MCP...")
            try:
                async with matrix_mcp_server:
                    # Add timeout to prevent hanging
                    result = await asyncio.wait_for(
                        Runner.run(
                            archie_agent,
                            prompt_msg.content,
                            context=context,
                            max_turns=3
                        ),
                        timeout=120.0  # 2 minute timeout
                    )

                print(f"✅ Agent completed: {result.final_output[:100]}...")
            except asyncio.TimeoutError:
                print(f"⏱️  Agent timed out after 120 seconds")
                raise Exception("Agent execution timed out")

            if self.matrix_adapter:
                await self.matrix_adapter.mark_event_processed(
                    prompt_msg.correlation_id
                )
        finally:
            await backend_client.aclose()

    async def _is_duplicate(self, event_id: str) -> bool:
        """Check if we've already processed this event."""
        table = await self.db_session.Table(self.processed_table)
        try:
            response = await table.get_item(Key={"event_id": event_id})
            return "Item" in response
        except Exception:
            return False
                
    async def _mark_processed(self, event_id: str):
        """Mark an event as processed."""
        # db_session is already the resource, not a context manager
        table = await self.db_session.Table(self.processed_table)
        await table.put_item(
            Item={
                "event_id": event_id,
                "processed_at": datetime.utcnow().isoformat() + "Z"
            }
        )
            
    async def _delete_message(self, message: Dict[str, Any]):
        """Delete a message from SQS after successful processing."""
        await self.sqs_client.delete_message(
            QueueUrl=self.queue_url,
            ReceiptHandle=message['ReceiptHandle']
        )
        
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
                    'StringValue': error[:256],  # Truncate long errors
                    'DataType': 'String'
                },
                'FailedAt': {
                    'StringValue': datetime.utcnow().isoformat(),
                    'DataType': 'String'
                }
            }
        )


# Lambda handler for AWS deployment
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler for SQS events.
    
    This is the entry point when deployed as a Lambda function.
    """
    import asyncio
    
    async def process_batch():
        # Initialize AWS clients
        session = aioboto3.Session()
        
        async with session.resource(
            "dynamodb",
            region_name=os.getenv("AWS_REGION", "us-east-1")
        ) as db_session, \
        session.client(
            "sqs",
            region_name=os.getenv("AWS_REGION", "us-east-1")
        ) as sqs_client:
            
            # Create consumer
            consumer = PromptQueueConsumer(
                queue_url=os.getenv("SQS_QUEUE_URL"),
                dlq_url=os.getenv("SQS_DLQ_URL"),
                db_session=db_session,
                sqs_client=sqs_client,
                backend_url=os.getenv("BACKEND_URL", "http://backend:3000")
            )
            
            # Process records from Lambda event
            failed_count = 0
            for record in event.get('Records', []):
                try:
                    # Lambda gives us the message directly
                    await consumer._process_message(record)
                except Exception as e:
                    print(f"Failed to process record: {e}")
                    failed_count += 1
                    
            return {
                'statusCode': 200 if failed_count == 0 else 500,
                'batchItemFailures': []  # TODO: Return specific failures
            }
            
    # Run the async handler
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    return loop.run_until_complete(process_batch())


# Standalone worker for local development
async def run_worker():
    """Run the queue consumer as a standalone worker."""
    # Initialize AWS clients
    session = aioboto3.Session()
    
    endpoint_url = os.getenv("LOCALSTACK_ENDPOINT", "http://localhost:4566")
    
    # Create the DB resource context manager
    db_resource = session.resource(
        "dynamodb",
        endpoint_url=endpoint_url,
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
    )
    
    # Enter the context to get the actual resource
    db_session = await db_resource.__aenter__()
    
    # Configure boto3 to reduce retries and show actual errors
    from botocore.config import Config
    
    config = Config(
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        retries={
            'max_attempts': 1,  # Reduce retries to see actual errors faster
            'mode': 'standard'
        }
    )
    
    sqs_client = await session.client(
        "sqs",
        endpoint_url=endpoint_url,
        config=config,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
    ).__aenter__()
    
    # Create and start consumer
    consumer = PromptQueueConsumer(
        queue_url=os.getenv("SQS_QUEUE_URL", f"{endpoint_url}/000000000000/prompt-queue"),
        dlq_url=os.getenv("SQS_DLQ_URL", f"{endpoint_url}/000000000000/prompt-queue-dlq"),
        db_session=db_session,
        sqs_client=sqs_client,
        backend_url=os.getenv("BACKEND_URL", "http://localhost:3000")
    )
    
    await consumer.start()


if __name__ == "__main__":
    # Run as standalone worker
    asyncio.run(run_worker())
