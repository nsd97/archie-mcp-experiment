import dotenv from 'dotenv';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../src/db/client';

dotenv.config();

const ENTITIES_TABLE = process.env.ENTITIES_TABLE || 'entities';
const LISTINGS_TABLE = process.env.LISTINGS_TABLE || 'listings';
const TASKS_TABLE = process.env.TASKS_TABLE || 'tasks';

const now = new Date('2025-01-01T00:00:00.000Z');

function fixedDate(offsetDays = 0) {
  return new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();
}

const entities = [
  {
    entity_key: 'agent:emma.stone',
    entity_id: '01F8MECHZX3TBDSZ7XRADM79XE',
    type: 'AGENT',
    name: 'Emma Stone',
    email: 'emma.stone@example.com',
    status: 'ACTIVE',
    created_at: fixedDate(),
    updated_at: fixedDate(),
  },
  {
    entity_key: 'admin_ops:liam.jones',
    entity_id: '01F8MECHZX3TBDSZ7XRADM79XF',
    type: 'ADMIN_OPS',
    name: 'Liam Jones',
    email: 'liam.jones@example.com',
    status: 'ACTIVE',
    created_at: fixedDate(),
    updated_at: fixedDate(),
  },
  {
    entity_key: 'admin_marketing:sophia.lee',
    entity_id: '01F8MECHZX3TBDSZ7XRADM79XG',
    type: 'ADMIN_MARKETING',
    name: 'Sophia Lee',
    email: 'sophia.lee@example.com',
    status: 'ACTIVE',
    created_at: fixedDate(),
    updated_at: fixedDate(),
  },
];

const listings = [
  {
    listing_id: '01H8MECHZX3TBDSZ7XRADM79X1',
    type: 'SALE',
    address_string: '101 Seedling Ave, Newtown, NY',
    agent_id: 'agent:emma.stone',
    assignee: 'agent:emma.stone',
    status: 'new',
    created_at: fixedDate(),
    updated_at: fixedDate(),
    due_date: fixedDate(3),
    GLOBAL: 'GLOBAL',
  },
  {
    listing_id: '01H8MECHZX3TBDSZ7XRADM79X2',
    type: 'LEASE',
    address_string: '202 Growth Blvd, Progress, CA',
    agent_id: 'agent:emma.stone',
    assignee: 'admin_ops:liam.jones',
    status: 'in_progress',
    created_at: fixedDate(),
    updated_at: fixedDate(),
    due_date: fixedDate(5),
    GLOBAL: 'GLOBAL',
    progress: { pct: 40 },
  },
];

const tasks = [
  {
    task_id: '01J8MECHZX3TBDSZ7XRADM79T1',
    listing_id: listings[0].listing_id,
    name: 'Prepare welcome packet',
    status: 'pending',
    priority: 3,
    due_date: fixedDate(1),
    created_at: fixedDate(),
    updated_at: fixedDate(),
  },
  {
    task_id: '01J8MECHZX3TBDSZ7XRADM79T2',
    listing_id: listings[0].listing_id,
    name: 'Schedule photographer',
    status: 'claimed',
    priority: 6,
    due_date: fixedDate(2),
    created_at: fixedDate(),
    updated_at: fixedDate(),
    assigned_to: { userId: 'admin_ops:liam.jones' },
    claimed_at: fixedDate(),
  },
  {
    task_id: '01J8MECHZX3TBDSZ7XRADM79T3',
    listing_id: listings[1].listing_id,
    name: 'Review lease documents',
    status: 'in_progress',
    priority: 4,
    due_date: fixedDate(4),
    created_at: fixedDate(),
    updated_at: fixedDate(),
    assigned_to: { userId: 'agent:emma.stone' },
  },
  {
    task_id: '01J8MECHZX3TBDSZ7XRADM79S1',
    name: 'Ops daily standup',
    task_category: 'ADMIN',
    status: 'pending',
    priority: 2,
    created_at: fixedDate(),
    updated_at: fixedDate(),
    is_stray: true,
    is_generic: true,
  },
  {
    task_id: '01J8MECHZX3TBDSZ7XRADM79S2',
    name: 'Marketing social post',
    task_category: 'MARKETING',
    status: 'pending',
    priority: 5,
    created_at: fixedDate(),
    updated_at: fixedDate(),
    is_stray: true,
    is_generic: false,
  },
];

async function put(table: string, item: Record<string, unknown>) {
  try {
    await ddb.send(new PutCommand({ TableName: table, Item: item }));
    console.log(`Upserted into ${table}: ${JSON.stringify(item, null, 2)}`);
  } catch (err) {
    console.error(`Failed to upsert into ${table}`, err);
    process.exit(1);
  }
}

async function seed() {
  for (const entity of entities) {
    await put(ENTITIES_TABLE, { ...entity, 'status#updated_at': `${entity.status}#${entity.updated_at}` });
  }

  for (const listing of listings) {
    await put(LISTINGS_TABLE, { ...listing });
  }

  for (const task of tasks) {
    const toPut = { ...task } as any;
    if (toPut.assigned_to?.userId) {
      toPut['assigned_to.userId'] = toPut.assigned_to.userId;
    }
    if (toPut.listing_id && toPut.status) {
      toPut['listing_id#status'] = `${toPut.listing_id}#${toPut.status}`;
    }
    toPut['priority#due_date'] = `${toPut.priority ?? 0}#${toPut.due_date ?? ''}`;
    toPut['status#priority'] = `${toPut.status}#${toPut.priority ?? 0}`;
    toPut['task_category#is_stray'] = `${toPut.task_category ?? 'uncategorized'}#${toPut.is_stray ? 1 : 0}`;
    await put(TASKS_TABLE, toPut);
  }

  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
