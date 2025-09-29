import { useMemo } from "react";
import type { OperationsState, Task } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SimpleTaskForm from "../SimpleTaskForm";
import { CURRENT_OPERATIONS_USER_ID } from "../currentUser";

export const TaskDetail = ({ ops, taskId }: { ops: OperationsState; taskId: string }) => {
  const task = useMemo(() => ops.tasks.find((t) => t.id === taskId), [ops.tasks, taskId]);
  const listing = useMemo(() => (task ? ops.listings.find((l) => l.id === task.listingId) : null), [ops.listings, task]);
  const hasTemplate = Boolean(task?.templateKey);

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
              {task.claimedById && task.claimedById !== CURRENT_OPERATIONS_USER_ID && ` • Claimed by ${task.assignee || task.claimedById}`}
            </div>
          </div>
          <div className="flex gap-2">
            {!task.claimedById ? (
              <Button size="sm" variant="outline" onClick={() => ops.claimTask(task.id, CURRENT_OPERATIONS_USER_ID)}>Claim</Button>
            ) : task.claimedById === CURRENT_OPERATIONS_USER_ID ? (
              <Button size="sm" variant="outline" onClick={() => ops.unclaimTask(task.id)}>Unclaim</Button>
            ) : null}
            {task.claimedById === CURRENT_OPERATIONS_USER_ID && (
              <Button size="sm" onClick={() => ops.markTaskDone(task.id)}>Mark Done</Button>
            )}
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
