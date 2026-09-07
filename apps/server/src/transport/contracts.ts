import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { createHash } from 'node:crypto';
import { idempotent } from '../application/idempotency';
import { fail } from '../application/engine';
import { takeLimit } from '../application/limits';
import { z } from 'zod';
import { commandSchema } from '../../../../packages/shared/game';

function withoutDefaults(value: any): any {
  if (Array.isArray(value)) return value.map(withoutDefaults);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== 'default')
        .map(([k, v]) => [k, withoutDefaults(v)]),
    );
  return value;
}
export async function installContracts(app: FastifyInstance) {
  app.decorate('warbandRoutes', new Map());
  await app.register(swagger, {
    openapi: {
      info: { title: 'Warband world API', version: '1.0.0' },
      components: {
        securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'wb_access' } },
      },
    },
  });
  await app.register(swaggerUI, { routePrefix: '/api/docs' });
  app.addHook('onRoute', (route) => {
    (app as any).warbandRoutes.set(`${route.method} ${route.url}`, route.handler);
    if (!route.url.startsWith('/api/') || route.url.startsWith('/api/docs')) return;
    const write = !(Array.isArray(route.method) ? route.method : [route.method]).every((m) =>
      ['GET', 'HEAD', 'OPTIONS'].includes(m),
    );
    const auth = route.url.startsWith('/api/auth/');
    const params = Object.fromEntries(
      [...route.url.matchAll(/:([a-zA-Z]+)/g)].map((m) => [m[1], { type: 'integer', minimum: 1 }]),
    );
    route.schema = {
      tags: [route.url.split('/')[2] || 'api'],
      security: auth ? [] : [{ session: [] }],
      ...route.schema,
      ...(Object.keys(params).length
        ? { params: { type: 'object', properties: params, required: Object.keys(params) } }
        : {}),
      ...(write && !auth
        ? {
            headers: {
              type: 'object',
              required: ['idempotency-key'],
              properties: { 'idempotency-key': { type: 'string', minLength: 8, maxLength: 120 } },
            },
          }
        : {}),
      ...(route.url.endsWith('/command')
        ? {
            body: withoutDefaults(
              z.toJSONSchema(commandSchema, { unrepresentable: 'any', target: 'draft-7' }),
            ),
          }
        : {}),
    };
    if (!write || auth || route.url.endsWith('/command')) return;
    const handler = route.handler;
    route.handler = async function (req, reply) {
      return idempotent(req, async () => handler.call(this, req, reply));
    };
  });
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const auth = req.url.startsWith('/api/auth/');
    const movement = (req.body as any)?.action === 'movement' || req.url.endsWith('/movements');
    const key = auth
      ? 'auth:' + createHash('sha256').update(req.ip).digest('hex')
      : `player:${req.playerId}:${movement ? 'movement' : 'command'}`;
    if (!(await takeLimit(key, auth ? 20 : movement ? 30 : 120, 60000))) {
      reply.header('Retry-After', '60');
      fail('Too many commands. Please wait a minute.', 429);
    }
  });
  app.addHook('preSerialization', async (_req, _reply, payload) =>
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? { server_now: Date.now(), ...payload }
      : payload,
  );
  app.get('/api/openapi.json', async () => app.swagger());
}
