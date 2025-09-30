import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { queryListingsByCreatedAt, type Listing } from '../db/listings';

const boardItemSchema = z.object({
  id: z.string(),
  address: z.string().optional(),
  agentId: z.string().optional(),
  status: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  progress: z.number().optional(),
  completedDate: z.string().nullable().optional(),
  type: z.enum(["SALE", "LEASE"]).optional(),
});

const boardResponseSchema = z.object({
  columns: z.record(z.string(), z.array(boardItemSchema)),
  summary: z.object({
    totalNew: z.number(),
    totalInProgress: z.number(),
    totalCompleted: z.number(),
    totalOverdue: z.number(),
  }),
});

function mapColumn(listing: Listing): string {
  const status = (listing.status || '').toLowerCase();
  switch (status) {
    case 'in_progress':
    case 'in-progress':
      return 'inProgress';
    case 'completed':
    case 'done':
      return 'completed';
    default:
      return 'new';
  }
}

export default async function boardRoutes(app: FastifyInstance) {
  app.withValidation({
    method: 'GET',
    url: '/v1/operations/board',
    validation: { response: { 200: boardResponseSchema } },
    async handler() {
      const listings = await queryListingsByCreatedAt('', 1000);
      const columns: Record<string, Array<{ id: string; address?: string; agentId?: string; status?: string; dueDate?: string | null; progress?: number; completedDate?: string | null; type?: "SALE" | "LEASE" }>> = {
        new: [],
        inProgress: [],
        completed: [],
      };

      for (const listing of listings) {
        const bucket = mapColumn(listing);
        if (!columns[bucket]) {
          columns[bucket] = [];
        }
        const progressValue = (() => {
          const value = (listing as any)?.progress;
          if (typeof value === 'number') return value;
          if (value && typeof value === 'object' && typeof value.pct === 'number') {
            return value.pct;
          }
          return undefined;
        })();

        columns[bucket].push({
          id: listing.listing_id,
          address: listing.address_string || undefined,
          agentId: listing.agent_id || undefined,
          status: listing.status,
          dueDate: listing.due_date ?? null,
          progress: bucket === 'inProgress' ? progressValue ?? 0 : undefined,
          completedDate: bucket === 'completed' ? listing.completed_at ?? listing.updated_at ?? null : undefined,
          type: listing.type,
        });
      }

      const toDate = (value?: string | null) => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      };

      const now = new Date();
      const totalOverdue = [...(columns.new || []), ...(columns.inProgress || [])].reduce((acc, item) => {
        const due = toDate(item.dueDate);
        return due && due.getTime() < now.getTime() ? acc + 1 : acc;
      }, 0);

      return {
        columns,
        summary: {
          totalNew: columns.new?.length ?? 0,
          totalInProgress: columns.inProgress?.length ?? 0,
          totalCompleted: columns.completed?.length ?? 0,
          totalOverdue,
        },
      };
    },
  });
}
