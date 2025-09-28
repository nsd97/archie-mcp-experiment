import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

let app: any;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  app = (await import("../src/app")).default;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("returns ok: true", async () => {
    const res = await request(app.server).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
