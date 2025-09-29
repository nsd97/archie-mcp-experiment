import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

let app: any;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  app = (await import('../src/app')).default;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('OpenAPI route', () => {
  it('includes required paths', async () => {
    const res = await request(app.server).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const paths = Object.keys(res.body.paths || {});
    const required = [
      '/v1/operations/listings',
      '/v1/operations/listings/{id}',
      '/v1/operations/listings/{id}/details',
      '/v1/operations/queues',
      '/v1/operations/queue',
      '/v1/operations/tasks/{listingId}',
      '/v1/operations/tasks/{taskId}',
      '/v1/operations/tasks/{taskId}/claim',
      '/v1/operations/tasks/{taskId}/unclaim',
      '/v1/operations/my-tasks',
      '/v1/operations/tasks/{taskId}/complete',
      '/v1/operations/stray-queues',
      '/v1/tasks/{task_id}/attachments/sign-put',
      '/files/sign-get',
      '/entities/me',
      '/entities/{id}',
      '/v1/operations/board'
    ];
    for (const p of required) {
      expect(paths).toContain(p);
    }
  });
  it('renders swagger ui at /docs', async () => {
    const res = await request(app.server).get('/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toMatch(/Operations Center/i);
  });
});
