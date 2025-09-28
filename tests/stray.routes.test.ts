import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";
import { putTask, type Task } from "../src/db/tasks";

dotenv.config();

let app: any;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
  app = (await import("../src/app")).default;
  await app.ready();

  await putTask({ name: "Admin stray", status: "OPEN", task_category: "ADMIN", is_stray: true, is_generic: true } as Partial<Task> as any);
  await putTask({ name: "Marketing stray", status: "OPEN", task_category: "MARKETING", is_stray: true, is_generic: false } as Partial<Task> as any);
});

afterAll(async () => { await app.close(); });

describe("Stray Queues", () => {
  it("GET /v1/operations/stray-queues groups by category", async () => {
    const res = await request(app.server).get("/v1/operations/stray-queues");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.queues)).toBe(true);
    expect(typeof res.body.totalTasks).toBe("number");
    const admin = res.body.queues.find((q: any) => q.category === "ADMIN");
    const marketing = res.body.queues.find((q: any) => q.category === "MARKETING");
    expect(admin).toBeTruthy();
    expect(marketing).toBeTruthy();
    expect(admin.taskCount).toBeGreaterThan(0);
    expect(marketing.taskCount).toBeGreaterThan(0);
  });
});
