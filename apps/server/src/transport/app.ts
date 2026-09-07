import { gameUseCases, spawn } from '../application/game';
import Fastify from 'fastify';
import { authenticate } from '../application/auth';
import { registerAuth } from './auth';
import { installContracts } from './contracts';
import { registerAdmin } from './admin';
import { registerExtended } from './extended';

import { registerMap } from './map';

import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

import { fail } from '../application/engine';
import type { WebSocket } from 'ws';
declare module 'fastify' {
  interface FastifyRequest {
    playerId: number;
    userId: number | null;
    isAdmin: boolean;
    sessionId: string;
  }
}

const secure = process.env.NODE_ENV === 'production';

export const sockets = new Map<number, Set<WebSocket>>();
export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    bodyLimit: 16384,
    ajv: { customOptions: { removeAdditional: false } },
    trustProxy:
      process.env.TRUST_PROXY === '1' ? (_address: string, hop: number) => hop < 1 : false,
  });
  if (secure && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32))
    throw new Error('JWT_SECRET must contain at least 32 characters in production');
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'local-only-warband-secret-change-before-deployment',
    cookie: { cookieName: 'wb_access', signed: false },
  });
  await app.register(rateLimit, {
    max: 1200,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (req) => (req.playerId ? 'player:' + req.playerId : req.ip),
  });
  await app.register(websocket);
  await installContracts(app);
  app.setErrorHandler((error: any, req, reply) => {
    if (error instanceof z.ZodError)
      return reply.status(400).send({ error: error.issues[0]?.message || 'Invalid request' });
    if (error.code === '23505')
      return reply.status(409).send({ error: 'That name or email is already taken' });
    if (error.statusCode >= 400 && error.statusCode < 500)
      return reply.status(error.statusCode).send({ error: error.message });
    req.log.error(error);
    return reply
      .status(500)
      .send({ error: 'The command could not be completed. Please try again.' });
  });
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api')) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      if (
        !URL.canParse(req.headers.origin) ||
        new URL(req.headers.origin).host !== req.headers.host
      )
        fail('Cross-origin commands are not allowed', 403);
    }
    if (req.url.startsWith('/api/auth/') || req.url === '/api/health' || req.url === '/api/legal')
      return;
    try {
      await authenticate(req);
    } catch {
      return reply.status(401).send({ error: 'Please sign in to your world' });
    }
  });
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api')) reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });

  app.get('/api/legal', gameUseCases.get_api_legal);
  app.get('/api/health', gameUseCases.get_api_health);
  await registerAuth(app, spawn);
  registerAdmin(app);
  app.get('/api/state', gameUseCases.get_api_state);
  app.post('/api/villages/:id/command', gameUseCases.post_api_villages_id_command);
  app.get('/api/map', gameUseCases.get_api_map);
  app.get('/api/reports', gameUseCases.get_api_reports);
  app.post('/api/reports/:id/read', gameUseCases.post_api_reports_id_read);
  app.get('/api/rankings', gameUseCases.get_api_rankings);
  app.get('/api/messages', gameUseCases.get_api_messages);
  app.post('/api/messages', gameUseCases.post_api_messages);
  app.get('/api/tribes', gameUseCases.get_api_tribes);
  app.post('/api/tribes', gameUseCases.post_api_tribes);
  app.post('/api/tribes/:id/join', gameUseCases.post_api_tribes_id_join);
  app.post('/api/tribes/leave', gameUseCases.post_api_tribes_leave);
  app.post('/api/tribes/forum', gameUseCases.post_api_tribes_forum);
  app.get('/api/tribes/forum/:id', gameUseCases.get_api_tribes_forum_id);
  app.post('/api/tribes/forum/:id', gameUseCases.post_api_tribes_forum_id);
  app.post('/api/tribes/diplomacy', gameUseCases.post_api_tribes_diplomacy);
  app.post('/api/restart', gameUseCases.post_api_restart);
  registerExtended(app);
  registerMap(app);
  app.get('/api/ws', { websocket: true }, (socket, req) => {
    const id = req.playerId;
    let set = sockets.get(id);
    if (!set) sockets.set(id, (set = new Set()));
    set.add(socket);
    socket.send(JSON.stringify({ type: 'connected', server_now: Date.now() }));
    let checking = false;
    const heartbeat = setInterval(async () => {
      if (checking || socket.readyState !== 1) return;
      checking = true;
      try {
        await authenticate(req);
        socket.send(JSON.stringify({ type: 'server_time', server_now: Date.now() }));
      } catch {
        socket.close(4001, 'Session revoked or expired');
      } finally {
        checking = false;
      }
    }, 5000);
    const expiry = setTimeout(
      () => socket.close(4001, 'Session refresh required'),
      Math.max(0, Number((req.user as any).exp) * 1000 - Date.now()),
    );
    socket.on('close', () => {
      set?.delete(socket);
      if (!set?.size) sockets.delete(id);
      clearInterval(heartbeat);
      clearTimeout(expiry);
    });
  });
  if (existsSync(resolve('dist'))) {
    await app.register(fastifyStatic, { root: resolve('dist') });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api')
        ? reply.status(404).send({ error: 'Not found' })
        : reply.sendFile('index.html'),
    );
  }
  return app;
}
