import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('openai', () => ({
  default: class OpenAIMock {
    chat: { completions: { create: typeof createMock } };
    constructor() {
      this.chat = { completions: { create: createMock } };
    }
  },
}));

describe('callLLM', () => {
  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.LLM_STREAM = 'false';
  });

  afterEach(() => {
    delete process.env.LLM_STREAM;
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
  });

  it('retries on transient failure', async () => {
    createMock
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"schema_version":1}' } }] });

    const mod = await import('../src/services/llmClassifier');
    const result = await mod.callLLM('system', 'user');

    expect(result).toContain('schema_version');
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('handles streamed responses when enabled', async () => {
    process.env.LLM_STREAM = 'true';
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: '{"schema' } }] };
        yield { choices: [{ delta: { content: '_version":1}' } }] };
      },
    } as any;
    createMock.mockResolvedValueOnce(stream);

    const mod = await import('../src/services/llmClassifier');
    const result = await mod.callLLM('system', 'user');

    expect(result).toContain('schema_version');
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
