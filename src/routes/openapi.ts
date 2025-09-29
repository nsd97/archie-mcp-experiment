import type { FastifyInstance } from "fastify";
import { buildOpenApiSpec } from "../openapi";

export default async function openapiRoute(app: FastifyInstance) {
  const cachedSpec = await buildOpenApiSpec();

  app.get("/openapi.json", async (_req, reply) => {
    return reply.type("application/json").send(cachedSpec);
  });
}
