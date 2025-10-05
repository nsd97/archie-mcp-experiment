/**
 * API version negotiation plugin.
 * 
 * Supports both v1 and v2 APIs with automatic version detection and routing.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    apiVersion: "v1" | "v2";
  }
}

async function apiVersionPlugin(fastify: FastifyInstance) {
  // Add version detection decorator
  fastify.decorateRequest("apiVersion", "v1");

  // Add version detection hook
  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Detect version from:
    // 1. URL path (/v2/...)
    // 2. Accept-Version header
    // 3. Query parameter (?api_version=v2)
    
    if (request.url.startsWith("/v2/")) {
      request.apiVersion = "v2";
    } else if (request.headers["accept-version"] === "v2") {
      request.apiVersion = "v2";
    } else if ((request.query as any)?.api_version === "v2") {
      request.apiVersion = "v2";
    } else {
      // Default to v1 for backward compatibility
      request.apiVersion = "v1";
    }
    
    // Add version header to response
    reply.header("API-Version", request.apiVersion);
  });

  // Add version info to root endpoint
  fastify.get("/api/version", async (request, reply) => {
    reply.send({
      current_version: request.apiVersion,
      supported_versions: ["v1", "v2"],
      default_version: "v1",
      v2_features: [
        "provenance_tracking",
        "agent_metadata",
        "agent_invocation",
        "enhanced_filtering",
      ],
      deprecation_notice: "v1 will remain supported indefinitely for backward compatibility",
    });
  });
}

export default fp(apiVersionPlugin, {
  name: "api-version",
  dependencies: [],
});
