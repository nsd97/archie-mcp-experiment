import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import { putListing, getListingById, type Listing } from "../src/db/listings";

dotenv.config();

const isLocal = process.env.LOCALSTACK_ENDPOINT || process.env.DYNAMO_ENDPOINT;

(isLocal ? describe : describe.skip)("DDB Listings", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "local";
  });

  it("put/get listing by id", async () => {
    const created = await putListing({
      type: "SALE",
      status: "DRAFT",
      address_string: "123 Test St, Testville, TS",
      agent_id: "agent-123",
    } as Partial<Listing> as any);

    const fetched = await getListingById(created.listing_id);
    expect(fetched).toBeTruthy();
    // Deep equal on user-supplied + generated ids; ignore timestamps if they differ by server clock
    expect({
      ...fetched,
      created_at: undefined,
      updated_at: undefined,
    }).toEqual({
      ...created,
      created_at: undefined,
      updated_at: undefined,
    });
  });
});
