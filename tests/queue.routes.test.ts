import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";
import { putListing, type Listing } from "../src/db/listings";
import { putTask, type Task } from "../src/db/tasks";

dotenv.config();

let app: any;
let listing: Listing;
let taskA: Task;
let taskB: Task;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
  app = (await import("../src/app")).default;
  await app.ready();

  listing = await putListing({
    type: "SALE",
    status: "ACTIVE",
    address_string: "40 Delta Dr",
    agent_id: "agent-x",
    due_date: "2099-08-01T00:00:00.000Z",
  } as Partial<Listing> as any);

  taskA = await putTask({
    listing_id: listing.listing_id,
    name: "Photograph property",
    status: "OPEN",
    priority: 7,
  } as Partial<Task> as any);

  taskB = await putTask({
    listing_id: listing.listing_id,
    name: "Prepare documents",
    status: "OPEN",
    priority: 3,
  } as Partial<Task> as any);
});

afterAll(async () => {
  await app.close();
});

describe("Queue APIs", () => {
  it("claim one task, verify summary and queue view", async () => {
    const claimRes = await request(app.server)
      .post(`/v1/operations/tasks/${taskA.task_id}/claim`)
      .send({ assigneeId: "user-z" });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.task.status).toBe("claimed");
    expect(typeof claimRes.body.task.claimedAt).toBe("string");

    const summary = await request(app.server).get("/v1/operations/queues");
    expect(summary.status).toBe(200);
    expect(summary.body).toEqual(
      expect.objectContaining({
        totalQueued: expect.any(Number),
        processingNow: expect.any(Number),
        completed: expect.any(Number),
        failed: expect.any(Number),
        avgProcessingTime: expect.any(Number),
      })
    );

    const queue = await request(app.server).get("/v1/operations/queue");
    expect(queue.status).toBe(200);
    expect(Array.isArray(queue.body.listings)).toBe(true);
    expect(typeof queue.body.totalListings).toBe("number");
    expect(typeof queue.body.totalTasks).toBe("number");

    // Find our listing and validate tasks with canClaim
    const l = queue.body.listings.find((x: any) => x.listingId === listing.listing_id);
    expect(l).toBeTruthy();
    const tA = l.tasks.find((t: any) => t.taskId === taskA.task_id);
    const tB = l.tasks.find((t: any) => t.taskId === taskB.task_id);
    expect(tA.canClaim).toBe(false);
    expect(tB.canClaim).toBe(true);
  });
});
