/*
 Slack polling listener (no RTM/Socket Mode) using Web API via HTTPS.
 Reads SLACK_BOT_TOKEN from env/.env and polls conversations the bot is in.
 For each new user message, runs the classification and (optionally) enqueues.

 Usage:
   NODE_ENV=local USE_LLM_CLASSIFIER=true \
   ts-node --transpile-only scripts/slack-poll-listener.ts --enqueue --interval 5

 Optional flags:
   --enqueue       If present, enqueue to SQS via classifyAndEnqueueFromSlackEvent
   --interval N    Poll interval seconds (default 5)
   --channels C1,C2  Limit to channel IDs (comma-separated). If omitted, polls all bot channels
*/

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { classifyAndEnqueueFromSlackEvent } from '../src/services/llmClassifier';

// Load env from common files (without overriding existing process.env)
(() => {
  const root = process.cwd();
  const candidates = ['.env.local', '.env', 'ENV_LOCAL.txt', 'ENV_LOCAL_EXAMPLE.txt'];
  for (const rel of candidates) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
  }
})();

const token =
  process.env.SLACK_BOT_TOKEN ||
  process.env.SLACK_TOKEN ||
  process.env.SLACK_BOT_USER_OAUTH_TOKEN ||
  process.env.BOT_TOKEN || '';

if (!token) {
  console.error('[SLACK-POLL] Missing SLACK_BOT_TOKEN (or SLACK_TOKEN/SLACK_BOT_USER_OAUTH_TOKEN)');
  process.exit(1);
}

function parseArg(name: string): string | undefined {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

const shouldEnqueue = process.argv.includes('--enqueue');
const intervalSec = Number(parseArg('interval') || '5');
const channelsCsv = parseArg('channels');
const limitToChannels = channelsCsv ? new Set(channelsCsv.split(',').map((s) => s.trim())) : undefined;

async function slackGet(method: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<any> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    qs.set(k, String(v));
  }
  const url = `https://slack.com/api/${method}?${qs.toString()}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await resp.json();
  if (!data?.ok) throw new Error(`Slack API error ${method}: ${data?.error || resp.status}`);
  return data;
}

async function listBotChannels(): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await slackGet('conversations.list', {
      types: 'public_channel,private_channel',
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const c of res.channels as any[]) {
      if (!limitToChannels || limitToChannels.has(c.id) || limitToChannels.has(c.name)) out.push(c.id);
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return out;
}

type LastTsMap = Map<string, string>;

async function pollOnce(channels: string[], last: LastTsMap) {
  for (const channel of channels) {
    try {
      const oldest = last.get(channel) || '0';
      const res = await slackGet('conversations.history', { channel, oldest, inclusive: false, limit: 100 });
      const messages = (res.messages as any[]) || [];
      messages.reverse(); // process oldest->newest
      for (const m of messages) {
        const ts = String(m.ts || m.event_ts || Date.now());
        last.set(channel, ts);
        if (m.subtype || m.bot_id) continue; // ignore bot/system
        const text = String(m.text || '').trim();
        if (!text) continue;
        const user = String(m.user || '');
        if (!user) continue;

        console.log(`\n[SLACK-POLL] #${channel} ${ts} ${user}: ${text}`);
        const body = { type: 'event_callback', event: { type: 'message', text, user, channel, event_ts: ts } };
        if (shouldEnqueue) {
          const res = await classifyAndEnqueueFromSlackEvent(body);
          console.log('[CLASSIFY+ENQUEUE] result:', res);
        } else {
          // Dry-run: just log that we would classify
          console.log('[DRY-RUN] Would classify and enqueue');
        }
      }
    } catch (err: any) {
      console.error(`[SLACK-POLL] Error polling ${channel}:`, err?.message || err);
    }
  }
}

async function main() {
  console.log('[SLACK-POLL] Starting with interval', intervalSec, 'sec');
  const channels = await listBotChannels();
  if (channels.length === 0) {
    console.log('[SLACK-POLL] No channels found (bot must be a member).');
    return;
  }
  console.log('[SLACK-POLL] Polling channels:', channels.join(','));
  const last: LastTsMap = new Map();
  // Prime last TS with current top message to avoid backfill spam
  for (const ch of channels) {
    try {
      const res = await slackGet('conversations.history', { channel: ch, limit: 1 });
      const top = (res.messages?.[0]?.ts as string | undefined) || '0';
      if (top) last.set(ch, top);
    } catch {}
  }

  // Loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await pollOnce(channels, last);
    await new Promise((r) => setTimeout(r, Math.max(1, intervalSec) * 1000));
  }
}

main().catch((e) => {
  console.error('[SLACK-POLL] Fatal:', e);
  process.exit(1);
});


