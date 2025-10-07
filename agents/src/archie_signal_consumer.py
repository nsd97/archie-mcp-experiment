"""Archie Signal Queue consumer.

Processes completion signals from Lauren and invokes Archie to inform users.

Following SDK patterns from external/openai-agents-python/docs/running_agents.md
"""

import os
import sys
import json
import asyncio
import traceback
from datetime import datetime
from typing import Dict, Any

sys.path.insert(0, "/app/external/openai-agents-python/src")

import aioboto3
import httpx
from agents import Runner

from .agents.archie_with_mcp import create_archie_with_mcp
from .context import AgentContext
from .observability.hooks import RunObservabilityHooks
from .matrix_adapter import create_matrix_adapter
from .logging_config import get_logger

logger = get_logger(__name__)


class ArchieSignalConsumer:
    """Consumer for processing Lauren's completion signals."""
    
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
        
        # Concurrency control
        self.max_concurrent = 3
        self.semaphore = asyncio.Semaphore(self.max_concurrent)
        
    async def start(self):
        """Start consuming signals from Lauren."""
        print(f"🚀 Starting Archie Signal Queue consumer")
        print(f"   Queue: {self.queue_url}")
        print(f"   DLQ: {self.dlq_url}")
        logger.info(
            "Archie signal consumer starting",
            extra={
                "queue_url": self.queue_url,
                "dlq_url": self.dlq_url,
                "max_concurrent": self.max_concurrent,
            },
        )
        
        # Initialize Matrix adapter for sending responses
        try:
            self.matrix_adapter = await create_matrix_adapter()
            print(f"✓ Matrix adapter initialized")
            logger.info("Matrix adapter initialized for Archie signal consumer")
        except Exception as e:
            print(f"⚠️  Matrix adapter not available: {e}")
            logger.warning("Matrix adapter not available: %s", e)
            # Continue anyway - Archie can still process signals
        
        while True:
            try:
                await self._poll_and_process()
            except KeyboardInterrupt:
                print("\n👋 Shutting down Archie signal consumer")
                logger.info("Archie signal consumer received shutdown signal")
                break
            except Exception as e:
                print(f"❌ Consumer error: {e}")
                logger.exception("Archie signal consumer loop error: %s", e)
                await asyncio.sleep(5)
                
    async def _poll_and_process(self):
        """Poll SQS and process signals."""
        # Receive messages from SQS
        response = await self.sqs_client.receive_message(
            QueueUrl=self.queue_url,
            MaxNumberOfMessages=10,
            WaitTimeSeconds=20,  # Long polling
            VisibilityTimeout=60,  # 1 minute (signals are fast)
            MessageAttributeNames=['All']
        )
        
        messages = response.get('Messages', [])
        if not messages:
            return
            
        print(f"📥 Archie received {len(messages)} signals from Lauren")
        logger.debug("Received signals", extra={"count": len(messages)})
        
        # Process signals
        tasks = []
        for message in messages:
            task = asyncio.create_task(self._process_signal(message))
            tasks.append(task)
            
        # Wait for all to complete
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Delete successfully processed messages
        for i, (message, result) in enumerate(zip(messages, results)):
            if not isinstance(result, Exception):
                await self._delete_message(message)
                logger.debug("Deleted processed signal", extra={"message_id": message.get('MessageId')})
            else:
                print(f"⚠️  Failed to process signal: {result}")
                logger.warning(
                    "Signal processing failed",
                    extra={
                        "message_id": message.get('MessageId'),
                        "error": str(result),
                    },
                )
                
    async def _process_signal(self, sqs_message: Dict[str, Any]):
        """Process a single signal from Lauren."""
        async with self.semaphore:
            try:
                # Parse signal
                body = json.loads(sqs_message['Body'])
                
                correlation_id = body.get("correlation_id")
                kind = body.get("kind")  # created, skipped, error
                task_id = body.get("task_id")
                task_name = body.get("task_name")
                listing_id = body.get("listing_id")
                details = body.get("details", {})
                room_id = body.get("room_id")
                thread_id = body.get("thread_id")
                
                print(f"📬 Signal from Lauren: {kind} - {correlation_id}")
                logger.info(
                    "Processing signal",
                    extra={
                        "correlation_id": correlation_id,
                        "kind": kind,
                        "task_id": task_id,
                    },
                )
                
                # Check for duplicate
                signal_id = f"signal-{correlation_id}-{kind}"
                if await self._is_duplicate(signal_id):
                    print(f"⏭️  Skipping duplicate signal {signal_id}")
                    logger.info("Duplicate signal skipped", extra={"signal_id": signal_id})
                    return True
                    
                # Invoke Archie to decide response
                await self._invoke_archie_for_signal(body)
                
                # Mark as processed
                await self._mark_processed(signal_id)
                logger.info("Signal processed", extra={"signal_id": signal_id})
                return True
                
            except Exception as e:
                print(f"❌ Error processing signal: {e}")
                traceback.print_exc()
                logger.exception("Error processing signal: %s", e)
                
                # Check DLQ threshold
                receive_count = int(sqs_message.get('Attributes', {}).get('ApproximateReceiveCount', 0))
                if receive_count >= 5:
                    await self._send_to_dlq(sqs_message, str(e))
                    logger.error(
                        "Signal sent to DLQ",
                        extra={
                            "signal_id": signal_id,
                            "receive_count": receive_count,
                        },
                    )
                    
                raise
                
    async def _invoke_archie_for_signal(self, signal: Dict[str, Any]):
        """Invoke Archie to process Lauren's signal and respond to user.
        
        Following SDK pattern: Runner.run with structured input.
        """
        # Create HTTP client
        backend_client = httpx.AsyncClient(
            base_url=self.backend_url,
            timeout=30.0
        )
        logger.debug(
            "Created backend client for Archie signal",
            extra={"base_url": self.backend_url},
        )
        
        # Build context
        context = AgentContext(
            user_id=signal.get("sender", "system"),
            room_id=signal.get("room_id", ""),
            thread_id=signal.get("thread_id"),
            correlation_id=signal.get("correlation_id", ""),
            db_session=self.db_session,
            backend_client=backend_client,
            matrix_client=self.matrix_adapter
        )
        
        # Build input for Archie based on signal type
        kind = signal.get("kind")
        details = signal.get("details", {})
        
        if kind == "created":
            archie_input = f"""Lauren has created a task:
- Task ID: {signal.get('task_id')}
- Task Name: {signal.get('task_name')}
- Listing: {signal.get('listing_id', 'N/A')}
- Status: OPEN (waiting for admin to claim)

Inform the user that their request has been processed and the task is now
in the admin queue. Be friendly and concise."""

        elif kind == "skipped":
            archie_input = f"""Lauren skipped creating a task:
- Reason: {details.get('message', 'Not a valid admin task')}

Politely explain to the user why the task wasn't created."""

        elif kind == "error":
            archie_input = f"""Lauren encountered an error:
- Error: {details.get('message', 'Unknown error')}

Apologize to the user and suggest they try again or contact support."""

        else:
            archie_input = f"Lauren sent an unknown signal type: {kind}"
            
        # Create Archie with MCP server
        archie_agent, matrix_mcp_server = await create_archie_with_mcp()
        
        try:
            # Use the MCP server context
            async with matrix_mcp_server:
                # Run Archie with the signal context
                result = await Runner.run(
                    archie_agent,
                    archie_input,
                    context=context,
                    hooks=RunObservabilityHooks(),
                    max_turns=3  # Should be quick - just formulate response
                )
                
                print(f"✅ Archie responded to signal: {result.final_output[:100]}...")
                logger.info(
                    "Archie responded to signal",
                    extra={
                        "correlation_id": context.correlation_id,
                        "kind": kind,
                        "result_preview": str(result.final_output)[:256],
                    },
                )
                
                # Archie should have used Matrix MCP tools
                # No need to do anything else
            
        finally:
            await backend_client.aclose()
            logger.debug("Closed backend client for Archie signal handling")
            
    async def _is_duplicate(self, signal_id: str) -> bool:
        """Check if we've already processed this signal."""
        async with self.db_session as db:
            table = await db.Table(self.processed_table)
            try:
                response = await table.get_item(Key={"event_id": signal_id})
                return "Item" in response
            except Exception:
                return False
                
    async def _mark_processed(self, signal_id: str):
        """Mark a signal as processed."""
        async with self.db_session as db:
            table = await db.Table(self.processed_table)
            await table.put_item(
                Item={
                    "event_id": signal_id,
                    "processed_at": datetime.utcnow().isoformat() + "Z",
                    "processor": "archie-signal"
                }
            )
            
    async def _delete_message(self, message: Dict[str, Any]):
        """Delete a signal from SQS after successful processing."""
        await self.sqs_client.delete_message(
            QueueUrl=self.queue_url,
            ReceiptHandle=message['ReceiptHandle']
        )
        print(f"🗑️  Deleted processed signal from Archie Signal Queue")
        
    async def _send_to_dlq(self, message: Dict[str, Any], error: str):
        """Send a poison signal to the DLQ."""
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


# Standalone worker for local development
async def run_worker():
    """Run the Archie Signal Queue consumer."""
    print("📡 Starting Archie Signal Queue Consumer...")
    
    # Get configuration
    endpoint_url = os.getenv("LOCALSTACK_ENDPOINT", "http://localhost:4566")
    region = os.getenv("AWS_REGION", "us-east-1")
    queue_url = os.getenv("ARCHIE_SIGNAL_QUEUE_URL", f"{endpoint_url}/000000000000/archie-signal-queue")
    dlq_url = os.getenv("ARCHIE_SIGNAL_QUEUE_DLQ_URL", f"{endpoint_url}/000000000000/archie-signal-queue-dlq")
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
    consumer = ArchieSignalConsumer(
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
