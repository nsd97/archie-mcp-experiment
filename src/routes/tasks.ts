import type { FastifyInstance } from "fastify";
import { queryListingTasks, getTaskById, claimTask, unclaimTask, type Task } from "../db/tasks";

function toApiPriority(p?: number): "low" | "medium" | "high" | "urgent" {
  if ((p ?? 0) >= 9) return "urgent";
  if ((p ?? 0) >= 6) return "high";
  if ((p ?? 0) >= 3) return "medium";
  return "low";
}

function toApiStatus(s: string): "pending" | "claimed" | "in_progress" | "completed" | "cancelled" {
  const v = (s || "").toLowerCase();
  if (v === "claimed") return "claimed";
  if (v === "in_progress") return "in_progress";
  if (v === "done" || v === "completed") return "completed";
  if (v === "cancelled") return "cancelled";
  return "pending";
}

function toApiTask(t: Task) {
  return {
    id: t.task_id,
    listingId: t.listing_id || "",
    name: t.name,
    description: t.description || "",
    status: toApiStatus(t.status),
    priority: toApiPriority(t.priority),
    category: t.task_category || "",
    tags: [],
    estimatedDurationMinutes: t.estimated_duration_minutes || 0,
    requiredSkills: t.required_skills || [],
    assignedTo: t.assigned_to || null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    claimedAt: t.claimed_at || null,
    dueDate: t.due_date || null,
    completedAt: t.completed_at || null,
    metadata: {},
  };
}

export default async function tasksRoutes(app: FastifyInstance) {
  app.get("/v1/operations/my-tasks", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      return reply.code(401).send({ error: "Missing authenticated user" });
    }
    const mod = await import("../db/tasks");
    const tasks: Task[] = await mod.queryMyTasks(userId, "", 1000);
    const byListing = new Map<string, Task[]>();
    for (const t of tasks) {
      const lid = t.listing_id || "unknown";
      if (!byListing.has(lid)) byListing.set(lid, []);
      byListing.get(lid)!.push(t);
    }
    const listings: any[] = [];
    for (const [listingId, ts] of byListing) {
      const listing = await (await import("../db/listings")).getListingById(listingId);
      if (!listing) continue;
      const earliestDue = ts.reduce<string | null>((earliest, current) => {
        if (!current.due_date) return earliest;
        if (!earliest) return current.due_date;
        return new Date(current.due_date).getTime() < new Date(earliest).getTime() ? current.due_date : earliest;
      }, null);
      listings.push({
        listingId,
        address: listing.address_string || "",
        listingType: listing.type,
        status: listing.status,
        agent: listing.agent_id || "",
        dueDate: earliestDue,
        taskCount: ts.length,
        tasks: ts.map((t) => {
          const status = toApiStatus(t.status);
          return {
            taskId: t.task_id,
            title: t.name,
            sla: 0,
            dueDate: t.due_date || null,
            priority: ((t.priority ?? 0) >= 8 ? "HIGH" : (t.priority ?? 0) >= 4 ? "MEDIUM" : "LOW"),
            status:
              status === "completed"
                ? "COMPLETED"
                : status === "cancelled"
                ? "CANCELLED"
                : status === "claimed" || status === "in_progress"
                ? "IN_PROGRESS"
                : "ASSIGNED",
          };
        }),
      });
    }
    const totalTasks = tasks.length;
    return reply.send({ listings, totalTasks });
  });

  app.get("/v1/operations/stray-queues", async (_req, reply) => {
    const mod = await import("../db/tasks");
    const categories = ["ADMIN", "MARKETING"] as const;
    const queues: any[] = [];
    let totalTasks = 0;

    for (const cat of categories) {
      const key = `${cat}#1`;
      const items: Task[] = await mod.queryTasksByCategory(key, "", 1000);
      const mapped = await Promise.all(
        items.map(async (t) => {
          let address: string | null = t.address || null;
          if (!address && t.listing_id) {
            const l = await (await import("../db/listings")).getListingById(t.listing_id);
            address = l?.address_string || null;
          }
          return {
            taskId: t.task_id,
            title: t.name,
            taskCategory: cat,
            createdBy: t.created_by || "",
            dueDate: t.due_date || null,
            priority: ((t.priority ?? 0) >= 8 ? "HIGH" : (t.priority ?? 0) >= 4 ? "MEDIUM" : "LOW"),
            listingId: t.listing_id || null,
            address,
            isGeneric: !!t.is_generic,
          };
        })
      );
      queues.push({ category: cat, displayName: `${cat.charAt(0)}${cat.slice(1).toLowerCase()} Queue`, tasks: mapped, taskCount: mapped.length });
      totalTasks += mapped.length;
    }

    return reply.send({ queues, totalTasks });
  });

  app.get("/v1/operations/tasks/:listingId", async (req, reply) => {
    const { listingId } = req.params as any;
    const { status, assignedTo, priority, page, limit } = (req.query as any) || {};
    const pageNum = Math.max(1, Number(page ?? 1) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit ?? 25) || 25));

    // Fetch tasks by listing; optionally filter in-memory for simplicity
    let tasks = await queryListingTasks(listingId, "", 1000);
    if (status) tasks = tasks.filter(t => toApiStatus(t.status) === status);
    if (assignedTo) tasks = tasks.filter(t => t.assigned_to?.userId === assignedTo);
    if (priority) tasks = tasks.filter(t => toApiPriority(t.priority) === priority);

    const total = tasks.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const start = (pageNum - 1) * limitNum;
    const pageItems = tasks.slice(start, start + limitNum).map(toApiTask);

    return reply.send({ listingId, tasks: pageItems, pagination: { page: pageNum, limit: limitNum, total, totalPages } });
  });

  app.get("/v1/operations/tasks/task/:taskId", async (req, reply) => {
    const { taskId } = req.params as any;
    const task = await getTaskById(taskId);
    if (!task) return reply.code(404).send({ error: "Not Found" });
    return reply.send({ task: toApiTask(task) });
  });

  app.post("/v1/operations/tasks/:taskId/claim", async (req, reply) => {
    const { taskId } = req.params as any;
    const body = (req.body as any) || {};
    const userId = body.userId || body.assigneeId;
    if (!userId) return reply.code(400).send({ error: "Missing userId" });
    const task = await getTaskById(taskId);
    if (!task) return reply.code(404).send({ error: "Not Found" });
    const updated = await claimTask(task, userId);
    return reply.send({ task: toApiTask(updated) });
  });

  app.post("/v1/operations/tasks/:taskId/unclaim", async (req, reply) => {
    const { taskId } = req.params as any;
    const task = await getTaskById(taskId);
    if (!task) return reply.code(404).send({ error: "Not Found" });
    const updated = await unclaimTask(task);
    return reply.send({ success: true, task: { taskId: updated.task_id, title: updated.name, status: "UNASSIGNED", unclaimedAt: updated.updated_at }, message: "Task unclaimed" });
  });

  app.post("/v1/operations/tasks/:taskId/complete", async (req, reply) => {
    const { taskId } = req.params as any;
    const task = await getTaskById(taskId);
    if (!task) return reply.code(404).send({ error: "Not Found" });
    const body = (req.body as any) || {};
    const completedBy = body.userId || body.completedBy || "system";
    const updated = await (await import("../db/tasks")).completeTask(task, completedBy);
    return reply.send({ success: true, task: { taskId: updated.task_id, title: updated.name, status: "COMPLETED", completedAt: (updated as any).completed_at, completedBy }, message: "Task completed" });
  });
}
