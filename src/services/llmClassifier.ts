import { z } from 'zod';
import { createHash } from 'crypto';
import { MessageAttributeValue, SendMessageCommand } from '@aws-sdk/client-sqs';
import OpenAI from 'openai';
import sqs from '../db/sqsClient';
import { captureAsync } from './xray';

// New V1 classification schema (message_type + group/task keys)
export type MessageType = 'GROUP' | 'STRAY' | 'INFO_REQUEST' | 'IGNORE';

export interface ClassificationV1 {
  schema_version: 1;
  message_type: MessageType;
  task_key: string | null;
  group_key: 'SALE_LISTING' | 'LEASE_LISTING' | null;
  listing: { type: 'LEASE' | 'SALE' | null; address: string | null };
  assignee_hint: string | null;
  due_date: string | null; // ISO yyyy-mm-dd or yyyy-mm-ddThh:mm
  confidence: number; // 0..1
  explanations: string[] | null;
}

export const ClassificationV1Schema = z.object({
  schema_version: z.literal(1),
  message_type: z.enum(['GROUP', 'STRAY', 'INFO_REQUEST', 'IGNORE']),
  task_key: z.union([z.string(), z.null()]),
  group_key: z.union([z.enum(['SALE_LISTING', 'LEASE_LISTING']), z.null()]),
  listing: z.object({
    type: z.union([z.enum(['LEASE', 'SALE']), z.null()]),
    address: z.union([z.string(), z.null()]),
  }),
  assignee_hint: z.union([z.string(), z.null()]),
  due_date: z.union([z.string(), z.null()]),
  confidence: z.number().min(0).max(1),
  explanations: z.union([z.array(z.string()).min(1), z.null()]),
});

export type ClassificationV1Parsed = z.infer<typeof ClassificationV1Schema>;

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
    const text = String(
      payload?.message?.text ||
      payload?.text ||
      payload?.callback_id ||
      ''
    );
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
  const system = [
    'System (ultra-brief, non-negotiable)',
    'You transform real-estate operations Slack messages into JSON only that conforms to the developer instructions and schema.',
    'Never fabricate fields. If irrelevant to ops, return IGNORE. If operational but incomplete, return INFO_REQUEST with brief explanations.',
    'Do not output prose or code fences—JSON only.',
  ].join('\n');

  const developer = [
    'Developer (full behavior spec)',
    'Objective',
    'Classify a Slack message and extract fields into a strict JSON object that matches the schema. Return only valid JSON.',
    '',
    'Message types',
    '• GROUP — The message declares or updates a listing container (i.e., “this is a listing entity”).',
    'Allowed group_key values:',
    '• SALE_LISTING',
    '• LEASE_LISTING',
    '• STRAY — A single actionable task that does not declare/update a listing group. Pick exactly one task_key below.',
    '• INFO_REQUEST — Operational/real-estate content but missing specifics to proceed. Explain what’s missing in explanations.',
    '• IGNORE — Chit-chat, reactions, or content unrelated to operations.',
    '',
    'Task taxonomy (valid task_key values for STRAY)',
    'Sale Listings',
    '• SALE_ACTIVE_TASKS, SALE_SOLD_TASKS, SALE_CLOSING_TASKS',
    '',
    'Lease Listings',
    '• LEASE_ACTIVE_TASKS, LEASE_LEASED_TASKS, LEASE_CLOSING_TASKS, LEASE_ACTIVE_TASKS_ARLYN (special case)',
    '',
    'Re-List Listings',
    '• RELIST_LISTING_DEAL_SALE, RELIST_LISTING_DEAL_LEASE',
    '',
    'Buyer Deals',
    '• BUYER_DEAL, BUYER_DEAL_CLOSING_TASKS',
    '',
    'Lease Tenant Deals',
    '• LEASE_TENANT_DEAL, LEASE_TENANT_DEAL_CLOSING_TASKS',
    '',
    'Pre-Con Deals',
    '• PRECON_DEAL',
    '',
    'Mutual Release',
    '• MUTUAL_RELEASE_STEPS',
    '',
    'Listing types (for listing.type)',
    '• SALE — Property being sold; tasks may reference active marketing, conditional/sold state, or closing steps.',
    '• LEASE — Property being leased; tasks may reference showings, offers, leased state, or closing steps.',
    'Note: “Active Tasks – Arlyn” is a lease-specific special case (LEASE_ACTIVE_TASKS_ARLYN).',
    '',
    'Extraction rules',
    '• listing.type → "SALE" or "LEASE" only if explicitly stated or unambiguously implied by the exact task label chosen. Otherwise null.',
    '• listing.address → Street/building/unit only if explicitly present. Otherwise null.',
    '• assignee_hint → Person named or @-mentioned as responsible (e.g., “assign to Arlyn”). Otherwise null.',
    '• due_date → Include only if present. Use ISO: Date: YYYY-MM-DD; DateTime: YYYY-MM-DDThh:mm (24-hour).',
    '  Resolve to ISO only when the calendar date/time is unambiguous from the message text. If absent or only relative (e.g., “by Friday”) without a resolvable calendar date, set null and add an explanation.',
    '',
    'Decision rules & tie-breaks',
    '• Choose exactly one message_type.',
    '• GROUP ⇒ set group_key (one of two) and task_key:null.',
    '• STRAY ⇒ set task_key (one from taxonomy) and group_key:null.',
    '• If multiple task candidates appear, choose the most specific (e.g., *_CLOSING_* over *_ACTIVE_*). If ambiguity remains, use INFO_REQUEST and explain.',
    '• Never infer addresses, listing types, assignees, or dates from context outside the message.',
    '• confidence ∈ [0,1] reflects certainty of classification and extracted fields.',
    '• explanations → brief bullets for key assumptions or missing info; null if not needed.',
  ].join('\n');

  const fewShot = [
    {
      role: 'user' as const,
      content: 'Input: “Create a new lease listing for 22 King St W unit 1402.”',
    },
    {
      role: 'assistant' as const,
      content: JSON.stringify({
        schema_version: 1,
        message_type: 'GROUP',
        task_key: null,
        group_key: 'LEASE_LISTING',
        listing: { type: 'LEASE', address: '22 King St W unit 1402' },
        assignee_hint: null,
        due_date: null,
        confidence: 0.94,
        explanations: ['Due date not present'],
      } satisfies ClassificationV1),
    },
    {
      role: 'user' as const,
      content: 'Input: “For 18 Oak Ave, start closing checklist; target Oct 3 17:00.”',
    },
    {
      role: 'assistant' as const,
      content: JSON.stringify({
        schema_version: 1,
        message_type: 'STRAY',
        task_key: 'SALE_CLOSING_TASKS',
        group_key: null,
        listing: { type: 'SALE', address: '18 Oak Ave' },
        assignee_hint: null,
        due_date: '2025-10-03T17:00',
        confidence: 0.91,
        explanations: null,
      } satisfies ClassificationV1),
    },
    {
      role: 'user' as const,
      content: 'Input: “Please start active tasks for the new listing.”',
    },
    {
      role: 'assistant' as const,
      content: JSON.stringify({
        schema_version: 1,
        message_type: 'INFO_REQUEST',
        task_key: null,
        group_key: null,
        listing: { type: null, address: null },
        assignee_hint: null,
        due_date: null,
        confidence: 0.72,
        explanations: ['Missing listing type (SALE/LEASE)', 'Missing address', 'Due date not present'],
      } satisfies ClassificationV1),
    },
    {
      role: 'user' as const,
      content: 'Input: “Great job team! 🎉”',
    },
    {
      role: 'assistant' as const,
      content: JSON.stringify({
        schema_version: 1,
        message_type: 'IGNORE',
        task_key: null,
        group_key: null,
        listing: { type: null, address: null },
        assignee_hint: null,
        due_date: null,
        confidence: 0.99,
        explanations: ['Irrelevant to operations'],
      } satisfies ClassificationV1),
    },
  ];

  const user = `Return ONLY JSON per the schema.\n\nMessage:\n${sanitizedText}`;

  return { system, developer, user, fewShot };
}

export let callLLM = async (
  systemPrompt: string,
  userPrompt: string,
  fewShot?: Array<{ role: 'user' | 'assistant'; content: string }>,
  developerPrompt?: string,
  jsonSchema?: Record<string, unknown>
): Promise<string> => {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (provider !== 'openai') {
    throw new Error(`LLM provider not configured${provider ? `: ${provider}` : ''}`);
  }

  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const client = new OpenAI({ apiKey });
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  messages.push({ role: 'system', content: systemPrompt });
  if (developerPrompt) messages.push({ role: 'system', content: developerPrompt });
  if (fewShot && fewShot.length) messages.push(...fewShot);
  messages.push({ role: 'user', content: userPrompt });

  const model = process.env.OPENAI_MODEL || 'gpt-5';
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
          response_format: jsonSchema
            ? { type: 'json_schema', json_schema: { name: 'RealEstateOpsClassification', schema: jsonSchema, strict: true } as any }
            : { type: 'json_object' },
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
        response_format: jsonSchema
          ? { type: 'json_schema', json_schema: { name: 'RealEstateOpsClassification', schema: jsonSchema, strict: true } as any }
          : { type: 'json_object' },
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

// JSON Schema to enforce the new output structure (mirrors the spec provided)
const CLASSIFICATION_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'RealEstateOpsClassification',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'message_type',
    'task_key',
    'group_key',
    'listing',
    'assignee_hint',
    'due_date',
    'confidence',
    'explanations',
  ],
  properties: {
    schema_version: { const: 1 },
    message_type: { type: 'string', enum: ['GROUP', 'STRAY', 'INFO_REQUEST', 'IGNORE'] },
    task_key: {
      oneOf: [
        {
          type: 'string',
          enum: [
            'SALE_ACTIVE_TASKS',
            'SALE_SOLD_TASKS',
            'SALE_CLOSING_TASKS',
            'LEASE_ACTIVE_TASKS',
            'LEASE_LEASED_TASKS',
            'LEASE_CLOSING_TASKS',
            'LEASE_ACTIVE_TASKS_ARLYN',
            'RELIST_LISTING_DEAL_SALE',
            'RELIST_LISTING_DEAL_LEASE',
            'BUYER_DEAL',
            'BUYER_DEAL_CLOSING_TASKS',
            'LEASE_TENANT_DEAL',
            'LEASE_TENANT_DEAL_CLOSING_TASKS',
            'PRECON_DEAL',
            'MUTUAL_RELEASE_STEPS',
          ],
        },
        { type: 'null' },
      ],
    },
    group_key: {
      oneOf: [
        { type: 'string', enum: ['SALE_LISTING', 'LEASE_LISTING'] },
        { type: 'null' },
      ],
    },
    listing: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'address'],
      properties: {
        type: { oneOf: [{ type: 'string', enum: ['LEASE', 'SALE'] }, { type: 'null' }] },
        address: { type: ['string', 'null'] },
      },
    },
    assignee_hint: { type: ['string', 'null'] },
    due_date: {
      type: ['string', 'null'],
      pattern: '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}(:\\d{2})?)?$',
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    explanations: { oneOf: [{ type: 'array', items: { type: 'string' }, minItems: 1 }, { type: 'null' }] },
  },
};

export async function classifyAndEnqueueFromSlackEvent(body: unknown): Promise<{ ok?: boolean; skipped?: boolean }> {
  const toggle = (process.env.USE_LLM_CLASSIFIER || '').toLowerCase();
  if (toggle !== 'true') return { skipped: true };

  const extracted = extractFromSlackEvent(body);
  if (!extracted) return { skipped: true };

  const { text, slack_user_id, channel_id, ts, links, attachments } = extracted;
  const idempotencyKey = sha1Hex(`${channel_id}:${ts}`);
  const { system, developer, user, fewShot } = buildPrompt({ text, slack_user_id, channel_id, ts });

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
    return withTimeout(callLLM(system, user, fewShot, developer, CLASSIFICATION_JSON_SCHEMA));
  });

  let parsed: ClassificationV1Parsed;
  try {
    const candidate = (typeof rawJson === 'string' ? parseLLMJson(rawJson) : rawJson) as Record<string, unknown>;
    const withDefaults = {
      ...candidate,
      schema_version: 1 as const,
    };
    parsed = ClassificationV1Schema.parse(withDefaults);
  } catch {
    return { skipped: true };
  }

  if (parsed.message_type === 'IGNORE' || (parsed.confidence ?? 0) < confidenceMin) {
    return { skipped: true };
  }

  await captureAsync('enqueue-intake', async () => {
    const attributes: Record<string, MessageAttributeValue> = {
      message_type: { DataType: 'String', StringValue: parsed.message_type },
    };

    const traceId = Array.isArray(parsed.explanations) ? parsed.explanations[0] : undefined;
    if (traceId) {
      attributes['x-trace-id'] = { DataType: 'String', StringValue: traceId };
    }

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: INTAKE_QUEUE_URL,
        MessageBody: JSON.stringify({
          schema: 'classification_v1',
          idempotency_key: idempotencyKey,
          source: { slack_user_id, channel_id, ts },
          payload: parsed,
          links,
          attachments,
        }),
        MessageDeduplicationId: idempotencyKey,
        MessageGroupId: channel_id,
        MessageAttributes: attributes,
      })
    );
  });

  return { ok: true };
}
