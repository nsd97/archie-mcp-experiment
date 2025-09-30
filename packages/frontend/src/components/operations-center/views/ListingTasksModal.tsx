import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TaskDetailModal } from "./TaskDetailModal";
import type { Task, OperationsState } from "../types";
import { CURRENT_USER_ID_RUNTIME } from "../currentUser";

export const ListingTasksModal = ({ ops, listingId, open, onOpenChange, taskFilter }: { ops: OperationsState; listingId: string | null; open: boolean; onOpenChange: (open: boolean) => void; taskFilter?: (task: Task) => boolean }) => {
  const listing = useMemo(() => listingId ? ops.listings.find(l => l.id === listingId) : undefined, [ops.listings, listingId]);
  const allListingTasks = useMemo(() => listingId ? ops.tasks.filter(t => t.listingId === listingId) : [], [ops.tasks, listingId]);
  const tasks = useMemo(() => taskFilter ? allListingTasks.filter(taskFilter) : allListingTasks, [allListingTasks, taskFilter]);
  const workItem = ops.workItems.find(w => (w.listingId === listingId) && w.taskIds.some(id => allListingTasks.some(t => t.id === id)))
    || ops.workItems.find(w => w.listingId === listingId);
  const typeToClass = (t: import("../types").WorkItemType | undefined) => {
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

  const claimedByName = (id?: string) => ops.agents.find(a => a.id === id)?.name || undefined;
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aClaimed = !!a.claimedById;
      const bClaimed = !!b.claimedById;
      if (aClaimed !== bClaimed) {
        return aClaimed ? 1 : -1; // prioritize unclaimed tasks where applicable
      }
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [tasks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-xl modal-uniform">
        <DialogHeader>
          <DialogTitle>
            <div className={`rounded-md px-3 py-2 category-surface ${typeToClass(workItem?.type)} flex items-center justify-between`}>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{listing?.address || "Listing"}</div>
                <div className="text-xs text-muted-foreground truncate">{String(workItem?.type || "").replace(/_/g, " ")}</div>
              </div>
              <div className="text-sm font-semibold">{listing ? new Date(listing.dueDate).toLocaleDateString() : "—"}</div>
            </div>
            <div className="mt-2">
              <div className="category-progress">
                {(() => {
                  const done = tasks.filter(t => t.status === "DONE").length;
                  const claimed = tasks.filter(t => !!t.claimedById).length;
                  const total = tasks.length || 1;
                  const claimedPct = Math.round((claimed / total) * 100);
                  const donePct = Math.round((done / total) * 100);
                  return (
                    <>
                      <div className="category-progress-claimed" style={{ width: `${claimedPct}%` }} />
                      <div className="category-progress-done" style={{ width: `${donePct}%` }} />
                    </>
                  );
                })()}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 modal-scroll">
          {sortedTasks.map(t => (
            <div key={t.id} role="button" tabIndex={0} className="p-3 rounded-md border bg-card w-full text-left hover:bg-accent/40" onClick={() => setOpenTaskId(t.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpenTaskId(t.id); }}>
              <div className="text-sm font-medium">{t.title}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>Status {t.status}</span>
                {t.claimedById && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={ops.agents.find(a => a.id === t.claimedById)?.avatarUrl} alt={ops.agents.find(a => a.id === t.claimedById)?.name} />
                      <AvatarFallback className="text-[10px]">
                        {(ops.agents.find(a => a.id === t.claimedById)?.name || "?")
                          .split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-muted-foreground">
                  {t.claimedById ? `Claimed by ${claimedByName(t.claimedById) || t.claimedById}` : "Unclaimed"}
                </div>
                <div className="flex items-center gap-2">
                  {!t.claimedById ? (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); ops.claimTask(t.id, CURRENT_USER_ID_RUNTIME); }}>Claim</Button>
                  ) : t.claimedById === CURRENT_USER_ID_RUNTIME ? (
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); ops.unclaimTask(t.id); }}>Unclaim</Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {sortedTasks.length === 0 && (
            <div className="text-sm text-muted-foreground">No tasks for this listing.</div>
          )}
        </div>
        <TaskDetailModal ops={ops} taskId={openTaskId} open={!!openTaskId} onOpenChange={(o) => !o ? setOpenTaskId(null) : null} />
      </DialogContent>
    </Dialog>
  );
};

export default ListingTasksModal;
