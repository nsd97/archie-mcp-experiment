import type { FastifyInstance } from "fastify";
import { getListingById } from "../db/listings";
import type { Task } from "../db/tasks";

export default async function queueRoutes(app: FastifyInstance) {
  app.get("/v1/operations/queues", async (_req, reply) => {
    // Simplified summary using heuristics (these would be computed via queries/aggregations in production)
    const mod = await import("../db/tasks");
    const tasks: Task[] = await (mod.scanTasks?.(1000) ?? Promise.resolve([]));
    const totalQueued = tasks.filter(t => (t.status ?? "OPEN").toUpperCase() === "OPEN").length;
    const processingNow = tasks.filter(t => (t.status ?? "").toUpperCase() === "CLAIMED").length;
    const completed = tasks.filter(t => (t.status ?? "").toUpperCase() === "DONE").length;
    const failed = tasks.filter(t => (t.status ?? "").toUpperCase() === "FAILED").length;
    const avgProcessingTime = 0;
    return reply.send({ totalQueued, processingNow, completed, failed, avgProcessingTime });
  });

  app.get("/v1/operations/queue", async (_req, reply) => {
    const mod = await import("../db/tasks");
    // For demo: gather all open/claimed tasks grouped by listing via ListingTasksIndex
    const tasks: Task[] = await (mod.scanTasks?.(1000) ?? Promise.resolve([]));
    const byListing = new Map<string, Task[]>();
    for (const t of tasks) {
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
        dueDate: listing.due_date,
        taskCount: ts.length,
        tasks: ts.map(t => ({
          taskId: t.task_id,
          title: t.name,
          priority: ((t.priority ?? 0) >= 8 ? "HIGH" : (t.priority ?? 0) >= 4 ? "MEDIUM" : "LOW"),
          canClaim: (t.claim_status ?? "UNCLAIMED") !== "CLAIMED",
        })),
      });
    }

    const totalTasks = tasks.length;
    const totalListings = listings.length;
    return reply.send({ listings, totalListings, totalTasks });
  });
}
