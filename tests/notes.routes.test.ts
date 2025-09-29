import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

let app: any;
let listing: any;
let task: any;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';

  app = (await import('../src/app')).default;
  await app.ready();

  const { putListing } = await import('../src/db/listings');
  const { putTask } = await import('../src/db/tasks');

  listing = await putListing({ type: 'SALE', status: 'new', address_string: '10 Note St' } as any);
  task = await putTask({ listing_id: listing.listing_id, name: 'Note task', status: 'OPEN' } as any);
});

afterAll(async () => { if (app?.close) await app.close(); });

describe('Task notes', () => {
  it('creates a note and lists it; appears in listing details', async () => {
    const text = 'This is a test note';
    const create = await request(app.server)
      .post(`/v1/tasks/${task.task_id}/notes`)
      .set('X-Debug-User', 'agent:test')
      .send({ text });
    expect(create.status).toBe(200);
    const noteId = create.body.note.id;

    const list = await request(app.server).get(`/v1/tasks/${task.task_id}/notes`);
    expect(list.status).toBe(200);
    const found = list.body.notes.find((n: any) => n.id === noteId);
    expect(found?.text).toBe(text);

    const details = await request(app.server).get(`/v1/operations/listings/${listing.listing_id}/details`);
    expect(details.status).toBe(200);
    const inDetails = details.body.notes.find((n: any) => n.content === text);
    expect(inDetails).toBeTruthy();
  });
});


