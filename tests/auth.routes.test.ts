import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { putListing } from '../src/db/listings';
import { putTask } from '../src/db/tasks';

let app: any;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DEBUG_USER = 'true';
  process.env.SLACK_CLIENT_ID = 'stub';
  process.env.SLACK_CLIENT_SECRET = 'stub';
  process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  app = (await import('../src/app')).default;
  await app.ready();
});

afterAll(async () => {
  if (app?.close) await app.close();
});

beforeEach(async () => {
  const { putEntity } = await import('../src/db/entities');
  await putEntity({ entity_key: 'agent:test', type: 'AGENT', name: 'Agent Test', email: 'agent@test.com', status: 'ACTIVE' } as any);
});

describe('/auth routes', () => {
  it('GET /auth/me returns principal via debug user', async () => {
    const res = await request(app.server)
      .get('/auth/me')
      .set('X-Debug-User', 'agent:test');
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe('agent:test');
    expect(res.body.user.email).toBe('agent@test.com');
  });

  it('POST /auth/link/slack stores slack user id', async () => {
    const mock = await import('../src/services/slackOauth');
    const spy = vi.spyOn(mock, 'exchangeSlackCode').mockResolvedValue({ slackUserId: 'U111' });
    const res = await request(app.server)
      .post('/auth/link/slack')
      .set('X-Debug-User', 'agent:test')
      .send({ code: 'abc' });
    expect(res.status).toBe(200);
    expect(res.body.slackUserId).toBe('U111');
    const { getEntityByKey } = await import('../src/db/entities');
    const entity = await getEntityByKey('agent:test');
    expect(entity?.slack_user_id).toBe('U111');
    spy.mockRestore();
  });

  it('rejects unauthorized claim attempt', async () => {
    const listing = await putListing({
      type: 'SALE',
      status: 'ACTIVE',
      address_string: '401 Auth Ln',
    } as any);
    const task = await putTask({
      listing_id: listing.listing_id,
      name: 'Restricted Task',
      status: 'OPEN',
      visibility_group: 'ADMIN_OPS',
    } as any);

    const res = await request(app.server)
      .post(`/v1/operations/tasks/${task.task_id}/claim`)
      .set('X-Debug-User', JSON.stringify({ userId: 'marketing:user', roles: ['ADMIN_MARKETING'], groups: ['ADMIN_MARKETING'] }))
      .send({ assigneeId: 'marketing:user' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
});
