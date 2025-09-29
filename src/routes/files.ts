import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import s3 from '../db/s3Client';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isCloudFrontEnabled, signCloudFrontUrl } from '../services/cloudfront';

const ARTIFACTS_BUCKET = process.env.ARTIFACTS_BUCKET || 'archieos-artifacts';

const listDocsParams = z.object({ id: z.string() });
const listDocsResponse = z.object({
  listingId: z.string(),
  documents: z.array(
    z.object({ docType: z.string(), objectKey: z.string(), updatedAt: z.string() })
  ),
});

const signGetBody = z.object({ objectKey: z.string().min(1) });
const signGetResponse = z.object({ url: z.string().url() });

const ALLOWED_PREFIXES = ['listings/', 'stray/'];

function isAllowedKey(key: string): boolean {
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

export default async function filesRoutes(app: FastifyInstance) {
  app.withValidation({
    method: 'GET',
    url: '/v1/listings/:id/documents',
    validation: { params: listDocsParams, response: { 200: listDocsResponse } },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { id } = req.params as any;
      // Optionally double-check inside handler if preHandler not available
      // if (!(await canReadListing(req.user, id))) {
      //   return reply.code(403).send({ error: 'Forbidden' });
      // }
      const prefix = `listings/${id}/`;
      const res = await s3.send(
        new ListObjectsV2Command({ Bucket: ARTIFACTS_BUCKET, Prefix: prefix })
      );
      const docs = (res.Contents || []).map((o) => ({
        docType: (o.Key || '').split('/')[2] || 'unknown',
        objectKey: o.Key || '',
        updatedAt: (o.LastModified || new Date()).toISOString(),
      }));
      return { listingId: id, documents: docs };
    },
  });
  app.withValidation({
    method: 'POST',
    url: '/files/sign-get',
    validation: { body: signGetBody, response: { 200: signGetResponse } },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { objectKey } = req.body as any;
      if (!isAllowedKey(objectKey)) {
        return reply.code(400).send({ error: 'Invalid objectKey' });
      }
      if (isCloudFrontEnabled()) {
        const url = signCloudFrontUrl(objectKey, 300);
        return { url };
      } else {
        const cmd = new GetObjectCommand({ Bucket: ARTIFACTS_BUCKET, Key: objectKey });
        const url = await getSignedUrl(s3 as any, cmd as any, { expiresIn: 300 });
        return { url };
      }
    },
  });
}


