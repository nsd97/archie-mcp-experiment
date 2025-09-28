import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";

dotenv.config();

let app: any;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  app = (await import("../src/app")).default;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("X-Debug-User middleware", () => {
  it("populates req.user from JSON header", async () => {
    const user = { userId: "email:test@example.com", email: "test@example.com", name: "Tester" };
    const res = await request(app.server)
      .get('/whoami')
      .set('X-Debug-User', JSON.stringify(user));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject(user);
  });

  it("populates req.user from simple id header", async () => {
    const res = await request(app.server)
      .get('/whoami')
      .set('X-Debug-User', 'email:plain@example.com');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeTruthy();
    expect(res.body.user.userId).toBe('email:plain@example.com');
  });
});
