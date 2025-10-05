"""Agent context and shared types for ArchieOS agents."""

from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional
import aioboto3
import httpx


@dataclass
class AgentContext:
    """Context passed to all agents and tools.
    
    This follows the SDK pattern from external/openai-agents-python/docs/agents.md#context
    """
    user_id: str
    room_id: str
    thread_id: Optional[str]
    correlation_id: str
    db_session: Any  # aioboto3 DynamoDB resource
    backend_client: httpx.AsyncClient  # HTTP client for REST API
    matrix_client: Optional[Any] = None  # Will be added in P3


@dataclass
class TaskStatusResponse:
    """Response from get_task_status tool."""
    summary: str
    items: list[Dict[str, Any]]
    next_page_token: Optional[str] = None
    total_count: int = 0


@dataclass 
class Task:
    """Task entity matching the backend schema."""
    task_id: str
    listing_id: Optional[str]
    task_def_id: Optional[str]
    name: str
    description: Optional[str]
    status: str
    priority: Optional[int]
    assigned_to: Optional[Dict[str, Any]]
    claim_status: Optional[str]
    due_date: Optional[str]
    completed_at: Optional[str]
    completed_by: Optional[str]
    inputs: Optional[Dict[str, Any]]
    outputs: Optional[Dict[str, Any]]
    created_at: str
    updated_at: str
    is_stray: bool = False
    
    @classmethod
    def from_db(cls, item: Dict[str, Any]) -> "Task":
        """Create Task from DynamoDB item."""
        return cls(
            task_id=item["task_id"],
            listing_id=item.get("listing_id"),
            task_def_id=item.get("task_def_id"),
            name=item["name"],
            description=item.get("description"),
            status=item["status"],
            priority=item.get("priority"),
            assigned_to=item.get("assigned_to"),
            claim_status=item.get("claim_status"),
            due_date=item.get("due_date"),
            completed_at=item.get("completed_at"),
            completed_by=item.get("completed_by"),
            inputs=item.get("inputs"),
            outputs=item.get("outputs"),
            created_at=item["created_at"],
            updated_at=item["updated_at"],
            is_stray=item.get("is_stray", False)
        )


@dataclass
class MessageSentResponse:
    """Response from send_matrix_message tool."""
    event_id: str
    timestamp: str
    room_id: str
    thread_id: Optional[str] = None


@dataclass
class AgentMessage:
    """Inter-agent message schema for handoffs and communication."""
    type: Literal["request", "response", "handoff", "system"]
    correlation_id: str
    parent_id: Optional[str]
    from_agent: str
    to_agent: Optional[str]
    provenance: Dict[str, Any]  # user_id, room_id, etc
    visibility: Literal["internal", "user_visible"]
    urgency: int  # 0-10
    payload: Dict[str, Any]
    timestamp: str
