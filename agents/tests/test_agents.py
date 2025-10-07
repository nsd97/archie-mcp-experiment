"""Basic tests for agent loading and configuration."""

import sys
import os

# Add the src directory to Python path for imports
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
VENDORED_SDK = os.path.join(PROJECT_ROOT, "external", "openai-agents-python", "src")
if VENDORED_SDK not in sys.path:
    sys.path.insert(0, VENDORED_SDK)

import pytest
from src.agents.archie import archie_agent
from src.agents.lauren import lauren_agent


def test_archie_agent_loaded():
    """Test that Archie agent is properly configured."""
    assert archie_agent is not None
    assert archie_agent.name == "Archie"
    assert "helpful operations assistant" in archie_agent.instructions
    # Archie has 3 tools: get_task_status, send_matrix_message, enqueue_for_lauren
    assert len(archie_agent.tools) == 3
    assert len(archie_agent.handoffs) == 0  # Using queues instead


def test_lauren_agent_loaded():
    """Test that Lauren agent is properly configured."""
    assert lauren_agent is not None
    assert lauren_agent.name == "Lauren"
    assert "task classification" in lauren_agent.instructions
    # Lauren has 3 tools: classify_and_create_task, create_task, notify_archie_signal
    assert len(lauren_agent.tools) == 3
    

def test_agent_model_configuration():
    """Test that agents are configured with the correct model."""
    assert archie_agent.model == "gpt-5"
    assert lauren_agent.model == "gpt-5"


if __name__ == "__main__":
    # Run basic verification
    print("✓ Archie agent loaded successfully")
    print(f"  Name: {archie_agent.name}")
    print(f"  Model: {archie_agent.model}")
    print(f"  Tools: {len(archie_agent.tools)}")
    
    print("\n✓ Lauren agent loaded successfully")
    print(f"  Name: {lauren_agent.name}")
    print(f"  Model: {lauren_agent.model}")
    print(f"  Tools: {len(lauren_agent.tools)}")
