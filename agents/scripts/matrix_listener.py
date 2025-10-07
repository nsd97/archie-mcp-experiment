"""Standalone Matrix listener for testing.

This script connects to Matrix and listens for messages,
forwarding them to the prompt queue for agent processing.
"""

import os
import sys
import asyncio

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.matrix_adapter import create_matrix_adapter


async def main():
    """Run the Matrix listener."""
    print("🎧 Starting Matrix listener...")
    print("=" * 60)
    
    # Check for required environment variables
    required_vars = [
        "MATRIX_HOMESERVER_URL",
        "MATRIX_ACCESS_TOKEN",
        "SQS_QUEUE_URL"
    ]
    
    print("📋 Checking environment variables:")
    for var in required_vars:
        value = os.getenv(var)
        if value:
            if var == "MATRIX_ACCESS_TOKEN":
                print(f"   ✅ {var}: {value[:10]}...")
            else:
                print(f"   ✅ {var}: {value}")
        else:
            print(f"   ❌ {var}: NOT SET")
    
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        print(f"\n❌ Missing required environment variables: {', '.join(missing)}")
        print("\nPlease set:")
        for var in missing:
            print(f"  export {var}=...")
        return
        
    try:
        # Create and connect adapter
        adapter = await create_matrix_adapter()
        
        print("\n✅ Connected to Matrix!")
        print(f"   Homeserver: {os.getenv('MATRIX_HOMESERVER_URL')}")
        print(f"   User: {adapter.user_id}")
        print(f"   Queue: {os.getenv('SQS_QUEUE_URL')}")
        
        # Optional: Join specific rooms
        rooms_to_join = os.getenv("MATRIX_ROOMS_TO_JOIN", "").split(",")
        for room_id in rooms_to_join:
            if room_id.strip():
                try:
                    await adapter.join_room(room_id.strip())
                except Exception as e:
                    print(f"⚠️  Could not join {room_id}: {e}")
                    
        print("\n📨 Listening for messages... (Ctrl+C to stop)")
        print("   Messages will be forwarded to the prompt queue")
        print("   Make sure the queue consumer is running to process them!")
        
        # Start listening
        await adapter.listen_for_messages()
        
    except KeyboardInterrupt:
        print("\n\n👋 Shutting down Matrix listener")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if 'adapter' in locals():
            await adapter.disconnect()


if __name__ == "__main__":
    print("=" * 50)
    print("ArchieOS Matrix Listener")
    print("=" * 50)
    
    asyncio.run(main())
