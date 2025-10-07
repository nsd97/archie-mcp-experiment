# Plan: Refactor SQS Client Helper

- [ ] Inspect the duplicated SQS client creation logic in `agents/src/tools/queues.py`
- [ ] Design an async helper `_create_sqs_client` that centralizes session setup, endpoint resolution, and credential validation
- [ ] Implement the helper and ensure it raises for missing credentials outside local/test contexts
- [ ] Update `enqueue_for_lauren` to use `async with await _create_sqs_client()`
- [ ] Update `notify_archie_signal` to use the shared helper
- [ ] Sanity-check environment handling and note any follow-up testing needed

