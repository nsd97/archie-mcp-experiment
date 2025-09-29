import { MessageAttributeValue, SendMessageCommand, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import sqs from '../db/sqsClient';
import { captureAsync } from './xray';

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
    input.MessageAttributes = attributes;
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
  };
}
