import fp from 'fastify-plugin';
import type { FastifyPluginCallback } from 'fastify';
import client from 'prom-client';

const Registry = client.Registry;
const g: any = globalThis as any;
const register: typeof g.__promRegister = g.__promRegister || new Registry();

let httpRequestsTotal: client.Counter<'method' | 'route' | 'status'>;
let httpErrorsTotal: client.Counter<'method' | 'route' | 'status'>;
let httpRequestDuration: client.Histogram<'method' | 'route' | 'status'>;

if (!g.__promRegister) {
  g.__promRegister = register;
  client.collectDefaultMetrics({ register });
  httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
  });
  httpErrorsTotal = new client.Counter({
    name: 'http_errors_total',
    help: 'Total HTTP error responses',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
  });
  httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2,5],
    registers: [register],
  });
  g.__promMetrics = { httpRequestsTotal, httpErrorsTotal, httpRequestDuration };
} else {
  const m = g.__promMetrics || {};
  httpRequestsTotal = m.httpRequestsTotal;
  httpErrorsTotal = m.httpErrorsTotal;
  httpRequestDuration = m.httpRequestDuration;
}

const metricsPlugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook('onRequest', async (req, reply) => {
    (req as any)._start = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (req, reply) => {
    const route = ((req as any).routeOptions?.url as string) || (req.routerPath as string) || req.raw.url || 'unknown';
    const labels = { method: req.method, route, status: String(reply.statusCode) } as const;
    httpRequestsTotal.inc(labels);
    const start = (req as any)._start as bigint | undefined;
    if (start) {
      const durNs = Number(process.hrtime.bigint() - start);
      httpRequestDuration.observe(labels, durNs / 1e9);
    }
    if (reply.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  });

  if ((process.env.NODE_ENV || '').toLowerCase() === 'local') {
    app.get('/metrics', async (_req, reply) => {
      reply.header('content-type', register.contentType);
      return reply.send(await register.metrics());
    });
  }

  done();
};

export default fp(metricsPlugin);


