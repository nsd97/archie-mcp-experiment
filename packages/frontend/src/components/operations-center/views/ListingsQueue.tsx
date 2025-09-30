import { useMemo, useState } from "react";
import type { OperationsState } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { Task } from "../types";
import { CURRENT_USER_ID_RUNTIME } from "../currentUser";

export const ListingsQueue = ({ ops, onOpenTask, onlyListingIds, taskFilter }: { ops: OperationsState; onOpenTask: (id: string) => void; onlyListingIds?: string[]; taskFilter?: (task: Task) => boolean }) => {
  const [_filterPlaybook] = useState<string | "all">("all");

  const filtered = useMemo(() => {
    const base = ops.tasks.filter(t => t.status !== "DONE" && !!t.listingId);
    if (taskFilter) {
      return base.filter(taskFilter);
    }
    return base.filter(t => !t.claimedById);
  }, [ops.tasks, taskFilter]);

  const grouped = useMemo(() => {
    const byListing = new Map<string, typeof filtered>();
    for (const t of filtered) {
      const key = t.listingId as string;
      if (onlyListingIds && !onlyListingIds.includes(key)) continue;
      if (!byListing.has(key)) byListing.set(key, [] as any);
      byListing.get(key)!.push(t);
    }
    // sort tasks within each group by urgency desc
    const groups = Array.from(byListing.entries()).map(([listingId, tasks]) => {
      const sortedTasks = [...tasks].sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));
      // compute a group priority to sort listings: max urgency in group, then earliest due date
      const maxUrgency = sortedTasks.reduce((m, t) => Math.max(m, t.urgencyScore || 0), 0);
      const earliestDue = sortedTasks.reduce((min, t) => Math.min(min, new Date(t.dueDate).getTime()), Number.POSITIVE_INFINITY);
      return { listingId, tasks: sortedTasks, maxUrgency, earliestDue };
    });
    groups.sort((a, b) => {
      if (b.maxUrgency !== a.maxUrgency) return b.maxUrgency - a.maxUrgency;
      return a.earliestDue - b.earliestDue;
    });
    return groups;
  }, [filtered, onlyListingIds]);

  const typeToClass = (t: import("../types").WorkItemType | undefined) => {
    switch (t) {
      case "STRAY": return "is-cat-stray";
      case "SALES_LISTING_ACTIVE": return "is-cat-sales-listing-active";
      case "LEASE_LISTING_ACTIVE": return "is-cat-lease-listing-active";
      case "SALE_LISTING_CLOSING": return "is-cat-sale-listing-closing";
      case "sale_listings_sold":
      case "SALE_LISTING_SOLD": return "is-cat-sale-listing-sold";
      case "LEASE_LISTING_LEASED": return "is-cat-lease-listing-leased";
      case "LEASE_LISTING_CLOSING": return "is-cat-lease-listing-closing";
      case "BUYER_DEAL_CLOSING": return "is-cat-buyer-deal-closing";
      case "LEASE_TENANT_DEAL_CLOSING": return "is-cat-lease-tenant-deal-closing";
      case "RELIST_LISTING_DEAL": return "is-cat-relist-listing-deal";
      default: return "";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Listings</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[60vh] pr-2">
          <div className="space-y-4">
            {grouped.map(group => {
              const listing = ops.listings.find(l => l.id === group.listingId);
              const agent = listing && (listing.agentName || ops.agents.find(a => a.id === listing.agentId)?.name);
              const listingTasks = ops.tasks.filter(t => t.listingId === group.listingId);
              const workItem = ops.workItems.find(w => (w.listingId === group.listingId) && w.taskIds.some(id => listingTasks.some(t => t.id === id)))
                || ops.workItems.find(w => w.listingId === group.listingId);
              const catClass = typeToClass(workItem?.type);
              const defaultClaimTarget = listing?.agentId || CURRENT_USER_ID_RUNTIME;
              return (
                <div key={group.listingId} className="rounded-md border">
                  <div className={`px-3 py-2 border-b category-surface ${catClass} flex items-center justify-between`}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{listing?.address || group.listingId}</div>
                      <div className="text-xs text-muted-foreground truncate">{agent ? `${agent}` : "Unassigned"}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold">{listing ? new Date(listing.dueDate).toLocaleDateString() : "—"}</div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  <div className="divide-y">
                    {group.tasks.map(t => (
                      <div key={t.id} role="button" tabIndex={0} className="py-3 w-full text-left flex items-center justify-between hover:bg-accent/40 px-3" onClick={() => onOpenTask(t.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenTask(t.id); }}>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{t.title}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); if (defaultClaimTarget) { ops.claimTask(t.id, defaultClaimTarget); } }} disabled={!defaultClaimTarget}>
                            {defaultClaimTarget ? "Claim" : "No agent"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {grouped.length === 0 && (
              <div className="text-xs text-muted-foreground px-1">No tasks</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ListingsQueue;
