import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-defs-'));
  process.env.TASK_DEFINITIONS_DIR = tmpDir;
  vi.resetModules();
});

afterEach(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  delete process.env.TASK_DEFINITIONS_DIR;
});

describe('task catalog', () => {
  it('loads valid definitions and validates outputs', async () => {
    const def = {
      task_def_id: 'SALE::BOOK_PHOTOS',
      version: 1,
      title: 'Book photographer',
      outputs_schema: {
        type: 'object',
        required: ['scheduled_start'],
        properties: {
          scheduled_start: { type: 'string' },
        },
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'SALE::BOOK_PHOTOS@v1.json'), JSON.stringify(def));

    const catalog = await import('../src/services/taskCatalog');
    catalog.loadTaskCatalog();
    const loaded = catalog.getTaskDefinition('SALE::BOOK_PHOTOS');
    expect(loaded).toMatchObject({ title: 'Book photographer' });

    const ok = catalog.validateTaskOutputs('SALE::BOOK_PHOTOS', { scheduled_start: '2025-01-01T00:00:00Z' });
    expect(ok.valid).toBe(true);

    const bad = catalog.validateTaskOutputs('SALE::BOOK_PHOTOS', {});
    expect(bad.valid).toBe(false);
  });

  it('throws when encountering malformed definitions', async () => {
    fs.writeFileSync(path.join(tmpDir, 'BAD@v1.json'), JSON.stringify({ task_def_id: 'BAD::DEF' }));
    const catalog = await import('../src/services/taskCatalog');
    expect(() => catalog.loadTaskCatalog()).toThrow();
  });
});
