import fp from "fastify-plugin";
import type { FastifyPluginCallback } from "fastify";

export type DebugUser = { userId: string; email?: string; name?: string };

declare module "fastify" {
  interface FastifyRequest {
    user?: DebugUser;
  }
}

const debugUserPlugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", async (req, _reply) => {
    try {
      const header = req.headers["x-debug-user"] as string | undefined;
      if (!header) return;

      let parsed: any = undefined;
      if (header.trim().startsWith("{")) {
        try {
          parsed = JSON.parse(header);
        } catch {
          parsed = undefined;
        }
      }

      let user: DebugUser | undefined;
      if (parsed && typeof parsed === "object") {
        if (parsed.userId && typeof parsed.userId === "string") {
          user = { userId: parsed.userId, email: parsed.email, name: parsed.name };
        }
      } else if (typeof header === "string" && header.length > 0) {
        // Treat as entity key id
        const key = header;
        try {
          const mod = await import("../db/entities");
          const entity = await mod.getEntityByKey(key);
          if (entity) {
            user = { userId: entity.entity_key, email: entity.email, name: entity.name };
          } else {
            user = { userId: key };
          }
        } catch {
          user = { userId: key };
        }
      }

      if (user) {
        req.user = user;
      }
    } catch {
      // Non-fatal: do nothing
    }
  });
  done();
};

export default fp(debugUserPlugin);
