import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";
import type { Listing } from "../src/db/listings";
import type { Task } from "../src/db/tasks";

dotenv.config();

let app: any;
let listing: Listing;
let taskA: Task;
let taskB: Task;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "test";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "test";
  app = (await import("../src/app")).default;
  await app.ready();

  const { putListing } = await import("../src/db/listings");
  const { putTask } = await import("../src/db/tasks");

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
    visibility_group: "ADMIN_OPS",
  } as Partial<Task> as any);

  taskB = await putTask({
    listing_id: listing.listing_id,
    name: "Prepare documents",
    status: "OPEN",
    priority: 3,
    visibility_group: "ADMIN_MARKETING",
  } as Partial<Task> as any);
});

afterAll(async () => {
  await app.close();
});

describe("Queue APIs", () => {
  it("claim one task, verify summary and queue view", async () => {
    const claimRes = await request(app.server)
      .post(`/v1/operations/tasks/${taskB.task_id}/claim`)
      .set(
        "X-Debug-User",
        JSON.stringify({ userId: "admin:marketing", roles: ["ADMIN_MARKETING"], groups: ["ADMIN_MARKETING", "BOTH"] })
      )
      .send({ assigneeId: "admin:marketing" });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.task.status).toBe("CLAIMED");
    expect(typeof claimRes.body.task.claimedAt).toBe("string");

    const summary = await request(app.server)
      .get("/v1/operations/queues")
      .set("X-Debug-User", JSON.stringify({ userId: "admin:ops", groups: ["ADMIN_OPS", "BOTH"], roles: ["ADMIN_OPS"] }));
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

    const queue = await request(app.server)
      .get("/v1/operations/queue")
      .set("X-Debug-User", JSON.stringify({ userId: "admin:ops", groups: ["ADMIN_OPS", "BOTH"], roles: ["ADMIN_OPS"] }));
    expect(queue.status).toBe(200);
    expect(Array.isArray(queue.body.listings)).toBe(true);
    expect(typeof queue.body.totalListings).toBe("number");
    expect(typeof queue.body.totalTasks).toBe("number");

    const l = queue.body.listings.find((x: any) => x.listingId === listing.listing_id);
    expect(l).toBeTruthy();
    const taskIds = l.tasks.map((t: any) => t.taskId);
    expect(taskIds).toContain(taskA.task_id);
    expect(taskIds).not.toContain(taskB.task_id);

    // Marketing user should not see ADMIN_OPS only task but see marketing one
    const marketingQueue = await request(app.server)
      .get("/v1/operations/queue")
      .set("X-Debug-User", JSON.stringify({ userId: "admin:marketing", roles: ["ADMIN_MARKETING"], groups: ["ADMIN_MARKETING", "BOTH"] }));
    const marketingListing = marketingQueue.body.listings.find((x: any) => x.listingId === listing.listing_id);
    expect(marketingListing).toBeTruthy();
    const marketingIds = marketingListing.tasks.map((t: any) => t.taskId);
    expect(marketingIds).toContain(taskB.task_id);
    expect(marketingIds).not.toContain(taskA.task_id);
  });
});
