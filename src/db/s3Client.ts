import { S3Client } from '@aws-sdk/client-s3';

const REGION = process.env.AWS_REGION || 'us-east-1';
const LOCALSTACK = process.env.LOCALSTACK_ENDPOINT || '';

const s3 = new S3Client({
  region: REGION,
  forcePathStyle: !!LOCALSTACK,
  ...(LOCALSTACK
    ? {
        endpoint: LOCALSTACK,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
        },
      }
    : {}),
});

export default s3;
