import type { FastifyInstance } from "fastify";

export default async function debugRoutes(app: FastifyInstance) {
  app.get("/whoami", async (req: any) => {
    return { user: req.user || null };
  });
}
