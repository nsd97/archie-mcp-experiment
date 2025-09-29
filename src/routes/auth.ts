import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getEntityByKey, putEntity } from '../db/entities';
import { exchangeSlackCode } from '../services/slackOauth';

const meResponseSchema = z.object({
  user: z.object({
    userId: z.string(),
    email: z.string().nullable(),
    name: z.string().nullable(),
    slackUserId: z.string().nullable(),
    entityType: z.string().nullable(),
  }),
});

const linkSlackBodySchema = z.object({ code: z.string(), redirectUri: z.string().optional() });
const linkSlackResponseSchema = z.object({ success: z.boolean(), slackUserId: z.string() });

export default async function authRoutes(app: FastifyInstance) {
  app.withValidation({
    method: 'GET',
    url: '/auth/me',
    validation: { response: { 200: meResponseSchema } },
    preHandler: (app as any).authenticate,
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const userId = req.user?.userId;
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      const entity = await getEntityByKey(userId);
      return {
        user: {
          userId,
          email: req.user?.email ?? entity?.email ?? null,
          name: req.user?.name ?? entity?.name ?? null,
          slackUserId: entity?.slack_user_id ?? null,
          entityType: entity?.type ?? null,
        },
      };
    },
  });

  app.withValidation({
    method: 'POST',
    url: '/auth/link/slack',
    validation: { body: linkSlackBodySchema, response: { 200: linkSlackResponseSchema } },
    preHandler: (app as any).authenticate,
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const userId = req.user?.userId;
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      const entity = await getEntityByKey(userId);
      if (!entity) {
        return reply.code(404).send({ error: 'entity not found' });
      }
      // RBAC placeholder: ensure entity is allowed to link slack
      if (entity.type !== 'AGENT' && entity.type !== 'ADMIN_OPS' && entity.type !== 'ADMIN_MARKETING') {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const { code, redirectUri } = req.body as { code: string; redirectUri?: string };
      const slackUser = await exchangeSlackCode(code, redirectUri);
      await putEntity({ ...entity, slack_user_id: slackUser.slackUserId });
      return { success: true, slackUserId: slackUser.slackUserId };
    },
  });
}

