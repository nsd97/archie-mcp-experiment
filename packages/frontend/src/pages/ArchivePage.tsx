import { useMemo, useState } from "react";
import { useOperations, OperationsProvider } from "@/components/operations-center/state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskDetailModal } from "@/components/operations-center/views/TaskDetailModal";
import { ListingTasksModal } from "@/components/operations-center/views/ListingTasksModal";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const ArchiveInner = () => {
  const ops = useOperations();
  const [openListingId, setOpenListingId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const archivedListings = useMemo(
    () => ops.listings.filter(l => l.status === "DONE_POSTED" && (now - new Date(l.dueDate).getTime()) > sevenDaysMs),
    [ops.listings]
  );

  const strayAdmin = useMemo(
    () => ops.tasks.filter(t => !t.listingId && t.queue === "ADMIN" && (now - new Date(t.dueDate).getTime()) > sevenDaysMs),
    [ops.tasks]
  );
  const strayMarketing = useMemo(
    () => ops.tasks.filter(t => !t.listingId && t.queue === "MARKETING" && (now - new Date(t.dueDate).getTime()) > sevenDaysMs),
    [ops.tasks]
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Archive</h1>
          <p className="text-sm text-muted-foreground">Older Done/Posted listings and stray tasks</p>
        </div>
        <Button asChild size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground">
          <Link to="/operations-center">Back</Link>
        </Button>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Archived Listings</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[70vh] pr-2">
              <div className="space-y-2">
                {archivedListings.map(l => {
                  const agent = ops.agents.find(a => a.id === l.agentId);
                  return (
                    <button key={l.id} className="p-3 rounded-md border bg-card w-full text-left hover:bg-accent/40" onClick={() => setOpenListingId(l.id)}>
                      <div className="text-sm font-medium truncate">{l.address}</div>
                      <div className="text-xs text-muted-foreground">{agent?.name} • Posted {new Date(l.dueDate).toLocaleDateString()}</div>
                    </button>
                  );
                })}
                {archivedListings.length === 0 && (
                  <div className="text-xs text-muted-foreground">No archived listings yet.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Archived Admin Strays</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[34vh] pr-2">
                <div className="space-y-2">
                  {strayAdmin.map(t => (
                    <button key={t.id} className="p-3 rounded-md border bg-card w-full text-left hover:bg-accent/40" onClick={() => setOpenTaskId(t.id)}>
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{ops.agents.find(a => a.id === t.agentId)?.name || "Unassigned"} • {t.address || "—"} • Due {new Date(t.dueDate).toLocaleDateString()}</div>
                    </button>
                  ))}
                  {strayAdmin.length === 0 && (
                    <div className="text-xs text-muted-foreground">No admin strays.</div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Archived Marketing Strays</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[34vh] pr-2">
                <div className="space-y-2">
                  {strayMarketing.map(t => (
                    <button key={t.id} className="p-3 rounded-md border bg-card w-full text-left hover:bg-accent/40" onClick={() => setOpenTaskId(t.id)}>
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{ops.agents.find(a => a.id === t.agentId)?.name || "Unassigned"} • {t.address || "—"} • Due {new Date(t.dueDate).toLocaleDateString()}</div>
                    </button>
                  ))}
                  {strayMarketing.length === 0 && (
                    <div className="text-xs text-muted-foreground">No marketing strays.</div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      <ListingTasksModal ops={ops} listingId={openListingId} open={!!openListingId} onOpenChange={(o) => !o ? setOpenListingId(null) : null} />
      <TaskDetailModal ops={ops} taskId={openTaskId} open={!!openTaskId} onOpenChange={(o) => !o ? setOpenTaskId(null) : null} />
    </div>
  );
};

const ArchivePage = () => {
  return (
    <OperationsProvider>
      <ArchiveInner />
    </OperationsProvider>
  );
};

export default ArchivePage;


