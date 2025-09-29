import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';

vi.mock('../src/db/listings', () => ({
  putListing: vi.fn().mockResolvedValue({ listing_id: 'L1' }),
}));
vi.mock('../src/db/tasks', () => ({
  putTask: vi.fn().mockResolvedValue({ task_id: 'T1' }),
}));
vi.mock('../src/db/audit_log', () => ({
  putAuditEvent: vi.fn().mockResolvedValue({}),
}));

import { processNormalizedIntake } from '../src/services/intakeIngestor';
import { putListing } from '../src/db/listings';
import { putTask } from '../src/db/tasks';
import { putAuditEvent } from '../src/db/audit_log';

describe('processNormalizedIntake', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates listing and tasks for CREATE_LISTING', async () => {
    const res = await processNormalizedIntake({
      intent: 'CREATE_LISTING',
      listing: { type: 'LEASE', address: '123 Main' },
      tasks: [{ task_type: 'BOOK_PHOTOS' }],
      source: { slack_user_id: 'U1', channel_id: 'C1', ts: '1.1' },
    });
    expect(putListing).toHaveBeenCalled();
    expect(putTask).toHaveBeenCalledWith(expect.objectContaining({ listing_id: 'L1', task_def_id: 'BOOK_PHOTOS' }));
    expect(putAuditEvent).toHaveBeenCalled();
    expect(res).toEqual({ listing_id: 'L1', tasks: 1 });
  });

  it('adds tasks to listing for ADD_TASKS_TO_LISTING', async () => {
    const res = await processNormalizedIntake({
      intent: 'ADD_TASKS_TO_LISTING',
      listing: { listing_id: 'L42' },
      tasks: [{ task_type: 'LOCKBOX_SETUP' }],
      source: { slack_user_id: 'U1', channel_id: 'C1', ts: '1.1' },
    });
    expect(putTask).toHaveBeenCalledWith(expect.objectContaining({ listing_id: 'L42', task_def_id: 'LOCKBOX_SETUP' }));
    expect(putAuditEvent).toHaveBeenCalled();
    expect(res).toEqual({ listing_id: 'L42', tasks: 1 });
  });

  it('creates stray tasks for CREATE_STRAY_TASK', async () => {
    const res = await processNormalizedIntake({
      intent: 'CREATE_STRAY_TASK',
      stray: { category_hint: 'MARKETING' },
      tasks: [{ task_type: 'UPDATE_SIGN_CHECKLIST' }],
      source: { slack_user_id: 'U1', channel_id: 'C1', ts: '1.1' },
    });
    expect(putTask).toHaveBeenCalledWith(expect.objectContaining({ listing_id: 'stray', is_stray: true }));
    expect(putAuditEvent).toHaveBeenCalled();
    expect(res).toEqual({ stray: true, tasks: 1 });
  });

  it('logs info request for INFO_REQUEST', async () => {
    const res = await processNormalizedIntake({
      intent: 'INFO_REQUEST',
      meta: { confidence: 0.4, explanations: ['Need listing type'] },
      source: { slack_user_id: 'U1', channel_id: 'C1', ts: '1.1' },
    });
    expect(putAuditEvent).toHaveBeenCalled();
    expect(res).toEqual({ infoRequested: true });
  });
});

