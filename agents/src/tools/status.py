"""DB-Read tools for Archie agent.

Following SDK patterns from external/openai-agents-python/docs/tools.md
"""

import sys
from typing import Optional
from datetime import datetime

sys.path.insert(0, "/app/external/openai-agents-python/src")

from agents import function_tool, RunContextWrapper

from src.context import AgentContext, TaskStatusResponse
from src.logging_config import get_logger

logger = get_logger(__name__)


async def _get_task_status_impl(
    ctx: RunContextWrapper[AgentContext],
    listing_id: Optional[str] = None,
    status: Optional[str] = None,
    assignee: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 20,
    page_token: Optional[str] = None
) -> TaskStatusResponse:
    """Get status of tasks with optional filters.
    
    Args:
        listing_id: Filter by specific listing ID
        status: Filter by task status (NEW, OPEN, CLAIMED, IN_PROGRESS, BLOCKED, DONE, CANCELED)
        assignee: Filter by assigned user ID
        since: Filter tasks updated since this date (ISO format)
        limit: Maximum number of tasks to return (default 20, max 100)
        page_token: Token for pagination from previous response
        
    Returns:
        TaskStatusResponse with summary and task items
    """
    context = ctx.context
    logger.debug(
        "get_task_status called",
        extra={
            "listing_id": listing_id,
            "status": status,
            "assignee": assignee,
            "limit": limit,
            "page_token": page_token,
            "correlation_id": context.correlation_id,
        },
    )
    
    # Build query parameters
    params = {}
    if status:
        params["status"] = status
    if assignee:
        params["assignedTo"] = assignee
    if limit:
        params["limit"] = min(limit, 100)  # Cap at 100
    if page_token:
        params["pageToken"] = page_token
        
    try:
        # Query the appropriate endpoint based on filters
        if listing_id:
            # Query tasks for specific listing
            response = await context.backend_client.get(
                f"/v1/operations/tasks/{listing_id}",
                params=params
            )
        else:
            # Query global task queue
            response = await context.backend_client.get(
                "/v1/operations/queue",
                params=params
            )
            
        response.raise_for_status()
        data = response.json()
        
        # Process the response based on the endpoint
        if listing_id:
            # Single listing response
            tasks = data.get("tasks", [])
            total_count = len(tasks)
            summary = _generate_listing_summary(listing_id, tasks)
        else:
            # Queue response with multiple listings
            listings = data.get("listings", [])
            tasks = []
            for listing in listings:
                tasks.extend(listing.get("tasks", []))
            total_count = len(tasks)
            summary = _generate_queue_summary(listings)
            
        # Apply since filter if provided (backend doesn't support this yet)
        if since:
            since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
            tasks = [
                task for task in tasks
                if datetime.fromisoformat(task.get("updated_at", "").replace('Z', '+00:00')) >= since_dt
            ]
            
        # Apply pagination
        start_idx = 0
        if page_token:
            try:
                start_idx = int(page_token)
            except:
                start_idx = 0
                
        paginated_tasks = tasks[start_idx:start_idx + limit]
        next_page_token = str(start_idx + limit) if start_idx + limit < len(tasks) else None

        response_payload = TaskStatusResponse(
            summary=summary,
            items=paginated_tasks,
            next_page_token=next_page_token,
            total_count=total_count
        )

        return response_payload

    except Exception as e:
        # Return error summary
        return TaskStatusResponse(
            summary=f"Error fetching task status: {str(e)}",
            items=[],
            total_count=0
        )


# Export tool for agent use
get_task_status = function_tool(_get_task_status_impl, strict_mode=False)


def _generate_listing_summary(listing_id: str, tasks: list) -> str:
    """Generate a human-friendly summary for a single listing."""
    if not tasks:
        return f"No tasks found for listing {listing_id}."
        
    total = len(tasks)
    status_counts = {}
    for task in tasks:
        status = task.get("status", "UNKNOWN")
        status_counts[status] = status_counts.get(status, 0) + 1
        
    # Build summary
    parts = [f"Listing {listing_id} has {total} task(s):"]
    for status, count in sorted(status_counts.items()):
        parts.append(f"{count} {status}")
        
    # Add priority info
    urgent_tasks = [t for t in tasks if t.get("priority", 0) >= 8]
    if urgent_tasks:
        parts.append(f"\n⚠️  {len(urgent_tasks)} urgent task(s) need attention")
        
    return " ".join(parts)


def _generate_queue_summary(listings: list) -> str:
    """Generate a human-friendly summary for the task queue."""
    if not listings:
        return "No active listings with tasks found."
        
    total_listings = len(listings)
    total_tasks = sum(len(l.get("tasks", [])) for l in listings)
    
    # Count tasks by status across all listings
    status_counts = {}
    urgent_count = 0
    
    for listing in listings:
        for task in listing.get("tasks", []):
            status = task.get("status", "UNKNOWN")
            status_counts[status] = status_counts.get(status, 0) + 1
            if task.get("priority", 0) >= 8:
                urgent_count += 1
                
    # Build summary
    parts = [f"Found {total_tasks} task(s) across {total_listings} listing(s):"]
    for status, count in sorted(status_counts.items()):
        parts.append(f"{count} {status}")
        
    if urgent_count > 0:
        parts.append(f"\n⚠️  {urgent_count} urgent task(s) require immediate attention")
        
    # Add top listings by task count
    listings_by_tasks = sorted(listings, key=lambda l: len(l.get("tasks", [])), reverse=True)[:3]
    if listings_by_tasks:
        parts.append("\n\nTop listings by task count:")
        for listing in listings_by_tasks:
            address = listing.get("address", "Unknown address")
            task_count = len(listing.get("tasks", []))
            parts.append(f"\n• {address}: {task_count} tasks")
            
    return " ".join(parts)


# Additional helper tools that Archie might use internally

async def summarize_queue(ctx: RunContextWrapper[AgentContext]) -> str:
    """Get a high-level summary of the entire task queue."""
    response = await get_task_status(ctx, limit=50)
    return response.summary


async def lookup_listing_by_address(
    ctx: RunContextWrapper[AgentContext],
    address: str
) -> Optional[str]:
    """Look up a listing ID by address.
    
    This is a helper for when users reference listings by address
    instead of ID.
    """
    return await _get_task_status_impl(
        ctx,
        listing_id,
        status,
        assignee,
        since,
        limit,
        page_token,
    )
    
    try:
        # Search listings by address
        response = await context.backend_client.get(
            "/v1/operations/listings",
            params={"address": address}
        )
        response.raise_for_status()
        
        listings = response.json().get("listings", [])
        if listings:
            return listings[0].get("listingId")
        return None
        
    except Exception:
        return None
