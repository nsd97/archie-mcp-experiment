import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../src/db/s3Client';

let app: any;
const BUCKET = process.env.ARTIFACTS_BUCKET || 'archieos-artifacts';
const listingId = '01TESTLISTINGDOCS';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  process.env.ARTIFACTS_BUCKET = BUCKET;

  app = (await import('../src/app')).default;
  await app.ready();

  // seed two S3 objects
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `listings/${listingId}/PHOTO_SET/image1.jpg`, Body: 'x' } as any));
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `listings/${listingId}/MPAC_REPORT/report.pdf`, Body: 'y' } as any));
});

afterAll(async () => {
  if (app?.close) await app.close();
});

describe('Files routes', () => {
  it('lists documents for a listing', async () => {
    const res = await request(app.server).get(`/v1/listings/${listingId}/documents`);
    expect(res.status).toBe(200);
    expect(res.body.listingId).toBe(listingId);
    const keys = res.body.documents.map((d: any) => d.objectKey);
    expect(keys).toEqual(expect.arrayContaining([
      `listings/${listingId}/PHOTO_SET/image1.jpg`,
      `listings/${listingId}/MPAC_REPORT/report.pdf`,
    ]));
  });

  it('presigns GET for an allowed key', async () => {
    const objectKey = `listings/${listingId}/PHOTO_SET/image1.jpg`;
    const res = await request(app.server).post('/files/sign-get').send({ objectKey });
    expect(res.status).toBe(200);
    expect(typeof res.body.url).toBe('string');
  });
});


