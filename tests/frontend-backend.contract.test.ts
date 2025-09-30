import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

let app: any;
let seededListingId: string | undefined;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';
  app = (await import('../src/app')).default;
  await app.ready();

  // Seed a listing and a task so endpoints return data
  const { putListing } = await import('../src/db/listings');
  const { putTask } = await import('../src/db/tasks');
  const l = await putListing({
    type: 'SALE',
    status: 'new',
    address_string: '123 Contract Test Rd',
    assignee: 'agent:test',
    due_date: '2099-12-31T00:00:00.000Z',
  } as any);
  seededListingId = l.listing_id;
  await putTask({
    listing_id: l.listing_id,
    name: 'Contract Test Task',
    status: 'OPEN',
    task_def_id: 'SALE::BOOK_PHOTOS',
    inputs: { availability: 'anytime' },
  } as any);
});

afterAll(async () => {
  await app.close();
});

describe('Frontend ↔ Backend API contract (Operations)', () => {
  it('lists listings with expected shape', async () => {
    const res = await request(app.server)
      .get('/v1/operations/listings?limit=10')
      .set('X-Debug-User', JSON.stringify({ userId: 'agent:test', name: 'Test Agent' }));

    expect([200, 204, 400, 500]).toContain(res.status);
    if (res.status !== 200) {
      // Fast fail visibility
      throw new Error(`GET /v1/operations/listings -> ${res.status}: ${res.text}`);
    }

    const body = res.body as any;
    expect(body).toHaveProperty('listings');
    expect(Array.isArray(body.listings)).toBe(true);
    if (body.listings.length) {
      const item = body.listings[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('address');
      expect(item).toHaveProperty('status');
    }
  });

  it('fetches listing details compatible with FE mapper', async () => {
    const list = await request(app.server)
      .get('/v1/operations/listings?limit=1')
      .set('X-Debug-User', JSON.stringify({ userId: 'agent:test', name: 'Test Agent' }));
    expect(list.status).toBe(200);
    const listingId = seededListingId || list.body?.listings?.[0]?.id;
    if (!listingId) return; // no data in local env

    const res = await request(app.server)
      .get(`/v1/operations/listings/${listingId}/details`)
      .set('X-Debug-User', JSON.stringify({ userId: 'agent:test', name: 'Test Agent' }));

    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body).toHaveProperty('listing');
    expect(body.listing).toHaveProperty('id');
    expect(body).toHaveProperty('history');
    expect(Array.isArray(body.history)).toBe(true);
    expect(body).toHaveProperty('tasks');
    expect(Array.isArray(body.tasks)).toBe(true);
  });

  it('lists tasks for a listing with expected fields', async () => {
    const list = await request(app.server)
      .get('/v1/operations/listings?limit=1')
      .set('X-Debug-User', JSON.stringify({ userId: 'agent:test', name: 'Test Agent' }));
    expect(list.status).toBe(200);
    const listingId = seededListingId || list.body?.listings?.[0]?.id;
    if (!listingId) return;

    const res = await request(app.server)
      .get(`/v1/operations/tasks/${listingId}`)
      .set('X-Debug-User', JSON.stringify({ userId: 'agent:test', name: 'Test Agent' }));
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body).toHaveProperty('listingId');
    expect(body).toHaveProperty('tasks');
    expect(Array.isArray(body.tasks)).toBe(true);
    if (body.tasks.length) {
      const t = body.tasks[0];
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('status');
    }
  });
});


