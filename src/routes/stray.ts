import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { queryTasksByCategory, type Task } from "../db/tasks";

const strayResponseSchema = z.object({
  queues: z.array(
    z.object({
      category: z.string(),
      isGeneric: z.boolean(),
      taskCount: z.number(),
      tasks: z.array(
        z.object({
          taskId: z.string(),
          title: z.string(),
          status: z.string(),
          canClaim: z.boolean(),
        })
      ),
    })
  ),
  totalTasks: z.number(),
});

export default async function strayRoutes(app: FastifyInstance) {
  app.withValidation({
    method: "GET",
    url: "/v1/operations/stray-queues",
    validation: { response: { 200: strayResponseSchema } },
    async handler(_req, _reply: FastifyReply) {
      const categories = ["ADMIN", "MARKETING"]; // basic set for now
      const queues: any[] = [];
      for (const cat of categories) {
        const key = `${cat}#1`;
        const items: Task[] = await queryTasksByCategory(key, "", 100);
        if (!items || items.length === 0) continue;
        queues.push({
          category: cat,
          isGeneric: true,
          taskCount: items.length,
          tasks: items.map((t) => ({
            taskId: t.task_id,
            title: t.name,
            status: t.status,
            canClaim: (t.claim_status ?? "UNASSIGNED") !== "CLAIMED",
          })),
        });
      }
      const totalTasks = queues.reduce((sum, q) => sum + (q.taskCount || 0), 0);
      return { queues, totalTasks };
    },
  });
}


