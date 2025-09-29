import { useMemo } from "react";
import type { OperationsState } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { getListingCompleteness } from "../validation";
import { CURRENT_OPERATIONS_USER_ID } from "../currentUser";

export const StrayQueuesBoard = ({ ops }: { ops: OperationsState }) => {
  const admin = useMemo(() => ops.tasks.filter(t => !t.listingId && t.queue === "ADMIN"), [ops.tasks]);
  const marketing = useMemo(() => ops.tasks.filter(t => !t.listingId && t.queue === "MARKETING"), [ops.tasks]);

  const Column = ({ title, tasks }: { title: string; tasks: typeof admin }) => (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[60vh] pr-2">
          <div className="space-y-2">
            {tasks.map(t => {
              const agent = t.agentId && ops.agents.find(a => a.id === t.agentId);
              const address = t.address || "—";
              const badge = null;
              return (
                <div key={t.id} className="p-3 rounded-md border bg-card">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                    <span>{agent?.name || "Unassigned"} • {address} • Due {new Date(t.dueDate).toLocaleDateString()}</span>
                    {/* badge removed per request */}
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
            {tasks.length === 0 && (
              <div className="text-xs text-muted-foreground">No tasks</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
      <Column title="Admin Queue" tasks={admin} />
      <Column title="Marketing Queue" tasks={marketing} />
    </div>
  );
};

export default StrayQueuesBoard;

