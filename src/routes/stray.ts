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
      // Only query ADMIN category since all stray tasks go there
      // The GSI key is task_category#is_stray, so for stray tasks it's "ADMIN#1"
      const adminTasks: Task[] = await queryTasksByCategory("ADMIN#1#1", "", 100);
      
      return {
        queues: [{
          category: "ADMIN", 
          isGeneric: true,
          taskCount: adminTasks.length,
          tasks: adminTasks.map((t) => ({
            taskId: t.task_id,
            title: t.name,
            status: t.status,
            canClaim: (t.claim_status ?? "UNASSIGNED") !== "CLAIMED",
          })),
        }],
        totalTasks: adminTasks.length,
      };
    },
  });
}


