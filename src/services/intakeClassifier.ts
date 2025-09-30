import { MessageAttributeValue, SendMessageCommand, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import sqs from '../db/sqsClient';
import { captureAsync } from './xray';
import type { MessageType, ClassificationV1 } from './llmClassifier';

type SlackEventPayload = Record<string, any> | undefined;

type SlackNormalizedType = 'app_mention' | 'message.channels' | 'shortcut';

type SlackEvent = {
  type?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  user_id?: string;
  text?: string;
  ts?: string;
  event_ts?: string;
  team?: string;
  trace_id?: string;
  client_msg_id?: string;
};

const INTAKE_QUEUE_URL = (() => {
  const configured = process.env.INTAKE_QUEUE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'local') {
    return 'http://localhost:4566/000000000000/intake-queue';
  }
  throw new Error('INTAKE_QUEUE_URL must be configured outside of dev/test environments');
})();

export type NormalizedIntake = {
  schema_version: 1;
  source: 'slack';
  type: SlackNormalizedType;
  team_id?: string;
  channel_id?: string;
  user_id?: string;
  text?: string;
  ts?: string;
  trace_id?: string;
  raw: unknown;
  message_type: MessageType;
  task_key: ClassificationV1['task_key'];
  group_key: ClassificationV1['group_key'];
  listing: ClassificationV1['listing'];
  assignee_hint: ClassificationV1['assignee_hint'];
  due_date: ClassificationV1['due_date'];
  confidence: ClassificationV1['confidence'];
  explanations: ClassificationV1['explanations'];
};

export async function enqueueIntakeEvent(event: NormalizedIntake): Promise<void> {
  const input: SendMessageCommandInput = {
    QueueUrl: INTAKE_QUEUE_URL,
    MessageBody: JSON.stringify(event),
  };

  if (event.trace_id) {
    const attributes: Record<string, MessageAttributeValue> = {
      'x-trace-id': { DataType: 'String', StringValue: event.trace_id },
    };
    if (event.message_type) {
      attributes['message_type'] = { DataType: 'String', StringValue: event.message_type };
    }
    input.MessageAttributes = attributes;
  } else if (event.message_type) {
    input.MessageAttributes = {
      message_type: { DataType: 'String', StringValue: event.message_type },
    };
  }

  await captureAsync('enqueueIntakeEvent', async () => {
    await sqs.send(new SendMessageCommand(input));
  });
}

function resolveType(body: SlackEventPayload, event: SlackEvent | undefined, isShortcut: boolean): SlackNormalizedType | undefined {
  if (isShortcut) return 'shortcut';
  if (!event) return undefined;
  if (event.type === 'app_mention') return 'app_mention';
  if (event.type === 'message') {
    const channelType = event.channel_type || (body?.channel?.id ? 'channel' : undefined);
    if (channelType === 'channel' || channelType === 'group') return 'message.channels';
    if (
      !channelType &&
      typeof event.channel === 'string' &&
      (event.channel.startsWith('C') || event.channel.startsWith('G'))
    ) {
      return 'message.channels';
    }
  }
  return undefined;
}

export function normalizeSlackEvent(body: unknown): NormalizedIntake | null {
  const payload = body as SlackEventPayload;
  const event = payload?.event as SlackEvent | undefined;
  const isShortcut = payload?.type === 'shortcut' || payload?.type === 'message_action';
  const type = resolveType(payload, event, isShortcut);

  if (!type) {
    return null;
  }

  const teamId =
    payload?.team_id ||
    payload?.team?.id ||
    payload?.authorizations?.[0]?.team_id ||
    event?.team ||
    undefined;

  const channelId =
    (event?.channel as string | undefined) ||
    payload?.channel?.id ||
    payload?.container?.channel_id ||
    payload?.message?.channel ||
    (isShortcut ? (payload?.channel_id || payload?.channel) : undefined);

  const userId =
    (event?.user as string | undefined) ||
    (event?.user_id as string | undefined) ||
    payload?.user?.id ||
    payload?.message?.user ||
    undefined;

  const text =
    event?.text ||
    payload?.text ||
    payload?.message?.text ||
    payload?.callback_id ||
    undefined;

  const ts =
    event?.ts ||
    event?.event_ts ||
    payload?.event_ts ||
    payload?.container?.message_ts ||
    payload?.message?.ts ||
    payload?.action_ts ||
    (isShortcut ? payload?.ts : undefined);

  const traceId =
    event?.trace_id ||
    payload?.trace_id ||
    event?.client_msg_id ||
    payload?.event_id ||
    undefined;

  const classification = fallbackClassify(text);

  return {
    schema_version: 1,
    source: 'slack',
    type,
    team_id: teamId,
    channel_id: channelId,
    user_id: userId,
    text,
    ts,
    trace_id: traceId,
    raw: body,
    ...classification,
  };
}

function fallbackClassify(text: string | undefined): Pick<
  NormalizedIntake,
  'message_type' | 'task_key' | 'group_key' | 'listing' | 'assignee_hint' | 'due_date' | 'confidence' | 'explanations'
> {
  if (!text || !text.trim()) {
    return {
      message_type: 'INFO_REQUEST',
      task_key: null,
      group_key: null,
      listing: { type: null, address: null },
      assignee_hint: null,
      due_date: null,
      confidence: 0.4,
      explanations: ['Message was empty or missing text'],
    };
  }

  const lower = text.toLowerCase();
  const explanations: string[] = [];

  const looksLikeListing = /(new\s+)?(lease|sale)\s+listing/.test(lower) || lower.includes('listing at ');
  const listingType: 'LEASE' | 'SALE' | null = lower.includes('lease')
    ? 'LEASE'
    : lower.includes('sale') || lower.includes('sell') || lower.includes('buyer sale')
    ? 'SALE'
    : null;

  const address = extractAddress(text);
  if (looksLikeListing && !address) {
    explanations.push('Could not extract address from message');
  }

  const dueDate = extractDueDate(text);
  if (!dueDate && /\bby\b|\bdue\b/.test(lower)) {
    explanations.push('Due date mentioned but not understood');
  }

  const brochureKeywords = /(brochure|onesheet|one\s*sheet|flyer|marketing\s+packet)/i;

  if (brochureKeywords.test(text)) {
    return {
      message_type: 'STRAY',
      task_key: 'BROCHURE_REQUEST',
      group_key: null,
      listing: { type: null, address },
      assignee_hint: extractAssignee(text),
      due_date: dueDate,
      confidence: address ? 0.75 : 0.6,
      explanations: explanations.length ? explanations : null,
    };
  }

  const groupKey = (() => {
    if (lower.includes('buyer lease')) return 'LEASE_LISTING' as const;
    if (lower.includes('buyer sale')) return 'SALE_LISTING' as const;
    if (listingType === 'LEASE') return 'LEASE_LISTING' as const;
    if (listingType === 'SALE') return 'SALE_LISTING' as const;
    return null;
  })();

  if (looksLikeListing) {
    return {
      message_type: 'GROUP',
      task_key: null,
      group_key: groupKey,
      listing: { type: listingType, address },
      assignee_hint: extractAssignee(text),
      due_date: dueDate,
      confidence: address ? 0.75 : 0.6,
      explanations: explanations.length ? explanations : null,
    };
  }

  if (lower.includes('task') || lower.startsWith('do ') || lower.includes('please')) {
    explanations.push('Could not map message to a known task key');
    return {
      message_type: 'INFO_REQUEST',
      task_key: null,
      group_key: null,
      listing: { type: null, address: null },
      assignee_hint: extractAssignee(text),
      due_date: dueDate,
      confidence: 0.5,
      explanations,
    };
  }

  return {
    message_type: 'IGNORE',
    task_key: null,
    group_key: null,
    listing: { type: null, address: null },
    assignee_hint: null,
    due_date: null,
    confidence: 0.6,
    explanations: ['Content not recognized as operational'],
  };
}

function extractAddress(text: string): string | null {
  if (!text) return null;

  const patterns: RegExp[] = [
    /\bat\s+([^\n]+?)(?:\s+(?:need|by|due|please|thanks)\b|[.,!?]|$)/i,
    /\bfor\s+([^\n]+?)(?:\s+(?:need|by|due|please|thanks)\b|[.,!?]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const cleaned = sanitizeAddressSegment(match[1]);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

function sanitizeAddressSegment(segment: string): string | null {
  if (!segment) return null;
  let cleaned = segment.trim();

  cleaned = cleaned.replace(/^(?:the\s+|a\s+|an\s+)/i, '');
  cleaned = cleaned.replace(/[.,!?]+$/, '');
  cleaned = cleaned.replace(/\s+(?:need|by|due|please|thanks)\b.*/i, '');
  cleaned = cleaned.replace(/\s+for\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b.*$/i, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned.length ? cleaned : null;
}

function extractDueDate(text: string): string | null {
  const monthRegex = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s*(\d{4}))?/i;
  const match = text.match(monthRegex);
  if (!match) return null;
  const [, monthName, dayStr, yearStr] = match;
  const monthMap: Record<string, string> = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12',
  };
  const month = monthMap[monthName.toLowerCase()];
  if (!month) return null;
  const day = dayStr.padStart(2, '0');
  // If year is missing, infer it as the next occurrence of the month/day.
  // Use current year if the month/day has not passed yet; otherwise, next year.
  const now = new Date();
  let inferredYear: number;
  if (yearStr && /^\d{4}$/.test(yearStr)) {
    inferredYear = parseInt(yearStr, 10);
  } else {
    const currentYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1; // 1-12
    const thisDay = now.getDate();
    const targetMonth = parseInt(month, 10);
    const targetDay = parseInt(day, 10);
    const isLaterThisYear =
      targetMonth > thisMonth || (targetMonth === thisMonth && targetDay >= thisDay);
    inferredYear = isLaterThisYear ? currentYear : currentYear + 1;
  }
  return `${inferredYear}-${month}-${day}`;
}

function extractAssignee(text: string): string | null {
  const mentionMatch = text.match(/<@([A-Z0-9]+)>/i);
  if (mentionMatch) return mentionMatch[1];
  const byName = text.match(/assign(?: to)?\s+([A-Za-z.\- ]+)/i);
  return byName ? byName[1].trim() : null;
}
