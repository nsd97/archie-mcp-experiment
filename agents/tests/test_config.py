"""Configuration sanity tests for queue URLs and env names."""

import os
import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def read_file(path: Path) -> str:
    with path.open("r", encoding="utf-8") as file:
        return file.read()


def test_docker_compose_fifo_urls():
    """Ensure docker-compose.agents.yml uses proper .fifo queue URLs."""

    compose_path = PROJECT_ROOT.parent / "docker-compose.agents.yml"
    content = read_file(compose_path)

    fifo_urls = re.findall(r"https?://[\w:\-/]+/(prompt|lauren-work|archie-signal)-queue(?:-dlq)?\.fifo", content)
    assert len(fifo_urls) >= 6, "Expected FIFO URLs for main+DLQ queues in docker-compose"

    # Ensure no duplicate `.fifo.fifo`
    assert ".fifo.fifo" not in content


def test_env_example_fifo_urls():
    """Check env.example has FIFO queue URLs and consistent dlq var names."""

    env_path = PROJECT_ROOT / "env.example"
    content = read_file(env_path)

    assert "LAUREN_WORK_QUEUE_DLQ_URL" in content
    required_vars = [
        "SQS_QUEUE_URL",
        "SQS_DLQ_URL",
        "LAUREN_WORK_QUEUE_URL",
        "LAUREN_WORK_QUEUE_DLQ_URL",
        "ARCHIE_SIGNAL_QUEUE_URL",
        "ARCHIE_SIGNAL_QUEUE_DLQ_URL",
    ]

    for var in required_vars:
        pattern = rf"{var}=https?://[\w:\-/]+/(.+)"
        match = re.search(pattern, content)
        assert match, f"Missing URL for {var}"
        assert match.group(1).endswith(".fifo"), f"{var} must point to .fifo queue"


