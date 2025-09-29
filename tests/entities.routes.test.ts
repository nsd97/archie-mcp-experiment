import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import entitiesRoutes from '../src/routes/entities';

const getEntityByKey = vi.fn();
const queryEntitiesByTypeStatus = vi.fn();

vi.mock('../src/db/entities', () => ({
  getEntityByKey,
  queryEntitiesByTypeStatus,
}));

function createMockApp() {
  const routes: Array<{ url: string; handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> } & Record<string, any>> = [];
  const withValidation = vi.fn((opts: any) => {
    routes.push(opts);
  });
  const app = {
    authenticate: vi.fn(),
    withValidation,
  } as unknown as Parameters<typeof entitiesRoutes>[0];
  return { app, routes };
}

function createReply() {
  const reply = {
    statusCode: 200,
    code: vi.fn(function (this: any, status: number) {
      this.statusCode = status;
      return this;
    }),
    send: vi.fn(function (this: any, payload: unknown) {
      this.payload = payload;
      return this;
    }),
  } as any;
  return reply;
}

describe('entities routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers expected endpoints', async () => {
    const { app, routes } = createMockApp();
    await entitiesRoutes(app);
    const urls = routes.map((r) => r.url);
    expect(urls).toEqual(expect.arrayContaining(['/entities/me', '/entities/:id', '/entities']));
  });

  it('resolves current user entity', async () => {
    const { app, routes } = createMockApp();
    await entitiesRoutes(app);
    const meRoute = routes.find((r) => r.url === '/entities/me');
    if (!meRoute) throw new Error('route missing');

    getEntityByKey.mockResolvedValueOnce({
      entity_key: 'agent:jane',
      entity_id: '1',
      type: 'AGENT',
      status: 'ACTIVE',
    });

    const reply = createReply();
    await meRoute.handler({ user: { userId: 'agent:jane' } } as any, reply);

    expect(getEntityByKey).toHaveBeenCalledWith('agent:jane');
    expect(reply.payload).toMatchObject({ entity_key: 'agent:jane', type: 'AGENT' });
  });

  it('filters entities by name when query provided', async () => {
    const { app, routes } = createMockApp();
    await entitiesRoutes(app);
    const listRoute = routes.find((r) => r.url === '/entities');
    if (!listRoute) throw new Error('route missing');

    queryEntitiesByTypeStatus.mockResolvedValueOnce([
      { entity_key: 'agent:jane', entity_id: '1', type: 'AGENT', name: 'Jane Doe', status: 'ACTIVE' },
      { entity_key: 'agent:bob', entity_id: '2', type: 'AGENT', name: 'Bob Smith', status: 'ACTIVE' },
    ]);

    const reply = createReply();
    const result = (await listRoute.handler({ query: { type: 'AGENT', query: 'jane' } } as any, reply)) as any;

    expect(queryEntitiesByTypeStatus).toHaveBeenCalledWith('AGENT', 'ACTIVE#', 1000);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].entity_key).toBe('agent:jane');
  });
});
