import { useMemo, useState } from "react";
import type { OperationsState } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TaskDetailModal } from "./TaskDetailModal";
import { CURRENT_OPERATIONS_USER_ID } from "../currentUser";

export const ListingDetail = ({ ops, listingId, onOpenTask }: { ops: OperationsState; listingId: string; onOpenTask: (id: string) => void }) => {
  const [note, setNote] = useState("");
  const listing = useMemo(() => ops.listings.find(l => l.id === listingId), [ops.listings, listingId]);
  const tasks = useMemo(() => ops.tasks.filter(t => t.listingId === listingId), [ops.tasks, listingId]);
  const notes = useMemo(() => ops.notes.filter(n => n.listingId === listingId), [ops.notes, listingId]);
  const attachments = useMemo(() => ops.attachments.filter(a => a.listingId === listingId), [ops.attachments, listingId]);
  const history = useMemo(() => ops.history.filter(h => h.listingId === listingId), [ops.history, listingId]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  if (!listing) return null;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{listing.address}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground mb-4">Due {new Date(listing.dueDate).toLocaleDateString()}</div>

          <div className="mb-4">
            <div className="text-sm font-medium mb-2">Tasks</div>
            <div className="space-y-2">
              {tasks.map(t => (
                <button key={t.id} className="p-3 rounded-md border bg-card w-full text-left hover:bg-accent/40" onClick={() => setOpenTaskId(t.id)}>
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Status {t.status} • Due {new Date(t.dueDate).toLocaleDateString()}
                    {t.claimedById && ` • ${t.claimedById === CURRENT_OPERATIONS_USER_ID ? 'Your task' : `Claimed by ${t.assignee || t.claimedById}`}`}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {!t.claimedById ? (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); ops.claimTask(t.id, CURRENT_OPERATIONS_USER_ID); }}>Claim</Button>
                    ) : t.claimedById === CURRENT_OPERATIONS_USER_ID ? (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); ops.unclaimTask(t.id); }}>Unclaim</Button>
                    ) : null}
                    {t.claimedById === CURRENT_OPERATIONS_USER_ID && (
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); ops.markTaskDone(t.id); }}>Mark Done</Button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-sm font-medium mb-2">Add Note</div>
            <div className="flex gap-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note..." />
              <Button onClick={() => { if (note.trim()) { ops.addNote(listing.id, CURRENT_OPERATIONS_USER_ID, note.trim()); setNote(""); } }}>Add</Button>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-sm font-medium mb-2">Notes</div>
            <div className="space-y-2">
              {notes.map(n => (
                <div key={n.id} className="p-2 rounded-md border bg-muted/40">
                  <div className="text-xs text-muted-foreground mb-1">{new Date(n.createdAt).toLocaleString()}</div>
                  <div className="text-sm">{n.body}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Attachments</div>
            <div className="space-y-1">
              {attachments.map(a => (
                <div key={a.id} className="text-sm">
                  <a href={a.url} className="text-primary underline">{a.name}</a>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="text-sm">
                <div className="text-xs text-muted-foreground">{new Date(h.timestamp).toLocaleString()}</div>
                <div>{h.summary}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <TaskDetailModal ops={ops} taskId={openTaskId} open={!!openTaskId} onOpenChange={(o) => !o ? setOpenTaskId(null) : null} />
    </div>
  );
};
