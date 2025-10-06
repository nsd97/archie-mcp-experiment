# Quick Start - Talk to Archie in Matrix

## Current Issue
The room `!hhfJmqVMIVFwNvVynl:localhost` might not be properly configured. Let's create a fresh setup.

## Step 1: Create Your User Account

1. Open Element: https://app.element.io
2. Click "Sign In"
3. Click "Edit" next to homeserver
4. Enter: `http://localhost:8008`
5. Click "Continue"
6. Click "Create Account"
7. Choose a username (e.g., `noah`)
8. Choose a password
9. Complete registration

## Step 2: Create a New Room with Archie

After logging in, run this command to create a new room:

```bash
# Get your access token first by logging in, then:
curl -X POST \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Archie Support","topic":"Talk to Archie","preset":"trusted_private_chat"}' \
  "http://localhost:8008/_matrix/client/r0/createRoom"
```

## Step 3: Send Test Message Directly

For now, let's test by sending a message directly to the queue:

```bash
cd "/Users/noahdeskin/ArchieOS Backend.worktrees/Noahs-agetnic-experiment"
python3 test_sqs_message.py
```

Then check the logs:
```bash
docker logs --tail=50 archieos-queue-consumer
```

## Known Issues Being Fixed:

1. **Matrix Listener**: Not automatically forwarding messages from Matrix to the queue
2. **MCP Server**: Connection issues preventing responses from going back to Matrix
3. **Room Discovery**: The existing room might not be properly joinable

## Workaround: Direct Queue Testing

While we fix the Matrix integration, you can test Archie by:
1. Sending messages directly to the queue (as shown above)
2. Watching the logs to see Archie's responses
3. The responses should eventually appear in Matrix once the MCP integration is fixed

## What's Working:
- ✅ Archie is processing messages
- ✅ Task status queries are working
- ✅ Backend is connected
- ✅ Queue processing is functional

## What Needs Fixing:
- ❌ Matrix → Queue message forwarding
- ❌ Queue → Matrix response delivery
- ❌ Room visibility/joining
