import { describe, expect, it, beforeEach, vi } from 'vitest';
import { normalizeSlackEvent } from '../src/services/intakeClassifier';

const sendMock = vi.fn();

vi.mock('../src/db/sqsClient', () => ({
  default: { send: sendMock },
}));

beforeEach(() => {
  vi.resetModules();
  sendMock.mockReset();
  delete process.env.USE_LLM_CLASSIFIER;
});

describe('intake pipeline helpers', () => {
  it('normalizes slack app mention payloads', () => {
    const body = {
      type: 'event_callback',
      team_id: 'T123',
      event: {
        type: 'app_mention',
        text: 'hello team',
        user: 'U123',
        channel: 'C123',
        event_ts: '123.456',
      },
    };

    const normalized = normalizeSlackEvent(body);
    expect(normalized).not.toBeNull();
    expect(normalized).toMatchObject({
      source: 'slack',
      type: 'app_mention',
      team_id: 'T123',
      channel_id: 'C123',
      user_id: 'U123',
      ts: '123.456',
    });
  });

  it('skips LLM classification unless enabled', async () => {
    process.env.USE_LLM_CLASSIFIER = 'false';
    const { classifyAndEnqueueFromSlackEvent } = await import('../src/services/llmClassifier');
    const result = await classifyAndEnqueueFromSlackEvent({
      type: 'event_callback',
      event: { type: 'app_mention', text: 'ping', user: 'U1', channel: 'C1', event_ts: '1.2' },
    });
    expect(result.skipped).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
