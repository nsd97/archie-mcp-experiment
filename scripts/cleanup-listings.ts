import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  },
}));

const table = process.env.LISTINGS_TABLE || "listings";
const tasksTable = process.env.TASKS_TABLE || "tasks";

async function deleteListings(ids: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 25) chunks.push(ids.slice(i, i + 25));
  for (const chunk of chunks) {
    await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [table]: chunk.map((listing_id) => ({ DeleteRequest: { Key: { listing_id } } })),
        },
      })
    );
  }
}

async function deleteTasks(listingIds: string[]) {
  if (listingIds.length === 0) return;

  const tasksToDelete: { listing_id: string; task_id: string }[] = [];
  for (const listing_id of listingIds) {
    let lastKey: Record<string, any> | undefined;
    do {
      const res = await client.send(
        new ScanCommand({
          TableName: tasksTable,
          FilterExpression: "#listing = :listing",
          ExpressionAttributeNames: { "#listing": "listing_id" },
          ExpressionAttributeValues: { ":listing": listing_id },
          ExclusiveStartKey: lastKey,
        })
      );
      for (const item of res.Items ?? []) {
        tasksToDelete.push({ listing_id, task_id: item.task_id });
      }
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  }
  const chunks: typeof tasksToDelete[] = [];
  for (let i = 0; i < tasksToDelete.length; i += 25) chunks.push(tasksToDelete.slice(i, i + 25));
  for (const chunk of chunks) {
    await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [tasksTable]: chunk.map(({ task_id }) => ({ DeleteRequest: { Key: { task_id } } })),
        },
      })
    );
  }
}

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Usage: ts-node scripts/cleanup-listings.ts <listingId> [moreIds...]");
    process.exit(1);
  }
  await deleteTasks(ids);
  await deleteListings(ids);
  console.log(`Deleted listings: ${ids.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
