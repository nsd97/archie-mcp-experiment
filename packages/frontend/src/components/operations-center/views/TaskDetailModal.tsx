import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMemo } from "react";
import type { OperationsState } from "../types";
import { TaskDetail } from "./TaskDetail";

export const TaskDetailModal = ({ ops, taskId, open, onOpenChange }: { ops: OperationsState; taskId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const task = useMemo(() => ops.tasks.find(t => t.id === taskId!), [ops.tasks, taskId]);
  const listing = useMemo(() => task ? ops.listings.find(l => l.id === task.listingId) : null, [ops.listings, task]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl modal-uniform">
        <DialogHeader>
          <DialogTitle>{task?.title || "Task"}{listing ? ` — ${listing.address}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="modal-scroll">
          {task && (
            <TaskDetail ops={ops} taskId={task.id} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailModal;


