import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { queryMyTasks, type Task } from "../db/tasks";
import { getListingById } from "../db/listings";

const myTasksQuerySchema = z.object({
  userId: z.string().min(1, "userId is required").transform((id) =>
    id.includes("-") ? id.replaceAll("-", ":") : id
  ),
});

const myTasksResponseSchema = z.object({
  listings: z.array(
    z.object({
      listingId: z.string().nullable(),
      address: z.string(),
      listingType: z.string().nullable(),
      status: z.string().nullable(),
      agent: z.string().nullable(),
      dueDate: z.string().nullable(),
      taskCount: z.number(),
      tasks: z.array(
        z.object({
          taskId: z.string(),
          title: z.string(),
          sla: z.number(),
          dueDate: z.string().nullable(),
          priority: z.string(),
          status: z.string(),
        })
      ),
    })
  ),
  totalTasks: z.number(),
});

export default async function myTasksRoutes(app: FastifyInstance) {
  app.withValidation({
    method: "GET",
    url: "/v1/operations/my-tasks",
    validation: { query: myTasksQuerySchema, response: { 200: myTasksResponseSchema } },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { userId } = req.query as any;
      if (!userId) return reply.code(401).send({ error: "Missing authenticated user" });

      const tasks: Task[] = await queryMyTasks(userId, "", 1000);
      const byListing = new Map<string, Task[]>();
      for (const t of tasks) {
        const lid = t.listing_id || "unknown";
        if (!byListing.has(lid)) byListing.set(lid, []);
        byListing.get(lid)!.push(t);
      }

      const listings: any[] = [];
      for (const [listingId, ts] of byListing) {
        const listing = listingId !== "unknown" ? await getListingById(listingId) : undefined;
        const tasksForListing = ts.map((task) => ({
          taskId: task.task_id,
          title: task.name,
          sla: task.estimated_duration_minutes ?? 0,
          dueDate: task.due_date ?? null,
          priority: ((task.priority ?? 0) >= 8 ? "HIGH" : (task.priority ?? 0) >= 4 ? "MEDIUM" : "LOW"),
          status: task.status,
        }));
        listings.push({
          listingId: listing
            ? listing.listing_id
            : listingId === "unknown"
              ? null
              : listingId,
          address: listing?.address_string ?? (listingId === "unknown" ? "General" : listingId),
          listingType: listing?.type ?? null,
          status: listing?.status ?? null,
          agent: listing?.agent_id ?? null,
          dueDate: listing?.due_date ?? null,
          taskCount: tasksForListing.length,
          tasks: tasksForListing,
        });
      }

      const totalTasks = listings.reduce((acc, listing) => acc + (listing.tasks?.length ?? 0), 0);
      return { listings, totalTasks };
    },
  });
}
