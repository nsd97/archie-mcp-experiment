/**
 * Operations API client (backend integration).
 *
 * The UI expects a single OperationsData snapshot. The new backend exposes
 * granular endpoints, so we aggregate the relevant responses here and map
 * them into the legacy frontend types.
 */
import { dueProximity } from "@/lib/utils";
import { CURRENT_OPERATIONS_USER_ID, CURRENT_OPERATIONS_USER } from "./currentUser";
import type {
  OperationsData,
  ListingStatus,
  StrayQueue,
  TaskStatus,
  UUID,
  Agent,
  Listing,
  Task,
  Note,
  HistoryEvent,
  Attachment,
  WorkItem,
} from "./types";

const DEFAULT_API_BASE = "/v1";
const API_BASE = ((import.meta.env.VITE_OPERATIONS_API_URL as string | undefined) ?? DEFAULT_API_BASE).replace(/\/$/, "");
const DEBUG_USER_HEADER = (() => {
  const raw = import.meta.env.VITE_OPERATIONS_DEBUG_USER as string | undefined;
  if (raw && raw.trim()) {
    return raw.trim();
  }
  return JSON.stringify(CURRENT_OPERATIONS_USER);
})();

const LISTING_LIMIT = Number(import.meta.env.VITE_OPERATIONS_LISTING_LIMIT ?? 100);

type HeadersDict = Record<string, string>;

/** Small helper to normalise URL paths so callers can omit the leading slash. */
const withBase = (path: string) => {
  // If API_BASE is already a full URL, use it as is
  if (API_BASE.startsWith("http://") || API_BASE.startsWith("https://")) {
    return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  }
  // Otherwise, it's a relative path that will use the same origin
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
};

const defaultHeaders: HeadersDict = {
  "Content-Type": "application/json",
  ...(DEBUG_USER_HEADER ? { "X-Debug-User": DEBUG_USER_HEADER } : {}),
};

async function jsonFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const url = withBase(path);
  const startedAt = performance.now();
  const method = (options.method || 'GET').toString().toUpperCase();
  const reqHeaders = { ...defaultHeaders, ...(options.headers ?? {}) } as HeadersInit;

  let reqBodyPreview: string | undefined;
  try {
    const body = (options as any).body as string | undefined;
    if (typeof body === 'string' && body.length <= 2048) reqBodyPreview = body;
  } catch {}

  console.debug('[FE][HTTP][request]', { method, url, headers: reqHeaders, bodyPreview: reqBodyPreview });

  const response = await fetch(url, { headers: reqHeaders, ...options });
  const endedAt = performance.now();
  const durationMs = Math.round(endedAt - startedAt);

  const respContentType = response.headers.get('content-type') || undefined;
  const respContentLength = response.headers.get('content-length') || undefined;
  const respText = await response.text();
  const ok = response.ok;

  console.debug('[FE][HTTP][response]', { method, url, status: response.status, durationMs, contentType: respContentType, contentLength: respContentLength, bodyPreview: respText?.slice(0, 2048) });

  if (!ok) {
    throw new Error(`API error ${response.status}: ${respText || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!respText) {
    return undefined as T;
  }

  try {
    return JSON.parse(respText) as T;
  } catch (err) {
    console.warn("Failed to parse JSON response", err);
    return undefined as T;
  }
}

async function safeFetch<T = unknown>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    return await jsonFetch<T>(path, options);
  } catch (error) {
    console.warn(`[FE][HTTP][error] ${path}`, error);
    return null;
  }
}

async function mutate(
  path: string,
  body?: unknown,
  method = "POST",
  fallback?: { path: string; body?: unknown; method?: string }
): Promise<void> {
  const primaryResult = await safeFetch(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (primaryResult === null && fallback) {
    await safeFetch(fallback.path, {
      method: fallback.method ?? method,
      body: fallback.body !== undefined ? JSON.stringify(fallback.body) : undefined,
    });
  }
}

type ApiMaybeWrapped<T> = T | { data: T };

const unwrap = <T,>(payload: ApiMaybeWrapped<T> | null | undefined): T | null => {
  if (!payload) return null;
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

const fetchLegacyOperationsState = async (): Promise<OperationsData> => {
  // Legacy endpoint doesn't exist in current backend
  // Return empty state instead of throwing
  return {
    agents: [],
    playbooks: [],
    listings: [],
    tasks: [],
    notes: [],
    attachments: [],
    history: [],
    workItems: [],
  };
};

const toListingStatus = (status: string | undefined | null): ListingStatus => {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
    case "done":
    case "closed":
      return "DONE_POSTED";
    case "in_progress":
    case "processing":
    case "active":
      return "IN_PROGRESS";
    default:
      return "NEW";
  }
};

const toApiListingStatus = (status: ListingStatus): string => {
  switch (status) {
    case "DONE_POSTED":
      return "completed";
    case "IN_PROGRESS":
      return "in_progress";
    default:
      return "new";
  }
};

const toTaskStatus = (status: string | undefined | null): TaskStatus => {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
    case "done":
      return "DONE";
    case "in_progress":
    case "claimed":
    case "started":
      return "IN_PROGRESS";
    default:
      return "NEW";
  }
};

const toTaskType = (category: string | undefined | null): Task["type"] => {
  switch ((category ?? "OTHER").toUpperCase()) {
    case "COPYWRITING":
    case "CONTENT":
      return "COPYWRITING";
    case "PHOTO":
    case "PHOTO_EDIT":
      return "PHOTO_EDIT";
    case "DOCS":
    case "DOCUMENTS":
      return "DOCS";
    case "REVIEW":
      return "REVIEW";
    case "PUBLISH":
      return "PUBLISH";
    default:
      return "OTHER";
  }
};

const mapHistoryType = (action?: string | null): HistoryEvent["type"] => {
  switch ((action ?? "").toUpperCase()) {
    case "CREATED":
      return "CREATED";
    case "CLAIMED":
      return "CLAIMED";
    case "UNCLAIMED":
      return "UNCLAIMED";
    case "COMPLETED":
    case "DONE":
      return "DONE";
    case "NOTE_ADDED":
      return "NOTE_ADDED";
    default:
      return "STATUS_CHANGED";
  }
};

type EntityRecord = {
  entity_key?: string;
  entity_id?: string;
  name?: string;
  email?: string;
  type?: string;
};

type EntitiesResponse = ApiMaybeWrapped<{ entities: EntityRecord[] }> | null;

const ensureTrailing = (value: string) => value.replace(/\s+/g, " ").trim();

const slugifyId = (value: string) => {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug || "user";
};

const buildAgent = (record: Partial<EntityRecord> & { id: string }): Agent => ({
  id: record.id,
  name: ensureTrailing(record.name ?? record.id),
  email: record.email ?? `${record.id}@example.com`,
});

const ensureAgent = (
  map: Map<string, Agent>,
  candidate?: { id?: string; name?: string; email?: string }
): string | undefined => {
  if (!candidate?.id) return undefined;
  const id = candidate.id;
  const existing = map.get(id);
  if (!existing) {
    map.set(id, buildAgent({ id, name: candidate.name, email: candidate.email }));
  } else {
    map.set(id, {
      ...existing,
      name: ensureTrailing(candidate.name ?? existing.name),
      email: candidate.email ?? existing.email,
    });
  }
  return id;
};

type ListingSummary = {
  id: string;
  address?: string;
  assignee?: unknown;
  dueDate?: string;
  status?: string;
  dealType?: string;
  propertyType?: string;
  squareFootage?: number;
  location?: string;
};

type ListingsResponse = ApiMaybeWrapped<{
  listings: ListingSummary[];
  pagination?: Record<string, unknown>;
}>;

type ListingDetailResponse = ApiMaybeWrapped<{
  listing: Record<string, unknown>;
  details?: Record<string, unknown>;
  history?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  notes?: Array<Record<string, unknown>>;
}>;

type ListingTasksResponse = ApiMaybeWrapped<{
  listingId?: string;
  tasks: Array<Record<string, unknown>>;
}>;

type StrayQueuesResponse = ApiMaybeWrapped<{
  queues: Array<{
    category: string;
    displayName?: string;
    tasks: Array<Record<string, unknown>>;
  }>;
}>;

type MyTasksResponse = ApiMaybeWrapped<{
  listings: Array<{
    listingId: string | null;
    address?: string;
    tasks: Array<Record<string, unknown>>;
  }>;
}>;

type BoardResponse = ApiMaybeWrapped<{
  columns?: Record<string, Array<Record<string, unknown>>>;
}>;

const parseAssignee = (raw: unknown): { id: string; name: string; email?: string } | undefined => {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    // Don't slugify IDs that already have a format like "agent:name" or "admin_ops:name"
    const id = raw;
    return { id, name: raw };
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const id =
      (typeof obj.userId === "string" && obj.userId) ||
      (typeof obj.id === "string" && obj.id) ||
      (typeof obj.entityId === "string" && obj.entityId);
    if (!id) return undefined;
    const name =
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.username === "string" && obj.username) ||
      (typeof obj.email === "string" && obj.email) ||
      id;
    const email = typeof obj.email === "string" ? obj.email : undefined;
    return { id, name, email };
  }
  return undefined;
};

const toIsoDate = (value?: string | null): string => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
};

const computeUrgency = (dueDate: string): number => Math.round(dueProximity(dueDate, 7) * 100);

const addListingTask = (
  tasksMap: Map<string, Task>,
  agentsMap: Map<string, Agent>,
  listing: Listing,
  raw: Record<string, unknown>
) => {
  const id =
    (typeof raw.id === "string" && raw.id) ||
    (typeof raw.taskId === "string" && raw.taskId);
  if (!id) return;

  const title =
    (typeof raw.title === "string" && raw.title) ||
    (typeof raw.name === "string" && raw.name) ||
    "Untitled Task";

  const status = toTaskStatus((typeof raw.status === "string" && raw.status) || undefined);
  const dueDate = toIsoDate((typeof raw.dueDate === "string" && raw.dueDate) || listing.dueDate);
  const category =
    (typeof raw.task_type === "string" && raw.task_type) ||
    (typeof raw.taskCategory === "string" && raw.taskCategory) ||
    (typeof raw.category === "string" && raw.category) ||
    undefined;

  const assignedTo = parseAssignee(raw.assignedTo ?? raw.assignee ?? raw.claimedBy ?? raw.owner);
  const claimedById = ensureAgent(agentsMap, assignedTo);

  const base: Task = {
    id,
    title,
    listingId: listing.id,
    playbookId: undefined,
    status,
    dueDate,
    claimedById,
    urgencyScore: computeUrgency(dueDate),
    type: toTaskType(category),
    queue: undefined,
    agentId: listing.agentId,
    address: listing.address,
    inputs: {},
    outputs: {},
    templateKey: undefined,
    template: undefined,
  };

  const existing = tasksMap.get(id);
  const merged: Task = existing ? { ...existing, ...base } : base;
  tasksMap.set(id, merged);
};

const addStrayTask = (
  tasksMap: Map<string, Task>,
  agentsMap: Map<string, Agent>,
  queue: StrayQueue,
  raw: Record<string, unknown>
) => {
  const id =
    (typeof raw.taskId === "string" && raw.taskId) ||
    (typeof raw.id === "string" && raw.id);
  if (!id) return;
  const title = (typeof raw.title === "string" && raw.title) || "Stray Task";
  const dueDate = toIsoDate((typeof raw.dueDate === "string" && raw.dueDate) || undefined);
  const assignedTo = parseAssignee(raw.assignedTo ?? raw.claimedBy ?? raw.createdBy);
  const claimedById = ensureAgent(agentsMap, assignedTo);

  const task: Task = {
    id,
    title,
    listingId: typeof raw.listingId === "string" ? raw.listingId : undefined,
    playbookId: undefined,
    status: toTaskStatus((typeof raw.status === "string" && raw.status) || undefined),
    dueDate,
    claimedById,
    urgencyScore: computeUrgency(dueDate),
    type: toTaskType((typeof raw.taskCategory === "string" && raw.taskCategory) || undefined),
    queue,
    agentId: typeof raw.agentId === "string" ? raw.agentId : undefined,
    address: typeof raw.address === "string" ? raw.address : undefined,
    inputs: {},
    outputs: {},
    templateKey: undefined,
    template: undefined,
  };

  const existing = tasksMap.get(id);
  tasksMap.set(id, existing ? { ...existing, ...task } : task);
};

const addMyTask = (
  tasksMap: Map<string, Task>,
  listingLookup: Map<string, Listing>,
  listingId: string | null,
  raw: Record<string, unknown>
) => {
  const id =
    (typeof raw.taskId === "string" && raw.taskId) ||
    (typeof raw.id === "string" && raw.id);
  if (!id) return;

  const title = (typeof raw.title === "string" && raw.title) || "Task";
  const dueDate = toIsoDate((typeof raw.dueDate === "string" && raw.dueDate) || undefined);
  const status = toTaskStatus((typeof raw.status === "string" && raw.status) || undefined);
  const listing = listingId ? listingLookup.get(listingId) : undefined;

  const base: Task = {
    id,
    title,
    listingId: listing?.id,
    playbookId: undefined,
    status,
    dueDate,
    claimedById: CURRENT_OPERATIONS_USER_ID,
    urgencyScore: computeUrgency(dueDate),
    type: toTaskType((typeof raw.taskCategory === "string" && raw.taskCategory) || undefined),
    queue: undefined,
    agentId: listing?.agentId,
    address: listing?.address,
    inputs: {},
    outputs: {},
    templateKey: undefined,
    template: undefined,
  };

  const existing = tasksMap.get(id);
  tasksMap.set(id, existing ? { ...base, ...existing, claimedById: CURRENT_OPERATIONS_USER_ID } : base);
};

const addNotes = (
  notes: Note[],
  listingId: string,
  rawNotes: Array<Record<string, unknown>> | undefined
) => {
  if (!rawNotes) return;
  for (const raw of rawNotes) {
    const id =
      (typeof raw.id === "string" && raw.id) ||
      (typeof raw.note_id === "string" && raw.note_id) ||
      (typeof raw.event_id === "string" && raw.event_id) ||
      `${listingId}-note-${notes.length + 1}`;
    const createdAt = toIsoDate((typeof raw.createdAt === "string" && raw.createdAt) || (typeof raw.timestamp === "string" && raw.timestamp) || undefined);
    const author =
      (typeof raw.createdBy === "string" && raw.createdBy) ||
      (typeof raw.performedBy === "string" && raw.performedBy) ||
      CURRENT_OPERATIONS_USER_ID;
    const body =
      (typeof raw.content === "string" && raw.content) ||
      (typeof raw.text === "string" && raw.text) ||
      (typeof raw.note === "string" && raw.note) ||
      "";
    notes.push({ id, listingId, authorId: author, createdAt, body });
  }
};

const addHistory = (
  history: HistoryEvent[],
  listingId: string,
  rawHistory: Array<Record<string, unknown>> | undefined
) => {
  if (!rawHistory) return;
  for (const raw of rawHistory) {
    const id =
      (typeof raw.id === "string" && raw.id) ||
      (typeof raw.event_id === "string" && raw.event_id) ||
      `${listingId}-evt-${history.length + 1}`;
    const timestamp = toIsoDate((typeof raw.timestamp === "string" && raw.timestamp) || undefined);
    const action = typeof raw.action === "string" ? raw.action : undefined;
    const summaryPieces = [action, typeof raw.performedBy === "string" ? raw.performedBy : undefined]
      .filter(Boolean)
      .map((piece) => piece as string);
    const summary = ensureTrailing(
      (typeof raw.summary === "string" && raw.summary) ||
        (typeof raw.content === "string" && raw.content) ||
        summaryPieces.join(" • ") ||
        "Update"
    );

    history.push({ id, listingId, type: mapHistoryType(action), timestamp, summary });
  }
};

/** Fetch the current Operations snapshot by aggregating backend endpoints. */
export async function fetchOperationsState(): Promise<OperationsData> {
  try {
    const agentsMap = new Map<string, Agent>();

  const [entitiesRes, listingsResRaw, strayResRaw, myTasksResRaw, boardResRaw] = await Promise.all([
    safeFetch<EntitiesResponse>("/entities?type=AGENT"),
    jsonFetch<ListingsResponse>(`/operations/listings?limit=${LISTING_LIMIT}`),
    safeFetch<StrayQueuesResponse>("/operations/stray-queues"),
    safeFetch<MyTasksResponse>(`/operations/my-tasks?userId=${encodeURIComponent(CURRENT_OPERATIONS_USER_ID)}`),
    safeFetch<BoardResponse>("/operations/board"),
  ]);

  const entities = unwrap(entitiesRes ?? undefined)?.entities ?? [];
  for (const entity of entities) {
    const id = (entity.entity_key ?? entity.entity_id) as string | undefined;
    if (id) {
      ensureAgent(agentsMap, { id, name: entity.name, email: entity.email });
    }
  }

  const listingsData = unwrap(listingsResRaw)?.listings ?? [];
  const listings: Listing[] = listingsData.map((listing) => {
    const assignee = parseAssignee(listing.assignee);
    const agentId = ensureAgent(agentsMap, assignee);

    return {
      id: listing.id,
      address: ensureTrailing(listing.address ?? listing.id ?? ""),
      status: toListingStatus(listing.status),
      agentId: agentId ?? CURRENT_OPERATIONS_USER_ID,
      dueDate: toIsoDate(listing.dueDate ?? undefined),
      dealType: listing.dealType ?? undefined,
      propertyType: listing.propertyType ?? undefined,
      squareFootage: listing.squareFootage ?? undefined,
      location: listing.location ?? undefined,
    } satisfies Listing;
  });

  const listingLookup = new Map<string, Listing>();
  listings.forEach((listing) => listingLookup.set(listing.id, listing));

  const notes: Note[] = [];
  const history: HistoryEvent[] = [];
  const attachments: Attachment[] = [];
  const tasksMap = new Map<string, Task>();

  await Promise.all(
    listings.map(async (listing) => {
      const [detailRaw, tasksRaw] = await Promise.all([
        safeFetch<ListingDetailResponse>(`/operations/listings/${listing.id}/details`),
        safeFetch<ListingTasksResponse>(`/operations/tasks/${listing.id}`),
      ]);

      const detail = unwrap(detailRaw);
      addNotes(notes, listing.id, detail?.notes);
      addHistory(history, listing.id, detail?.history);

      const detailTasks = detail?.tasks ?? [];
      const tasksResponse = unwrap(tasksRaw);
      const tasksList = tasksResponse?.tasks ?? detailTasks;

      for (const raw of tasksList) {
        addListingTask(tasksMap, agentsMap, listing, raw);
      }
    })
  );

  const strayRes = unwrap(strayResRaw);
  if (strayRes?.queues) {
    for (const queue of strayRes.queues) {
      const category = (queue.category as StrayQueue) ?? "ADMIN";
      for (const raw of queue.tasks ?? []) {
        addStrayTask(tasksMap, agentsMap, category, raw);
      }
    }
  }

  const myTasksRes = unwrap(myTasksResRaw);
  if (myTasksRes?.listings) {
    for (const group of myTasksRes.listings) {
      for (const raw of group.tasks ?? []) {
        addMyTask(tasksMap, listingLookup, group.listingId, raw);
      }
    }
  }

  const tasks = Array.from(tasksMap.values()).map((task) => ({
    ...task,
    claimedById: task.claimedById ?? undefined,
  }));

  tasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const boardRes = unwrap(boardResRaw);
  const workItems: WorkItem[] = [];
  const columnToType = (column: string): WorkItem["type"] => {
    switch (column.toLowerCase()) {
      case "new":
        return "SALES_LISTING_ACTIVE";
      case "inprogress":
        return "SALE_LISTING_CLOSING";
      case "completed":
        return "SALE_LISTING_SOLD";
      default:
        return "SALES_LISTING_ACTIVE";
    }
  };

  if (boardRes?.columns) {
    for (const [column, items] of Object.entries(boardRes.columns)) {
      for (const item of items ?? []) {
        const listingId = typeof item.id === "string" ? item.id : undefined;
        if (!listingId) continue;
        workItems.push({
          id: `${column}-${listingId}`,
          type: columnToType(column),
          title: typeof item.address === "string" ? item.address : listingLookup.get(listingId)?.address ?? listingId,
          listingId,
          taskIds: [],
          metadata: {},
        });
      }
    }
  }

    return {
      agents: Array.from(agentsMap.values()),
      playbooks: [],
      listings,
      tasks,
      notes,
      attachments,
      history,
      workItems,
    } satisfies OperationsData;
  } catch (error) {
    console.warn("Failed to build aggregated operations state, attempting legacy fallback", error);
    return fetchLegacyOperationsState();
  }
}

/** Update a listing's status (Listings board drag/drop). */
export async function apiUpdateListingStatus(listingId: UUID, status: ListingStatus): Promise<OperationsData> {
  await mutate(`/operations/listings/${listingId}/status`, { status: toApiListingStatus(status) });
  return fetchOperationsState();
}

/** Claim a task for a given agent. */
export async function apiClaimTask(taskId: UUID, agentId: UUID): Promise<OperationsData> {
  await mutate(
    `/operations/tasks/${taskId}/claim`,
    { assigneeId: agentId },
    "POST",
    { path: `/operations/tasks/${taskId}/claim`, body: { assigneeId: agentId } }
  );
  return fetchOperationsState();
}

/** Unclaim a task (and reset status). */
export async function apiUnclaimTask(taskId: UUID): Promise<OperationsData> {
  await mutate(
    `/operations/tasks/${taskId}/unclaim`,
    { reason: "Unclaimed from Operations UI" },
    "POST",
    { path: `/operations/tasks/${taskId}/unclaim`, body: {} }
  );
  return fetchOperationsState();
}

/** Mark a task as DONE. */
export async function apiMarkTaskDone(taskId: UUID): Promise<OperationsData> {
  await mutate(
    `/operations/tasks/${taskId}/complete`,
    { completionNotes: "Completed from Operations UI" },
    "POST",
    { path: `/operations/tasks/${taskId}/done`, body: {} }
  );
  return fetchOperationsState();
}

/** Defer a task by the given number of days (best-effort). */
export async function apiDeferTask(taskId: UUID, days: number): Promise<OperationsData> {
  await mutate(`/operations/tasks/${taskId}/defer`, { days }, "POST", {
    path: `/operations/tasks/${taskId}/defer`,
    body: { days },
  });
  return fetchOperationsState();
}

/** Add a note to a listing (falls back silently if backend is missing the endpoint). */
export async function apiAddNote(listingId: UUID, authorId: UUID, body: string): Promise<OperationsData> {
  await mutate(`/operations/listings/${listingId}/notes`, { authorId, text: body }, "POST", {
    path: `/operations/listings/${listingId}/notes`,
    body: { authorId, body },
  });
  return fetchOperationsState();
}

/** Move a stray task into a queue (best-effort). */
export async function apiMoveStrayTask(taskId: UUID, queue: StrayQueue): Promise<OperationsData> {
  await mutate(`/operations/tasks/${taskId}/queue`, { queue });
  return fetchOperationsState();
}

/** Update a single output field on a task. */
export async function apiUpdateTaskOutput(taskId: UUID, key: string, value: string): Promise<OperationsData> {
  await mutate(`/operations/tasks/${taskId}/outputs`, { key, value });
  return fetchOperationsState();
}

/** Set a task's status directly (maps to claim/unclaim/complete). */
export async function apiUpdateTaskStatus(taskId: UUID, status: TaskStatus): Promise<OperationsData> {
  switch (status) {
    case "DONE":
      await mutate(
        `/operations/tasks/${taskId}/complete`,
        { completionNotes: "Completed from board" },
        "POST",
        { path: `/operations/tasks/${taskId}/done`, body: {} }
      );
      break;
    case "IN_PROGRESS":
      await mutate(
        `/operations/tasks/${taskId}/claim`,
        { assigneeId: CURRENT_OPERATIONS_USER_ID },
        "POST",
        { path: `/operations/tasks/${taskId}/claim`, body: { assigneeId: CURRENT_OPERATIONS_USER_ID } }
      );
      break;
    default:
      await mutate(
        `/operations/tasks/${taskId}/unclaim`,
        { reason: "Moved back to queue" },
        "POST",
        { path: `/operations/tasks/${taskId}/unclaim`, body: {} }
      );
      break;
  }
  return fetchOperationsState();
}
