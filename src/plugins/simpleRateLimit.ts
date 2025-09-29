import fp from 'fastify-plugin';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

type Counter = { count: number; resetAt: number };

function parseWindowToMs(input: string | undefined): number {
  const raw = (input || '').trim().toLowerCase();
  if (!raw) return 60_000;
  const num = parseInt(raw, 10);
  if (Number.isFinite(num) && num > 0) {
    if (raw.includes('min')) return num * 60_000;
    if (raw.includes('sec')) return num * 1_000;
    if (raw.includes('ms')) return num;
    return num * 1_000; // default seconds
  }
  return 60_000;
}

const simpleRateLimit: FastifyPluginCallback = (app, _opts, done) => {
  const max = Number(process.env.RATE_LIMIT_MAX || 20);
  const windowMs = parseWindowToMs(process.env.RATE_LIMIT_WINDOW || '60 seconds');
  const buckets = new Map<string, Counter>();

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const method = (request.method || '').toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method)) return;

    const ip = (request.ip || (request.socket as any)?.remoteAddress || 'unknown') as string;
    const now = Date.now();
    let c = buckets.get(ip);
    if (!c || now >= c.resetAt) {
      c = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, c);
    }
    c.count += 1;
    if (c.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((c.resetAt - now) / 1000));
      reply.header('Retry-After', String(retryAfterSec));
      return reply.code(429).send({ error: 'Too Many Requests' });
    }
  });

  done();
};

export default fp(simpleRateLimit, { name: 'simple-rate-limit' });


