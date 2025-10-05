/**
 * Agent orchestration endpoints for v2 API.
 * 
 * Provides direct agent invocation and session management.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { generateUlid } from "../../services/ids";
import { nowIso } from "../../services/time";
import { getUserContext } from "../../services/authz";

// Agent invocation schema
const agentInvokeSchema = z.object({
  agent: z.enum(["archie", "lauren"]).optional().default("archie"),
  input: z.string().min(1),
  context: z.object({
    room_id: z.string().optional(),
    thread_id: z.string().optional(),
    listing_id: z.string().optional(),
    correlation_id: z.string().optional(),
  }).optional(),
  max_turns: z.number().min(1).max(20).optional().default(10),
});

const agentSessionSchema = z.object({
  session_id: z.string().optional(),
  agent: z.enum(["archie", "lauren"]).optional().default("archie"),
  room_id: z.string().optional(),
});

export default async function v2AgentRoutes(fastify: FastifyInstance) {
  // POST /v2/agent/invoke - Direct agent invocation
  fastify.post(
    "/v2/agent/invoke",
    {
      schema: {
        body: agentInvokeSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof agentInvokeSchema>;
      const userCtx = getUserContext(request);

      // Generate correlation ID
      const correlationId = body.context?.correlation_id || generateUlid();

      // For now, return a placeholder that indicates the agent service should handle this
      // In a full implementation, this would call the agent service directly via HTTP
      
      const agentServiceUrl = process.env.AGENT_SERVICE_URL || "http://agent-service:8000";
      
      try {
        // This would be the actual invocation:
        // const response = await fetch(`${agentServiceUrl}/invoke`, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({
        //     agent: body.agent,
        //     input: body.input,
        //     context: {
        //       user_id: userCtx.userId,
        //       room_id: body.context?.room_id,
        //       thread_id: body.context?.thread_id,
        //       correlation_id: correlationId,
        //     },
        //     max_turns: body.max_turns,
        //   }),
        // });

        // For P4, return a stub response
        reply.send({
          correlation_id: correlationId,
          agent: body.agent,
          status: "pending",
          message: "Agent invocation queued. Use the correlation_id to track progress.",
          timestamp: nowIso(),
          note: "Direct agent invocation will be fully implemented in production deployment (P6)",
        });
      } catch (error) {
        reply.status(503).send({
          error: "Agent service unavailable",
          correlation_id: correlationId,
        });
      }
    }
  );

  // GET /v2/agent/sessions/:sessionId - Get agent session history
  fastify.get(
    "/v2/agent/sessions/:sessionId",
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply
    ) => {
      const { sessionId } = request.params;
      const userCtx = getUserContext(request);

      // In a full implementation, this would query the agent session store
      // For P4, return a placeholder

      reply.send({
        session_id: sessionId,
        status: "active",
        messages: [],
        agent: "archie",
        created_at: nowIso(),
        note: "Session management will be fully implemented with agent deployment (P6)",
      });
    }
  );

  // POST /v2/agent/sessions - Create new agent session
  fastify.post(
    "/v2/agent/sessions",
    {
      schema: {
        body: agentSessionSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof agentSessionSchema>;
      const userCtx = getUserContext(request);

      const sessionId = body.session_id || generateUlid();

      reply.status(201).send({
        session_id: sessionId,
        agent: body.agent,
        room_id: body.room_id,
        status: "created",
        created_at: nowIso(),
        note: "Session created. Messages sent to this session will maintain context.",
      });
    }
  );

  // GET /v2/agent/status - Get agent service health
  fastify.get("/v2/agent/status", async (request, reply) => {
    const agentServiceUrl = process.env.AGENT_SERVICE_URL || "http://agent-service:8000";
    
    try {
      // Check if agent service is reachable
      const response = await fetch(`${agentServiceUrl}/health`);
      const health = await response.json();
      
      reply.send({
        status: "healthy",
        agent_service: health,
        agents: {
          archie: "available",
          lauren: "available",
        },
      });
    } catch (error) {
      reply.status(503).send({
        status: "degraded",
        error: "Agent service unavailable",
        agents: {
          archie: "unavailable",
          lauren: "unavailable",
        },
      });
    }
  });
}

