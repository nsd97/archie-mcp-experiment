import dotenv from 'dotenv';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

dotenv.config();

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';

const base = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test' },
});
const ddb = DynamoDBDocumentClient.from(base);

const ENTITIES_TABLE = process.env.ENTITIES_TABLE || 'entities';
const LISTINGS_TABLE = process.env.LISTINGS_TABLE || 'listings';
const TASKS_TABLE = process.env.TASKS_TABLE || 'tasks';
const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || 'audit_log';

async function truncate(tableName: string, keyNames: string[]) {
  const projection = keyNames.map((_, idx) => `#k${idx}`).join(', ');
  const ExpressionAttributeNames = keyNames.reduce<Record<string, string>>((acc, key, idx) => {
    acc[`#k${idx}`] = key;
    return acc;
  }, {});
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const scan = await ddb.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: projection,
      ExpressionAttributeNames,
      ExclusiveStartKey,
    }));
    for (const item of scan.Items || []) {
      const key = keyNames.reduce<Record<string, unknown>>((acc, keyName) => {
        acc[keyName] = (item as any)[keyName];
        return acc;
      }, {});
      await ddb.send(new DeleteCommand({ TableName: tableName, Key: key as any }));
    }
    ExclusiveStartKey = scan.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);
}

async function main() {
  // Best-effort truncate known tables
  await truncate(ENTITIES_TABLE, ['entity_key']);
  await truncate(LISTINGS_TABLE, ['listing_id']);
  await truncate(TASKS_TABLE, ['task_id']);
  await truncate(AUDIT_LOG_TABLE, ['entity_id', 'sk']);
  await import('./seed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
