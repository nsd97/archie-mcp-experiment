import { ddb } from "./client";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { nowIso } from "@services/time";
import { generateUlid } from "@services/ids";

export type AuditEvent = {
  entity_id: string; // listing_id or task_id
  sk: string; // timestamp#event_id
  entity_type: string;
  event_id: string;
  timestamp: string; // ISO
  action: string;
  performed_by?: string;
  performer_name?: string;
  changes?: Record<string, unknown>;
  content?: string;
  note_type?: string;
  metadata?: Record<string, unknown>;
};

const AUDIT_TABLE = process.env.AUDIT_LOG_TABLE || "audit_log";

export function makeSortKey(ts?: string, id?: string): string {
  const timestamp = ts ?? nowIso();
  const eventId = id ?? generateUlid();
  return `${timestamp}#${eventId}`;
}

export async function putAuditEvent(evt: Omit<AuditEvent, "sk" | "timestamp" | "event_id"> & Partial<Pick<AuditEvent, "timestamp" | "event_id">>): Promise<AuditEvent> {
  const timestamp = evt.timestamp ?? nowIso();
  const event_id = evt.event_id ?? generateUlid();
  const final: AuditEvent = {
    ...evt,
    timestamp,
    event_id,
    sk: `${timestamp}#${event_id}`,
  } as AuditEvent;
  const toPut: any = {
    ...final,
    "entity_type#action": `${final.entity_type}#${final.action}`,
    "entity_type#entity_id": `${final.entity_type}#${final.entity_id}`,
  };
  await ddb.send(new PutCommand({ TableName: AUDIT_TABLE, Item: toPut }));
  return final;
}

export async function getAuditEvent(entity_id: string, sk: string): Promise<AuditEvent | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: AUDIT_TABLE, Key: { entity_id, sk } }));
  return res.Item as AuditEvent | undefined;
}

// GSIs
// UserActivityIndex: PK performed_by, SK timestamp
export async function queryUserActivity(userId: string, fromTs = "", limit = 50): Promise<AuditEvent[]> {
  const hasFrom = typeof fromTs === "string" && fromTs.length > 0;
  const params: any = {
    TableName: AUDIT_TABLE,
    IndexName: "UserActivityIndex",
    ExpressionAttributeNames: { "#pk": "performed_by" },
    ExpressionAttributeValues: { ":pk": userId },
    Limit: limit,
    ScanIndexForward: false,
  };
  if (hasFrom) {
    params.KeyConditionExpression = "#pk = :pk AND begins_with(#ts, :from)";
    params.ExpressionAttributeNames["#ts"] = "timestamp";
    params.ExpressionAttributeValues[":from"] = fromTs;
  } else {
    params.KeyConditionExpression = "#pk = :pk";
  }
  const res = await ddb.send(new QueryCommand(params));
  return (res.Items as AuditEvent[]) ?? [];
}

// EntityTypeIndex: PK entity_type#action, SK timestamp
export async function queryByEntityTypeAction(key: string, fromTs = "", limit = 50): Promise<AuditEvent[]> {
  const hasFrom = typeof fromTs === "string" && fromTs.length > 0;
  const params: any = {
    TableName: AUDIT_TABLE,
    IndexName: "EntityTypeIndex",
    ExpressionAttributeNames: { "#pk": "entity_type#action" },
    ExpressionAttributeValues: { ":pk": key },
    Limit: limit,
    ScanIndexForward: false,
  };
  if (hasFrom) {
    params.KeyConditionExpression = "#pk = :pk AND begins_with(#ts, :from)";
    params.ExpressionAttributeNames["#ts"] = "timestamp";
    params.ExpressionAttributeValues[":from"] = fromTs;
  } else {
    params.KeyConditionExpression = "#pk = :pk";
  }
  const res = await ddb.send(new QueryCommand(params));
  return (res.Items as AuditEvent[]) ?? [];
}

// ListingHistoryIndex: PK entity_type#entity_id, SK timestamp
export async function queryListingHistory(key: string, fromTs = "", limit = 50): Promise<AuditEvent[]> {
  const hasFrom = typeof fromTs === "string" && fromTs.length > 0;
  const params: any = {
    TableName: AUDIT_TABLE,
    IndexName: "ListingHistoryIndex",
    ExpressionAttributeNames: { "#pk": "entity_type#entity_id" },
    ExpressionAttributeValues: { ":pk": key },
    Limit: limit,
    ScanIndexForward: false,
  };
  if (hasFrom) {
    params.KeyConditionExpression = "#pk = :pk AND begins_with(#ts, :from)";
    params.ExpressionAttributeNames["#ts"] = "timestamp";
    params.ExpressionAttributeValues[":from"] = fromTs;
  } else {
    params.KeyConditionExpression = "#pk = :pk";
  }
  const res = await ddb.send(new QueryCommand(params));
  return (res.Items as AuditEvent[]) ?? [];
}
