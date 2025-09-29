import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifySlackSignature } from '../services/slackVerify';

function shouldBypass(): boolean {
  return (process.env.SLACK_BYPASS_VERIFY || '').toLowerCase() === 'true' || process.env.NODE_ENV === 'local';
}

async function verifyOr401(req: FastifyRequest, reply: FastifyReply, rawBody: string): Promise<boolean> {
  if (shouldBypass()) return true;
  const secret = process.env.SLACK_SIGNING_SECRET || '';
  const sig = (req.headers['x-slack-signature'] as string) || '';
  const ts = (req.headers['x-slack-request-timestamp'] as string) || '';
  const ok = secret && sig && ts && verifySlackSignature(secret, ts, rawBody, sig);
  if (!ok) {
    await reply.code(401).send({ error: 'invalid signature' });
    return false;
  }
  return true;
}

function normalizeEvent(body: any): { type: string; text?: string; user?: string } | null {
  if (body?.type === 'event_callback' && body.event) {
    const ev = body.event;
    if (ev.type === 'app_mention') return { type: 'app_mention', text: ev.text, user: ev.user };
    if (ev.type === 'message' && ev.channel_type === 'channel') return { type: 'message.channels', text: ev.text, user: ev.user };
  }
  if (body?.type === 'shortcut') return { type: 'shortcut', text: body.callback_id, user: body.user?.id };
  return null;
}

async function ingest(payload: any) {
  // Stub ingestion: write to audit log for visibility
  const { putAuditEvent } = await import('../db/audit_log');
  await putAuditEvent({
    entity_id: 'slack-intake',
    entity_type: 'external',
    action: payload.type || 'unknown',
    content: JSON.stringify(payload),
    performed_by: payload.user || 'slack',
  });
}

export default async function slackRoutes(app: FastifyInstance) {
  // Raw body capture
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body: string, done) => {
    try {
      (req as any).rawBody = body;
      done(null, JSON.parse(body || '{}'));
    } catch (err) {
      done(err as Error, undefined as any);
    }
  });

  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body: string, done) => {
    try {
      (req as any).rawBody = body;
      const parsed = body && body.trim().startsWith('{') ? JSON.parse(body) : { text: body };
      done(null, parsed);
    } catch (err) {
      done(err as Error, undefined as any);
    }
  });

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body: string, done) => {
    try {
      (req as any).rawBody = body;
      let parsed: any = {};
      if (body && body.trim().length > 0) {
        if (body.startsWith('payload=')) {
          const v = body.slice('payload='.length);
          const json = decodeURIComponent(v.replace(/\+/g, '%20'));
          parsed = JSON.parse(json);
        } else {
          const params = new URLSearchParams(body);
          params.forEach((val, key) => {
            parsed[key] = val;
          });
        }
      }
      done(null, parsed);
    } catch (err) {
      done(err as Error, undefined as any);
    }
  });

  app.post('/slack/events', async (req, reply) => {
    const raw = (req as any).rawBody || '';
    if (!(await verifyOr401(req, reply, raw))) return;
    const body: any = req.body || {};
    if (body.type === 'url_verification' && body.challenge) {
      return reply.send({ challenge: body.challenge });
    }

    // Ack immediately to avoid Slack retries
    // Persist minimal state before acking
    const norm = normalizeEvent(body);
    if (norm) await ingest(norm); // ensure we’ve persisted something before acking

    // Ack quickly after the durable write
    reply.send({ ok: true });

    // Fire-and-forget background processing
    void (async () => {
      try {
        const payload = body;
        const { classifyAndEnqueueFromSlackEvent } = await import('../services/llmClassifier');
        const res = await classifyAndEnqueueFromSlackEvent(payload);
        if (!res?.ok) {
          const legacy = await import('../services/intakeClassifier');
          const normalized = legacy.normalizeSlackEvent(payload);
          if (normalized) await legacy.enqueueIntakeEvent(normalized);
        }
      } catch {
        try {
          const legacy = await import('../services/intakeClassifier');
          const normalized = legacy.normalizeSlackEvent(body);
          if (normalized) await legacy.enqueueIntakeEvent(normalized);
        } catch {}
      }
    })();

    return;
  });

  app.post('/slack/interact', async (req, reply) => {
    const raw = (req as any).rawBody || '';
    if (!(await verifyOr401(req, reply, raw))) return;
    const body = req.body as any;
    const norm = normalizeEvent(body);
    if (norm) await ingest(norm);
    try {
      const { classifyAndEnqueueFromSlackEvent } = await import('../services/llmClassifier');
      const res = await classifyAndEnqueueFromSlackEvent(body);
      if (!res?.ok) {
        const legacy = await import('../services/intakeClassifier');
        const normalized = legacy.normalizeSlackEvent(body);
        if (normalized) await legacy.enqueueIntakeEvent(normalized);
      }
    } catch {
      try {
        const legacy = await import('../services/intakeClassifier');
        const normalized = legacy.normalizeSlackEvent(body);
        if (normalized) await legacy.enqueueIntakeEvent(normalized);
      } catch {}
    }
    return reply.send({ ok: true });
  });
}


