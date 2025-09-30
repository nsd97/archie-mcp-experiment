import { useMemo, useState } from "react";
import { useOperations } from "../state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const QueueView = ({ onOpenTask }: { onOpenTask: (id: string) => void }) => {
  const ops = useOperations();
  const [filterPlaybook, setFilterPlaybook] = useState<string | "all">("all");
  const [filterAssignee, setFilterAssignee] = useState<string | "all">("all");

  const unclaimed = useMemo(
    () => ops.tasks.filter((t) => !t.claimedById && t.status !== "DONE"),
    [ops.tasks]
  );

  const filtered = useMemo(() => {
    return unclaimed.filter((t) => {
      const matchesPlaybook = filterPlaybook === "all" || t.playbookId === filterPlaybook;
      const matchesAssignee =
        filterAssignee === "all" || t.agentId === filterAssignee || (!t.agentId && filterAssignee === "unassigned");
      return matchesPlaybook && matchesAssignee;
    });
  }, [unclaimed, filterPlaybook, filterAssignee]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.urgencyScore - a.urgencyScore),
    [filtered]
  );

  const selectableAgents = useMemo(() => {
    const entries = ops.agents.map((agent) => ({ id: agent.id, name: agent.name }));
    return [{ id: "unassigned", name: "Unassigned" }, ...entries];
  }, [ops.agents]);

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
              {ops.playbooks.map((pb) => (
                <SelectItem key={pb.id} value={pb.id}>
                  {pb.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAssignee} onValueChange={(v) => setFilterAssignee(v as any)}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {selectableAgents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            Viewing as {ops.agents.find((a) => a.id === selectableAgents[1]?.id)?.name ?? "Operations"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[60vh] pr-2">
          <div className="divide-y">
            {sorted.map((t) => {
              const listing = ops.listings.find((l) => l.id === t.listingId);
              const agent = listing && (listing.agentName || ops.agents.find((a) => a.id === listing.agentId)?.name);
              const defaultClaimTarget = listing?.agentId || ops.agents[0]?.id;
              return (
                <button
                  key={t.id}
                  className="py-3 w-full text-left flex items-center justify-between hover:bg-accent/40 rounded-md px-2"
                  onClick={() => onOpenTask(t.id)}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {agent ? `Assigned to ${agent}` : "Unassigned"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">SLA {t.urgencyScore}</span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (defaultClaimTarget) {
                          ops.claimTask(t.id, defaultClaimTarget);
                        }
                      }}
                      disabled={!defaultClaimTarget}
                    >
                      {defaultClaimTarget ? "Claim" : "No agent"}
                    </Button>
                  </div>
                </button>
              );
            })}
            {sorted.length === 0 && (
              <div className="text-xs text-muted-foreground py-3 text-center">No tasks matching filters</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default QueueView;

