import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { computeSlackSignature } from '../src/services/slackVerify';

let app: any;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SLACK_SIGNING_SECRET = 'testsecret';
  app = (await import('../src/app')).default;
  await app.ready();
});

afterAll(async () => { if (app?.close) await app.close(); });

describe('Slack routes', () => {
  it('rejects invalid signature', async () => {
    const body = { type: 'url_verification', challenge: 'abc' };
    const res = await request(app.server)
      .post('/slack/events')
      .set('x-slack-signature', 'v0=deadbeef')
      .set('x-slack-request-timestamp', `${Math.floor(Date.now()/1000)}`)
      .send(body);
    expect(res.status).toBe(401);
  });

  it('accepts valid signature and returns challenge', async () => {
    const ts = `${Math.floor(Date.now()/1000)}`;
    const payload = { type: 'url_verification', challenge: 'abc' };
    const bodyStr = JSON.stringify(payload);
    const sig = computeSlackSignature('testsecret', ts, bodyStr);
    const res = await request(app.server)
      .post('/slack/events')
      .set('x-slack-signature', sig)
      .set('x-slack-request-timestamp', ts)
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.challenge).toBe('abc');
  });

  it('rejects stale timestamp', async () => {
    const ts = `${Math.floor(Date.now()/1000) - 600}`;
    const payload = { type: 'url_verification', challenge: 'abc' };
    const bodyStr = JSON.stringify(payload);
    const sig = computeSlackSignature('testsecret', ts, bodyStr);
    const res = await request(app.server)
      .post('/slack/events')
      .set('x-slack-signature', sig)
      .set('x-slack-request-timestamp', ts)
      .send(payload);
    expect(res.status).toBe(401);
  });

  it('rejects tampered payload', async () => {
    const ts = `${Math.floor(Date.now()/1000)}`;
    const payload = { type: 'url_verification', challenge: 'abc' };
    const bodyStr = JSON.stringify(payload);
    const sig = computeSlackSignature('testsecret', ts, bodyStr);
    const res = await request(app.server)
      .post('/slack/events')
      .set('x-slack-signature', sig)
      .set('x-slack-request-timestamp', ts)
      .send({ ...payload, challenge: 'tampered' });
    expect(res.status).toBe(401);
  });
});


