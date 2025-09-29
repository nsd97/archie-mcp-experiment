import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getEntityByKey, putEntity, queryEntitiesByTypeStatus, type Entity } from '../db/entities';

const entityResponse = z.object({
  entity_key: z.string(),
  entity_id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  slack_user_id: z.string().optional(),
  role_subtype: z.string().optional(),
  status: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  external_ids: z.record(z.string(), z.string()).optional(),
});

const searchQuery = z.object({ type: z.string(), query: z.string().optional() });

function toApi(e: Entity) {
  return {
    entity_key: e.entity_key,
    entity_id: e.entity_id,
    type: e.type,
    name: e.name,
    email: e.email,
    slack_user_id: e.slack_user_id,
    role_subtype: e.role_subtype,
    status: e.status,
    metadata: e.metadata,
    external_ids: e.external_ids,
  };
}

export default async function entitiesRoutes(app: FastifyInstance) {
  // GET /entities/me
  app.withValidation({
    method: 'GET',
    url: '/entities/me',
    preHandler: (app as any).authenticate,
    validation: { response: { 200: entityResponse } },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const userId = req.user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Missing user' });
      const ent = await getEntityByKey(userId);
      if (!ent) return reply.code(404).send({ error: 'Not Found' });
      return toApi(ent);
    },
  });

  // GET /entities/:id
  app.withValidation({
    method: 'GET',
    url: '/entities/:id',
    validation: { params: z.object({ id: z.string() }), response: { 200: entityResponse } },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { id } = req.params as any;
      const ent = await getEntityByKey(id);
      if (!ent) return reply.code(404).send({ error: 'Not Found' });
      return toApi(ent);
    },
  });

  // GET /entities?type=&query=
  app.withValidation({
    method: 'GET',
    url: '/entities',
    validation: { query: searchQuery, response: { 200: z.object({ entities: z.array(entityResponse) }) } },
    async handler(req: FastifyRequest) {
      const { type, query } = req.query as any;
      const items = await queryEntitiesByTypeStatus(type, 'ACTIVE#', 1000);
      const q = (query || '').toLowerCase();
      const filtered = q ? items.filter((e) => (e.name || '').toLowerCase().includes(q)) : items;
      return { entities: filtered.map(toApi) };
    },
  });
}

