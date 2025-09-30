import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getListingById, queryListingsByStatus, queryListingsByCreatedAt, type Listing } from "../db/listings";

type Status = "new" | "in_progress" | "completed";

type SortBy = "created_at" | "due_date" | "address";

type ApiListing = {
  id: string;
  address: string;
  assignee?: string | null;
  dueDate?: string | null;
  status: Status;
  progress?: number | null;
  type?: "SALE" | "LEASE";
  createdAt: string;
  updatedAt: string;
};

const listingsQuerySchema = z.object({
  status: z.enum(["new", "in_progress", "completed"]).optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  sortBy: z.enum(["created_at", "due_date", "address"]).optional(),
});

const paginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

const listingsResponseSchema = z.object({
  listings: z.array(
    z.object({
      id: z.string(),
      address: z.string(),
      assignee: z.string().nullable(),
      dueDate: z.string().nullable(),
      status: z.string(),
      progress: z.number().nullable(),
      type: z.enum(["SALE", "LEASE"]).optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
  ),
  pagination: paginationSchema,
});

const listingParamsSchema = z.object({ id: z.string() });

const listingResponseSchema = z.object({
  id: z.string(),
  address: z.string(),
  assignee: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: z.string(),
  progress: z.number().nullable(),
  type: z.enum(["SALE", "LEASE"]).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const listingDetailsResponseSchema = z.object({
    listing: z.object({
      id: z.string(),
      address: z.string(),
      assignee: z.string().nullable(),
      dueDate: z.string().nullable(),
      status: z.string(),
      progress: z.number().nullable(),
      type: z.enum(["SALE", "LEASE"]).optional(),
    }),
  details: z.object({
    propertyType: z.string().nullable(),
    bedrooms: z.number(),
    bathrooms: z.number(),
    sqft: z.number(),
    yearBuilt: z.number(),
    listPrice: z.number(),
    notes: z.string().nullable(),
  }),
  history: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      performedBy: z.string().nullable(),
      timestamp: z.string(),
      changes: z.record(z.string(), z.any()).optional(),
    })
  ),
  tasks: z.array(
    z.object({ id: z.string(), title: z.string(), status: z.string(), assignee: z.string().nullable() })
  ),
  notes: z.array(
    z.object({ id: z.string(), content: z.string(), type: z.string(), createdBy: z.string().nullable(), createdAt: z.string() })
  ),
});

function toApiListing(l: Listing): ApiListing {
  return {
    id: l.listing_id,
    address: l.address_string || "",
    assignee: l.assignee ?? null,
    dueDate: l.due_date ?? null,
    status: l.status as Status,
    progress: (() => {
      const p = (l as any).progress;
      if (typeof p === 'number') return p;
      if (p && typeof p === 'object' && typeof p.pct === 'number') return p.pct;
      return null;
    })(),
    type: l.type,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  };
}

export default async function listingsRoutes(app: FastifyInstance) {
  app.withValidation({
    method: "GET",
    url: "/v1/operations/listings",
    validation: {
      query: listingsQuerySchema,
      response: { 200: listingsResponseSchema },
    },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { status, page, limit, sortBy } = (req.query as any) || {};
      const statusFilter: Status | undefined = status as Status | undefined;
      const pageNum = Math.max(1, Number(page ?? 1) || 1);
      const limitNum = Math.min(100, Math.max(1, Number(limit ?? 25) || 25));
      const sortField: SortBy = sortBy ?? "created_at";

      const items = statusFilter
        ? await queryListingsByStatus(statusFilter, "", 1000)
        : await queryListingsByCreatedAt("", 1000);

      items.sort((a, b) => {
        if (sortField === "address") return (a.address_string || "").localeCompare(b.address_string || "");
        if (sortField === "due_date") return (a.due_date || "").localeCompare(b.due_date || "");
        return a.created_at.localeCompare(b.created_at);
      });

      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / limitNum));
      const start = (pageNum - 1) * limitNum;
      const pageItems = items.slice(start, start + limitNum).map((item) => {
        const api = toApiListing(item);
        return {
          id: api.id,
          address: api.address,
          assignee: api.assignee,
          dueDate: api.dueDate,
          status: api.status,
          progress: api.progress,
          type: api.type,
          createdAt: api.createdAt,
          updatedAt: api.updatedAt,
        };
      });

      return reply.send({
        listings: pageItems,
        pagination: { page: pageNum, limit: limitNum, total, totalPages },
      });
    },
  });

  app.withValidation({
    method: "GET",
    url: "/v1/operations/listings/:id",
    validation: {
      params: listingParamsSchema,
      response: { 200: listingResponseSchema },
    },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { id } = req.params as any;
      const item = await getListingById(id);
      if (!item) return reply.code(404).send({ error: "Not Found" });
      const api = toApiListing(item);
      return reply.send({
        id: api.id,
        address: api.address,
        assignee: api.assignee ?? null,
        dueDate: api.dueDate ?? null,
        status: api.status,
        progress: api.progress ?? null,
        createdAt: api.createdAt,
        updatedAt: api.updatedAt,
      });
    },
  });

  app.withValidation({
    method: "GET",
    url: "/v1/operations/listings/:id/details",
    validation: {
      params: listingParamsSchema,
      response: { 200: listingDetailsResponseSchema },
    },
    async handler(req: FastifyRequest, reply: FastifyReply) {
      const { id } = req.params as any;
      const l = await getListingById(id);
      if (!l) return reply.code(404).send({ error: "Not Found" });

      const [historyEvents, taskItems] = await Promise.all([
        (async () => {
          const key = `listing#${id}`;
          const mod = await import("../db/audit_log");
          return mod.queryListingHistory(key, "", 100);
        })(),
        (async () => {
          const mod = await import("../db/tasks");
          return mod.queryListingTasks(id, "", 100);
        })(),
      ]);

      const history = historyEvents.map((e: any) => ({
        id: e.event_id,
        action: e.action,
        performedBy: e.performed_by ?? null,
        timestamp: e.timestamp,
        changes: e.changes || undefined,
        content: e.content,
        noteType: e.note_type,
      }));

      const tasks = taskItems.map((t: any) => ({
        id: t.task_id,
        title: t.name,
        status: t.status,
        assignee: t.assigned_to?.userId ?? null,
      }));

      const notes = history
        .filter((h) => h.content && h.noteType)
        .map((h) => ({
          id: h.id,
          content: h.content as string,
          type: h.noteType as string,
          createdBy: h.performedBy,
          createdAt: h.timestamp,
        }));

      return {
        listing: {
          id: l.listing_id,
          address: l.address_string || "",
          assignee: l.assignee ?? null,
          dueDate: l.due_date ?? null,
          status: l.status,
          type: l.type,
          progress: (() => {
            const p = (l as any).progress;
            if (typeof p === 'number') return p;
            if (p && typeof p === 'object' && typeof p.pct === 'number') return p.pct;
            return null;
          })(),
        },
        details: {
          propertyType: l.property_type ?? null,
          bedrooms: l.bedrooms ?? 0,
          bathrooms: l.bathrooms ?? 0,
          sqft: l.sqft ?? 0,
          yearBuilt: l.year_built ?? 0,
          listPrice: l.list_price ?? 0,
          notes: l.notes ?? null,
        },
        history: history.map(({ content: _content, noteType: _noteType, ...rest }) => rest),
        tasks,
        notes,
      };
    },
  });

  // Board route moved to `src/routes/board.ts` and registered separately.
}
