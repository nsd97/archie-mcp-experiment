import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

let app: any;

const envBootstrap: Record<string, () => string> = {
  NODE_ENV: () => 'test',
  AWS_REGION: () => 'us-east-1',
  LOCALSTACK_ENDPOINT: () => 'http://localhost:4566',
  AWS_ACCESS_KEY_ID: () => process.env.AWS_ACCESS_KEY_ID ?? 'test',
  AWS_SECRET_ACCESS_KEY: () => process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  ENTITIES_TABLE: () => 'entities',
  LISTINGS_TABLE: () => 'listings',
  TASKS_TABLE: () => 'tasks',
  AUDIT_LOG_TABLE: () => 'audit_log',
};
const previousEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  for (const [key, valueFactory] of Object.entries(envBootstrap)) {
    previousEnv[key] = process.env[key];
    process.env[key] = valueFactory();
  }
  await import('../scripts/infra-init');
  await import('../scripts/seed');
  app = (await import('../src/app')).default;
  await app.ready();
});

afterAll(async () => {
  try {
    if (app) await app.close();
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
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
