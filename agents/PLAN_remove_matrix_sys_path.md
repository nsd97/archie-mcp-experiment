# Remove runtime `sys.path` modification from Matrix tool

- [x] Confirm environment-level configuration already exposes `external/openai-agents-python` (Docker `PYTHONPATH`, local README instructions).
- [x] Delete the runtime `sys.path.insert` call from `agents/src/tools/matrix.py`.
- [x] Update docs/deployment notes so developers rely on the environment `PYTHONPATH` instead of per-file tweaks (e.g., `.env`, Dockerfile, README).
- [x] Sanity check for any references or tooling that would regress after the change.

