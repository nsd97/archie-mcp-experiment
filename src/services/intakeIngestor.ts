import { ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import sqs from "../db/sqsClient";
import { putAuditEvent } from "../db/audit_log";
import { ddb } from "../db/client";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { putListing } from "../db/listings";
import { putTask } from "../db/tasks";
import { captureAsync } from "./xray";

const INTAKE_QUEUE_URL = process.env.INTAKE_QUEUE_URL || "http://localhost:4566/000000000000/intake-queue";

export async function pollAndIngestOnce(maxMessages = 5) {
  const recv = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: INTAKE_QUEUE_URL,
      MaxNumberOfMessages: Math.min(Math.max(maxMessages, 1), 10),
      WaitTimeSeconds: 1,
    })
  );

  if (!recv.Messages || recv.Messages.length === 0) return 0;

  let processed = 0;
  for (const m of recv.Messages) {
    try {
      const payload = JSON.parse(m.Body || "{}");
      if (payload?.schema_version !== 1) throw new Error("invalid schema");
      const eventId = payload.ts || payload.raw?.event?.event_ts || payload.raw?.event_id || m.MessageId;
      // Idempotency via intake_events table
      const table = process.env.INTAKE_EVENTS_TABLE || 'intake_events';
      const existing = await ddb.send(new GetCommand({ TableName: table, Key: { event_id: String(eventId) } }));
      if (existing.Item) {
        await sqs.send(new DeleteMessageCommand({ QueueUrl: INTAKE_QUEUE_URL, ReceiptHandle: m.ReceiptHandle! }));
        processed++;
        continue;
      }

      // Idempotency could be enforced via intake_events table (omitted minimal stub)
      // Map normalized payload to domain writes
      await captureAsync('intakeIngest', async () => {
        const intent = payload.intent as string | undefined;
        if (intent === 'CREATE_LISTING') {
          const l = payload.listing || {};
          const listing = await putListing({ type: l.type || 'SALE', status: 'new', address_string: l.address || 'Unknown' } as any);
          for (const t of payload.tasks || []) {
            await putTask({ listing_id: listing.listing_id, name: t.title || t.task_type, status: 'OPEN', task_def_id: t.task_type, inputs: t.inputs } as any);
          }
          await putAuditEvent({ entity_type: 'listing', entity_id: listing.listing_id, action: 'CREATED_FROM_INTAKE', content: JSON.stringify(payload) } as any);
        } else if (intent === 'ADD_TASKS_TO_LISTING') {
          const lId = payload.listing?.address || payload.source?.channel_id; // simplistic mapping fallback
          if (lId) {
            for (const t of payload.tasks || []) {
              await putTask({ listing_id: lId, name: t.title || t.task_type, status: 'OPEN', task_def_id: t.task_type, inputs: t.inputs } as any);
            }
            await putAuditEvent({ entity_type: 'listing', entity_id: lId, action: 'TASKS_ADDED_FROM_INTAKE', content: JSON.stringify(payload) } as any);
          }
        } else if (intent === 'CREATE_STRAY_TASK') {
          for (const t of payload.tasks || []) {
            await putTask({ listing_id: 'stray', name: t.title || t.task_type, status: 'OPEN', task_def_id: t.task_type, inputs: t.inputs, task_category: payload.stray?.category_hint, is_stray: true } as any);
          }
          await putAuditEvent({ entity_type: 'stray', entity_id: 'stray', action: 'STRAY_TASKS_FROM_INTAKE', content: JSON.stringify(payload) } as any);
        } else if (intent === 'INFO_REQUEST') {
          await putAuditEvent({ entity_type: 'intake', entity_id: 'slack', action: 'INFO_REQUESTED', content: JSON.stringify(payload.meta?.explanations || []) } as any);
        } else {
          await putAuditEvent({ entity_type: 'intake', entity_id: 'slack', action: 'INGESTED', content: payload.type } as any);
        }
      });
      await ddb.send(new PutCommand({ TableName: table, Item: { event_id: String(eventId), processed_at: new Date().toISOString() } }));

      await sqs.send(new DeleteMessageCommand({ QueueUrl: INTAKE_QUEUE_URL, ReceiptHandle: m.ReceiptHandle! }));
      processed++;
    } catch (err) {
      // Let SQS handle retries / DLQ via redrive policy
      // Do not delete the message on error
    }
  }
  return processed;
}

// Testable pure-ish mapper using existing DB helpers
export async function processNormalizedIntake(payload: any) {
  return await captureAsync('intakeIngest', async () => {
    const intent = payload.intent as string | undefined;
    if (intent === 'CREATE_LISTING') {
      const l = payload.listing || {};
      const listing = await putListing({ type: l.type || 'SALE', status: 'new', address_string: l.address || 'Unknown' } as any);
      for (const t of payload.tasks || []) {
        await putTask({ listing_id: listing.listing_id, name: t.title || t.task_type, status: 'OPEN', task_def_id: t.task_type, inputs: t.inputs } as any);
      }
      await putAuditEvent({ entity_type: 'listing', entity_id: listing.listing_id, action: 'CREATED_FROM_INTAKE', content: JSON.stringify(payload) } as any);
      return { listing_id: listing.listing_id, tasks: (payload.tasks || []).length };
    } else if (intent === 'ADD_TASKS_TO_LISTING') {
      const lId = payload.listing?.listing_id || payload.listing?.address || payload.source?.channel_id;
      if (lId) {
        for (const t of payload.tasks || []) {
          await putTask({ listing_id: lId, name: t.title || t.task_type, status: 'OPEN', task_def_id: t.task_type, inputs: t.inputs } as any);
        }
        await putAuditEvent({ entity_type: 'listing', entity_id: lId, action: 'TASKS_ADDED_FROM_INTAKE', content: JSON.stringify(payload) } as any);
        return { listing_id: lId, tasks: (payload.tasks || []).length };
      }
      return { skipped: true };
    } else if (intent === 'CREATE_STRAY_TASK') {
      for (const t of payload.tasks || []) {
        await putTask({ listing_id: 'stray', name: t.title || t.task_type, status: 'OPEN', task_def_id: t.task_type, inputs: t.inputs, task_category: payload.stray?.category_hint, is_stray: true } as any);
      }
      await putAuditEvent({ entity_type: 'stray', entity_id: 'stray', action: 'STRAY_TASKS_FROM_INTAKE', content: JSON.stringify(payload) } as any);
      return { stray: true, tasks: (payload.tasks || []).length };
    } else if (intent === 'INFO_REQUEST') {
      await putAuditEvent({ entity_type: 'intake', entity_id: 'slack', action: 'INFO_REQUESTED', content: JSON.stringify(payload.meta?.explanations || []) } as any);
      return { infoRequested: true };
    }
    await putAuditEvent({ entity_type: 'intake', entity_id: 'slack', action: 'INGESTED', content: payload.type } as any);
      return { ingested: true };
  });
}

