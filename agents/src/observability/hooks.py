"""Observability hooks for ArchieOS agents.

Following SDK patterns from external/openai-agents-python/examples/basic/lifecycle_example.py
"""

import sys
import time
from typing import Any, Optional
from datetime import datetime

sys.path.insert(0, "/app/external/openai-agents-python/src")

from agents import (
    Agent,
    AgentHooks,
    RunContextWrapper,
    RunHooks,
    Tool,
    Usage
)
from agents.items import ModelResponse, TResponseInputItem

# Prometheus metrics (if available)
try:
    from prometheus_client import Counter, Histogram, Gauge
    
    # Agent metrics
    agent_invocations = Counter(
        'agent_invocations_total',
        'Total agent invocations',
        ['agent_name', 'status']
    )
    
    agent_duration = Histogram(
        'agent_duration_seconds',
        'Agent execution duration',
        ['agent_name']
    )
    
    tool_invocations = Counter(
        'tool_invocations_total',
        'Total tool invocations',
        ['agent_name', 'tool_name', 'status']
    )
    
    tool_duration = Histogram(
        'tool_duration_seconds',
        'Tool execution duration',
        ['agent_name', 'tool_name']
    )
    
    llm_requests = Counter(
        'llm_requests_total',
        'Total LLM requests',
        ['agent_name', 'model']
    )
    
    llm_tokens = Counter(
        'llm_tokens_total',
        'Total LLM tokens used',
        ['agent_name', 'token_type']  # input, output, total
    )
    
    handoffs = Counter(
        'agent_handoffs_total',
        'Total handoffs between agents',
        ['from_agent', 'to_agent']
    )
    
    active_agents = Gauge(
        'active_agents',
        'Number of currently active agents'
    )
    
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False
    print("⚠️  Prometheus metrics not available")


class ObservabilityHooks(AgentHooks[Any]):
    """Agent-level hooks for observability.
    
    These track individual agent lifecycle events and emit metrics/logs.
    """
    
    def __init__(self, agent_name: str):
        self.agent_name = agent_name
        self.start_time: Optional[float] = None
        self.tool_times: dict[str, float] = {}
        
    async def on_start(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any]
    ) -> None:
        """Called when agent starts processing."""
        self.start_time = time.time()
        
        print(f"🤖 [{self.agent_name}] Starting agent execution")
        
        if METRICS_AVAILABLE:
            active_agents.inc()
            
    async def on_end(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any],
        output: Any
    ) -> None:
        """Called when agent finishes processing."""
        if self.start_time:
            duration = time.time() - self.start_time
            print(f"✅ [{self.agent_name}] Completed in {duration:.2f}s")
            
            if METRICS_AVAILABLE:
                agent_invocations.labels(
                    agent_name=self.agent_name,
                    status='success'
                ).inc()
                agent_duration.labels(agent_name=self.agent_name).observe(duration)
                active_agents.dec()
        else:
            print(f"✅ [{self.agent_name}] Completed")
            
    async def on_handoff(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any],
        source: Agent[Any]
    ) -> None:
        """Called when handoff occurs."""
        print(f"↔️  [{self.agent_name}] Received handoff from {source.name}")
        
        if METRICS_AVAILABLE:
            handoffs.labels(
                from_agent=source.name,
                to_agent=agent.name
            ).inc()
            
    async def on_tool_start(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any],
        tool: Tool
    ) -> None:
        """Called when tool execution starts."""
        self.tool_times[tool.name] = time.time()
        print(f"🔧 [{self.agent_name}] Starting tool: {tool.name}")
        
    async def on_tool_end(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any],
        tool: Tool,
        result: str
    ) -> None:
        """Called when tool execution ends."""
        tool_name = tool.name
        if tool_name in self.tool_times:
            duration = time.time() - self.tool_times[tool_name]
            result_preview = result[:100] + "..." if len(result) > 100 else result
            print(f"✓ [{self.agent_name}] Tool {tool_name} completed in {duration:.2f}s: {result_preview}")
            
            if METRICS_AVAILABLE:
                tool_invocations.labels(
                    agent_name=self.agent_name,
                    tool_name=tool_name,
                    status='success'
                ).inc()
                tool_duration.labels(
                    agent_name=self.agent_name,
                    tool_name=tool_name
                ).observe(duration)
        else:
            print(f"✓ [{self.agent_name}] Tool {tool_name} completed")


class RunObservabilityHooks(RunHooks):
    """Run-level hooks for comprehensive observability.
    
    These track entire workflow execution across all agents.
    """
    
    def __init__(self):
        self.event_counter = 0
        self.run_start_time: Optional[float] = None
        
    def _usage_to_str(self, usage: Usage) -> str:
        """Format usage info for logging."""
        return (
            f"{usage.requests} requests, "
            f"{usage.input_tokens} input, "
            f"{usage.output_tokens} output, "
            f"{usage.total_tokens} total tokens"
        )
        
    def _emit_token_metrics(self, agent_name: str, usage: Usage):
        """Emit token usage metrics."""
        if METRICS_AVAILABLE:
            llm_tokens.labels(
                agent_name=agent_name,
                token_type='input'
            ).inc(usage.input_tokens)
            llm_tokens.labels(
                agent_name=agent_name,
                token_type='output'
            ).inc(usage.output_tokens)
            llm_tokens.labels(
                agent_name=agent_name,
                token_type='total'
            ).inc(usage.total_tokens)
            
    async def on_run_start(
        self,
        context: RunContextWrapper[Any]
    ) -> None:
        """Called when entire run starts."""
        self.run_start_time = time.time()
        self.event_counter = 0
        print(f"\n{'='*60}")
        print(f"🚀 Run started at {datetime.utcnow().isoformat()}")
        print(f"{'='*60}\n")
        
    async def on_run_end(
        self,
        context: RunContextWrapper[Any],
        output: Any
    ) -> None:
        """Called when entire run ends."""
        if self.run_start_time:
            duration = time.time() - self.run_start_time
            print(f"\n{'='*60}")
            print(f"✅ Run completed in {duration:.2f}s")
            print(f"   Total events: {self.event_counter}")
            print(f"   Usage: {self._usage_to_str(context.usage)}")
            print(f"{'='*60}\n")
            
    async def on_agent_start(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any]
    ) -> None:
        """Called when any agent starts."""
        self.event_counter += 1
        print(f"#{self.event_counter} Agent [{agent.name}] started")
        print(f"   Usage so far: {self._usage_to_str(context.usage)}")
        
    async def on_agent_end(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any],
        output: Any
    ) -> None:
        """Called when any agent ends."""
        self.event_counter += 1
        print(f"#{self.event_counter} Agent [{agent.name}] ended")
        print(f"   Usage: {self._usage_to_str(context.usage)}")
        
        # Emit metrics
        self._emit_token_metrics(agent.name, context.usage)
        
    async def on_llm_start(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any],
        system_prompt: Optional[str],
        input_items: list[TResponseInputItem]
    ) -> None:
        """Called when LLM request starts."""
        self.event_counter += 1
        print(f"#{self.event_counter} LLM request started for [{agent.name}]")
        
        if METRICS_AVAILABLE:
            llm_requests.labels(
                agent_name=agent.name,
                model=agent.model
            ).inc()
            
    async def on_llm_end(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any],
        response: ModelResponse
    ) -> None:
        """Called when LLM request ends."""
        self.event_counter += 1
        print(f"#{self.event_counter} LLM request completed for [{agent.name}]")
        print(f"   Usage: {self._usage_to_str(context.usage)}")
        
    async def on_tool_start(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any],
        tool: Tool
    ) -> None:
        """Called when tool execution starts."""
        self.event_counter += 1
        tool_args = getattr(context, 'tool_arguments', 'N/A')
        print(f"#{self.event_counter} Tool [{tool.name}] started")
        print(f"   Args: {tool_args}")
        
    async def on_tool_end(
        self,
        context: RunContextWrapper[Any],
        agent: Agent[Any],
        tool: Tool,
        result: str
    ) -> None:
        """Called when tool execution ends."""
        self.event_counter += 1
        result_preview = result[:100] + "..." if len(result) > 100 else result
        print(f"#{self.event_counter} Tool [{tool.name}] completed")
        print(f"   Result: {result_preview}")


# Factory function for creating hooks

def create_agent_hooks(agent_name: str) -> ObservabilityHooks:
    """Create observability hooks for an agent."""
    return ObservabilityHooks(agent_name)


def create_run_hooks() -> RunObservabilityHooks:
    """Create observability hooks for a run."""
    return RunObservabilityHooks()

