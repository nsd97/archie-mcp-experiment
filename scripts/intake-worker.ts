// intake worker: continuously drain intake queue so Slack events reach local UI
import { pollAndIngestOnce } from "../src/services/intakeIngestor";

const intervalMs = Number(process.env.INTAKE_WORKER_INTERVAL_MS || 2000);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[intake-worker] started");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const processed = await pollAndIngestOnce();
      if (processed > 0) {
        console.log(`[intake-worker] processed ${processed} message(s)`);
      }
    } catch (err) {
      console.error("[intake-worker] error", err);
    }
    await sleep(intervalMs);
  }
}

void main();
