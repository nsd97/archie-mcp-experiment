import fp from 'fastify-plugin';
import type { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const isLocal = (process.env.NODE_ENV || '').toLowerCase() === 'local' || (process.env.NODE_ENV || '').toLowerCase() === 'test';
const jwtIssuer = process.env.COGNITO_ISSUER || process.env.OIDC_ISSUER || '';
const jwtAudience = process.env.COGNITO_AUDIENCE || process.env.OIDC_AUDIENCE || '';
const allowDebugUser = isLocal || process.env.ALLOW_DEBUG_USER === 'true';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function verifyJwt(token: string): Promise<JWTPayload> {
  if (!jwtIssuer) throw new Error('OIDC issuer not configured');
  if (!jwks) {
    const jwksUri = `${jwtIssuer.replace(/\/$/, '')}/.well-known/jwks.json`;
    jwks = createRemoteJWKSet(new URL(jwksUri));
  }
  const { payload } = await jwtVerify(token, jwks as any, {
    issuer: jwtIssuer,
    audience: jwtAudience || undefined,
  });
  return payload;
}

const authPlugin: FastifyPluginCallback = (app, _opts, done) => {
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = req.headers['authorization'];
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice('Bearer '.length);
        const payload = await verifyJwt(token);
        const userId = (payload.sub as string) || (payload['cognito:username'] as string);
        if (!userId) throw new Error('Missing subject');
        req.user = {
          userId,
          email: (payload.email as string) || undefined,
          name: (payload.name as string) || undefined,
          tenantId: (payload['custom:tenant_id'] as string) || undefined,
          provider: 'cognito',
          rawClaims: payload,
          roles: Array.isArray(payload['custom:roles'])
            ? (payload['custom:roles'] as string[])
            : typeof payload['custom:roles'] === 'string'
            ? String(payload['custom:roles']).split(',')
            : [],
          groups: Array.isArray(payload['custom:groups'])
            ? (payload['custom:groups'] as string[])
            : typeof payload['custom:groups'] === 'string'
            ? String(payload['custom:groups']).split(',')
            : [],
        } as any;
        return;
      }

      if (allowDebugUser) {
        const header = req.headers['x-debug-user'];
        const value = Array.isArray(header) ? header[0] : header;
        if (value && typeof value === 'string') {
          try {
            if (value.startsWith('{')) {
              const parsed = JSON.parse(value);
              if (parsed.userId) {
                req.user = {
                  userId: parsed.userId,
                  email: parsed.email,
                  name: parsed.name,
                  provider: 'debug',
                  rawClaims: parsed,
                  roles: Array.isArray(parsed.roles)
                    ? parsed.roles
                    : typeof parsed.roles === 'string'
                    ? parsed.roles.split(',')
                    : [],
                  groups: Array.isArray(parsed.groups)
                    ? parsed.groups
                    : typeof parsed.groups === 'string'
                    ? parsed.groups.split(',')
                    : [],
                } as any;
                return;
              }
            } else {
              req.user = { userId: value, provider: 'debug', roles: [], groups: [] } as any;
              return;
            }
          } catch {
            req.user = { userId: value, provider: 'debug', roles: [], groups: [] } as any;
            return;
          }
        }
      }

      throw new Error('Unauthorized');
    } catch (err) {
      app.log.warn({ err }, 'Auth failed');
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }
  });

  done();
};

export default fp(authPlugin);
