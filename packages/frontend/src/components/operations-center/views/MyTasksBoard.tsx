import { useMemo } from "react";
import { useOperations } from "../state";
import { Board } from "../Board";
import { CURRENT_USER_ID_RUNTIME } from "../currentUser";

export const MyTasksBoard = () => {
  const ops = useOperations();
  const myId = CURRENT_USER_ID_RUNTIME;
  type Task = (typeof ops.tasks)[number];

  const byStatus = useMemo(() => {
    const mine = ops.tasks.filter(t => t.claimedById === myId);
    return {
      NEW: mine.filter(t => t.status === "NEW"),
      IN_PROGRESS: mine.filter(t => t.status === "IN_PROGRESS"),
      DONE: mine.filter(t => t.status === "DONE"),
    };
  }, [ops.tasks]);

  const columns = [
    { id: "NEW", title: "New" },
    { id: "IN_PROGRESS", title: "In Progress" },
    { id: "DONE", title: "Done" },
  ];

  const itemsByColumn: Record<"NEW" | "IN_PROGRESS" | "DONE", Task[]> = {
    NEW: byStatus.NEW,
    IN_PROGRESS: byStatus.IN_PROGRESS,
    DONE: byStatus.DONE,
  };

  const getId = (t: Task) => t.id;
  const renderCard = (t: Task) => {
    const listing = t.listingId && ops.listings.find(l => l.id === t.listingId);
    const label = listing ? `${listing.address} • ${t.title}` : t.title;
    return (
      <div className="p-3 rounded-md border bg-card cursor-grab">
        <div className="text-sm font-medium truncate">{label}</div>
        <div className="text-xs text-muted-foreground truncate">Due {new Date(t.dueDate).toLocaleDateString()}</div>
      </div>
    );
  };

  const onDrop = (
    draggableId: string,
    _from: string,
    to: string,
    _sourceIndex: number,
    _destIndex: number
  ) => {
    const newStatus = to as "NEW" | "IN_PROGRESS" | "DONE";
    ops.updateTaskStatus(draggableId, newStatus);
  };

  return (
    <Board
      columns={columns}
      itemsByColumn={itemsByColumn}
      getId={getId}
      renderCard={renderCard}
      onDrop={onDrop}
    />
  );
};

export default MyTasksBoard;

