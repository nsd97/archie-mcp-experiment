import type { FastifyInstance } from "fastify";
import { getListingById, queryListingsByStatus, queryListingsByCreatedAt, type Listing } from "../db/listings";

type Status = "new" | "in_progress" | "completed";

type SortBy = "created_at" | "due_date" | "address";

type ApiListing = {
  id: string;
  address: string;
  assignee?: string;
  dueDate?: string;
  status: Status;
  progress?: number;
  createdAt: string;
  updatedAt: string;
};

function toApiListing(l: Listing): ApiListing {
  return {
    id: l.listing_id,
    address: l.address_string || "",
    assignee: l.assignee,
    dueDate: l.due_date,
    status: l.status as Status,
    progress: (l as any).progress as number | undefined,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  };
}

export default async function listingsRoutes(app: FastifyInstance) {
  app.get("/v1/operations/listings", async (req, reply) => {
    try {
      const { status, page, limit, sortBy } = (req.query as any) || {};
      // Validate and coerce
      const allowedStatus: Record<string, true> = { new: true, in_progress: true, completed: true };
      const statusFilter: Status | undefined = status && allowedStatus[status] ? (status as Status) : undefined;
      const pageNum = Math.max(1, Number(page ?? 1) || 1);
      const limitNum = Math.min(100, Math.max(1, Number(limit ?? 25) || 25));
      const sortField: SortBy = (sortBy === "created_at" || sortBy === "due_date" || sortBy === "address") ? sortBy : "created_at";

      let items: Listing[] = [];
      if (statusFilter) {
        // Pull a generous window, then paginate in-memory
        items = await queryListingsByStatus(statusFilter, "", 1000);
      } else {
        items = await queryListingsByCreatedAt("", 1000);
      }

      // Sort in-memory as needed
      items.sort((a, b) => {
        if (sortField === "address") {
          const aa = a.address_string || "";
          const bb = b.address_string || "";
          return aa.localeCompare(bb);
        }
        if (sortField === "due_date") {
          const ad = a.due_date || "";
          const bd = b.due_date || "";
          return ad.localeCompare(bd);
        }
        // created_at default
        return a.created_at.localeCompare(b.created_at);
      });

      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / limitNum));
      const start = (pageNum - 1) * limitNum;
      const pageItems = items.slice(start, start + limitNum).map(toApiListing);

      return reply.send({
        listings: pageItems,
        pagination: { page: pageNum, limit: limitNum, total, totalPages },
      });
    } catch (err: any) {
      req.log.error({ err }, "Failed to list listings");
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  });

  app.get("/v1/operations/listings/:id", async (req, reply) => {
    try {
      const { id } = req.params as any;
      if (!id || typeof id !== "string") {
        return reply.code(400).send({ error: "Invalid id" });
      }
      const item = await getListingById(id);
      if (!item) {
        return reply.code(404).send({ error: "Not Found" });
      }
      return reply.send(toApiListing(item));
    } catch (err: any) {
      req.log.error({ err }, "Failed to get listing by id");
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  });

  app.get("/v1/operations/listings/:id/details", async (req, reply) => {
    try {
      const { id } = req.params as any;
      if (!id || typeof id !== "string") {
        return reply.code(400).send({ error: "Invalid id" });
      }

      const l = await getListingById(id);
      if (!l) return reply.code(404).send({ error: "Not Found" });

      const [history, tasks] = await Promise.all([
        (async () => {
          const key = `listing#${id}`;
          const mod = await import("../db/audit_log");
          const events = await mod.queryListingHistory(key, "", 100);
          return events.map((e: any) => ({
            id: e.event_id,
            action: e.action,
            performedBy: e.performed_by,
            timestamp: e.timestamp,
            changes: e.changes || {},
            content: e.content,
            note_type: e.note_type,
          }));
        })(),
        (async () => {
          const mod = await import("../db/tasks");
          const items = await mod.queryListingTasks(id, "", 100);
          return items.map((t: any) => ({ id: t.task_id, title: t.name, status: t.status, assignee: t.assigned_to?.username || t.assigned_to?.userId || "" }));
        })(),
      ]);

      const notes = history.map((h: any) => ({
        id: h.id,
        content: h.content || "",
        type: h.note_type || "general",
        createdBy: h.performedBy || "",
        createdAt: h.timestamp,
      }));

      return reply.send({
        listing: {
          id: l.listing_id,
          address: l.address_string || "",
          assignee: l.assignee || "",
          dueDate: l.due_date,
          status: l.status,
          progress: (l as any).progress ?? 0,
        },
        details: {
          propertyType: l.property_type || "",
          bedrooms: l.bedrooms || 0,
          bathrooms: l.bathrooms || 0,
          sqft: l.sqft || 0,
          yearBuilt: l.year_built || 0,
          listPrice: l.list_price || 0,
          notes: l.notes || "",
        },
        history: history.map((h: any) => ({ id: h.id, action: h.action, performedBy: h.performedBy, timestamp: h.timestamp, changes: h.changes })),
        tasks,
        notes,
      });
    } catch (err: any) {
      req.log.error({ err }, "Failed to get listing details");
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  });
}
