import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { waitUntilTableExists } from "@aws-sdk/client-dynamodb";

const REGION = process.env.AWS_REGION || "us-east-1";
const ENDPOINT = process.env.LOCALSTACK_ENDPOINT || process.env.DYNAMO_ENDPOINT || "http://localhost:4566";

const client = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test", secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test" },
});

async function ensureTable(params: any) {
  const name = params.TableName as string;
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    console.log(`Table exists: ${name}`);
    return;
  } catch (err: any) {
    if (err?.name !== "ResourceNotFoundException") throw err;
  }
  console.log(`Creating table: ${name}`);
  await client.send(new CreateTableCommand(params));
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: name });
  console.log(`Table ready: ${name}`);
}

async function main() {
  const ENTITIES_TABLE = process.env.ENTITIES_TABLE || "entities";
  const LISTINGS_TABLE = process.env.LISTINGS_TABLE || "listings";
  const TASKS_TABLE = process.env.TASKS_TABLE || "tasks";
  const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || "audit_log";

  await ensureTable({
    TableName: ENTITIES_TABLE,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "entity_key", AttributeType: "S" },
      { AttributeName: "type", AttributeType: "S" },
      { AttributeName: "status#updated_at", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "entity_key", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "TypeStatusIndex",
        KeySchema: [
          { AttributeName: "type", KeyType: "HASH" },
          { AttributeName: "status#updated_at", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await ensureTable({
    TableName: LISTINGS_TABLE,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "listing_id", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
      { AttributeName: "due_date", AttributeType: "S" },
      { AttributeName: "agent_id", AttributeType: "S" },
      { AttributeName: "type", AttributeType: "S" },
      { AttributeName: "GLOBAL", AttributeType: "S" },
      { AttributeName: "address_string", AttributeType: "S" },
      { AttributeName: "created_at", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "listing_id", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "StatusIndex",
        KeySchema: [
          { AttributeName: "status", KeyType: "HASH" },
          { AttributeName: "due_date", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "AgentIndex",
        KeySchema: [
          { AttributeName: "agent_id", KeyType: "HASH" },
          { AttributeName: "due_date", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "TypeDueDateIndex",
        KeySchema: [
          { AttributeName: "type", KeyType: "HASH" },
          { AttributeName: "due_date", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "AddressSearchIndex",
        KeySchema: [
          { AttributeName: "GLOBAL", KeyType: "HASH" },
          { AttributeName: "address_string", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "CreatedAtIndex",
        KeySchema: [
          { AttributeName: "GLOBAL", KeyType: "HASH" },
          { AttributeName: "created_at", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await ensureTable({
    TableName: TASKS_TABLE,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "task_id", AttributeType: "S" },
      { AttributeName: "assigned_to.userId", AttributeType: "S" },
      { AttributeName: "due_date", AttributeType: "S" },
      { AttributeName: "listing_id#status", AttributeType: "S" },
      { AttributeName: "priority#due_date", AttributeType: "S" },
      { AttributeName: "listing_id", AttributeType: "S" },
      { AttributeName: "status#priority", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
      { AttributeName: "claim_status", AttributeType: "S" },
      { AttributeName: "task_category#is_stray", AttributeType: "S" },
      { AttributeName: "created_at", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "task_id", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "MyTasksIndex",
        KeySchema: [
          { AttributeName: "assigned_to.userId", KeyType: "HASH" },
          { AttributeName: "due_date", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "QueueIndex",
        KeySchema: [
          { AttributeName: "listing_id#status", KeyType: "HASH" },
          { AttributeName: "priority#due_date", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "ListingTasksIndex",
        KeySchema: [
          { AttributeName: "listing_id", KeyType: "HASH" },
          { AttributeName: "status#priority", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "StatusIndex",
        KeySchema: [
          { AttributeName: "listing_id", KeyType: "HASH" },
          { AttributeName: "status", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "UnclaimedTasksIndex",
        KeySchema: [
          { AttributeName: "listing_id", KeyType: "HASH" },
          { AttributeName: "claim_status", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "TaskCategoryIndex",
        KeySchema: [
          { AttributeName: "task_category#is_stray", KeyType: "HASH" },
          { AttributeName: "created_at", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await ensureTable({
    TableName: AUDIT_LOG_TABLE,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "entity_id", AttributeType: "S" },
      { AttributeName: "sk", AttributeType: "S" },
      { AttributeName: "performed_by", AttributeType: "S" },
      { AttributeName: "timestamp", AttributeType: "S" },
      { AttributeName: "entity_type#action", AttributeType: "S" },
      { AttributeName: "entity_type#entity_id", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "entity_id", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "UserActivityIndex",
        KeySchema: [
          { AttributeName: "performed_by", KeyType: "HASH" },
          { AttributeName: "timestamp", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "EntityTypeIndex",
        KeySchema: [
          { AttributeName: "entity_type#action", KeyType: "HASH" },
          { AttributeName: "timestamp", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        IndexName: "ListingHistoryIndex",
        KeySchema: [
          { AttributeName: "entity_type#entity_id", KeyType: "HASH" },
          { AttributeName: "timestamp", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
