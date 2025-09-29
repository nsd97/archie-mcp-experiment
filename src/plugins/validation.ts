import fp from 'fastify-plugin';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import { ZodError, ZodTypeAny } from 'zod';

declare module 'fastify' {
  interface FastifyInstance {
    withValidation(options: RouteOptions & { validation?: SchemaConfig }): void;
  }
}

type SchemaConfig = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  response?: Record<number, ZodTypeAny>;
};

function formatError(err: unknown): { error: string; details?: any } {
  if (err instanceof ZodError) {
    return { error: 'Validation error', details: err.flatten() };
  }
  if (err instanceof Error) {
    return { error: err.message };
  }
  return { error: 'Unknown error' };
}

const validationPlugin: FastifyPluginCallback = (app, _opts, done) => {
  app.decorate('withValidation', (options: RouteOptions & { validation?: SchemaConfig }) => {
    const { validation, ...rest } = options;

    const validator = async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        if (validation?.query) req.query = validation.query.parse(req.query);
        if (validation?.params) req.params = validation.params.parse(req.params);
        if (validation?.body) req.body = validation.body.parse(req.body);
      } catch (err) {
        const formatted = formatError(err);
        return reply.code(400).send(formatted);
      }
    };

    const originalHandler = rest.handler;

    const wrappedHandler = async (req: FastifyRequest, reply: FastifyReply) => {
      // Intercept .send so we can validate any direct reply.send(...) calls
      const originalSend = reply.send.bind(reply);
      reply.send = ((payload: unknown) => {
        const schema = validation?.response?.[reply.statusCode || 200];
        if (schema) {
          payload = schema.parse(payload);
        }
        return originalSend(payload);
      }) as typeof reply.send;
  
      try {
        const data = await originalHandler?.call(app, req, reply);
        // If nothing has been sent yet and the handler returned a value, send it (with our interceptor)
        if (!reply.sent && data !== undefined) {
          return reply.send(data);
        }
        return data;
      } catch (err) {
        const formatted = formatError(err);
        const status = err instanceof ZodError ? 400 : 500;
        if (!reply.sent) {
          return reply.code(status).send(formatted);
        }
        throw err;
      } finally {
        // No restoration needed once preSerialization is used
      }
    };


    const preHandlers = Array.isArray(rest.preHandler)
      ? [...rest.preHandler, validator]
      : rest.preHandler
      ? [rest.preHandler, validator]
      : [validator];

    app.route({
      ...rest,
      preHandler: preHandlers,
      handler: wrappedHandler,
    });
  });

  done();
};

export default fp(validationPlugin);
