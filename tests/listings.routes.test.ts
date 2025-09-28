import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";
import { putListing, type Listing } from "../src/db/listings";

dotenv.config();

let app: any;
let seededNew: Listing;
let seededInProgress: Listing;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
  app = (await import("../src/app")).default;
  await app.ready();

  // seed two listings with different statuses and due_date so they appear in GSIs
  seededNew = await putListing({
    type: "SALE",
    status: "new",
    address_string: "10 Alpha Ave",
    assignee: "user-a",
    due_date: "2099-01-01T00:00:00.000Z",
  } as Partial<Listing> as any);

  seededInProgress = await putListing({
    type: "LEASE",
    status: "in_progress",
    address_string: "20 Beta Blvd",
    assignee: "user-b",
    due_date: "2099-06-01T00:00:00.000Z",
  } as Partial<Listing> as any);
});

afterAll(async () => {
  await app.close();
});

describe("Listings APIs", () => {
  it("GET /v1/operations/listings?status=new returns only NEW", async () => {
    const res = await request(app.server)
      .get("/v1/operations/listings")
      .query({ status: "new", page: 1, limit: 25, sortBy: "created_at" });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.listings)).toBe(true);
    expect(res.body.pagination).toEqual(
      expect.objectContaining({
        page: expect.any(Number),
        limit: expect.any(Number),
        total: expect.any(Number),
        totalPages: expect.any(Number),
      })
    );

    // All returned should be status=new
    for (const l of res.body.listings) {
      expect(l.status).toBe("new");
    }

    // Ensure seeded NEW is present
    const found = res.body.listings.find((l: any) => l.id === seededNew.listing_id);
    expect(found).toBeTruthy();
  });

  it("GET /v1/operations/listings/:id returns full detail shape", async () => {
    const url = "/v1/operations/listings/" + seededInProgress.listing_id;
    const res = await request(app.server).get(url);
    expect(res.status).toBe(200);

    const l = res.body;
    expect(l).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        address: expect.any(String),
        status: expect.stringMatching(/^(new|in_progress|completed)$/),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    );

    // ISO string checks
    expect(new Date(l.createdAt).toISOString()).toBe(l.createdAt);
    expect(new Date(l.updatedAt).toISOString()).toBe(l.updatedAt);

    // Allowed optional fields
    if (l.dueDate) expect(typeof l.dueDate).toBe("string");
    if (l.assignee) expect(typeof l.assignee).toBe("string");
    if (l.progress !== undefined) expect(typeof l.progress).toBe("number");
  });
});
