import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

let app: any;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AWS_REGION = 'us-east-1';
  process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
  process.env.ENTITIES_TABLE = 'entities';
  process.env.LISTINGS_TABLE = 'listings';
  process.env.TASKS_TABLE = 'tasks';
  process.env.AUDIT_LOG_TABLE = 'audit_log';
  await import('../scripts/infra-init');
  await import('../scripts/seed');
  app = (await import('../src/app')).default;
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
});

describe('Seed data endpoints', () => {
  it('returns one listing with status=new', async () => {
    const res = await request(app.server)
      .get('/v1/operations/listings')
      .query({ status: 'new' });
    expect(res.status).toBe(200);
    expect(res.body.listings.length).toBeGreaterThan(0);
  });

  it('returns queue totals', async () => {
    const res = await request(app.server).get('/v1/operations/queue');
    expect(res.status).toBe(200);
    expect(res.body.totalTasks).toBeGreaterThan(0);
  });

  it('returns stray queues', async () => {
    const res = await request(app.server).get('/v1/operations/stray-queues');
    expect(res.status).toBe(200);
    expect(res.body.queues.some((q: any) => q.category === 'ADMIN')).toBe(true);
    expect(res.body.queues.some((q: any) => q.category === 'MARKETING')).toBe(true);
  });
});
