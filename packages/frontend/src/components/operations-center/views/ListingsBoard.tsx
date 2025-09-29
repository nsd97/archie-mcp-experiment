/**
 * ListingsBoard — Kanban view of listings by status.
 *
 * Groups listings into columns (NEW, IN_PROGRESS, DONE_POSTED). Cards show
 * address, agent, due, and simple progress bars. Dragging a card updates the
 * listing status via `ops.updateListingStatus`.
 */
import { useMemo, useState } from "react";
import type { Task, WorkItemType, OperationsState, WorkItem } from "../types";
import { ListingTasksModal } from "./ListingTasksModal";
import { getListingCompleteness } from "../validation";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Board } from "../Board";
import { dueProximity } from "@/lib/utils";

/**
 * Renders a kanban board of listings and opens a modal to inspect tasks.
 */
export const ListingsBoard = ({ ops, onOpenListing, onlyListingIds, taskFilter }: { ops: OperationsState; onOpenListing: (id: string) => void; onlyListingIds?: string[]; taskFilter?: (task: Task) => boolean }) => {
  // Filter listings once to prevent unnecessary re-renders
  const listingsSource = useMemo(() => (
    onlyListingIds ? ops.listings.filter(l => onlyListingIds.includes(l.id)) : ops.listings
  ), [ops.listings, onlyListingIds]);

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // Precompute tasks grouped by listingId for O(1) card lookups
  const tasksByListingId = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of ops.tasks) {
      if (!t.listingId) continue;
      (map[t.listingId] ||= []).push(t);
    }
    return map;
  }, [ops.tasks]);

  // Derive board column by inspecting a listing's tasks
  const computeListingColumn = (listingId: string): "NEW" | "IN_PROGRESS" | "DONE_POSTED" => {
    const tasks = tasksByListingId[listingId] || [];
    if (tasks.length === 0) return "NEW";
    const allDone = tasks.every(t => t.status === "DONE");
    if (allDone) return "DONE_POSTED";
    const anyDoneOrClaimed = tasks.some(t => t.status === "DONE" || !!t.claimedById);
    return anyDoneOrClaimed ? "IN_PROGRESS" : "NEW";
  };

  // Partition by derived status; Done/Posted is time-limited to keep board focused
  const byStatus = useMemo(() => ({
    NEW: listingsSource.filter(l => computeListingColumn(l.id) === "NEW"),
    IN_PROGRESS: listingsSource.filter(l => computeListingColumn(l.id) === "IN_PROGRESS"),
    DONE_POSTED: listingsSource.filter(l => computeListingColumn(l.id) === "DONE_POSTED" && (now - new Date(l.dueDate).getTime()) <= sevenDaysMs),
  }), [listingsSource, tasksByListingId, now, sevenDaysMs]);

  // Apply optional filter per listing-specific task array
  const filteredTasksByListingId = useMemo(() => {
    if (!taskFilter) return tasksByListingId;
    const map: Record<string, Task[]> = {};
    for (const [listingId, arr] of Object.entries(tasksByListingId)) {
      map[listingId] = arr.filter(taskFilter);
    }
    return map;
  }, [tasksByListingId, taskFilter]);

  // Precompute work items grouped by listingId
  const workItemsByListingId = useMemo(() => {
    const map: Record<string, WorkItem[]> = {};
    for (const w of ops.workItems) {
      if (!w.listingId) continue;
      (map[w.listingId] ||= []).push(w);
    }
    return map;
  }, [ops.workItems]);

  const [modalListingId, setModalListingId] = useState<string | null>(null);
  const typeToClass = (t: WorkItemType | undefined) => {
    switch (t) {
      case "STRAY": return "is-cat-stray";
      case "SALES_LISTING_ACTIVE": return "is-cat-sales-listing-active";
      case "LEASE_LISTING_ACTIVE": return "is-cat-lease-listing-active";
      case "SALE_LISTING_CLOSING": return "is-cat-sale-listing-closing";
      case "SALE_LISTING_SOLD": return "is-cat-sale-listing-sold";
      case "LEASE_LISTING_LEASED": return "is-cat-lease-listing-leased";
      case "LEASE_LISTING_CLOSING": return "is-cat-lease-listing-closing";
      case "BUYER_DEAL_CLOSING": return "is-cat-buyer-deal-closing";
      case "LEASE_TENANT_DEAL_CLOSING": return "is-cat-lease-tenant-deal-closing";
      case "RELIST_LISTING_DEAL": return "is-cat-relist-listing-deal";
      default: return "";
    }
  };

  const columns = [
    { id: "NEW", title: "New" },
    { id: "IN_PROGRESS", title: "In Progress" },
    { id: "DONE_POSTED", title: "Done/Posted", headerRight: (
      <Button asChild size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground">
        <Link to="/operations-center/archive">Archive</Link>
      </Button>
    ) },
  ];

  const itemsByColumn: Record<string, { id: string }[]> = {
    NEW: byStatus.NEW.map(l => ({ id: l.id })),
    IN_PROGRESS: byStatus.IN_PROGRESS.map(l => ({ id: l.id })),
    DONE_POSTED: byStatus.DONE_POSTED.map(l => ({ id: l.id })),
  };

  const getId = (x: { id: string }) => x.id;

  const renderCard = (x: { id: string }) => {
    const l = ops.listings.find(xx => xx.id === x.id);
    if (!l) return null;
    const agent = ops.agents.find(a => a.id === l.agentId);
    const allListingTasks = tasksByListingId[l.id] || [];
    const tasks = taskFilter ? (filteredTasksByListingId[l.id] || []) : allListingTasks;
    const workItemsForListing = workItemsByListingId[l.id] || [];
    const taskIdSet = tasks.length ? new Set(tasks.map(t => t.id)) : undefined;
    const workItem = (taskIdSet ? workItemsForListing.find(w => w.taskIds.some(id => taskIdSet.has(id))) : undefined)
      || workItemsForListing[0];
    const completeness = getListingCompleteness(ops, l.id);
    const catClass = typeToClass(workItem?.type);

    // Time-to-due progress (0 until 7 days out, then ramps to 100% at due)
    const duePct = Math.round(dueProximity(l.dueDate, 7) * 100);
    const dueBadge = new Date(l.dueDate).toLocaleDateString();

    // Task progress: claimed underlay, done overlay
    const done = tasks.filter(t => t.status === "DONE").length;
    const claimed = tasks.filter(t => !!t.claimedById).length;
    const total = tasks.length || 1;
    const claimedPct = Math.round((claimed / total) * 100);
    const donePct = Math.round((done / total) * 100);

    return (
      <div
        className={`p-3 rounded-md border transition-colors cursor-pointer category-surface ${catClass} h-28 flex flex-col justify-between relative`}
        onClick={() => { setModalListingId(l.id); onOpenListing?.(l.id); }}
        role="button"
        tabIndex={0}
      >
        <div>
          <div className="text-sm font-medium truncate flex items-center gap-2">
            <span>{l.address}</span>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>{agent?.name} • Due {new Date(l.dueDate).toLocaleDateString()}</span>
          </div>
        </div>
        {/* Date badge with fill-behind progress (light grey), starting 7 days out */}
        <div className="absolute top-1 right-1">
          <div className="relative text-[10px] h-5 rounded border overflow-hidden" style={{ width: 72 }}>
            <div className="absolute inset-0 bg-background/60" />
            <div className="absolute inset-y-0 left-0 bg-muted" style={{ width: `${duePct}%` }} />
            <div className="relative px-1.5 flex items-center justify-center h-full">{dueBadge}</div>
          </div>
        </div>
        {/* Main progress bar at bottom: claimed (underlay), done (overlay) */}
        <div>
          <div className="category-progress">
            <div className="category-progress-claimed" style={{ width: `${claimedPct}%` }} />
            <div className="category-progress-done" style={{ width: `${donePct}%` }} />
          </div>
        </div>
      </div>
    );
  };

  // DnD handler → map column ID directly to ListingStatus
  const onDrop = (
    draggableId: string,
    _from: string,
    to: string,
    _sourceIndex: number,
    _destIndex: number
  ) => {
    const newStatus = to as "NEW" | "IN_PROGRESS" | "DONE_POSTED";
    ops.updateListingStatus(draggableId, newStatus);
  };

  return (
    <>
      <Board
        columns={columns}
        itemsByColumn={itemsByColumn}
        getId={getId}
        renderCard={renderCard}
        onDrop={onDrop}
      />
      <ListingTasksModal ops={ops} listingId={modalListingId} open={!!modalListingId} onOpenChange={(o) => !o ? setModalListingId(null) : null} taskFilter={taskFilter} />
    </>
  );
};

