import 'module-alias/register';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import simpleRateLimit from './plugins/simpleRateLimit';
import dotenv from 'dotenv';
import listingsRoutes from './routes/listings';
import queueRoutes from './routes/queue';
import tasksRoutes from './routes/tasks';
import myTasksRoutes from './routes/mytasks';
import strayRoutes from './routes/stray';
import debugRoutes from './routes/debug';
import openapiRoute from './routes/openapi';
import docsRoute from './routes/docs';
import filesRoutes from './routes/files';
import slackRoutes from './routes/slack';
import entitiesRoutes from './routes/entities';
import validationPlugin from './plugins/validation';
import metricsPlugin from './plugins/metrics';
import { loadTaskCatalog } from './services/taskCatalog';
import authPlugin from './plugins/auth';
import debugUser from './plugins/debugUser';
import authRoutes from './routes/auth';
import boardRoutes from './routes/board';
import apiVersionPlugin from './plugins/apiVersion';
import v2TasksRoutes from './routes/v2/tasks';
import v2AgentRoutes from './routes/v2/agent';

dotenv.config();

type AppOptions = {
  enableCors?: boolean;
  enablePreflightRoute?: boolean;
};

export function createApp(options: AppOptions = {}) {
  const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  const app = Fastify({
    logger: { level: logLevel },
    genReqId: (req) => {
      const hdr = req.headers['x-correlation-id'];
      const id = Array.isArray(hdr) ? hdr[0] : hdr;
      return (id && String(id)) || Math.random().toString(36).slice(2);
    },
  });

  // Load task catalog on boot
  try {
    loadTaskCatalog();
  } catch (err) {
    // Fail fast on malformed definitions (except during tests that may not need catalog)
    if (process.env.NODE_ENV !== 'test') {
      throw err;
    }
  }

  // Correlation ID header on responses
  app.addHook('onRequest', async (request, reply) => {
    const id = request.id as string;
    reply.header('x-correlation-id', id);
  });

  const shouldRegisterCors =
    options.enableCors ?? (process.env.ENABLE_CORS !== 'false');
  const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (shouldRegisterCors) {
    app.register(cors, {
      origin: (origin: any, cb: any) => {
        if (!origin) return cb(null, true);
        const allowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin);
        // Log CORS decisions for debugging cross-origin issues
        app.log[allowed ? 'debug' : 'warn']({ event: 'cors', origin, allowed }, 'CORS origin check');
        cb(null, allowed);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Debug-User', 'x-correlation-id'],
      preflight: true,
      strictPreflight: false,
    });
  }

  // Compression
  app.register(compress, { global: true });
  app.register(validationPlugin);
  app.register(metricsPlugin);
  app.register(apiVersionPlugin); // API version negotiation
  app.register(authPlugin);
  app.register(debugUser);
  app.register(debugRoutes);
  app.register(openapiRoute);
  app.register(docsRoute);
  
  // V1 routes (existing)
  app.register(listingsRoutes);
  app.register(queueRoutes);
  app.register(boardRoutes);
  app.register(tasksRoutes);
  app.register(myTasksRoutes);
  app.register(strayRoutes);
  app.register(filesRoutes);
  app.register(slackRoutes);
  app.register(entitiesRoutes);
  app.register(authRoutes);
  
  // V2 routes (with agent support)
  app.register(v2TasksRoutes);
  app.register(v2AgentRoutes);

  // Simple rate limit for write methods
  app.register(simpleRateLimit);

  // Verbose HTTP logging hooks (enable via HTTP_LOG_VERBOSE=true)
  const isHttpVerbose = String(process.env.HTTP_LOG_VERBOSE || '').toLowerCase() === 'true'
    || process.env.HTTP_LOG_VERBOSE === '1'
    || (process.env.DEBUG || '').includes('http');

  if (isHttpVerbose) {
    app.addHook('onRequest', async (request) => {
      const start = Date.now();
      (request as any).startMs = start;
      const headers = request.headers || {};
      request.log.info({
        event: 'http.onRequest',
        method: request.method,
        url: request.url,
        origin: headers.origin,
        referer: headers.referer,
        correlationId: headers['x-correlation-id'],
      }, 'Incoming request');
    });

    app.addHook('preHandler', async (request) => {
      const contentLength = request.headers['content-length'];
      const contentType = request.headers['content-type'];
      let bodyPreview: unknown = undefined;
      try {
        const body = request.body as any;
        const raw = typeof body === 'string' ? body : JSON.stringify(body);
        if (raw && raw.length <= 2048) bodyPreview = raw;
      } catch {
        bodyPreview = undefined;
      }
      request.log.debug({
        event: 'http.preHandler',
        method: request.method,
        url: request.url,
        contentType,
        contentLength,
        bodyPreview,
      }, 'Request details');
    });

    app.addHook('onResponse', async (request, reply) => {
      const start = (request as any).startMs as number | undefined;
      const durationMs = start ? Date.now() - start : undefined;
      const ct = reply.getHeader('content-type');
      const cl = reply.getHeader('content-length');
      request.log.info({
        event: 'http.onResponse',
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        contentType: ct,
        contentLength: cl,
        durationMs,
      }, 'Response sent');
    });
  }

  // Centralized error handler with correlation id propagation
  app.setErrorHandler((error, request, reply) => {
    const status = (error as any).statusCode || 500;
    request.log.error({ event: 'http.error', err: error, url: request.url, method: request.method }, 'Unhandled error');
    const payload = {
      error: {
        message: status >= 500 ? 'Internal Server Error' : error.message,
        code: (error as any).code || undefined,
      },
      correlationId: request.id,
    } as const;
    reply.status(status).send(payload);
  });

  app.setNotFoundHandler((request, reply) => {
    request.log.warn({ event: 'http.notFound', method: request.method, url: request.url }, 'Route not found');
    reply.status(404).send({ error: { message: 'Not Found' }, correlationId: request.id });
  });

  app.get('/health', async () => {
    return {
      ok: true,
      env: process.env.NODE_ENV,
      logLevel: logLevel,
      httpVerbose: isHttpVerbose,
      corsOrigins: allowedOrigins,
    } as const;
  });

  return app;
}

const app = createApp();

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 3000);
  const host = '0.0.0.0';
  (async () => {
    try {
      await app.ready();
      await app.listen({ port, host });
      app.log.info(`Server running on port ${port}`);
    } catch (err: unknown) {
      app.log.error(err);
      process.exit(1);
    }
  })();
}

export default app;
