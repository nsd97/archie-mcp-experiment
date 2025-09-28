import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";
import { putListing, type Listing } from "../src/db/listings";
import { putTask, type Task } from "../src/db/tasks";

dotenv.config();

let app: any;
let listing: Listing;
let task: Task;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
  app = (await import("../src/app")).default;
  await app.ready();

  listing = await putListing({
    type: "SALE",
    status: "ACTIVE",
    address_string: "50 Echo St",
  } as Partial<Listing> as any);

  task = await putTask({
    listing_id: listing.listing_id,
    name: "Coordinate inspection",
    status: "OPEN",
    priority: 5,
    task_category: "ops",
  } as Partial<Task> as any);
});

afterAll(async () => {
  await app.close();
});

describe("Tasks APIs", () => {
  it("list by listing with pagination and filters", async () => {
    const res = await request(app.server)
      .get(`/v1/operations/tasks/${listing.listing_id}`)
      .query({ status: "pending", page: 1, limit: 25, priority: "medium" });
    expect(res.status).toBe(200);
    expect(res.body.listingId).toBe(listing.listing_id);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.pagination).toEqual(
      expect.objectContaining({ page: expect.any(Number), limit: expect.any(Number), total: expect.any(Number), totalPages: expect.any(Number) })
    );
  });

  it("get by taskId and claim/unclaim toggles status and assignee", async () => {
    const getRes = await request(app.server).get(`/v1/operations/tasks/task/${task.task_id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.task.id).toBe(task.task_id);

    const claimRes = await request(app.server)
      .post(`/v1/operations/tasks/${task.task_id}/claim`)
      .send({ userId: "user-xyz" });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.task.status).toBe("claimed");
    expect(claimRes.body.task.assignedTo?.userId).toBe("user-xyz");

    const unclaimRes = await request(app.server)
      .post(`/v1/operations/tasks/${task.task_id}/unclaim`)
      .send({ userId: "user-xyz", reason: "test" });
    expect(unclaimRes.status).toBe(200);
    expect(unclaimRes.body.task.status).toBe("pending");
    expect(unclaimRes.body.task.assignedTo).toBe(null);
  });
});
