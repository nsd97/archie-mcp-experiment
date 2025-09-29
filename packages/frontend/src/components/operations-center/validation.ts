import type { OperationsState, WorkItemType, UUID } from "./types";
import { categoryTemplates } from "./templates";

export function getWorkItemForListing(ops: OperationsState, listingId: UUID) {
  return ops.workItems.find(w => w.type !== "STRAY" && w.listingId === listingId);
}

export function getListingCompleteness(ops: OperationsState, listingId: UUID): {
  required: number;
  present: number;
  isComplete: boolean;
  type?: WorkItemType;
} {
  const wi = getWorkItemForListing(ops, listingId);
  if (!wi) {
    return { required: 0, present: 0, isComplete: false };
  }
  const templates = categoryTemplates[wi.type] || [];
  const required = templates.length;
  const present = wi.taskIds.length;
  const isComplete = present >= required && required > 0;
  return { required, present, isComplete, type: wi.type };
}


