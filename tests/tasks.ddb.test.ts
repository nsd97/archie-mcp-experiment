import { describe, it, expect, beforeAll } from "vitest";
import dotenv from "dotenv";
import { putTask, queryMyTasks, type Task } from "../src/db/tasks";

dotenv.config();

const isLocal = process.env.LOCALSTACK_ENDPOINT || process.env.DYNAMO_ENDPOINT;

(isLocal ? describe : describe.skip)("DDB Tasks MyTasksIndex", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "local";
  });

  it("query MyTasksIndex returns seeded item", async () => {
    const userId = "user-" + Math.random().toString(36).slice(2, 8);
    const created = await putTask({
      name: "Seed Task",
      status: "OPEN",
      task_category: "ops",
      assigned_to: { userId },
      due_date: "2099-12-31T00:00:00.000Z",
    } as Partial<Task> as any);

    const results = await queryMyTasks(userId, "", 10);
    expect(results.length).toBeGreaterThan(0);
    const found = results.find((t) => t.task_id === created.task_id);
    expect(found).toBeTruthy();
  });
});
