import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";
import { putListing, type Listing } from "../src/db/listings";
import { putTask, type Task } from "../src/db/tasks";

dotenv.config();

let app: any;
let listingA: Listing;
let listingB: Listing;
let userId = "user-mine";

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
  app = (await import("../src/app")).default;
  await app.ready();

  listingA = await putListing({ type: "SALE", status: "ACTIVE", address_string: "60 Foxtrot Ave" } as Partial<Listing> as any);
  listingB = await putListing({ type: "LEASE", status: "ACTIVE", address_string: "70 Golf Rd" } as Partial<Listing> as any);

  await putTask({ listing_id: listingA.listing_id, name: "A1", status: "OPEN", priority: 5, due_date: "2099-01-01T00:00:00.000Z", assigned_to: { userId } } as Partial<Task> as any);
  await putTask({ listing_id: listingA.listing_id, name: "A2", status: "CLAIMED", priority: 2, due_date: "2099-02-01T00:00:00.000Z", assigned_to: { userId } } as Partial<Task> as any);
  await putTask({ listing_id: listingB.listing_id, name: "B1", status: "OPEN", priority: 8, due_date: "2099-03-01T00:00:00.000Z", assigned_to: { userId } } as Partial<Task> as any);
});

afterAll(async () => { await app.close(); });

describe("My Tasks APIs", () => {
  it("GET /v1/operations/my-tasks groups by listing and totals", async () => {
    const res = await request(app.server)
      .get("/v1/operations/my-tasks")
      .query({ userId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.listings)).toBe(true);
    expect(typeof res.body.totalTasks).toBe("number");

    const a = res.body.listings.find((l: any) => l.listingId === listingA.listing_id);
    const b = res.body.listings.find((l: any) => l.listingId === listingB.listing_id);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a.taskCount).toBeGreaterThan(0);
    expect(b.taskCount).toBeGreaterThan(0);
  });

  it("unclaim and complete mutate state correctly", async () => {
    // Find one of user tasks and unclaim
    const res = await request(app.server).get("/v1/operations/my-tasks").query({ userId });
    const listingWithTwoTasks = res.body.listings.find(
      (l: any) => l.listingId === listingA.listing_id
    );
    expect(listingWithTwoTasks?.tasks?.length).toBeGreaterThan(1);
    const [firstTask, secondTask] = listingWithTwoTasks!.tasks;
    const firstTaskId = firstTask.taskId;
    const unclaimRes = await request(app.server)
      .post(`/v1/operations/tasks/${firstTaskId}/unclaim`)
      .send({ reason: "reassign" });
    expect(unclaimRes.status).toBe(200);
    expect(unclaimRes.body.task.status).toBe("UNASSIGNED");

    // Complete another task
    const secondTaskId = secondTask.taskId;
    const completeRes = await request(app.server)
      .post(`/v1/operations/tasks/${secondTaskId}/complete`)
      .send({ userId });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.task.status).toBe("COMPLETED");
    expect(typeof completeRes.body.task.completedAt).toBe("string");
  });
});
