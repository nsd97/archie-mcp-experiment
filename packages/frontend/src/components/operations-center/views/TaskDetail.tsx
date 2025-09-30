import { useMemo } from "react";
import type { OperationsState, Task } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SimpleTaskForm from "../SimpleTaskForm";
import { CURRENT_USER_ID_RUNTIME } from "../currentUser";

const formatAssignee = (ops: OperationsState) =>
  (id?: string, fallback?: string) => {
    if (!id) return fallback ?? "Unassigned";
    const agent = ops.agents.find((a) => a.id === id);
    return agent?.name ?? fallback ?? id;
  };

export const TaskDetail = ({ ops, taskId }: { ops: OperationsState; taskId: string }) => {
  const task = useMemo(() => ops.tasks.find((t) => t.id === taskId), [ops.tasks, taskId]);
  const listing = useMemo(() => (task ? ops.listings.find((l) => l.id === task.listingId) : null), [ops.listings, task]);
  const hasTemplate = Boolean(task?.templateKey);
  const formatAgent = useMemo(() => formatAssignee(ops), [ops]);
  const availableAgentId = useMemo(() => listing?.agentId || ops.agents[0]?.id, [listing, ops.agents]);
  const isClaimedByMe = task?.claimedById === CURRENT_USER_ID_RUNTIME;

  if (!task) return null;

  const values: Record<string, string> = {
    ...(task.inputs || {}),
    ...(task.outputs || {}),
    listingAddress: listing?.address,
  };

  const handleValueChange = (binding: string, value: string) => {
    ops.updateTaskOutput(task.id, binding, value);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{task.title}</CardTitle>
            <div className="text-xs text-muted-foreground">
              {listing?.address ? `${listing.address} • ` : ""}Due {new Date(task.dueDate).toLocaleDateString()}
              {task.claimedById && (
                <>
                  {" "}
                  • {isClaimedByMe ? "Claimed by you" : `Claimed by ${formatAgent(task.claimedById)}`}
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!task.claimedById ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => availableAgentId && ops.claimTask(task.id, availableAgentId)}
                disabled={!availableAgentId}
              >
                {availableAgentId ? `Claim as ${formatAgent(availableAgentId)}` : "No agents available"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => ops.unclaimTask(task.id)}>
                Unclaim
              </Button>
            )}
            {!availableAgentId && !task.claimedById && (
              <span className="text-xs text-muted-foreground">
                Add an agent to claim this task.
              </span>
            )}
            <Button
              size="sm"
              onClick={() => ops.markTaskDone(task.id)}
              disabled={!isClaimedByMe}
            >
              Mark Done
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasTemplate ? (
          <SimpleTaskForm task={task} values={values} onChange={handleValueChange} />
        ) : (
          <div className="text-sm text-muted-foreground">No screen definition for this task yet.</div>
        )}
      </CardContent>
    </Card>
  );
};
