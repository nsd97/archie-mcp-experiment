import dotenv from 'dotenv';
import { ddb } from '../src/db/client';
import { PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { generateUlid } from '../src/services/ids';
import { createRequire } from 'module';

dotenv.config();

const ENTITIES_TABLE = process.env.ENTITIES_TABLE || 'entities';
const LISTINGS_TABLE = process.env.LISTINGS_TABLE || 'listings';
const TASKS_TABLE = process.env.TASKS_TABLE || 'tasks';
const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || 'audit_log';

// Use __filename to stay in CommonJS mode under ts-node
const requireCjs = createRequire(__filename);

function parseFlags() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function mapListingStatus(s: string | undefined): string {
  const map: Record<string, string> = { NEW: 'new', IN_PROGRESS: 'in_progress', DONE: 'completed' };
  return s && map[s.toUpperCase()] ? map[s.toUpperCase()] : 'new';
}

function mapDealType(s: string | undefined): 'SALE' | 'LEASE' {
  return (s || '').toUpperCase() === 'LEASE' ? 'LEASE' : 'SALE';
}

function priorityFromUrgency(u?: number): number {
  if (!u && u !== 0) return 1;
  if (u >= 80) return 9;
  if (u >= 60) return 7;
  if (u >= 40) return 5;
  return 3;
}

async function upsertEntity(agent: any, flags: { dryRun: boolean; verbose: boolean }) {
  const entity_key = agent.email ? `email:${agent.email}` : `local:${agent.id}`;
  // Existence by entity_key or external_ids.fe_agent_id
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const scan = await ddb.send(new ScanCommand({
      TableName: ENTITIES_TABLE,
      FilterExpression: 'entity_key = :ek or external_ids.fe_agent_id = :fid',
      ExpressionAttributeValues: { ':ek': entity_key, ':fid': agent.id },
      ExclusiveStartKey,
    }));
    if (scan.Items && scan.Items.length > 0) return { skipped: 1, inserted: 0, entity_key };
    ExclusiveStartKey = scan.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  const item: any = {
    entity_key,
    entity_id: generateUlid(),
    type: 'AGENT',
    name: agent.name,
    email: agent.email,
    status: 'ACTIVE',
    created_at: nowIso(),
    updated_at: nowIso(),
    external_ids: { fe_agent_id: agent.id },
    'status#updated_at': `ACTIVE#${nowIso()}`,
  };
  if (flags.verbose) console.log('[entity] insert', item);
  if (!flags.dryRun) await ddb.send(new PutCommand({ TableName: ENTITIES_TABLE, Item: item }));
  return { skipped: 0, inserted: 1, entity_key };
}

async function findAgentKeyByFeIdOrEmail(id?: string, email?: string): Promise<string | undefined> {
  if (id) {
    const scan = await ddb.send(new ScanCommand({
      TableName: ENTITIES_TABLE,
      FilterExpression: 'external_ids.fe_agent_id = :fid',
      ExpressionAttributeValues: { ':fid': id },
      ProjectionExpression: 'entity_key',
    }));
    const match = scan.Items?.[0];
    if (match?.entity_key) return match.entity_key as string;
  }
  if (email) {
    const scan = await ddb.send(new ScanCommand({
      TableName: ENTITIES_TABLE,
      FilterExpression: 'entity_key = :ek',
      ExpressionAttributeValues: { ':ek': `email:${email}` },
      ProjectionExpression: 'entity_key',
    }));
    const match = scan.Items?.[0];
    if (match?.entity_key) return match.entity_key as string;
  }
  return undefined;
}

async function upsertListing(listing: any, flags: { dryRun: boolean; verbose: boolean }) {
  // Existence by external_ids.fe_listing_id
  const scan = await ddb.send(new ScanCommand({
    TableName: LISTINGS_TABLE,
    FilterExpression: 'external_ids.fe_listing_id = :lid',
    ExpressionAttributeValues: { ':lid': listing.id },
  }));
  if (scan.Items && scan.Items.length > 0) return { skipped: 1, inserted: 0, listing_id: scan.Items[0].listing_id };

  const agent_id = await findAgentKeyByFeIdOrEmail(listing.agentId, undefined);
  if (!agent_id) {
    console.warn(`[warn] No agent for listing ${listing.id} (${listing.address}); skipping listing insert.`);
    return { skipped: 1, inserted: 0 };
  }

  const item: any = {
    listing_id: generateUlid(),
    type: mapDealType(listing.dealType),
    address_string: listing.address,
    address: { line1: listing.address, city: listing.location || '', country: 'CA' },
    agent_id,
    status: mapListingStatus(listing.status),
    created_at: nowIso(),
    updated_at: nowIso(),
    due_date: listing.dueDate || null,
    GLOBAL: 'GLOBAL',
    sqft: listing.squareFootage || undefined,
    property_type: listing.propertyType || undefined,
    external_ids: { fe_listing_id: listing.id },
  };
  if (flags.verbose) console.log('[listing] insert', item);
  if (!flags.dryRun) {
    await ddb.send(new PutCommand({ TableName: LISTINGS_TABLE, Item: item }));
    const ts = nowIso();
    const audit: any = {
      entity_id: item.listing_id,
      sk: `ts#${ts}#CREATED`,
      entity_type: 'listing',
      action: 'CREATED',
      content: `seed-from-frontend ${listing.id}`,
      performed_by: 'seed-from-frontend',
      timestamp: ts,
      'entity_type#action': `listing#CREATED`,
      'entity_type#entity_id': `listing#${item.listing_id}`,
    };
    await ddb.send(new PutCommand({ TableName: AUDIT_LOG_TABLE, Item: audit }));
  }
  return { skipped: 0, inserted: 1, listing_id: item.listing_id };
}

async function findListingIdByFeId(id: string): Promise<string | undefined> {
  const scan = await ddb.send(new ScanCommand({
    TableName: LISTINGS_TABLE,
    FilterExpression: 'external_ids.fe_listing_id = :lid',
    ExpressionAttributeValues: { ':lid': id },
    ProjectionExpression: 'listing_id',
  }));
  return scan.Items?.[0]?.listing_id as string | undefined;
}

async function upsertTask(task: any, flags: { dryRun: boolean; verbose: boolean }) {
  // Existence by external_ids.fe_task_id
  const exists = await ddb.send(new ScanCommand({
    TableName: TASKS_TABLE,
    FilterExpression: 'external_ids.fe_task_id = :tid',
    ExpressionAttributeValues: { ':tid': task.id },
  }));
  if (exists.Items && exists.Items.length > 0) return { skipped: 1, inserted: 0 };

  const listing_id = await findListingIdByFeId(task.listingId);
  if (!listing_id) {
    console.warn(`[warn] No listing match for task ${task.id} (${task.title}); skipping.`);
    return { skipped: 1, inserted: 0 };
  }
  const assigned_to_userId = task.claimedById ? await findAgentKeyByFeIdOrEmail(task.claimedById, undefined) : undefined;
  const mappedStatus = (task.status || '').toUpperCase();
  const statusMap: Record<string, string> = { NEW: 'pending', IN_PROGRESS: 'in_progress', DONE: 'completed' };
  const status = statusMap[mappedStatus] || 'pending';
  const priority = priorityFromUrgency(task.urgencyScore);
  const task_id = generateUlid();

  const item: any = {
    task_id,
    listing_id,
    name: task.title,
    status,
    priority,
    due_date: task.dueDate || null,
    created_at: nowIso(),
    updated_at: nowIso(),
    task_category: 'ADMIN',
    external_ids: { fe_task_id: task.id },
  };
  if (task.inputs) item.inputs = task.inputs;
  if (task.outputs) item.outputs = task.outputs;
  if (assigned_to_userId) {
    item.assigned_to = { userId: assigned_to_userId };
    item['assigned_to.userId'] = assigned_to_userId;
  }
  item['listing_id#status'] = `${listing_id}#${status}`;
  item['priority#due_date'] = `${priority}#${item.due_date || ''}`;
  item['status#priority'] = `${status}#${priority}`;
  item['task_category#is_stray'] = `${item.task_category}#0`;

  if (flags.verbose) console.log('[task] insert', item);
  if (!flags.dryRun) {
    await ddb.send(new PutCommand({ TableName: TASKS_TABLE, Item: item }));
    const ts = nowIso();
    const audit: any = {
      entity_id: item.task_id,
      sk: `ts#${ts}#CREATED`,
      entity_type: 'task',
      action: 'CREATED',
      content: `seed-from-frontend ${task.id}`,
      performed_by: 'seed-from-frontend',
      timestamp: ts,
      'entity_type#action': `task#CREATED`,
      'entity_type#entity_id': `task#${item.task_id}`,
    };
    await ddb.send(new PutCommand({ TableName: AUDIT_LOG_TABLE, Item: audit }));
  }
  return { skipped: 0, inserted: 1 };
}

async function main() {
  // Preflight
  try {
    requireCjs('../packages/frontend/mock-server/operations-store.js');
  } catch {
    console.error('Missing packages/frontend/mock-server/operations-store.js');
    process.exit(1);
  }

  const flags = parseFlags();
  const store = requireCjs('../packages/frontend/mock-server/operations-store.js');
  const snapshot = store.getState ? store.getState() : store.default?.getState?.();
  if (!snapshot) {
    console.error('Could not read FE mock snapshot.');
    process.exit(1);
  }

  const counts = { entities: { inserted: 0, skipped: 0 }, listings: { inserted: 0, skipped: 0 }, tasks: { inserted: 0, skipped: 0 } };

  // Entities
  for (const agent of snapshot.agents || []) {
    const r = await upsertEntity(agent, flags);
    counts.entities.inserted += r.inserted;
    counts.entities.skipped += r.skipped;
  }

  // Listings
  for (const l of snapshot.listings || []) {
    const r = await upsertListing(l, flags);
    counts.listings.inserted += r.inserted;
    counts.listings.skipped += r.skipped;
  }

  // Tasks
  for (const t of snapshot.tasks || []) {
    const r = await upsertTask(t, flags);
    counts.tasks.inserted += r.inserted;
    counts.tasks.skipped += r.skipped;
  }

  console.log('Import complete. Summary:', counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


