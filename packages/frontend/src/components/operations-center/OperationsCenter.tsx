/**
 * Operations Center shell.
 *
 * Provides tabs for Listings, Strays, and My Tasks. Uses OperationsProvider
 * to supply data and actions to descendant views and modals.
 */
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOperations, OperationsProvider } from "./state";
import { ListingsView } from "./views/ListingsView";
import { MyTasksView } from "./views/MyTasksView";
import { ListingDetail } from "./views/ListingDetail";
import { TaskDetail } from "./views/TaskDetail";
import { StrayQueuesBoard } from "./views/StrayQueuesBoard";
import { TaskDetailModal } from "./views/TaskDetailModal";

const OperationsShell = () => {
  const ops = useOperations();
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const selectedListing = useMemo(() => ops.listings.find(l => l.id === selectedListingId) ?? null, [ops.listings, selectedListingId]);
  const selectedTask = useMemo(() => ops.tasks.find(t => t.id === selectedTaskId) ?? null, [ops.tasks, selectedTaskId]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Tabs defaultValue="listings" className="w-full">
        <TabsList>
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="strays">Stray Queues</TabsTrigger>
          <TabsTrigger value="my">My Tasks</TabsTrigger>
          {selectedListing && <TabsTrigger value="listing">Listing Detail</TabsTrigger>}
        </TabsList>

        <TabsContent value="listings">
          <ListingsView ops={ops} onOpenListing={setSelectedListingId} onOpenTask={setSelectedTaskId} />
        </TabsContent>
        <TabsContent value="strays">
          <StrayQueuesBoard ops={ops} />
        </TabsContent>
        <TabsContent value="my">
          <MyTasksView ops={ops} onOpenTask={setSelectedTaskId} />
        </TabsContent>
        {selectedListing && (
          <TabsContent value="listing">
            <ListingDetail ops={ops} listingId={selectedListing.id} onOpenTask={setSelectedTaskId} />
          </TabsContent>
        )}
        <TaskDetailModal ops={ops} taskId={selectedTask?.id ?? null} open={!!selectedTask} onOpenChange={(o) => { if (!o) { setSelectedTaskId(null); } }} />
      </Tabs>
    </div>
  );
};

/**
 * Top-level exported component that wires up the Operations context and shell.
 */
export const OperationsCenter = () => {
  return (
    <OperationsProvider>
      <OperationsShell />
    </OperationsProvider>
  );
};

export default OperationsCenter;


