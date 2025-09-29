import { z } from 'zod';
import { createHash } from 'crypto';
import { MessageAttributeValue, SendMessageCommand } from '@aws-sdk/client-sqs';
import OpenAI from 'openai';
import sqs from '../db/sqsClient';
import { captureAsync } from './xray';

export type IntakeIntent =
  | 'CREATE_LISTING'
  | 'CREATE_STRAY_TASK'
  | 'UPDATE_LISTING'
  | 'ADD_TASKS_TO_LISTING'
  | 'INFO_REQUEST'
  | 'IGNORE';

export interface NormalizedIntakeV1 {
  schema_version: 1;
  intent: IntakeIntent;
  idempotency_key: string;
  source: { slack_user_id: string; channel_id: string; ts: string };
  listing?: { type?: 'LEASE' | 'SALE'; address?: string; agent_hint?: string };
  tasks?: Array<{ task_type: string; title?: string; inputs?: Record<string, unknown> }>;
  stray?: { text?: string; category_hint?: 'ADMIN' | 'MARKETING' };
  meta?: { confidence: number; explanations?: string[] };
  links?: string[];
  attachments?: unknown[];
}

export const NormalizedIntakeV1Schema = z.object({
  schema_version: z.literal(1),
  intent: z.enum(['CREATE_LISTING', 'CREATE_STRAY_TASK', 'UPDATE_LISTING', 'ADD_TASKS_TO_LISTING', 'INFO_REQUEST', 'IGNORE']),
  idempotency_key: z.string(),
  source: z.object({
    slack_user_id: z.string(),
    channel_id: z.string(),
    ts: z.string(),
  }),
  listing: z
    .object({
      type: z.enum(['LEASE', 'SALE']).optional(),
      address: z.string().optional(),
      agent_hint: z.string().optional(),
    })
    .optional(),
  tasks: z
    .array(
      z.object({
        task_type: z.string(),
        title: z.string().optional(),
        inputs: z.record(z.string(), z.any()).optional(),
      })
    )
    .optional(),
  stray: z
    .object({
      text: z.string().optional(),
      category_hint: z.enum(['ADMIN', 'MARKETING']).optional(),
    })
    .optional(),
  meta: z
    .object({
      confidence: z.number().min(0).max(1),
      explanations: z.array(z.string()).optional(),
    })
    .optional(),
  links: z.array(z.string()).optional(),
  attachments: z.array(z.any()).optional(),
});

export type NormalizedIntakeV1Parsed = z.infer<typeof NormalizedIntakeV1Schema>;

const schemaDoc = `NormalizedIntakeV1 {
  schema_version: 1;
  intent: "CREATE_LISTING" | "CREATE_STRAY_TASK" | "UPDATE_LISTING" | "ADD_TASKS_TO_LISTING" | "INFO_REQUEST" | "IGNORE";
  idempotency_key: string;
  source: { slack_user_id: string; channel_id: string; ts: string };
  listing?: { type?: "LEASE" | "SALE"; address?: string; agent_hint?: string };
  tasks?: Array<{ task_type: string; title?: string; inputs?: Record<string, unknown> }>;
  stray?: { text?: string; category_hint?: "ADMIN" | "MARKETING" };
  meta?: { confidence: number; explanations?: string[] };
  links?: string[];
  attachments?: unknown[];
}`;

function sha1Hex(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function redactPII(text: string): string {
  if (!text) return '';
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b\+?\d[\d\s().-]{7,}\b/g, '[REDACTED_PHONE]');
}

export function extractFromSlackEvent(body: unknown):
  | { text: string; slack_user_id: string; channel_id: string; ts: string; links?: string[]; attachments?: unknown[] }
  | null {
  const payload = body as Record<string, any> | undefined;
  const type = payload?.type;

  if (type === 'event_callback' && payload?.event) {
    const event = payload.event as Record<string, any>;
    const text = String(event.text || '');
    const slackUser = String(event.user || event.user_id || '');
    const channel = String(event.channel || event.channel_id || '');
    const ts = String(event.event_ts || event.ts || payload.event_ts || '');
    if (!channel || !ts || !slackUser) return null;
    const links = Array.isArray(event.links) ? event.links : extractLinks(text);
    const attachments = Array.isArray(event.attachments) ? event.attachments : payload.attachments;
    return { text, slack_user_id: slackUser, channel_id: channel, ts, links, attachments };
  }

  if (type === 'shortcut' || type === 'message_action') {
    const text = String(payload?.callback_id || payload?.text || '');
    const slackUser = String(payload?.user?.id || payload?.user_id || '');
    const channel = String(payload?.channel?.id || payload?.channel?.name || payload?.channel_id || 'shortcut');
    const ts = String(payload?.action_ts || payload?.message?.ts || payload?.ts || Date.now());
    if (!slackUser || !ts) return null;
    const links = extractLinks(text);
    const attachments = Array.isArray(payload?.attachments) ? payload?.attachments : undefined;
    return { text, slack_user_id: slackUser, channel_id: channel, ts, links, attachments };
  }

  return null;
}

function extractLinks(text: string): string[] | undefined {
  const matches = text.match(/https?:\/\/\S+/gi);
  return matches && matches.length > 0 ? matches : undefined;
}

export function buildPrompt(input: { text: string; slack_user_id: string; channel_id: string; ts: string }) {
  const sanitizedText = redactPII(input.text);
  const system =
    'You convert Slack messages from real-estate operations into a strict JSON object that exactly matches the provided TypeScript schema. ' +
    'If the message is irrelevant respond with intent "IGNORE". For ambiguous messages respond with intent "INFO_REQUEST" and include meta.explanations describing what is missing. ' +
    'Never fabricate information, and always return valid JSON only.';

  const fewShot = [
    {
      role: 'user' as const,
      content:
        'Slack User: <@U111>\nChannel: C111\nTimestamp: 111.1\nMessage:\nCreate new lease at 123 Main St for Jane Agent. Need photos Friday.\n\nRequired JSON schema (TypeScript): ' +
        schemaDoc,
    },
    {
      role: 'assistant' as const,
      content: JSON.stringify({
        schema_version: 1,
        intent: 'CREATE_LISTING',
        idempotency_key: 'sha1(C111:111.1)',
        source: { slack_user_id: 'U111', channel_id: 'C111', ts: '111.1' },
        listing: { type: 'LEASE', address: '123 Main St', agent_hint: 'Jane Agent' },
        tasks: [{ task_type: 'BOOK_PHOTOS' }],
        meta: { confidence: 0.9, explanations: ['Clear lease creation with address and agent.'] },
      } satisfies NormalizedIntakeV1),
    },
    {
      role: 'user' as const,
      content:
        'Slack User: <@U222>\nChannel: C222\nTimestamp: 222.2\nMessage:\nthanks!\n\nRequired JSON schema (TypeScript): ' + schemaDoc,
    },
    {
      role: 'assistant' as const,
      content: JSON.stringify({
        schema_version: 1,
        intent: 'IGNORE',
        idempotency_key: 'sha1(C222:222.2)',
        source: { slack_user_id: 'U222', channel_id: 'C222', ts: '222.2' },
        meta: { confidence: 0.95 },
      } satisfies NormalizedIntakeV1),
    },
  ];

  const user = `Slack User: <@${input.slack_user_id}>
Channel: ${input.channel_id}
Timestamp: ${input.ts}
Message:
${sanitizedText}

Required JSON schema (TypeScript): ${schemaDoc}
Return ONLY the JSON.`;

  return { system, user, fewShot };
}

export let callLLM = async (
  systemPrompt: string,
  userPrompt: string,
  fewShot?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> => {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (provider !== 'openai') {
    throw new Error(`LLM provider not configured${provider ? `: ${provider}` : ''}`);
  }

  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const client = new OpenAI({ apiKey });
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...(fewShot || []),
    { role: 'user', content: userPrompt },
  ];

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const maxRetries = Number(process.env.LLM_MAX_RETRIES || '2');
  const useStream = (process.env.LLM_STREAM || 'false').toLowerCase() === 'true';

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= maxRetries) {
    try {
      if (useStream) {
        const stream = await client.chat.completions.create({
          model,
          messages,
          temperature: 0,
          response_format: { type: 'json_object' },
          stream: true,
        } as any);

        if (stream && typeof (stream as any)[Symbol.asyncIterator] === 'function') {
          let out = '';
          for await (const chunk of stream as any) {
            const delta = chunk?.choices?.[0]?.delta?.content || '';
            if (delta) out += delta;
          }
          return out.trim();
        }

        const fallback = stream as any;
        if (fallback?.choices) {
          const joined = (fallback.choices || [])
            .map((choice: any) => choice.delta?.content || choice.message?.content || '')
            .join('');
          if (joined) return joined.trim();
        }

        return '{}';
      }

      const resp = await client.chat.completions.create({
        model,
        messages,
        temperature: 0,
        response_format: { type: 'json_object' },
      } as any);

      return resp.choices?.[0]?.message?.content?.trim() || '{}';
    } catch (error) {
      lastErr = error;
      attempt += 1;
      if (attempt > maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }

  throw lastErr || new Error('LLM call failed');
};

export function __setCallLLM(fn: typeof callLLM) {
  callLLM = fn;
}

function parseLLMJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const sliced = raw.slice(start, end + 1);
      return JSON.parse(sliced);
    }
    throw new Error('Failed to parse LLM JSON output');
  }
}

const INTAKE_QUEUE_URL = process.env.INTAKE_QUEUE_URL || 'http://localhost:4566/000000000000/intake-queue';

export async function classifyAndEnqueueFromSlackEvent(body: unknown): Promise<{ ok?: boolean; skipped?: boolean }> {
  const toggle = (process.env.USE_LLM_CLASSIFIER || '').toLowerCase();
  if (toggle !== 'true') return { skipped: true };

  const extracted = extractFromSlackEvent(body);
  if (!extracted) return { skipped: true };

  const { text, slack_user_id, channel_id, ts, links, attachments } = extracted;
  const idempotencyKey = sha1Hex(`${channel_id}:${ts}`);
  const { system, user, fewShot } = buildPrompt({ text, slack_user_id, channel_id, ts });

  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || '6000');
  const confidenceMin = Number(process.env.LLM_CONFIDENCE_MIN || '0.6');

  const rawJson = await captureAsync('llm-classify', async () => {
    const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('LLM timeout')), timeoutMs);
        promise
          .then((value) => {
            clearTimeout(timer);
            resolve(value);
          })
          .catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
      });
    return withTimeout(callLLM(system, user, fewShot));
  });

  let parsed: NormalizedIntakeV1Parsed;
  try {
    const candidate = {
      ...(typeof rawJson === 'string' ? parseLLMJson(rawJson) : rawJson),
      schema_version: 1 as const,
      idempotency_key: idempotencyKey,
      source: { slack_user_id, channel_id, ts },
      links,
      attachments,
    } satisfies Partial<NormalizedIntakeV1>;

    parsed = NormalizedIntakeV1Schema.parse(candidate);
  } catch {
    return { skipped: true };
  }

  if (parsed.intent === 'IGNORE' || (parsed.meta?.confidence ?? 0) < confidenceMin) {
    return { skipped: true };
  }

  await captureAsync('enqueue-intake', async () => {
    const attributes: Record<string, MessageAttributeValue> = {
      intent: { DataType: 'String', StringValue: parsed.intent },
    };

    const traceId = parsed.meta?.explanations?.[0];
    if (traceId) {
      attributes['x-trace-id'] = { DataType: 'String', StringValue: traceId };
    }

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: INTAKE_QUEUE_URL,
        MessageBody: JSON.stringify(parsed),
        MessageDeduplicationId: parsed.idempotency_key,
        MessageGroupId: parsed.source.channel_id,
        MessageAttributes: attributes,
      })
    );
  });

  return { ok: true };
}
