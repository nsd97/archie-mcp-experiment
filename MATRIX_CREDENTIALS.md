# Matrix (Element) Credentials

## Homeserver URL
```
http://localhost:8008
```

## Archie Bot Account
- **Username**: `archie`
- **Password**: `archie-password`
- **Full User ID**: `@archie:localhost`
- **Access Token**: `syt_YXJjaGll_gmulrSbJJjEIKXscSQCX_09kKXY`

## Human User Account
You need to create your own user account to interact with Archie:

### Option 1: Element Web (Recommended)
1. Open Element web client: https://app.element.io
2. Click "Sign In" 
3. Click "Edit" next to the homeserver
4. Enter homeserver URL: `http://localhost:8008`
5. Click "Continue"
6. Click "Create Account"
7. Choose a username (e.g., `testuser`)
8. Choose a password
9. Complete registration

### Option 2: Command Line
```bash
curl -X POST http://localhost:8008/_matrix/client/r0/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "your-secure-password",
    "auth": {"type": "m.login.dummy"}
  }'
```

**Note**: Registration is now enabled on the homeserver!

## Room Information
- **Archie Support Room ID**: `!hhfJmqVMIVFwNvVynl:localhost`
- **Room Name**: "Archie Support"

## Connecting to Archie
1. After logging in to Element, join the Archie Support room:
   - Click the "+" next to "Rooms"
   - Select "Join a room"
   - Enter: `!hhfJmqVMIVFwNvVynl:localhost`
   - Click "Join"

2. Send a message to Archie:
   - Type your message in the room (e.g., "Hi Archie, how are my tasks?")
   - Press Enter to send

## Important Notes
- The Matrix access token is required for Archie to send messages back
- Make sure to add `MATRIX_ACCESS_TOKEN=syt_YXJjaGll_gmulrSbJJjEIKXscSQCX_09kKXY` to your .env file
- The homeserver must be running at `http://localhost:8008` for Element to connect
