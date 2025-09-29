import 'fastify';
import type { RouteOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodTypeAny } from 'zod';

type SchemaConfig = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  response?: Record<number, ZodTypeAny>;
};

declare module 'fastify' {
  interface FastifyInstance {
    withValidation(
      options: Omit<RouteOptions, 'schema'> & { schema?: SchemaConfig }
    ): void;
    authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    user?: {
      userId: string;
      email?: string;
      name?: string;
      tenantId?: string;
      provider?: string;
      rawClaims?: unknown;
      roles?: string[];
      groups?: string[];
    };
  }

  interface FastifyReply {
    user?: FastifyRequest['user'];
  }
}
