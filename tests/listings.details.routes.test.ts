import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";
import type { Listing } from "../src/db/listings";
import type { Task } from "../src/db/tasks";

dotenv.config();

let app: any;
let listing: Listing;

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
  const { putAuditEvent } = await import("../src/db/audit_log");

  listing = await putListing({
    type: "SALE",
    status: "new",
    address_string: "30 Gamma Rd",
    assignee: "user-c",
    due_date: "2099-07-01T00:00:00.000Z",
    property_type: "Condo",
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1200,
    year_built: 2001,
    list_price: 500000,
    notes: "Initial note",
  } as Partial<Listing> as any);

  await putTask({
    listing_id: listing.listing_id,
    name: "Stage home",
    status: "OPEN",
    assigned_to: { userId: "stager" },
  } as Partial<Task> as any);

  await putAuditEvent({
    entity_id: listing.listing_id,
    entity_type: "listing",
    action: "NOTE",
    performed_by: "agent-1",
    performer_name: "Agent One",
    content: "This is a note",
    note_type: "general",
  });
});

afterAll(async () => {
  await app.close();
});

describe("Listing Detail API", () => {
  it("GET /v1/operations/listings/:id/details returns all groups with types", async () => {
    const res = await request(app.server).get(`/v1/operations/listings/${listing.listing_id}/details`);
    expect(res.status).toBe(200);

    const body = res.body;
    expect(body).toEqual(
      expect.objectContaining({
        listing: expect.objectContaining({
          id: expect.any(String),
          address: expect.any(String),
          status: expect.any(String),
        }),
        details: expect.objectContaining({
          propertyType: expect.any(String),
          bedrooms: expect.any(Number),
          bathrooms: expect.any(Number),
          sqft: expect.any(Number),
          yearBuilt: expect.any(Number),
          listPrice: expect.any(Number),
          notes: expect.any(String),
        }),
        history: expect.any(Array),
        tasks: expect.any(Array),
        notes: expect.any(Array),
      })
    );

    // arrays exist even if empty
    expect(Array.isArray(body.history)).toBe(true);
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(Array.isArray(body.notes)).toBe(true);

    // task subset contains the seeded task
    const taskFound = body.tasks.find((t: any) => t.title === "Stage home");
    expect(taskFound).toBeTruthy();

    // notes contain the seeded audit note and types/timestamps valid
    const note = body.notes.find((n: any) => n.content === "This is a note");
    expect(note).toBeTruthy();
    expect(note.type).toMatch(/^(general|warning|important)$/);
    expect(new Date(note.createdAt).toISOString()).toBe(note.createdAt);
  });
});
