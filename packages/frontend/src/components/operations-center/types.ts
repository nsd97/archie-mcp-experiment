// Core types for Operations Center (frontend-only mocks)

export type UUID = string;

export type ListingStatus = "NEW" | "IN_PROGRESS" | "DONE_POSTED";
export type TaskStatus = "NEW" | "IN_PROGRESS" | "DONE";

export interface Agent {
  id: UUID;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface Playbook {
  id: UUID;
  name: string;
}

export interface Listing {
  id: UUID;
  address: string;
  status: ListingStatus;
  agentId: UUID;
  agentName?: string;
  dueDate: string; // ISO date
  dealType?: string; // e.g., Sale, Lease, Buyer Deal, Tenant Deal
  propertyType?: string; // e.g., Condo, Detached, Townhouse
  squareFootage?: number;
  location?: string;
}

export interface Task {
  id: UUID;
  title: string;
  listingId?: UUID;
  playbookId?: UUID;
  status: TaskStatus;
  dueDate: string; // ISO date
  claimedById?: UUID; // undefined => unclaimed
  // Higher is more urgent
  urgencyScore: number; // 0..100 based on mock SLA logic
  type: "COPYWRITING" | "PHOTO_EDIT" | "DOCS" | "REVIEW" | "PUBLISH" | "OTHER";
  // Stray-only enrichments
  queue?: StrayQueue; // ADMIN | MARKETING
  agentId?: UUID; // for strays without listing
  address?: string; // for strays without listing
  // Template origin (used to map UI config/resources/outputs)
  templateKey?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  template?: string; // quick copy
}

export interface Note {
  id: UUID;
  listingId: UUID;
  authorId: UUID;
  createdAt: string;
  body: string;
}

export interface Attachment {
  id: UUID;
  listingId: UUID;
  name: string;
  url: string;
}

export type HistoryEventType = "CREATED" | "STATUS_CHANGED" | "CLAIMED" | "UNCLAIMED" | "DONE" | "NOTE_ADDED";

export interface HistoryEvent {
  id: UUID;
  listingId: UUID;
  type: HistoryEventType;
  timestamp: string;
  summary: string;
}

export interface OperationsData {
  agents: Agent[];
  playbooks: Playbook[];
  listings: Listing[];
  tasks: Task[];
  notes: Note[];
  attachments: Attachment[];
  history: HistoryEvent[];
  workItems: WorkItem[];
}

export interface OperationsActions {
  updateListingStatus: (listingId: UUID, status: ListingStatus) => void;
  claimTask: (taskId: UUID, agentId: UUID) => void;
  unclaimTask: (taskId: UUID) => void;
  markTaskDone: (taskId: UUID) => void;
  deferTask: (taskId: UUID, days: number) => void;
  addNote: (listingId: UUID, authorId: UUID, body: string) => void;
  moveStrayTaskToQueue: (taskId: UUID, queue: StrayQueue) => void;
  updateTaskOutput: (taskId: UUID, key: string, value: string) => void;
  updateTaskStatus: (taskId: UUID, status: TaskStatus) => void;
}

export interface OperationsState extends OperationsData, OperationsActions {}

// Work item categorization contract for FE/BE
// Two high-level kinds: STRAY vs categorized grouping below.
export type WorkItemType =
  | "STRAY"
  | "LEASE_LISTING_ACTIVE"
  | "SALES_LISTING_ACTIVE"
  | "SALE_LISTING_CLOSING"
  | "SALE_LISTING_SOLD"
  | "LEASE_LISTING_LEASED"
  | "LEASE_LISTING_CLOSING"
  | "BUYER_DEAL_CLOSING"
  | "LEASE_TENANT_DEAL_CLOSING"
  | "RELIST_LISTING_DEAL"; // sale or lease

export type StrayQueue = "ADMIN" | "MARKETING";

// A WorkItem represents either a stray task or a grouped category instance.
// - STRAY: listingId is optional; taskIds will typically have a single task
// - Categorized: listingId usually present; taskIds represent the group
export interface WorkItem {
  id: UUID;
  type: WorkItemType;
  title: string;
  listingId?: UUID;
  taskIds: UUID[];
  // Opaque metadata bag for future BE fields (e.g., phase, channel)
  metadata?: Record<string, string | number | boolean>;
}


