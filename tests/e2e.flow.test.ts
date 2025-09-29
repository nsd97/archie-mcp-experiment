import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import dotenv from 'dotenv';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);

dotenv.config();

let app: any;

// Optional: we will discover IDs at runtime from the queue

describe('E2E Flow: seed → listings → claim → my-tasks → unclaim → queue', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'local';
    process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
    process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';

    await exec('npm run infra:up');
    await exec('npm run infra:init');
    await exec('npm run seed');

    app = (await import('../src/app')).default;
    await app.ready();
  }, 180000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('runs the end-to-end happy path', async () => {
    // 1) List listings
    const listRes = await request(app.server).get('/v1/operations/listings');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.listings)).toBe(true);
    expect(listRes.body.listings.length).toBeGreaterThan(0);

    // 2) Find a claimable task from queue
    const queueBefore = await request(app.server).get('/v1/operations/queue');
    expect(queueBefore.status).toBe(200);
    const anyListing = queueBefore.body.listings.find((l: any) => l.tasks && l.tasks.some((t: any) => t.canClaim));
    expect(anyListing).toBeTruthy();
    const claimable = anyListing.tasks.find((t: any) => t.canClaim);
    expect(claimable).toBeTruthy();
    const listingId = anyListing.listingId;
    const taskId = claimable.taskId;

    const userId = 'user-e2e';
    const claimRes = await request(app.server)
      .post(`/v1/operations/tasks/${taskId}/claim`)
      .send({ userId });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.task.id).toBe(taskId);
    expect(claimRes.body.task.status).toBe('CLAIMED');
    expect(claimRes.body.task.assignedTo?.userId).toBe(userId);

    // 3) My tasks includes it
    const myTasksRes = await request(app.server)
      .get('/v1/operations/my-tasks')
      .query({ userId });
    expect(myTasksRes.status).toBe(200);
    const foundListing = myTasksRes.body.listings.find((l: any) => l.listingId === listingId);
    expect(foundListing).toBeTruthy();
    const foundTask = foundListing.tasks.find((t: any) => t.taskId === taskId);
    expect(foundTask).toBeTruthy();
    // in my-tasks we display IN_PROGRESS for CLAIMED
    expect(foundTask.status).toBe('IN_PROGRESS');

    // 4) Unclaim it
    const unclaimRes = await request(app.server)
      .post(`/v1/operations/tasks/${taskId}/unclaim`)
      .send({ reason: 'release' });
    expect(unclaimRes.status).toBe(200);
    expect(unclaimRes.body.task.id).toBe(taskId);
    expect(unclaimRes.body.task.status).toBe('UNASSIGNED');

    // 5) Queue reflects change (canClaim true)
    const queueRes = await request(app.server).get('/v1/operations/queue');
    expect(queueRes.status).toBe(200);
    const listingInQueue = queueRes.body.listings.find((l: any) => l.listingId === listingId);
    expect(listingInQueue).toBeTruthy();
    const taskInQueue = listingInQueue.tasks.find((t: any) => t.taskId === taskId);
    expect(taskInQueue).toBeTruthy();
    expect(taskInQueue.canClaim).toBe(true);
  });
});


