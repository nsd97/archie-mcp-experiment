import { useState } from "react";
import { ListingsBoard } from "./ListingsBoard";
import { ListingsQueue } from "./ListingsQueue";
import type { OperationsState } from "../types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Task } from "../types";

export const ListingsView = ({ ops, onOpenListing, onOpenTask, onlyListingIds, taskFilter }: { ops: OperationsState; onOpenListing: (id: string) => void; onOpenTask: (id: string) => void; onlyListingIds?: string[]; taskFilter?: (task: Task) => boolean }) => {
  const [mode, setMode] = useState<"board" | "queue">("board");

  return (
    <div className="flex flex-col gap-3">
      <Card className="border-none shadow-none">
        <CardHeader className="py-0 px-0">
          <div className="flex items-center gap-3">
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as any)}>
              <ToggleGroupItem value="board" aria-label="Board view">Board</ToggleGroupItem>
              <ToggleGroupItem value="queue" aria-label="Queue view">Queue</ToggleGroupItem>
            </ToggleGroup>
            <CardTitle className="text-base font-medium">Listings</CardTitle>
          </div>
        </CardHeader>
      </Card>
      {mode === "board" ? (
        <ListingsBoard ops={ops} onOpenListing={onOpenListing} onlyListingIds={onlyListingIds} taskFilter={taskFilter} />
      ) : (
        <ListingsQueue ops={ops} onOpenTask={onOpenTask} onlyListingIds={onlyListingIds} taskFilter={taskFilter} />
      )}
    </div>
  );
};

export default ListingsView;

