import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import dotenv from "dotenv";
import { putTask, deleteTaskById, type Task } from "../src/db/tasks";

dotenv.config();

let app: any;
let adminTask: Task;
let marketingTask: Task;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
  app = (await import("../src/app")).default;
  await app.ready();

  adminTask = await putTask({ name: "Admin stray", status: "OPEN", task_category: "ADMIN", is_stray: true, is_generic: true } as Partial<Task> as any);
  marketingTask = await putTask({ name: "Marketing stray", status: "OPEN", task_category: "MARKETING", is_stray: true, is_generic: false } as Partial<Task> as any);
});

afterAll(async () => {
  try {
    if (adminTask?.task_id) await deleteTaskById(adminTask.task_id);
    if (marketingTask?.task_id) await deleteTaskById(marketingTask.task_id);
  } finally {
    await app.close();
  }
});

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

    // Claim first ADMIN task
    const adminTaskId = admin.tasks[0].taskId;
    const claim = await request(app.server)
      .post(`/v1/operations/tasks/${adminTaskId}/claim`)
      .send({ assigneeId: "stray-user" });
    expect(claim.status).toBe(200);
    expect(claim.body.task.assignedTo?.userId).toBe("stray-user");
    expect((claim.body.task.status as string).toLowerCase()).toBe("claimed");

    // Unclaim it
    const unclaim = await request(app.server)
      .post(`/v1/operations/tasks/${adminTaskId}/unclaim`)
      .send({ reason: "return to queue" });
    expect(unclaim.status).toBe(200);
    expect(unclaim.body.task.status).toBe("UNASSIGNED");

  });
});
