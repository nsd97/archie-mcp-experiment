/*
 Live Slack listener that streams messages from your workspace and runs the
 classification_v1 prompt, printing results and (optionally) enqueueing to SQS.

 Usage:
   SLACK_BOT_TOKEN=xoxb-... OPENAI_API_KEY=sk-... USE_LLM_CLASSIFIER=true \
   NODE_ENV=local ts-node --transpile-only scripts/slack-live-listener.ts --enqueue

 Flags:
   --enqueue   If provided, will call classifyAndEnqueueFromSlackEvent to enqueue to SQS.
               Otherwise, it will just run the prompt and print the parsed JSON.
*/

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { RTMClient } from '@slack/rtm-api';
import { App } from '@slack/bolt';
import { classifyAndEnqueueFromSlackEvent, buildPrompt, callLLM, ClassificationV1Schema } from '../src/services/llmClassifier';

// Load environment from common local files if not already present
(() => {
  const root = process.cwd();
  const candidates = [
    '.env.local',
    '.env',
    'ENV_LOCAL.txt',
    'ENV_LOCAL_EXAMPLE.txt',
  ];
  for (const rel of candidates) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
    }
  }
})();

const token =
  process.env.SLACK_BOT_TOKEN ||
  process.env.SLACK_TOKEN ||
  process.env.SLACK_BOT_USER_OAUTH_TOKEN ||
  process.env.BOT_TOKEN ||
  process.env.SLACK_OAUTH_TOKEN ||
  '';
const appToken = process.env.SLACK_APP_LEVEL_TOKEN || process.env.SLACK_APP_TOKEN || '';
if (!token) {
  console.error('[SLACK] SLACK_BOT_TOKEN missing (looked for SLACK_BOT_TOKEN/SLACK_TOKEN/SLACK_BOT_USER_OAUTH_TOKEN)');
  process.exit(1);
}

const shouldEnqueue = process.argv.includes('--enqueue');

async function handleMessage(event: any) {
  try {
    if (!event || typeof event !== 'object') return;
    if (event.subtype) return; // ignore bot edits, joins, etc.
    const text = String(event.text || '').trim();
    if (!text) return;

    console.log('\n[SLACK] Message:', text);
    const body = { type: 'event_callback', event };

    if (shouldEnqueue) {
      const res = await classifyAndEnqueueFromSlackEvent(body);
      console.log('[CLASSIFY+ENQUEUE] result:', res);
      return;
    }

    const extracted = {
      text,
      slack_user_id: String(event.user || event.user_id || ''),
      channel_id: String(event.channel || ''),
      ts: String(event.ts || event.event_ts || Date.now()),
    };

    const { system, developer, user, fewShot } = buildPrompt(extracted);
    const schema = ClassificationV1Schema.toJSON?.() as any | undefined;
    const raw = await callLLM(system, user, fewShot, developer, schema);
    console.log('[LLM raw]:', raw);
    const parsed = ClassificationV1Schema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
    console.log('[Parsed]:', JSON.stringify(parsed, null, 2));
  } catch (err: any) {
    console.error('[ERROR] handleMessage:', err?.message || err);
    if (err?.stack) console.error(err.stack);
  }
}

async function main() {
  if (appToken) {
    console.log('[SLACK] Starting Bolt Socket Mode...');
    const app = new App({ token, appToken, socketMode: true });
    app.event('message', async ({ event }) => {
      await handleMessage(event);
    });
    await app.start();
    console.log('[SLACK] Socket Mode ready');
    return;
  }

  console.log('[SLACK] Starting RTM...');
  const rtm = new RTMClient(token);
  rtm.on('ready', () => console.log('[SLACK] RTM ready'));
  rtm.on('disconnected', () => console.log('[SLACK] RTM disconnected'));
  rtm.on('unable_to_rtm_start', (e) => console.error('[SLACK] unable_to_rtm_start', e));
  rtm.on('error', (e) => console.error('[SLACK] RTM error', e));
  rtm.on('message', handleMessage);
  await rtm.start();
}

main().catch((e) => {
  console.error('[SLACK] Fatal:', e);
  process.exit(1);
});


