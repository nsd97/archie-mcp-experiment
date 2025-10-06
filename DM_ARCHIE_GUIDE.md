# How to Direct Message Archie

## Quick Start

1. **In Element:**
   - Click on "People" in the left sidebar
   - Click the "+" to start a new direct chat
   - Search for: `@archie:localhost`
   - Click on Archie
   - Start chatting!

2. **Test Messages to Send:**
   - "Hi Archie, can you check my task status?"
   - "What tasks are open?"
   - "Show me tasks for listing-123"
   - "Book photos for 123 Main Street" (admin task)

## What's Happening Behind the Scenes

1. **DM Listener** (running) - Watches for your messages to Archie
2. **Queue** - Your message goes to the prompt queue
3. **Archie** - Processes your message and uses MCP to respond
4. **Matrix** - Response appears in your DM

## Check if It's Working

Watch the logs:
```bash
# See if DM listener is receiving messages
docker logs --tail=20 archieos-agent-service | grep -E "📨|DM from"

# See if Archie is processing
docker logs --tail=20 archieos-queue-consumer | grep -E "Processing|Agent completed"

# See MCP server activity
docker logs --tail=20 archieos-matrix-mcp-server
```

## Troubleshooting

If you don't see responses:

1. **Make sure Archie accepted your DM invite**
   - The DM listener auto-accepts invites
   - You should see "Joined room" in the logs

2. **Send a test message directly to queue:**
   ```bash
   cd "/Users/noahdeskin/ArchieOS Backend.worktrees/Noahs-agetnic-experiment"
   python3 -c "
import boto3
import json
from datetime import datetime
sqs = boto3.client('sqs', endpoint_url='http://localhost:4566', region_name='us-east-1')
sqs.send_message(
    QueueUrl='http://localhost:4566/000000000000/prompt-queue.fifo',
    MessageBody=json.dumps({
        'type': 'matrix_message',
        'correlation_id': 'test-dm',
        'room_id': '!YOUR_DM_ROOM_ID:localhost',  # Replace with your DM room ID
        'sender': '@you:localhost',
        'content': 'Hi Archie, test message',
        'thread_id': None,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'retries': 0
    }),
    MessageGroupId='test-dm'
)
print('Test message sent!')
"
   ```

## Current Status

- ✅ DM Listener is running
- ✅ Queue processing works
- ✅ Archie responds with task info
- ⚠️ MCP server connection (responses may not appear yet)

The system is designed to work! If you're not seeing responses in Element yet, check the logs to confirm Archie is processing your messages.
