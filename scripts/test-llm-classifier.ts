/*
 Terminal harness to exercise the LLM classifier end-to-end (prompt → JSON).
 Usage:
   NODE_ENV=local USE_LLM_CLASSIFIER=true OPENAI_API_KEY=sk-... \
   ts-node --transpile-only scripts/test-llm-classifier.ts --message "Create a new lease listing for 22 King St W unit 1402."
*/

import 'dotenv/config';
import { argv } from 'node:process';

import { buildPrompt, callLLM, ClassificationV1Schema } from '../src/services/llmClassifier';

function parseArg(name: string): string | undefined {
  const flag = `--${name}`;
  const idx = argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

async function main() {
  const message = parseArg('message') || 'Please start active tasks for a new listing';
  const channel_id = 'C_TEST';
  const slack_user_id = 'U_TEST';
  const ts = String(Date.now());

  console.log('[TEST] Starting LLM classification test');
  console.log('[TEST] Using model from env:', process.env.OPENAI_MODEL || '(missing)');
  console.log('[TEST] Message:', message);

  try {
    const { system, developer, user, fewShot } = buildPrompt({ text: message, slack_user_id, channel_id, ts });

    console.log('[TEST] System prompt length:', system.length);
    console.log('[TEST] Developer spec length:', developer.length);
    console.log('[TEST] Few-shot examples:', fewShot.length);

    // We already provide a schema from the classifier module when used via classifyAndEnqueue,
    // here we call with json_object fallback to keep the harness simple.
    const raw = await callLLM(system, user, fewShot, developer, undefined);

    console.log('[TEST] Raw model output:', raw);

    // Validate output structure
    const parsed = ClassificationV1Schema.parse(
      typeof raw === 'string' ? JSON.parse(raw) : raw
    );

    console.log('[TEST] Parsed object:', JSON.stringify(parsed, null, 2));
    console.log('[TEST] SUCCESS');
    process.exit(0);
  } catch (err: any) {
    console.error('[TEST] ERROR:', err?.message || err);
    if (err?.response) {
      console.error('[TEST] API response error:', err.response);
    }
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();


