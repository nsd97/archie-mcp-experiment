"""Task classification and creation tools for Lauren agent.

Lauren's role: Classify admin task intents and create OPEN/UNCLAIMED tasks for human admins.
Humans claim and complete tasks via the frontend UI.

Following SDK patterns from external/openai-agents-python/docs/tools.md
"""

import sys
import json
from typing import Dict, Any, Optional
from datetime import datetime
import re

sys.path.insert(0, "/app/external/openai-agents-python/src")

from agents import function_tool, RunContextWrapper

from src.context import AgentContext, Task
from .queues import notify_archie_signal


@function_tool
async def classify_and_create_task(
    ctx: RunContextWrapper[AgentContext],
    raw_text: str,
    attachments: Optional[list[dict]] = None,
    listing_hint: Optional[str] = None,
    admin_channel: str = "ops",
    priority_hint: Optional[int] = None,
    due_hint: Optional[str] = None
) -> Task:
    """Classify an admin task intent and create an OPEN/UNCLAIMED task.
    
    This is Lauren's primary tool. She receives raw user intent from Archie,
    classifies it using legacy rules, and creates a task that appears in the
    frontend UI for human admins to claim and complete.
    
    Args:
        raw_text: The user's original request (e.g., "Book photos for 123 Main St")
        attachments: Optional file attachments from the user
        listing_hint: Address or listing ID hint
        admin_channel: "ops" or "marketing" (determines task visibility)
        priority_hint: Suggested priority 0-10 from Archie
        due_hint: Suggested due date string
        
    Returns:
        The created Task object (status=OPEN, claim_status=UNCLAIMED)
    """
    context = ctx.context
    
    # Step 1: Classify the raw text to determine task_def_id
    task_def_id, extracted_inputs = await _classify_admin_intent(
        context,
        raw_text,
        listing_hint,
        attachments
    )
    
    # Step 2: Determine listing_id if hint provided
    listing_id = None
    if listing_hint:
        listing_id = await _resolve_listing(context, listing_hint)
        
    # Step 3: Build task data
    task_data = {
        "listing_id": listing_id,
        "task_def_id": task_def_id,
        "name": _get_task_name_from_catalog(task_def_id),
        "inputs": extracted_inputs,
        "priority": priority_hint or 5,
        "status": "OPEN",  # Always OPEN for admin to claim
        "claim_status": "UNCLAIMED",  # Always UNCLAIMED
        "assigned_to": None,  # Never pre-assign
        "visibility_group": admin_channel,
        "is_stray": listing_id is None
    }
    
    if due_hint:
        task_data["due_date"] = _parse_due_date(due_hint)
        
    # Add provenance
    task_data["created_by"] = "agent:lauren"
    task_data["metadata"] = {
        "provenance": {
            "source": "matrix",
            "room_id": context.room_id,
            "thread_id": context.thread_id,
            "correlation_id": context.correlation_id
        },
        "agent_metadata": {
            "created_by_agent": "Lauren",
            "classified_from": raw_text[:100]
        }
    }
    
    # Step 4: Create task via backend API
    try:
        response = await context.backend_client.post(
            "/v1/operations/tasks",
            json=task_data
        )
        response.raise_for_status()
        
        result = response.json()
        task = Task.from_db(result["task"])
        
        print(f"✅ Lauren created task: {task.task_id} ({task.name}) - OPEN/UNCLAIMED")
        
        # Step 5: Signal Archie about successful creation
        await notify_archie_signal(
            ctx,
            kind="created",
            task_id=task.task_id,
            task_name=task.name,
            listing_id=listing_id,
            message=f"Created {task.name} task" + (f" for {listing_hint}" if listing_hint else ""),
            details={
                "task_def_id": task_def_id,
                "priority": task.priority,
                "status": "OPEN",
                "claim_status": "UNCLAIMED"
            }
        )
        
        return task
        
    except Exception as e:
        print(f"❌ Lauren failed to create task: {e}")
        
        # Signal error to Archie
        await notify_archie_signal(
            ctx,
            kind="error",
            message=f"Failed to create task: {str(e)}",
            details={"error": str(e), "raw_text": raw_text}
        )
        
        raise Exception(f"Failed to create task: {str(e)}")


@function_tool
async def create_task(
    ctx: RunContextWrapper[AgentContext],
    listing_id: Optional[str],
    task_def_id: str,
    inputs: Dict[str, Any],
    name: Optional[str] = None,
    description: Optional[str] = None,
    priority: int = 5,
    due_date: Optional[str] = None
) -> Task:
    """Direct task creation (when classification already done by Archie).
    
    Args:
        listing_id: The listing this task belongs to (None for stray tasks)
        task_def_id: Task definition ID from catalog (e.g., "SALE::BOOK_PHOTOS@v1")
        inputs: Task-specific inputs matching the catalog schema
        name: Optional override for task name
        description: Optional task description
        priority: Task priority 0-10 (default 5)
        due_date: Optional due date in ISO format
        
    Returns:
        The created Task object (always OPEN/UNCLAIMED)
    """
    context = ctx.context
    
    # Validate against task catalog
    catalog_valid = await _validate_task_catalog(context, task_def_id, inputs)
    if not catalog_valid:
        raise ValueError(f"Task inputs do not match catalog schema for {task_def_id}")
    
    # Prepare task data
    task_data = {
        "listing_id": listing_id,
        "task_def_id": task_def_id,
        "name": name or _get_task_name_from_catalog(task_def_id),
        "inputs": inputs,
        "priority": max(0, min(10, priority)),
        "status": "OPEN",
        "claim_status": "UNCLAIMED",
        "assigned_to": None,  # Never pre-assign
        "created_by": "agent:lauren",
        "is_stray": listing_id is None
    }
    
    if description:
        task_data["description"] = description
    if due_date:
        task_data["due_date"] = due_date
        
    # Add metadata
    task_data["metadata"] = {
        "provenance": {
            "source": "matrix",
            "room_id": context.room_id,
            "correlation_id": context.correlation_id
        },
        "agent_metadata": {
            "created_by_agent": "Lauren"
        }
    }
    
    try:
        # Create via backend API
        response = await context.backend_client.post(
            "/v1/operations/tasks",
            json=task_data
        )
        response.raise_for_status()
        
        result = response.json()
        task = Task.from_db(result["task"])
        
        print(f"✅ Lauren created task: {task.task_id} - OPEN/UNCLAIMED")
        
        # Signal Archie
        await notify_archie_signal(
            ctx,
            kind="created",
            task_id=task.task_id,
            task_name=task.name,
            listing_id=listing_id,
            message=f"Created {task.name}",
            details={"task_def_id": task_def_id}
        )
        
        return task
        
    except Exception as e:
        await notify_archie_signal(
            ctx,
            kind="error",
            message=f"Failed to create task: {str(e)}",
            details={"error": str(e)}
        )
        raise Exception(f"Failed to create task: {str(e)}")


# Helper functions for classification

async def _classify_admin_intent(
    context: AgentContext,
    raw_text: str,
    listing_hint: Optional[str],
    attachments: Optional[list]
) -> tuple[str, Dict[str, Any]]:
    """Classify admin intent using legacy rules.
    
    This reuses the logic from src/services/intakeClassifier.ts and llmClassifier.ts.
    For now, we'll use simple keyword matching. In production, call the backend
    classification endpoint or use the LLM classifier.
    
    Returns:
        (task_def_id, extracted_inputs)
    """
    text_lower = raw_text.lower()
    
    # Simple keyword-based classification (mirrors legacy rules)
    # In production, this would call backend /v1/operations/classify or use LLM
    
    if any(word in text_lower for word in ["photo", "photos", "photography", "picture"]):
        return ("SALE::BOOK_PHOTOS@v1", {
            "photographer_notes": raw_text,
            "preferred_time": "As soon as possible"
        })
        
    if any(word in text_lower for word in ["sign", "signage", "install sign"]):
        return ("SALE::INSTALL_SIGN@v1", {
            "sign_type": "For Sale",
            "location_notes": raw_text
        })
        
    if any(word in text_lower for word in ["mls", "listing", "post", "publish"]):
        return ("SALE::POST_TO_MLS@v1", {
            "listing_notes": raw_text
        })
        
    if any(word in text_lower for word in ["showing", "show", "open house"]):
        return ("SALE::SCHEDULE_SHOWING@v1", {
            "showing_notes": raw_text
        })
        
    # Fallback to generic admin task
    return ("ADMIN::GENERIC_TASK@v1", {
        "task_description": raw_text,
        "needs_review": True
    })


async def _resolve_listing(context: AgentContext, listing_hint: str) -> Optional[str]:
    """Resolve a listing from an address hint or ID.
    
    Args:
        listing_hint: Address string (e.g., "123 Main St") or listing ID
        
    Returns:
        listing_id or None if not found
    """
    # If it looks like a listing ID, return it
    if listing_hint.startswith("listing-") or listing_hint.startswith("01"):
        return listing_hint
        
    # Otherwise, search by address
    try:
        response = await context.backend_client.get(
            "/v1/operations/listings",
            params={"search": listing_hint, "limit": 1}
        )
        response.raise_for_status()
        
        listings = response.json().get("listings", [])
        if listings:
            return listings[0].get("listingId")
            
    except Exception as e:
        print(f"⚠️  Could not resolve listing '{listing_hint}': {e}")
        
    return None


def _get_task_name_from_catalog(task_def_id: str) -> str:
    """Get default task name from catalog ID.
    
    Args:
        task_def_id: Format is CATEGORY::TASK_NAME@version
        
    Returns:
        Human-friendly task name
    """
    parts = task_def_id.split("::")
    if len(parts) > 1:
        name_part = parts[1].split("@")[0]
        # Convert SNAKE_CASE to Title Case
        return " ".join(word.capitalize() for word in name_part.split("_"))
    return "Task"


def _parse_due_date(due_hint: str) -> str:
    """Parse a due date hint into ISO format.
    
    Args:
        due_hint: Natural language date (e.g., "next week", "2025-10-15")
        
    Returns:
        ISO format date string
    """
    # If already ISO format, return as-is
    if re.match(r'\d{4}-\d{2}-\d{2}', due_hint):
        return due_hint + "T00:00:00Z" if "T" not in due_hint else due_hint
        
    # Simple parsing for common phrases
    from datetime import timedelta
    now = datetime.utcnow()
    
    hint_lower = due_hint.lower()
    
    if "tomorrow" in hint_lower:
        date = now + timedelta(days=1)
    elif "next week" in hint_lower:
        date = now + timedelta(days=7)
    elif "next month" in hint_lower:
        date = now + timedelta(days=30)
    else:
        # Default to 7 days from now
        date = now + timedelta(days=7)
        
    return date.isoformat() + "Z"


async def _validate_task_catalog(
    context: AgentContext,
    task_def_id: str,
    inputs: Dict[str, Any]
) -> bool:
    """Validate inputs against task catalog schema.
    
    In production, this would load schemas from config/task-definitions/
    For now, basic validation on known types.
    """
    # Known task types and their required fields
    required_fields_map = {
        "SALE::BOOK_PHOTOS@v1": ["photographer_notes", "preferred_time"],
        "SALE::INSTALL_SIGN@v1": ["sign_type", "location_notes"],
        "SALE::POST_TO_MLS@v1": ["listing_notes"],
        "SALE::SCHEDULE_SHOWING@v1": ["showing_notes"],
    }
    
    if task_def_id in required_fields_map:
        required = required_fields_map[task_def_id]
        for field in required:
            if field not in inputs:
                return False
                
    # Default to valid for unknown types (be permissive)
    return True