import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  getTaskById,
  queryListingTasks,
  claimTask,
  unclaimTask,
  completeTask,
  type Task,
} from "../db/tasks";
import { getListingById } from "../db/listings";
import { getUserContext, canSeeTask, canClaimTask, canUnclaimTask, canCompleteTask } from "../services/authz";

const claimRequestSchema = z
  .object({
    userId: z.string().min(1).optional(),
    assigneeId: z.string().min(1).optional(),
    notes: z.any().optional(),
  })
  .refine((b) => !!(b.userId || b.assigneeId), {
    message: "userId or assigneeId is required",
  });

const claimResponseSchema = z.object({
  task: z.object({
    id: z.string(),
    listingId: z.string().optional(),
    name: z.string(),
    status: z.string(),
    priority: z.string(),
    assignedTo: z.object({ userId: z.string() }).nullable(),
    claimedAt: z.string().nullable(),
  }),
});

const unclaimRequestSchema = z.object({
  userId: z.string().optional(),
  reason: z.string().optional(),
});

const unclaimResponseSchema = z.object({
  task: z.object({
    id: z.string(),
    status: z.string(),
    assignedTo: z.null(),
  }),
});

const completeRequestSchema = z.object({
  userId: z.string().optional(),
  completedBy: z.string().optional(),
  outputs: z.any().optional(),
});

const completeResponseSchema = z.object({
  task: z.object({
    id: z.string(),
    status: z.string(),
    completedAt: z.string().nullable(),
    completedBy: z.string().nullable(),
  }),
});

const listTasksQuerySchema = z.object({
  status: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

const listTasksParamsSchema = z.object({ listingId: z.string() });

const listTasksResponseSchema = z.object({
  listingId: z.string(),
  tasks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      priority: z.string(),
    })
  ),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const getTaskParamsSchema = z.object({ taskId: z.string() });
const getTaskResponseSchema = z.object({ task: z.object({ id: z.string(), status: z.string() }) });

function toPriorityLabel(priority?: number): string {
  if ((priority ?? 0) >= 8) return "urgent";
  if ((priority ?? 0) >= 4) return "high";
  if ((priority ?? 0) >= 2) return "medium";
  return "low";
}

export default async function tasksRoutes(app: FastifyInstance) {
  app.withValidation({
    method: "GET",
    url: "/v1/operations/tasks/:listingId",
    validation: {
      params: listTasksParamsSchema,
      query: listTasksQuerySchema,
      response: { 200: listTasksResponseSchema },
    },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { listingId } = req.params as any;
      const { status, assignedTo, priority, page, limit } = req.query as any;
      const user = getUserContext(req as any);

      const listing = await getListingById(listingId);
      if (!listing) return reply.code(404).send({ error: "Listing not found" });

      const pageNum = Math.max(1, Number(page ?? 1) || 1);
      const limitNum = Math.min(100, Math.max(1, Number(limit ?? 25) || 25));

      let statusPrefix = "";
      if (status) statusPrefix = status;
      const allTasks = await queryListingTasks(listingId, statusPrefix, 1000);
      const visibleTasks = allTasks.filter((task) => {
        try {
          if (!canSeeTask(user, task.visibility_group)) return false;
          return true;
        } catch {
          return false;
        }
      });
      let filteredTasks = visibleTasks;

      if (assignedTo) filteredTasks = filteredTasks.filter((t) => t.assigned_to?.userId === assignedTo);
      if (priority) filteredTasks = filteredTasks.filter((t) => toPriorityLabel(t.priority) === priority);

      const total = filteredTasks.length;
      const totalPages = Math.max(1, Math.ceil(total / limitNum));
      const start = (pageNum - 1) * limitNum;
      const pageItems = filteredTasks.slice(start, start + limitNum).map((t) => ({
        id: t.task_id,
        name: t.name,
        status: t.status,
        priority: toPriorityLabel(t.priority),
      }));

      return {
        listingId,
        tasks: pageItems,
        pagination: { page: pageNum, limit: limitNum, total, totalPages },
      };
    },
  });

  // Notes: POST /v1/tasks/:taskId/notes and GET /v1/tasks/:taskId/notes
  const noteBodySchema = z.object({ text: z.string().min(1) });
  const noteResponseSchema = z.object({ note: z.object({ id: z.string(), text: z.string(), createdAt: z.string() }) });
  const notesListResponseSchema = z.object({ notes: z.array(z.object({ id: z.string(), text: z.string(), createdAt: z.string() })) });

  app.withValidation({
    method: "POST",
    url: "/v1/tasks/:taskId/notes",
    validation: { params: z.object({ taskId: z.string() }), body: noteBodySchema, response: { 200: noteResponseSchema } },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { taskId } = req.params as any;
      const { text } = req.body as any;
      const user = getUserContext(req as any);
      const { putAuditEvent } = await import("../db/audit_log");
      const { getTaskById } = await import("../db/tasks");
      const task = await getTaskById(taskId);
      if (!task) return reply.code(404).send({ error: "Not Found" });
      if (!canSeeTask(user, task.visibility_group)) return reply.code(403).send({ error: "forbidden" });
      const evt = await putAuditEvent({
        entity_id: taskId,
        entity_type: "task",
        action: "NOTE_ADDED",
        content: text,
        note_type: "general",
        performed_by: user?.userId || "system",
      } as any);
      if (task?.listing_id) {
        await putAuditEvent({
          entity_id: task.listing_id,
          entity_type: "listing",
          action: "NOTE_ADDED",
          content: text,
          note_type: "general",
          performed_by: user?.userId || "system",
        } as any);
      }
      return { note: { id: evt.event_id, text, createdAt: evt.timestamp } };
    },
  });

  app.withValidation({
    method: "GET",
    url: "/v1/tasks/:taskId/notes",
    validation: { params: z.object({ taskId: z.string() }), response: { 200: notesListResponseSchema } },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { taskId } = req.params as any;
      const user = getUserContext(req as any);
      const task = await getTaskById(taskId);
      if (!task) return reply.code(404).send({ error: "Not Found" });
      if (!canSeeTask(user, task.visibility_group)) return reply.code(403).send({ error: "forbidden" });
      const mod = await import("../db/audit_log");
      const events = await mod.queryListingHistory(`task#${taskId}`, "", 100);
      const notes = events
        .filter((e: any) => (e.action || "").toUpperCase() === "NOTE_ADDED")
        .map((e: any) => ({ id: e.event_id, text: e.content as string, createdAt: e.timestamp }));
      return { notes };
    },
  });


  app.withValidation({
    method: "GET",
    url: "/v1/operations/tasks/task/:taskId",
    validation: { params: getTaskParamsSchema, response: { 200: getTaskResponseSchema } },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { taskId } = req.params as any;
      const task = await getTaskById(taskId);
      if (!task) return reply.code(404).send({ error: "Not Found" });
      const user = getUserContext(req as any);
      if (!canSeeTask(user, task.visibility_group)) return reply.code(403).send({ error: "forbidden" });
      return { task: { id: task.task_id, status: task.status } };
    },
  });

  app.withValidation({
    method: "POST",
    url: "/v1/operations/tasks/:taskId/claim",
    validation: {
      params: z.object({ taskId: z.string() }),
      body: claimRequestSchema,
      response: { 200: claimResponseSchema },
    },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { taskId } = req.params as any;
      const { userId: bodyUserId, assigneeId } = req.body as any;
      const userContext = getUserContext(req as any);
      const userId = bodyUserId || assigneeId;
      const task = await getTaskById(taskId);
      if (!task) return reply.code(404).send({ error: "Not Found" });
      if (!canClaimTask(userContext, task)) return reply.code(403).send({ error: "forbidden" });
      const updated = await claimTask(task as Task, userId);
      const auditor = userContext?.userId || "system";
      const { putAuditEvent } = await import("../db/audit_log");
      await putAuditEvent({
        entity_id: taskId,
      entity_type: "task",
        action: "TASK_CLAIMED",
        performed_by: auditor,
        content: JSON.stringify({ previousAssignee: task.assigned_to?.userId, newAssignee: userId }),
      } as any);
      return {
        task: {
          id: updated.task_id,
          listingId: updated.listing_id,
          name: updated.name,
          status: updated.status, // remains 'CLAIMED'
          priority: toPriorityLabel(updated.priority),
          assignedTo: updated.assigned_to ? { userId: updated.assigned_to.userId } : null,
          claimedAt: updated.claimed_at ?? null,
        },
      };
    },
  });

  app.withValidation({
    method: "POST",
    url: "/v1/operations/tasks/:taskId/unclaim",
    validation: {
      params: z.object({ taskId: z.string() }),
      body: unclaimRequestSchema,
      response: { 200: unclaimResponseSchema },
    },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { taskId } = req.params as any;
      const userContext = getUserContext(req as any);
      const task = await getTaskById(taskId);
      if (!task) return reply.code(404).send({ error: "Not Found" });
      if (!canUnclaimTask(userContext, task)) return reply.code(403).send({ error: "forbidden" });
      const updated = await unclaimTask(task as Task);
      const { putAuditEvent } = await import("../db/audit_log");
      await putAuditEvent({
        entity_id: taskId,
        entity_type: "task",
        action: "TASK_UNCLAIMED",
        performed_by: userContext?.userId || "system",
        content: JSON.stringify({ previousAssignee: task.assigned_to?.userId }),
      } as any);
      return {
        task: {
          id: updated.task_id,
          status: "UNASSIGNED",
          assignedTo: null,
        },
      };
    },
  });

  app.withValidation({
    method: "POST",
    url: "/v1/operations/tasks/:taskId/complete",
    validation: {
      params: z.object({ taskId: z.string() }),
      body: completeRequestSchema,
      response: { 200: completeResponseSchema },
    },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { taskId } = req.params as any;
      const { completedBy, outputs } = req.body as any;
      const userContext = getUserContext(req as any);
      const task = await getTaskById(taskId);
      if (!task) return reply.code(404).send({ error: "Not Found" });
      if (!canCompleteTask(userContext, task)) return reply.code(403).send({ error: "forbidden" });
      // Enforce outputs schema if task_def_id present
      if (task.task_def_id) {
        const { validateTaskOutputs } = await import('../services/taskCatalog');
        const res = validateTaskOutputs(task.task_def_id, outputs || {});
        if (!res.valid) {
          return reply.code(400).send({ error: 'Invalid outputs', details: res.errors });
        }
      }
      const updated = await completeTask(task as Task, completedBy || "system");
      const { putAuditEvent } = await import("../db/audit_log");
      await putAuditEvent({
        entity_id: taskId,
        entity_type: "task",
        action: "TASK_COMPLETED",
        performed_by: userContext?.userId || completedBy || "system",
        content: JSON.stringify({ outputs: outputs ?? {} }),
      } as any);
      return {
        task: {
          id: updated.task_id,
          status: "COMPLETED",
          completedAt: updated.completed_at ?? null,
          completedBy: updated.completed_by ?? null,
        },
      };
    },
  });
}
