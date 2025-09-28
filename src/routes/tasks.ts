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
    return reply.send({ task: toApiTask(updated) });
  });
}
