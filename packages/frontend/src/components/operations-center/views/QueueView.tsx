import { useMemo, useState } from "react";
import { useOperations } from "../state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENT_OPERATIONS_USER_ID } from "../currentUser";

export const QueueView = ({ onOpenTask }: { onOpenTask: (id: string) => void }) => {
  const ops = useOperations();
  const [filterPlaybook, setFilterPlaybook] = useState<string | "all">("all");

  const unclaimed = useMemo(() => ops.tasks.filter(t => !t.claimedById && t.status !== "DONE"), [ops.tasks]);
  const filtered = useMemo(() => unclaimed.filter(t => filterPlaybook === "all" ? true : t.playbookId === filterPlaybook), [unclaimed, filterPlaybook]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => b.urgencyScore - a.urgencyScore), [filtered]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Queue</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={filterPlaybook} onValueChange={(v) => setFilterPlaybook(v as any)}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Playbook" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Playbooks</SelectItem>
              {ops.playbooks.map(pb => (
                <SelectItem key={pb.id} value={pb.id}>{pb.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[60vh] pr-2">
          <div className="divide-y">
            {sorted.map(t => {
              const listing = ops.listings.find(l => l.id === t.listingId);
              const agent = listing && ops.agents.find(a => a.id === listing.agentId);
              return (
                <button key={t.id} className="py-3 w-full text-left flex items-center justify-between hover:bg-accent/40 rounded-md px-2" onClick={() => onOpenTask(t.id)}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{agent?.name} • {listing?.address} • Due {new Date(t.dueDate).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">SLA {t.urgencyScore}</span>
                    {!t.claimedById ? (
                      <Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); ops.claimTask(t.id, CURRENT_OPERATIONS_USER_ID); }}>Claim</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Claimed</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

