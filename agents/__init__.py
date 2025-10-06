"""ArchieOS Agents package initializer.

This loader wraps the vendored OpenAI Agents SDK and exposes its public API while
keeping the local ArchieOS modules under the same namespace.
"""

from __future__ import annotations

import os
import sys
from pkgutil import extend_path

PACKAGE_DIR = os.path.dirname(__file__)
REPO_ROOT = os.path.abspath(os.path.join(PACKAGE_DIR, ".."))
SDK_SRC = os.path.join(REPO_ROOT, "external", "openai-agents-python", "src")
SDK_PKG_DIR = os.path.join(SDK_SRC, "agents")

if os.path.isdir(SDK_SRC) and SDK_SRC not in sys.path:
    sys.path.insert(0, SDK_SRC)

__path__ = extend_path(__path__, __name__)
if os.path.isdir(SDK_PKG_DIR) and SDK_PKG_DIR not in __path__:
    __path__.append(SDK_PKG_DIR)

VENDOR_INIT = os.path.join(SDK_PKG_DIR, "__init__.py")
if os.path.isfile(VENDOR_INIT):
    with open(VENDOR_INIT, "r", encoding="utf-8") as fh:
        exec(compile(fh.read(), VENDOR_INIT, "exec"), globals(), globals())
