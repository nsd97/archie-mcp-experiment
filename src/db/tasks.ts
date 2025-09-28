import { ddb } from "./client";
import { GetCommand, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { nowIso } from "@services/time";
import { generateUlid } from "@services/ids";

export type AssignedTo = { userId: string; username?: string; email?: string };

export type Task = {
  task_id: string; // ULID
  listing_id?: string;
  address?: string;
  agent?: string;
  listing_type?: string;
  listing_status?: string;
  task_type?: string;
  task_category?: string;
  name: string;
  description?: string;
  status: string;
  priority?: number;
  assigned_to?: AssignedTo;
  claim_status?: string;
  claimed_at?: string;
  due_date?: string;
  completed_at?: string;
  completed_by?: string;
  sla?: string;
  visibility_group?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  notes?: unknown[];
  attachments?: unknown[];
  estimated_duration_minutes?: number;
  required_skills?: string[];
  created_at: string;
  updated_at: string;
  created_by?: string;
  can_claim?: boolean;
  is_generic?: boolean;
  is_stray?: boolean;
};

const TASKS_TABLE = process.env.TASKS_TABLE || "tasks";

export async function putTask(
  item: Omit<Task, "task_id" | "created_at" | "updated_at"> & Partial<Pick<Task, "task_id">>
): Promise<Task> {
  const now = nowIso();
  const final: Task = {
    task_id: item.task_id ?? generateUlid(),
    created_at: now,
    updated_at: now,
    ...item,
  } as Task;
  const toPut: any = { ...final };
  if (final.assigned_to?.userId) {
    toPut["assigned_to.userId"] = final.assigned_to.userId;
  }
  if (final.listing_id && final.status) {
    toPut["listing_id#status"] = `${final.listing_id}#${final.status}`;
  }
  toPut["priority#due_date"] = `${final.priority ?? 0}#${final.due_date ?? ""}`;
  toPut["status#priority"] = `${final.status}#${final.priority ?? 0}`;
  toPut["task_category#is_stray"] = `${final.task_category ?? "uncategorized"}#${final.is_stray ? 1 : 0}`;
  await ddb.send(new PutCommand({ TableName: TASKS_TABLE, Item: toPut }));
  return final;
}

export async function getTaskById(task_id: string): Promise<Task | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TASKS_TABLE, Key: { task_id } }));
  return res.Item as Task | undefined;
}

// GSIs
// MyTasksIndex: PK assigned_to.userId, SK due_date
export async function queryMyTasks(userId: string, dueFrom = "", limit = 50): Promise<Task[]> {
  const hasFrom = typeof dueFrom === "string" && dueFrom.length > 0;
  const params: any = {
    TableName: TASKS_TABLE,
    IndexName: "MyTasksIndex",
    ExpressionAttributeNames: { "#assigned": "assigned_to.userId" },
    ExpressionAttributeValues: { ":user": userId },
    Limit: limit,
  };
  if (hasFrom) {
    params.KeyConditionExpression = "#assigned = :user AND begins_with(#due, :from)";
    params.ExpressionAttributeNames["#due"] = "due_date";
    params.ExpressionAttributeValues[":from"] = dueFrom;
  } else {
    params.KeyConditionExpression = "#assigned = :user";
  }
  const res = await ddb.send(new QueryCommand(params));
  return (res.Items as Task[]) ?? [];
}

// QueueIndex: PK listing_id#status, SK priority#due_date
export async function queryQueue(listingStatusKey: string, rangePrefix = "", limit = 50): Promise<Task[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TASKS_TABLE,
      IndexName: "QueueIndex",
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
      ExpressionAttributeNames: { "#pk": "listing_id#status", "#sk": "priority#due_date" },
      ExpressionAttributeValues: { ":pk": listingStatusKey, ":prefix": rangePrefix },
      Limit: limit,
    })
  );
  return (res.Items as Task[]) ?? [];
}

// ListingTasksIndex: PK listing_id, SK status#priority
export async function queryListingTasks(listing_id: string, statusPrefix = "", limit = 50): Promise<Task[]> {
  const hasPrefix = typeof statusPrefix === "string" && statusPrefix.length > 0;
  const params: any = {
    TableName: TASKS_TABLE,
    IndexName: "ListingTasksIndex",
    ExpressionAttributeNames: { "#listing": "listing_id" },
    ExpressionAttributeValues: { ":listing": listing_id },
    Limit: limit,
  };
  if (hasPrefix) {
    params.KeyConditionExpression = "#listing = :listing AND begins_with(#sk, :prefix)";
    params.ExpressionAttributeNames["#sk"] = "status#priority";
    params.ExpressionAttributeValues[":prefix"] = statusPrefix;
  } else {
    params.KeyConditionExpression = "#listing = :listing";
  }
  const res = await ddb.send(new QueryCommand(params));
  return (res.Items as Task[]) ?? [];
}

// StatusIndex: PK listing_id, SK status
export async function queryTasksByStatus(listing_id: string, status: string, limit = 50): Promise<Task[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TASKS_TABLE,
      IndexName: "StatusIndex",
      KeyConditionExpression: "#listing = :listing AND #status = :status",
      ExpressionAttributeNames: { "#listing": "listing_id", "#status": "status" },
      ExpressionAttributeValues: { ":listing": listing_id, ":status": status },
      Limit: limit,
    })
  );
  return (res.Items as Task[]) ?? [];
}

// UnclaimedTasksIndex: PK listing_id, SK claim_status
export async function queryUnclaimedTasks(listing_id: string, claimStatusPrefix = "", limit = 50): Promise<Task[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TASKS_TABLE,
      IndexName: "UnclaimedTasksIndex",
      KeyConditionExpression: "#listing = :listing AND begins_with(#claim, :prefix)",
      ExpressionAttributeNames: { "#listing": "listing_id", "#claim": "claim_status" },
      ExpressionAttributeValues: { ":listing": listing_id, ":prefix": claimStatusPrefix },
      Limit: limit,
    })
  );
  return (res.Items as Task[]) ?? [];
}

// TaskCategoryIndex: PK task_category#is_stray, SK created_at
export async function queryTasksByCategory(categoryKey: string, createdFrom = "", limit = 50): Promise<Task[]> {
  const hasFrom = typeof createdFrom === "string" && createdFrom.length > 0;
  const params: any = {
    TableName: TASKS_TABLE,
    IndexName: "TaskCategoryIndex",
    ExpressionAttributeNames: { "#pk": "task_category#is_stray" },
    ExpressionAttributeValues: { ":pk": categoryKey },
    Limit: limit,
    ScanIndexForward: false,
  };
  if (hasFrom) {
    params.KeyConditionExpression = "#pk = :pk AND begins_with(#created, :from)";
    params.ExpressionAttributeNames["#created"] = "created_at";
    params.ExpressionAttributeValues[":from"] = createdFrom;
  } else {
    params.KeyConditionExpression = "#pk = :pk";
  }
  const res = await ddb.send(new QueryCommand(params));
  return (res.Items as Task[]) ?? [];
}

export async function scanTasks(limit = 1000): Promise<Task[]> {
  const res = await ddb.send(new ScanCommand({ TableName: TASKS_TABLE, Limit: limit }));
  return (res.Items as Task[]) ?? [];
}

export async function claimTask(task: Task, assigneeId: string): Promise<Task> {
  const updated: Task = {
    ...task,
    status: "CLAIMED",
    claim_status: "CLAIMED",
    assigned_to: { ...(task.assigned_to || {}), userId: assigneeId },
    claimed_at: nowIso(),
    updated_at: nowIso(),
  } as Task;
  const toPut: any = { ...updated };
  toPut["assigned_to.userId"] = updated.assigned_to?.userId;
  if (updated.listing_id && updated.status) {
    toPut["listing_id#status"] = `${updated.listing_id}#${updated.status}`;
  }
  toPut["priority#due_date"] = `${updated.priority ?? 0}#${updated.due_date ?? ""}`;
  toPut["status#priority"] = `${updated.status}#${updated.priority ?? 0}`;
  toPut["task_category#is_stray"] = `${updated.task_category ?? "uncategorized"}#${updated.is_stray ? 1 : 0}`;
  await ddb.send(new PutCommand({ TableName: TASKS_TABLE, Item: toPut }));
  return updated;
}

export async function unclaimTask(task: Task): Promise<Task> {
  const updated: Task = {
    ...task,
    status: "OPEN",
    claim_status: "UNCLAIMED",
    assigned_to: null as any,
    claimed_at: undefined,
    updated_at: nowIso(),
  } as Task;
  const toPut: any = { ...updated };
  delete toPut.assigned_to;
  if (updated.listing_id && updated.status) {
    toPut["listing_id#status"] = `${updated.listing_id}#${updated.status}`;
  }
  toPut["priority#due_date"] = `${updated.priority ?? 0}#${updated.due_date ?? ""}`;
  toPut["status#priority"] = `${updated.status}#${updated.priority ?? 0}`;
  toPut["task_category#is_stray"] = `${updated.task_category ?? "uncategorized"}#${updated.is_stray ? 1 : 0}`;
  await ddb.send(new PutCommand({ TableName: TASKS_TABLE, Item: toPut }));
  return updated;
}

export async function completeTask(task: Task, completedBy: string): Promise<Task> {
  const updated: Task = {
    ...task,
    status: "DONE",
    completed_at: nowIso(),
    completed_by: completedBy,
    updated_at: nowIso(),
  } as Task;
  const toPut: any = { ...updated };
  if (updated.assigned_to?.userId) {
    toPut["assigned_to.userId"] = updated.assigned_to.userId;
  }
  if (updated.listing_id && updated.status) {
    toPut["listing_id#status"] = `${updated.listing_id}#${updated.status}`;
  }
  toPut["priority#due_date"] = `${updated.priority ?? 0}#${updated.due_date ?? ""}`;
  toPut["status#priority"] = `${updated.status}#${updated.priority ?? 0}`;
  toPut["task_category#is_stray"] = `${updated.task_category ?? "uncategorized"}#${updated.is_stray ? 1 : 0}`;
  await ddb.send(new PutCommand({ TableName: TASKS_TABLE, Item: toPut }));
  return updated;
}
