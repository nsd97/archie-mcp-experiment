import { DynamoDBClient, CreateTableCommand, ListTablesCommand, type CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import { S3Client, CreateBucketCommand, ListBucketsCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { SQSClient, CreateQueueCommand, GetQueueAttributesCommand, GetQueueUrlCommand, SetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { CloudWatchClient, PutMetricAlarmCommand, PutDashboardCommand } from '@aws-sdk/client-cloudwatch';
import dotenv from 'dotenv';

dotenv.config();

const isLocal = process.env.NODE_ENV === 'local';
const region = process.env.AWS_REGION || 'us-east-1';
const endpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';

const ENTITIES_TABLE = process.env.ENTITIES_TABLE || 'entities';
const LISTINGS_TABLE = process.env.LISTINGS_TABLE || 'listings';
const TASKS_TABLE = process.env.TASKS_TABLE || 'tasks';
const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || 'audit_log';
const ARTIFACTS_BUCKET = process.env.ARTIFACTS_BUCKET || 'archieos-artifacts';
const INTAKE_QUEUE_NAME = process.env.INTAKE_QUEUE_NAME || 'intake-queue';
const INTAKE_DLQ_NAME = process.env.INTAKE_DLQ_NAME || 'intake-queue-dlq';
const INTAKE_EVENTS_TABLE = process.env.INTAKE_EVENTS_TABLE || 'intake_events';

const localCreds = isLocal
  ? {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    }
  : {};

const ddb = new DynamoDBClient({ region, endpoint: isLocal ? endpoint : undefined, ...(localCreds as any) });
const s3 = new S3Client({ region, endpoint: isLocal ? endpoint : undefined, forcePathStyle: true, ...(localCreds as any) });
const sqs = new SQSClient({ region, endpoint: isLocal ? endpoint : undefined, ...(localCreds as any) });
const cw = new CloudWatchClient({ region, endpoint: isLocal ? endpoint : undefined, ...(localCreds as any) });

async function ensureTable(def: CreateTableCommandInput) {
  try {
    await ddb.send(new CreateTableCommand(def));
    console.log(`Created table: ${def.TableName}`);
  } catch (err: any) {
    if (err?.name === 'ResourceInUseException') {
      console.log(`Table exists: ${def.TableName}`);
    } else {
      throw err;
    }
  }
}

async function ensureBucket(bucket: string) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket exists: ${bucket}`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket, ACL: 'private' as any }));
    console.log(`Created bucket: ${bucket}`);
  }
}

async function main() {
  if (!isLocal) {
    console.log('NODE_ENV is not local; skipping infra init.');
    return;
  }

  const tables: CreateTableCommandInput[] = [
    {
      TableName: ENTITIES_TABLE,
      KeySchema: [{ AttributeName: 'entity_key', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'entity_key', AttributeType: 'S' },
        { AttributeName: 'type', AttributeType: 'S' },
        { AttributeName: 'status#updated_at', AttributeType: 'S' },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      GlobalSecondaryIndexes: [
        {
          IndexName: 'TypeStatusIndex',
          KeySchema: [
            { AttributeName: 'type', KeyType: 'HASH' },
            { AttributeName: 'status#updated_at', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        },
      ],
    },
    {
      TableName: LISTINGS_TABLE,
      KeySchema: [{ AttributeName: 'listing_id', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'listing_id', AttributeType: 'S' },
        { AttributeName: 'status', AttributeType: 'S' },
        { AttributeName: 'due_date', AttributeType: 'S' },
        { AttributeName: 'agent_id', AttributeType: 'S' },
        { AttributeName: 'type', AttributeType: 'S' },
        { AttributeName: 'GLOBAL', AttributeType: 'S' },
        { AttributeName: 'address_string', AttributeType: 'S' },
        { AttributeName: 'created_at', AttributeType: 'S' },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      GlobalSecondaryIndexes: [
        { IndexName: 'StatusIndex', KeySchema: [ { AttributeName: 'status', KeyType: 'HASH' }, { AttributeName: 'due_date', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'AgentIndex', KeySchema: [ { AttributeName: 'agent_id', KeyType: 'HASH' }, { AttributeName: 'due_date', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'TypeDueDateIndex', KeySchema: [ { AttributeName: 'type', KeyType: 'HASH' }, { AttributeName: 'due_date', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'AddressSearchIndex', KeySchema: [ { AttributeName: 'GLOBAL', KeyType: 'HASH' }, { AttributeName: 'address_string', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'CreatedAtIndex', KeySchema: [ { AttributeName: 'GLOBAL', KeyType: 'HASH' }, { AttributeName: 'created_at', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
      ],
    },
    {
      TableName: TASKS_TABLE,
      KeySchema: [{ AttributeName: 'task_id', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'task_id', AttributeType: 'S' },
        { AttributeName: 'assigned_to.userId', AttributeType: 'S' },
        { AttributeName: 'due_date', AttributeType: 'S' },
        { AttributeName: 'listing_id#status', AttributeType: 'S' },
        { AttributeName: 'priority#due_date', AttributeType: 'S' },
        { AttributeName: 'listing_id', AttributeType: 'S' },
        { AttributeName: 'status#priority', AttributeType: 'S' },
        { AttributeName: 'status', AttributeType: 'S' },
        { AttributeName: 'claim_status', AttributeType: 'S' },
        { AttributeName: 'task_category#is_stray', AttributeType: 'S' },
        { AttributeName: 'created_at', AttributeType: 'S' },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      GlobalSecondaryIndexes: [
        { IndexName: 'MyTasksIndex', KeySchema: [ { AttributeName: 'assigned_to.userId', KeyType: 'HASH' }, { AttributeName: 'due_date', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'QueueIndex', KeySchema: [ { AttributeName: 'listing_id#status', KeyType: 'HASH' }, { AttributeName: 'priority#due_date', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'ListingTasksIndex', KeySchema: [ { AttributeName: 'listing_id', KeyType: 'HASH' }, { AttributeName: 'status#priority', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'StatusIndex', KeySchema: [ { AttributeName: 'listing_id', KeyType: 'HASH' }, { AttributeName: 'status', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'UnclaimedTasksIndex', KeySchema: [ { AttributeName: 'listing_id', KeyType: 'HASH' }, { AttributeName: 'claim_status', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'TaskCategoryIndex', KeySchema: [ { AttributeName: 'task_category#is_stray', KeyType: 'HASH' }, { AttributeName: 'created_at', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
      ],
    },
    {
      TableName: AUDIT_LOG_TABLE,
      KeySchema: [ { AttributeName: 'entity_id', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' } ],
      AttributeDefinitions: [
        { AttributeName: 'entity_id', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'performed_by', AttributeType: 'S' },
        { AttributeName: 'timestamp', AttributeType: 'S' },
        { AttributeName: 'entity_type#action', AttributeType: 'S' },
        { AttributeName: 'entity_type#entity_id', AttributeType: 'S' },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      GlobalSecondaryIndexes: [
        { IndexName: 'UserActivityIndex', KeySchema: [ { AttributeName: 'performed_by', KeyType: 'HASH' }, { AttributeName: 'timestamp', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'EntityTypeIndex', KeySchema: [ { AttributeName: 'entity_type#action', KeyType: 'HASH' }, { AttributeName: 'timestamp', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
        { IndexName: 'ListingHistoryIndex', KeySchema: [ { AttributeName: 'entity_type#entity_id', KeyType: 'HASH' }, { AttributeName: 'timestamp', KeyType: 'RANGE' } ], Projection: { ProjectionType: 'ALL' }, ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 } },
      ],
    },
    {
      TableName: INTAKE_EVENTS_TABLE,
      KeySchema: [{ AttributeName: 'event_id', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'event_id', AttributeType: 'S' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  ];

  for (const t of tables) {
    await ensureTable(t);
  }

  await ensureBucket(ARTIFACTS_BUCKET);

  // SQS queues (DLQ + main with redrive)
  try {
    // DLQ
    let dlqUrl: string;
    try {
      dlqUrl = (await sqs.send(new CreateQueueCommand({ QueueName: INTAKE_DLQ_NAME }))).QueueUrl!;
    } catch (e: any) {
      // AWS SQS throws an error with code 'QueueAlreadyExists' or 'QueueNameExists' if the queue already exists.
      // In localstack, the error may not always have a consistent code, so also check the message.
      if (
        e?.name === 'QueueAlreadyExists' ||
        e?.name === 'QueueNameExists' ||
        e?.Code === 'QueueAlreadyExists' ||
        e?.Code === 'QueueNameExists' ||
        (typeof e?.message === 'string' && e.message.includes('Queue already exists'))
      ) {
        dlqUrl = (await sqs.send(new GetQueueUrlCommand({ QueueName: INTAKE_DLQ_NAME }))).QueueUrl!;
      } else {
        throw e;
      }
    }
    const dlqAttrs = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: dlqUrl,
        AttributeNames: ['QueueArn'],
      })
    );
    const dlqArn = dlqAttrs.Attributes?.QueueArn as string;

    // Main
    let qUrl: string;
    try {
      qUrl = (await sqs.send(new CreateQueueCommand({ QueueName: INTAKE_QUEUE_NAME }))).QueueUrl!;
    } catch (e: any) {
      if (e?.name === 'QueueAlreadyExists') {
        qUrl = (await sqs.send(new GetQueueUrlCommand({ QueueName: INTAKE_QUEUE_NAME }))).QueueUrl!;
      } else {
        throw e;
      }
    }
    const redrivePolicy = JSON.stringify({
      deadLetterTargetArn: dlqArn,
      maxReceiveCount: 5,
    });
    await sqs.send(
      new SetQueueAttributesCommand({
        QueueUrl: qUrl,
        Attributes: { RedrivePolicy: redrivePolicy },
      })
    );
    console.log('SQS queues ensured:', { qUrl, dlqUrl });
  } catch (err) {
    console.log('SQS ensure error (likely exists):', (err as any)?.name || err);
  }

  // Alarms and Dashboard
  try {
    await cw.send(
      new PutMetricAlarmCommand({
        AlarmName: 'IntakeQueue-OldestAge-High',
        MetricName: 'ApproximateAgeOfOldestMessage',
        Namespace: 'AWS/SQS',
        Statistic: 'Maximum',
        Period: 60,
        EvaluationPeriods: 1,
        Threshold: 60,
        ComparisonOperator: 'GreaterThanThreshold',
        Dimensions: [{ Name: 'QueueName', Value: INTAKE_QUEUE_NAME }],
      })
    );
    await cw.send(
      new PutMetricAlarmCommand({
        AlarmName: 'IntakeDLQ-MessagesVisible-High',
        MetricName: 'ApproximateNumberOfMessagesVisible',
        Namespace: 'AWS/SQS',
        Statistic: 'Maximum',
        Period: 60,
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        Dimensions: [{ Name: 'QueueName', Value: INTAKE_DLQ_NAME }],
        TreatMissingData: 'notBreaching',
      })
    );
    // Basic dashboard with SQS widgets
    const dashboardBody = JSON.stringify({
      widgets: [
        {
          type: 'metric',
          properties: {
            title: 'SQS Visible Messages',
            metrics: [['AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'QueueName', INTAKE_QUEUE_NAME]],
            view: 'timeSeries',
            region,
            period: 60,
          },
        },
        {
          type: 'metric',
          properties: {
            title: 'SQS Oldest Age',
            metrics: [['AWS/SQS', 'ApproximateAgeOfOldestMessage', 'QueueName', INTAKE_QUEUE_NAME]],
            view: 'timeSeries',
            region,
            period: 60,
          },
        },
      ],
    });
    await cw.send(new PutDashboardCommand({ DashboardName: 'OpsCenter', DashboardBody: dashboardBody }));
    console.log('CloudWatch alarms ensured');
  } catch (e) {
    console.log('CloudWatch alarms setup skipped:', (e as any)?.name || e);
  }

  // Output for verification convenience
  const tableList = await ddb.send(new ListTablesCommand({}));
  console.log('Tables:', tableList.TableNames);
  const buckets = await s3.send(new ListBucketsCommand({}));
  console.log('Buckets:', buckets.Buckets?.map((b: any) => b.Name));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
