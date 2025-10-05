"""Basic tests for agent loading and configuration."""

import sys
import os

# Add the src directory to Python path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, "/app/external/openai-agents-python/src")

import pytest
from src.agents.archie import archie_agent
from src.agents.lauren import lauren_agent


def test_archie_agent_loaded():
    """Test that Archie agent is properly configured."""
    assert archie_agent is not None
    assert archie_agent.name == "Archie"
    assert "helpful operations assistant" in archie_agent.instructions
    # Currently no tools until P1/P3
    assert len(archie_agent.tools) == 0
    assert len(archie_agent.handoffs) == 0


def test_lauren_agent_loaded():
    """Test that Lauren agent is properly configured."""
    assert lauren_agent is not None
    assert lauren_agent.name == "Lauren"
    assert "task executor" in lauren_agent.instructions
    # Currently no tools until P2
    assert len(lauren_agent.tools) == 0
    

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
