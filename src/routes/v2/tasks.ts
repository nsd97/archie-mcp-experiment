/**
 * API v2 for tasks with agent provenance and metadata support.
 * 
 * Maintains backward compatibility with v1 while adding:
 * - Provenance tracking (Matrix, Slack, API sources)
 * - Agent metadata (which agent created/modified)
 * - Enhanced filtering and correlation
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  getTaskById,
  queryListingTasks,
  claimTask as dbClaimTask,
  unclaimTask as dbUnclaimTask,
  completeTask as dbCompleteTask,
  putTask,
  type Task,
} from "../../db/tasks";
import { getUserContext, canSeeTask, canClaimTask, canCompleteTask } from "../../services/authz";
import { generateUlid } from "../../services/ids";
import { nowIso } from "../../services/time";

// Enhanced schemas with provenance

const provenanceSchema = z.object({
  source: z.enum(["matrix", "slack", "api"]),
  room_id: z.string().optional(),
  thread_id: z.string().optional(),
  correlation_id: z.string().optional(),
  event_id: z.string().optional(),
});

const agentMetadataSchema = z.object({
  created_by_agent: z.string().optional(),
  handoff_from: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  agent_session_id: z.string().optional(),
});

const createTaskV2Schema = z.object({
  listing_id: z.string().optional(),
  task_def_id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.number().min(0).max(10).optional(),
  due_date: z.string().optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  is_stray: z.boolean().optional(),
  provenance: provenanceSchema.optional(),
  agent_metadata: agentMetadataSchema.optional(),
});

const taskV2ResponseSchema = z.object({
  task_id: z.string(),
  name: z.string(),
  status: z.string(),
  priority: z.number().optional(),
  provenance: provenanceSchema.optional(),
  agent_metadata: agentMetadataSchema.optional(),
});

const listTasksV2QuerySchema = z.object({
  listing_id: z.string().optional(),
  status: z.string().optional(),
  assignee: z.string().optional(),
  source: z.enum(["matrix", "slack", "api"]).optional(),
  created_by_agent: z.string().optional(),
  correlation_id: z.string().optional(),
  since: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  page_token: z.string().optional(),
});

export default async function v2TasksRoutes(fastify: FastifyInstance) {
  // POST /v2/tasks - Create task with provenance
  fastify.post(
    "/v2/tasks",
    {
      schema: {
        body: createTaskV2Schema,
        response: {
          201: taskV2ResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof createTaskV2Schema>;
      const userCtx = getUserContext(request);
      if (!userCtx) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }

      // Build task with v2 fields
      const metadata = {
        ...(body.provenance ? { provenance: body.provenance } : {}),
        ...(body.agent_metadata ? { agent_metadata: body.agent_metadata } : {}),
      };

      const taskInput: any = {
        ...body,
        created_by: userCtx.userId,
      };

      if (Object.keys(metadata).length) {
        taskInput.metadata = metadata;
      }

      const task = await putTask(taskInput);

      reply.status(201).send({
        task_id: task.task_id,
        name: task.name,
        status: task.status,
        priority: task.priority,
        provenance: body.provenance,
        agent_metadata: body.agent_metadata,
      });
    }
  );

  // GET /v2/tasks - List tasks with enhanced filtering
  fastify.get(
    "/v2/tasks",
    {
      schema: {
        querystring: listTasksV2QuerySchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as z.infer<typeof listTasksV2QuerySchema>;
      const userCtx = getUserContext(request);
      if (!userCtx) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }

      // Get tasks based on filters
      let tasks: Task[] = [];
      
      if (query.listing_id) {
        tasks = await queryListingTasks(query.listing_id);
      } else {
        // Global query - would need to implement queryAllTasks with filters
        // For now, return empty or use existing queue endpoint
        tasks = [];
      }

      // Apply v2-specific filters
      if (query.source && tasks.length > 0) {
        tasks = tasks.filter(
          (t) => (t as any).metadata?.provenance?.source === query.source
        );
      }

      if (query.created_by_agent && tasks.length > 0) {
        tasks = tasks.filter(
          (t) =>
            (t as any).metadata?.agent_metadata?.created_by_agent ===
            query.created_by_agent
        );
      }

      if (query.correlation_id && tasks.length > 0) {
        tasks = tasks.filter(
          (t) =>
            (t as any).metadata?.provenance?.correlation_id ===
            query.correlation_id
        );
      }

      // Apply authorization filters
      tasks = tasks.filter((t) => canSeeTask(userCtx, t));

      // Pagination
      const limit = query.limit || 20;
      const startIdx = query.page_token ? parseInt(query.page_token) : 0;
      const paginatedTasks = tasks.slice(startIdx, startIdx + limit);
      const nextPageToken =
        startIdx + limit < tasks.length ? String(startIdx + limit) : undefined;

      reply.send({
        tasks: paginatedTasks.map((t) => ({
          task_id: t.task_id,
          listing_id: t.listing_id,
          name: t.name,
          description: t.description,
          status: t.status,
          priority: t.priority,
          assigned_to: t.assigned_to,
          due_date: t.due_date,
          created_at: t.created_at,
          updated_at: t.updated_at,
          provenance: (t as any).metadata?.provenance,
          agent_metadata: (t as any).metadata?.agent_metadata,
        })),
        pagination: {
          limit,
          next_page_token: nextPageToken,
          total_count: tasks.length,
        },
      });
    }
  );

  // GET /v2/tasks/:taskId - Get single task with full metadata
  fastify.get(
    "/v2/tasks/:taskId",
    async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
      const { taskId } = request.params;
      const userCtx = getUserContext(request);
      if (!userCtx) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }

      const task = await getTaskById(taskId);
      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }

      if (!canSeeTask(userCtx, task)) {
        return reply.status(403).send({ error: "Unauthorized" });
      }

      reply.send({
        ...task,
        provenance: (task as any).metadata?.provenance,
        agent_metadata: (task as any).metadata?.agent_metadata,
      });
    }
  );

  // POST /v2/tasks/:taskId/claim - Claim with provenance
  fastify.post(
    "/v2/tasks/:taskId/claim",
    async (
      request: FastifyRequest<{
        Params: { taskId: string };
        Body: { userId?: string; provenance?: any };
      }>,
      reply: FastifyReply
    ) => {
      const { taskId } = request.params;
      const { userId, provenance } = request.body;
      const userCtx = getUserContext(request);
      if (!userCtx) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }

      const task = await getTaskById(taskId);
      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }

      if (!canClaimTask(userCtx, task)) {
        return reply.status(403).send({ error: "Cannot claim this task" });
      }

      const claimedTaskInput = { ...task } as Task;
      const claimedTask = await dbClaimTask(
        claimedTaskInput,
        userId || userCtx.userId
      );

      // Update provenance if provided
      if (provenance) {
        const metadata = { ...(claimedTask as any).metadata };
        metadata.last_action_provenance = provenance;
        (claimedTask as any).metadata = metadata;
        // TODO: persist metadata change in data store
      }

      reply.send({
        task: claimedTask,
        provenance: (claimedTask as any).metadata?.provenance,
      });
    }
  );

  // POST /v2/tasks/:taskId/complete - Complete with outputs and provenance
  fastify.post(
    "/v2/tasks/:taskId/complete",
    async (
      request: FastifyRequest<{
        Params: { taskId: string };
        Body: {
          userId?: string;
          outputs?: Record<string, any>;
          provenance?: any;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { taskId } = request.params;
      const { userId, outputs, provenance } = request.body;
      const userCtx = getUserContext(request);
      if (!userCtx) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }

      const task = await getTaskById(taskId);
      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }

      if (!canCompleteTask(userCtx, task)) {
        return reply.status(403).send({ error: "Cannot complete this task" });
      }

      const taskForCompletion = { ...task } as Task;
      if (outputs) {
        (taskForCompletion as any).outputs = outputs;
      }
      const completedTask = await dbCompleteTask(
        taskForCompletion,
        userId || userCtx.userId
      );

      if (provenance) {
        const metadata = { ...(completedTask as any).metadata };
        metadata.last_action_provenance = provenance;
        (completedTask as any).metadata = metadata;
        // TODO: persist metadata change in data store
      }

      reply.send({
        task: completedTask,
        provenance: (completedTask as any).metadata?.provenance,
      });
    }
  );
}
