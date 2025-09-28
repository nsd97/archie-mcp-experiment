import type { FastifyInstance } from "fastify";
import { buildOpenApiSpec } from "../openapi";

export default async function openapiRoute(app: FastifyInstance) {
  app.get("/openapi.json", async (_req, reply) => {
    const spec = buildOpenApiSpec();
    return reply.type("application/json").send(spec);
  });
}
