import fp from "fastify-plugin";
import type { FastifyPluginCallback } from "fastify";
import type { Entity } from "../db/entities";

export type DebugUser = {
  userId: string;
  email?: string;
  name?: string;
  tenantId?: string;
  provider?: string;
  roles?: string[];
  groups?: string[];
};

type EntityWithExtras = Entity & {
  roles?: unknown;
  visibility_groups?: unknown;
  tenant_id?: string;
};

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

declare module "fastify" {
  interface FastifyRequest {
    user?: DebugUser;
  }
}

const debugUserPlugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", async (req, _reply) => {
    try {
      // Normalize multi-value headers into a single string
      const rawHeader = req.headers["x-debug-user"];
      const value =
        typeof rawHeader === "string"
          ? rawHeader
          : Array.isArray(rawHeader)
            ? rawHeader[0]
            : undefined;
      if (!value) {
        req.log.debug({ event: "debugUser", reason: "missing-header" }, "No X-Debug-User header provided");
        return;
      }

      const header = value.trim();
      if (header.length === 0) {
        req.log.debug({ event: "debugUser", reason: "empty-header" }, "X-Debug-User header was empty");
        return;
      }

      let parsed: any = undefined;
      if (header.startsWith("{")) {
        try {
          parsed = JSON.parse(header);
        } catch (err) {
          req.log.warn({ event: "debugUser", reason: "invalid-json", header }, "Failed to parse X-Debug-User JSON header");
          parsed = undefined;
        }
      }

      let user: DebugUser | undefined;
      if (parsed && typeof parsed === "object") {
        if (parsed.userId && typeof parsed.userId === "string") {
          const roles = Array.isArray(parsed.roles)
            ? parsed.roles
            : typeof parsed.roles === "string"
              ? parsed.roles.split(",").map((r: string) => r.trim())
              : [];
          const groups = Array.isArray(parsed.groups)
            ? parsed.groups
            : typeof parsed.groups === "string"
              ? parsed.groups.split(",").map((g: string) => g.trim())
              : [];
          user = {
            userId: parsed.userId,
            email: parsed.email,
            name: parsed.name,
            tenantId: parsed.tenantId,
            provider: "debug",
            roles,
            groups,
          };
        }
      } else {
        const key = header;
        try {
          const mod = await import("../db/entities");
          const entity = await mod.getEntityByKey(key);
          if (entity) {
            const extended = entity as EntityWithExtras;
            const roles = parseList(extended.roles);
            const groups = parseList(extended.visibility_groups);
            user = {
              userId: entity.entity_key,
              email: entity.email,
              name: entity.name,
              tenantId: extended.tenant_id,
              provider: "debug",
              roles,
              groups,
            };
          } else {
            user = { userId: key, provider: "debug", roles: [], groups: [] };
          }
        } catch (err) {
          req.log.warn({ event: "debugUser", reason: "entity-lookup-error", err }, "Failed to fetch entity for debug user");
          user = { userId: key, provider: "debug", roles: [], groups: [] };
        }
      }

      if (user) {
        req.user = user;
      }
    } catch (err) {
      req.log.error({ event: "debugUser", err }, "Failed to process X-Debug-User header");
    }
  });
  done();
};

export default fp(debugUserPlugin);
