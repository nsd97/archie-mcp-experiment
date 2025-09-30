import { useMemo } from "react";
import type { OperationsState } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { CURRENT_OPERATIONS_USER_ID } from "../currentUser";

export const StrayQueuesBoard = ({ ops }: { ops: OperationsState }) => {
  const admin = useMemo(() => ops.tasks.filter(t => !t.listingId), [ops.tasks]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Admin Queue</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[60vh] pr-2">
          <div className="space-y-2">
            {admin.map(t => {
              const agent = t.agentId && ops.agents.find(a => a.id === t.agentId);
              const address = t.address || "—";
              return (
                <div key={t.id} className="p-3 rounded-md border bg-card">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                    <span>{agent?.name || "Unassigned"} • {address} • Due {new Date(t.dueDate).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {!t.claimedById ? (
                      <Button size="xs" variant="outline" onClick={() => ops.claimTask(t.id, CURRENT_OPERATIONS_USER_ID)}>Claim</Button>
                    ) : (
                      <div className="text-xs text-muted-foreground">Claimed by {ops.agents.find(a => a.id === t.claimedById)?.name || t.claimedById}</div>
                    )}
                  </div>
                </div>
              );
            })}
            {admin.length === 0 && (
              <div className="text-xs text-muted-foreground">No tasks</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default StrayQueuesBoard;

