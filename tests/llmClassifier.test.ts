import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';

vi.mock('../src/db/sqsClient', () => {
  return {
    default: { send: vi.fn().mockResolvedValue({}) },
  };
});

describe('LLM Classifier', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.USE_LLM_CLASSIFIER = 'true';
    process.env.LLM_CONFIDENCE_MIN = '0.6';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies Create Listing (Lease) and enqueues', async () => {
    const slack = {
      type: 'event_callback',
      event: {
        type: 'app_mention',
        text: 'Create new lease at 123 Main St for Jane Agent. Need photos this Friday.',
        user: 'UAGENT',
        channel: 'CCHAN',
        event_ts: '1727000000.12345',
      },
    };

    const json = {
      schema_version: 1,
      intent: 'CREATE_LISTING',
      idempotency_key: 'abc',
      source: { slack_user_id: 'UAGENT', channel_id: 'CCHAN', ts: '1727000000.12345' },
      listing: { type: 'LEASE', address: '123 Main St', agent_hint: 'Jane Agent' },
      tasks: [{ task_type: 'BOOK_PHOTOS' }],
      meta: { confidence: 0.9 },
    };

    const mod = await import('../src/services/llmClassifier');
    mod.__setCallLLM(async () => JSON.stringify(json));
    const res = await mod.classifyAndEnqueueFromSlackEvent(slack);
    expect(res.ok).toBe(true);

    const mocked = (await import('../src/db/sqsClient')).default as any;
    expect(mocked.send).toHaveBeenCalledTimes(1);
    const cmdArg = mocked.send.mock.calls[0][0];
    const body = JSON.parse(cmdArg.input.MessageBody);
    expect(body.intent).toBe('CREATE_LISTING');
    expect(body.listing.address).toContain('123 Main');
  });

  it('classifies stray task and enqueues', async () => {
    const slack = {
      type: 'event_callback',
      event: { type: 'app_mention', text: 'Can someone update our marketing checklist for signs?', user: 'U1', channel: 'C1', event_ts: '1.1' },
    };
    const json = {
      schema_version: 1,
      intent: 'CREATE_STRAY_TASK',
      idempotency_key: 'def',
      source: { slack_user_id: 'U1', channel_id: 'C1', ts: '1.1' },
      stray: { category_hint: 'MARKETING' },
      tasks: [{ task_type: 'UPDATE_SIGN_CHECKLIST' }],
      meta: { confidence: 0.7 },
    };
    const mod = await import('../src/services/llmClassifier');
    mod.__setCallLLM(async () => JSON.stringify(json));
    const res = await mod.classifyAndEnqueueFromSlackEvent(slack);
    expect(res.ok).toBe(true);
  });

  it('ignores non-intent', async () => {
    const slack = { type: 'event_callback', event: { type: 'app_mention', text: 'thanks!', user: 'U1', channel: 'C1', event_ts: '1.2' } };
    const json = {
      schema_version: 1,
      intent: 'IGNORE',
      idempotency_key: 'ghi',
      source: { slack_user_id: 'U1', channel_id: 'C1', ts: '1.2' },
      meta: { confidence: 0.5 },
    };
    const mod = await import('../src/services/llmClassifier');
    mod.__setCallLLM(async () => JSON.stringify(json));
    const res = await mod.classifyAndEnqueueFromSlackEvent(slack);
    expect(res.skipped).toBe(true);
  });

  it('low confidence skips', async () => {
    const slack = { type: 'event_callback', event: { type: 'app_mention', text: 'Please list 22 King Rd', user: 'U1', channel: 'C1', event_ts: '1.3' } };
    const json = {
      schema_version: 1,
      intent: 'CREATE_LISTING',
      idempotency_key: 'jkl',
      source: { slack_user_id: 'U1', channel_id: 'C1', ts: '1.3' },
      listing: { address: '22 King Rd' },
      meta: { confidence: 0.3 },
    };
    const mod = await import('../src/services/llmClassifier');
    mod.__setCallLLM(async () => JSON.stringify(json));
    const res = await mod.classifyAndEnqueueFromSlackEvent(slack);
    expect(res.skipped).toBe(true);
  });
});


