import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getListingById } from "../db/listings";
import type { Task } from "../db/tasks";
import { getUserContext, canSeeTask, canClaimTask } from "../services/authz";

const queuesResponseSchema = z.object({
  totalQueued: z.number(),
  processingNow: z.number(),
  completed: z.number(),
  failed: z.number(),
  avgProcessingTime: z.number(),
});

const queueResponseSchema = z.object({
  listings: z.array(
    z.object({
      listingId: z.string(),
      address: z.string(),
      listingType: z.string(),
      status: z.string(),
      agent: z.string(),
      dueDate: z.string().nullable(),
      taskCount: z.number(),
      tasks: z.array(
        z.object({
          taskId: z.string(),
          title: z.string(),
          priority: z.string(),
          canClaim: z.boolean(),
        })
      ),
    })
  ),
  totalListings: z.number(),
  totalTasks: z.number(),
});

export default async function queueRoutes(app: FastifyInstance) {
  app.withValidation({
    method: "GET",
    url: "/v1/operations/queues",
    validation: {
      response: { 200: queuesResponseSchema },
    },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const user = getUserContext(req as any);
      const mod = await import("../db/tasks");
      const tasks: Task[] = await (mod.scanTasks?.(1000) ?? Promise.resolve([]));
      const visibleTasks = tasks.filter((t) => canSeeTask(user, t.visibility_group));
      const totalQueued = visibleTasks.filter((t) => (t.status ?? "OPEN").toUpperCase() === "OPEN").length;
      const processingNow = visibleTasks.filter((t) => (t.status ?? "").toUpperCase() === "CLAIMED").length;
      const completed = visibleTasks.filter((t) => (t.status ?? "").toUpperCase() === "DONE").length;
      const failed = visibleTasks.filter((t) => (t.status ?? "").toUpperCase() === "FAILED").length;
      const avgProcessingTime = 0;
      return { totalQueued, processingNow, completed, failed, avgProcessingTime };
    },
  });

  app.withValidation({
    method: "GET",
    url: "/v1/operations/queue",
    validation: {
      response: { 200: queueResponseSchema },
    },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const user = getUserContext(req as any);
      const mod = await import("../db/tasks");
      const tasks: Task[] = await (mod.scanTasks?.(1000) ?? Promise.resolve([]));
      const visibleTasks = tasks.filter((t) => canSeeTask(user, t.visibility_group));
      const byListing = new Map<string, Task[]>();
      for (const t of visibleTasks) {
        const lid = t.listing_id || "unknown";
        if (!byListing.has(lid)) byListing.set(lid, []);
        byListing.get(lid)!.push(t);
      }

      const listings: any[] = [];
      for (const [listingId, ts] of byListing) {
        const listing = await getListingById(listingId);
        if (!listing) continue;
        listings.push({
          listingId,
          address: listing.address_string || "",
          listingType: listing.type,
          status: listing.status,
          agent: listing.agent_id || "",
          dueDate: listing.due_date || null,
          taskCount: ts.length,
          tasks: ts.map((t) => ({
            taskId: t.task_id,
            title: t.name,
            priority: ((t.priority ?? 0) >= 8 ? "HIGH" : (t.priority ?? 0) >= 4 ? "MEDIUM" : "LOW"),
            canClaim: canClaimTask(user, t),
          })),
        });
      }

    const totalTasks = visibleTasks.length;
      const totalListings = listings.length;
      return { listings, totalListings, totalTasks };
    },
  });
}
