import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { SQSClient, GetQueueUrlCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import dotenv from 'dotenv';

dotenv.config();

const isLocal = process.env.NODE_ENV === 'local';
const region = process.env.AWS_REGION || 'us-east-1';
const endpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';

const ddb = new DynamoDBClient({ region, endpoint: isLocal ? endpoint : undefined });
const s3 = new S3Client({ region, endpoint: isLocal ? endpoint : undefined, forcePathStyle: true });
const sqs = new SQSClient({ region, endpoint: isLocal ? endpoint : undefined });

async function main() {
  const tables = await ddb.send(new ListTablesCommand({}));
  console.log('Tables:', tables.TableNames);
  const buckets = await s3.send(new ListBucketsCommand({}));
  console.log('Buckets:', buckets.Buckets?.map((b: any) => b.Name));

  // Verify SQS queue and DLQ
  const mainName = process.env.INTAKE_QUEUE_NAME || 'intake-queue';
  const dlqName = process.env.INTAKE_DLQ_NAME || 'intake-queue-dlq';
  const mainUrl = (await sqs.send(new GetQueueUrlCommand({ QueueName: mainName }))).QueueUrl;
  const dlqUrl = (await sqs.send(new GetQueueUrlCommand({ QueueName: dlqName }))).QueueUrl;
  const mainAttrs = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: mainUrl!, AttributeNames: ['RedrivePolicy'] }));
  console.log('Queues:', { mainUrl, dlqUrl, redrive: mainAttrs.Attributes?.RedrivePolicy });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
