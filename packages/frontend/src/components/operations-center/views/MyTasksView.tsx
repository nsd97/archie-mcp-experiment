import { useMemo, useState } from "react";
import type { OperationsState } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MyTasksBoard } from "./MyTasksBoard";
import { ListingsView } from "./ListingsView";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { Task } from "../types";
import { CURRENT_OPERATIONS_USER_ID } from "../currentUser";

export const MyTasksView = ({ ops, onOpenTask }: { ops: OperationsState; onOpenTask: (id: string) => void }) => {
  const myId = CURRENT_OPERATIONS_USER_ID;
  const myTasks = useMemo(() => ops.tasks.filter(t => t.claimedById === myId && t.status !== "DONE"), [ops.tasks, myId]);
  const [mode, setMode] = useState<"queue" | "board">("queue");
  const myListingIds = useMemo(() => Array.from(new Set(myTasks.map(t => t.listingId).filter(Boolean))) as string[], [myTasks]);
  const taskFilter = useMemo(() => (task: Task) => task.claimedById === myId, [myId]);

  const grouped = useMemo(() => {
    const byListing = new Map<string, typeof myTasks>();
    for (const t of myTasks) {
      const key = t.listingId || "__stray__";
      if (!byListing.has(key)) byListing.set(key, [] as any);
      byListing.get(key)!.push(t);
    }
    const groups = Array.from(byListing.entries()).map(([listingId, tasks]) => {
      const sortedTasks = [...tasks].sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));
      const earliestDue = sortedTasks.reduce((min, t) => Math.min(min, new Date(t.dueDate).getTime()), Number.POSITIVE_INFINITY);
      return { listingId, tasks: sortedTasks, earliestDue };
    });
    groups.sort((a, b) => a.earliestDue - b.earliestDue);
    return groups;
  }, [myTasks]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as any)}>
            <ToggleGroupItem value="queue" aria-label="Queue view">Queue</ToggleGroupItem>
            <ToggleGroupItem value="board" aria-label="Board view">Board</ToggleGroupItem>
          </ToggleGroup>
          <CardTitle className="text-sm">My Tasks</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {mode === "board" ? (
          <ListingsView ops={ops} onOpenListing={() => {}} onOpenTask={onOpenTask} onlyListingIds={myListingIds} taskFilter={taskFilter} />
        ) : (
          <ScrollArea className="h-[60vh] pr-2">
            <div className="space-y-4">
              {grouped.map(group => {
                if (group.listingId === "__stray__") return null; // strays not grouped here
                const listing = ops.listings.find(l => l.id === group.listingId);
                return (
                  <div key={group.listingId} className="rounded-md border">
                    <div className="px-3 py-2 border-b bg-muted/30">
                      <div className="text-sm font-medium truncate">{listing?.address || group.listingId}</div>
                      <div className="text-xs text-muted-foreground truncate">Due {listing ? new Date(listing.dueDate).toLocaleDateString() : "—"}</div>
                    </div>
                    <div className="divide-y">
                      {group.tasks.map(t => (
                        <div key={t.id} role="button" tabIndex={0} className="py-3 w-full text-left flex items-center justify-between hover:bg-accent/40 px-3" onClick={() => onOpenTask(t.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenTask(t.id); }}>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{t.title}</div>
                            <div className="text-xs text-muted-foreground truncate">SLA {t.urgencyScore} • Due {new Date(t.dueDate).toLocaleDateString()}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); ops.unclaimTask(t.id); }}>Unclaim</Button>
                            <Button size="xs" onClick={(e) => { e.stopPropagation(); ops.markTaskDone(t.id); }}>Mark Done</Button>
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
        )}
      </CardContent>
    </Card>
  );
};
