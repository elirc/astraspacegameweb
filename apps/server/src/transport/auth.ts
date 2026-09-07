import type { FastifyInstance } from 'fastify';
import { createAuthUseCases } from '../application/auth';
export async function registerAuth(
  app: FastifyInstance,
  spawn: Parameters<typeof createAuthUseCases>[1],
) {
  const useCases = createAuthUseCases(app, spawn);
  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  app.post('/api/auth/guest', authLimit, useCases.post_api_auth_guest);
  app.post('/api/auth/register', authLimit, useCases.post_api_auth_register);
  app.post('/api/auth/login', authLimit, useCases.post_api_auth_login);
  app.post('/api/auth/refresh', useCases.post_api_auth_refresh);
  app.post('/api/auth/logout', useCases.post_api_auth_logout);
  app.post('/api/auth/forgot', authLimit, useCases.post_api_auth_forgot);
  app.post('/api/auth/reset', authLimit, useCases.post_api_auth_reset);
}
