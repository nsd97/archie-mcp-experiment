import type { FastifyInstance } from "fastify";

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Operations Center API Docs</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; }
      #swagger-ui { max-width: 100%; }
    </style>
  </head>
  <body>
    <h1 style="position:absolute;left:-9999px;">Operations Center</h1>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout'
        });
      };
    </script>
  </body>
  </html>`;

export default async function docsRoute(app: FastifyInstance) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DOCS !== "true") {
    app.log.info("Docs route disabled in production");
    return;
  }
  app.get("/docs", async (_req, reply) => {
    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .send(html);
  });
}


