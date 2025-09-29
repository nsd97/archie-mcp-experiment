import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import dotenv from "dotenv";

dotenv.config();

const TEST_USER = {
  userId: "test-user",
  email: "test@example.com",
  name: "Test User",
  tenantId: "tenant-1",
  provider: "debug",
  roles: ["ADMIN_OPS"],
  groups: ["BOTH"],
};

function withUser(req: request.Test) {
  return req.set("x-debug-user", JSON.stringify(TEST_USER));
}

type ListingsModule = typeof import("../src/db/listings");
type TasksModule = typeof import("../src/db/tasks");
type PutListingPayload = Parameters<ListingsModule["putListing"]>[0];
type PutTaskPayload = Parameters<TasksModule["putTask"]>[0];
type Listing = Awaited<ReturnType<ListingsModule["putListing"]>>;
type Task = Awaited<ReturnType<TasksModule["putTask"]>>;

let app: FastifyInstance;
let listing!: Listing;
let task!: Task;
let ddbClient: import("@aws-sdk/client-dynamodb").DynamoDBClient;
const createdTables: string[] = [];

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
  process.env.AWS_ACCESS_KEY_ID = "test";
  process.env.AWS_SECRET_ACCESS_KEY = "test";
  process.env.LISTINGS_TABLE = process.env.LISTINGS_TABLE || "test-listings";
  process.env.TASKS_TABLE = process.env.TASKS_TABLE || "test-tasks";
  process.env.ENTITIES_TABLE = process.env.ENTITIES_TABLE || "test-entities";

  const { DynamoDBClient, CreateTableCommand } = await import("@aws-sdk/client-dynamodb");
  ddbClient = new DynamoDBClient({
    region: process.env.AWS_REGION,
    endpoint: process.env.LOCALSTACK_ENDPOINT,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
  });

  const listingsTable = process.env.LISTINGS_TABLE;
  const tasksTable = process.env.TASKS_TABLE;

// tests/tasks.routes.test.ts

// Track only tables we truly create
const createdTables: string[] = [];

const ensureTable = async (commandInput: any) => {
  try {
    await ddbClient.send(new CreateTableCommand(commandInput));
    // Only record if we actually created it
    createdTables.push(commandInput.TableName as string);
    return true;
  } catch (err: any) {
    // Table already exists—nothing to record
    if (err?.name === "ResourceInUseException") return false;
    throw err;
  }
};

await ensureTable({
  TableName: listingsTable,
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "listing_id", AttributeType: "S" },
    { AttributeName: "status",     AttributeType: "S" },
    { AttributeName: "GLOBAL",     AttributeType: "S" },
    { AttributeName: "created_at", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "listing_id", KeyType: "HASH" }],
  GlobalSecondaryIndexes: [
    {
      IndexName: "StatusIndex",
      KeySchema: [
        { AttributeName: "status",     KeyType: "HASH" },
        { AttributeName: "listing_id", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
    {
      IndexName: "CreatedAtIndex",
      KeySchema: [
        { AttributeName: "GLOBAL",     KeyType: "HASH" },
        { AttributeName: "created_at", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});

// No more unconditional createdTables.push(listingsTable!);

await ensureTable({
  TableName: tasksTable,
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "task_id",    AttributeType: "S" },
    /* ... */
  ],
  KeySchema: [{ AttributeName: "task_id", KeyType: "HASH" }],
});

// No more createdTables.push(tasksTable!);

await ensureTable({
  TableName: process.env.ENTITIES_TABLE!,
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    /* ... */
  ],
  KeySchema: [
    /* ... */
  ],
});

// No more createdTables.push(process.env.ENTITIES_TABLE!);
  await ensureTable({
    TableName: tasksTable,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "task_id", AttributeType: "S" },
      { AttributeName: "listing_id", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
      { AttributeName: "status#priority", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "task_id", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
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
    ],
  });
  createdTables.push(tasksTable!);

  const { createApp } = await import("../src/app");
  const mockAudit = await import("../src/db/audit_log");
  vi.spyOn(mockAudit, "putAuditEvent").mockResolvedValue({ event_id: "evt", timestamp: new Date().toISOString() } as any);
  vi.spyOn(mockAudit, "queryListingHistory").mockResolvedValue([] as any);
  app = createApp({ enableCors: false, enablePreflightRoute: false });
  await app.ready();

  const { putListing } = await import("../src/db/listings");
  const { putTask } = await import("../src/db/tasks");

  const listingPayload: PutListingPayload = {
    type: "SALE",
    status: "ACTIVE",
    address_string: "50 Echo St",
  };

  listing = await putListing(listingPayload);

  await ensureTable({
    TableName: process.env.ENTITIES_TABLE,
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
  createdTables.push(process.env.ENTITIES_TABLE!);

  const { putEntity } = await import("../src/db/entities");
  await putEntity({
    entity_key: TEST_USER.userId,
    type: "user",
    status: "ACTIVE",
    email: TEST_USER.email,
    name: TEST_USER.name,
    tenant_id: TEST_USER.tenantId,
    roles: TEST_USER.roles,
    visibility_groups: TEST_USER.groups,
  } as any);

  const taskPayload: PutTaskPayload = {
    listing_id: listing.listing_id,
    name: "Coordinate inspection",
    status: "OPEN",
    priority: 5,
    task_category: "ops",
    visibility_group: "BOTH",
  };

  task = await putTask(taskPayload);
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
  const { DeleteTableCommand } = await import("@aws-sdk/client-dynamodb");
  const tables = new Set<string>();
  for (const table of createdTables) {
    if (table) tables.add(table);
  }
  for (const table of tables) {
    if (!table) continue;
    try {
      await ddbClient.send(new DeleteTableCommand({ TableName: table }));
    } catch (err: any) {
      if (err?.name !== "ResourceNotFoundException") throw err;
    }
  }
  if (ddbClient) {
    await ddbClient.destroy();
  }
});

describe("Tasks APIs", () => {
  it("list by listing with pagination and filters", async () => {
    const res = await withUser(
      request(app.server)
        .get(`/v1/operations/tasks/${listing.listing_id}`)
        .query({ status: "pending", page: 1, limit: 25, priority: "medium" })
    );
    expect(res.status).toBe(200);
    expect(res.body.listingId).toBe(listing.listing_id);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.pagination).toEqual(
      expect.objectContaining({ page: expect.any(Number), limit: expect.any(Number), total: expect.any(Number), totalPages: expect.any(Number) })
    );
  });

  it("get by taskId and claim/unclaim toggles status and assignee", async () => {
    const getRes = await withUser(request(app.server).get(`/v1/operations/tasks/task/${task.task_id}`));
    expect(getRes.status).toBe(200);
    expect(getRes.body.task.id).toBe(task.task_id);

    const claimRes = await withUser(
      request(app.server)
        .post(`/v1/operations/tasks/${task.task_id}/claim`)
        .send({ userId: "user-xyz" })
    );
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.task.status).toBe("CLAIMED");
    expect(claimRes.body.task.assignedTo?.userId).toBe("user-xyz");

    const unclaimRes = await withUser(
      request(app.server)
        .post(`/v1/operations/tasks/${task.task_id}/unclaim`)
        .send({ userId: "user-xyz", reason: "test" })
    );
    expect(unclaimRes.status).toBe(200);
    expect(unclaimRes.body.task.status).toBe("UNASSIGNED");
    expect(unclaimRes.body.task.assignedTo).toBe(null);
  });

  it("enforces outputs schema on completion", async () => {
    const { putTask } = await import("../src/db/tasks");
    const completionTaskPayload: PutTaskPayload = {
      listing_id: listing.listing_id,
      name: "Book photos",
      status: "OPEN",
      task_def_id: "SALE::BOOK_PHOTOS",
      inputs: { availability: "10-12" },
    };
    const t = await putTask(completionTaskPayload);

    const bad = await withUser(
      request(app.server)
        .post(`/v1/operations/tasks/${t.task_id}/complete`)
        .send({ completedBy: TEST_USER.userId, outputs: {} })
    );
    expect(bad.status).toBe(400);

    const good = await withUser(
      request(app.server)
        .post(`/v1/operations/tasks/${t.task_id}/complete`)
        .send({ completedBy: TEST_USER.userId, outputs: { scheduled_start: "2025-01-01T10:00:00Z" } })
    );
    expect(good.status).toBe(200);
    expect(good.body.task.status).toBe("COMPLETED");
  });
});
