import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";
import { generateUlid } from "../src/services/ids";
import type { Listing } from "../src/db/listings";

dotenv.config();

let app: any;
let seededNew: Listing;
let seededInProgress: Listing;
let seededCompleted: Listing;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "test";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "test";
  app = (await import("../src/app")).default;
  await app.ready();

  const { putListing } = await import("../src/db/listings");

  const now = new Date().toISOString();
  const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  seededNew = await putListing({
    listing_id: generateUlid(),
    type: "SALE",
    address_string: "100 Board New St, Boardtown, BT",
    status: "new",
    due_date: past,
    created_at: now,
    updated_at: now,
  } as any);

  seededInProgress = await putListing({
    listing_id: generateUlid(),
    type: "LEASE",
    address_string: "200 Board In Prog Ave, Boardtown, BT",
    status: "in_progress",
    due_date: now,
    progress: 50 as any,
    created_at: now,
    updated_at: now,
  } as any);

  seededCompleted = await putListing({
    listing_id: generateUlid(),
    type: "SALE",
    address_string: "300 Board Done Rd, Boardtown, BT",
    status: "completed",
    completed_at: now,
    created_at: now,
    updated_at: now,
  } as any);
});

afterAll(async () => {
  try {
    // No teardown helper implemented for listings yet
  } finally {
    if (app?.close) await app.close();
  }
});

describe("Board View API", () => {
  it("GET /v1/operations/board returns columns and summary", async () => {
    const res = await request(app.server).get("/v1/operations/board");
    expect(res.status).toBe(200);

    const body = res.body;
    expect(body.columns).toBeDefined();
    expect(Array.isArray(body.columns.new)).toBe(true);
    expect(Array.isArray(body.columns.inProgress)).toBe(true);
    expect(Array.isArray(body.columns.completed)).toBe(true);

    // Ensure seeded listings appear in correct columns
    const newItem = body.columns.new.find((l: any) => l.id === seededNew.listing_id);
    expect(newItem).toBeDefined();
    expect(typeof newItem.address).toBe("string");
    expect(typeof newItem.dueDate === "string" || newItem.dueDate === null).toBe(true);

    const inProgItem = body.columns.inProgress.find((l: any) => l.id === seededInProgress.listing_id);
    expect(inProgItem).toBeDefined();
    expect(typeof inProgItem.progress === "number" || inProgItem.progress === 0).toBe(true);

    const doneItem = body.columns.completed.find((l: any) => l.id === seededCompleted.listing_id);
    expect(doneItem).toBeDefined();
    expect(typeof doneItem.completedDate).toBe("string");

    // Summary totals match column lengths
    expect(body.summary.totalNew).toBe(body.columns.new.length);
    expect(body.summary.totalInProgress).toBe(body.columns.inProgress.length);
    expect(body.summary.totalCompleted).toBe(body.columns.completed.length);
    expect(typeof body.summary.totalOverdue).toBe("number");
  });
});
