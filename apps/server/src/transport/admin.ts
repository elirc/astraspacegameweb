import type { FastifyInstance } from 'fastify';
import { createAdminUseCases } from '../application/admin';
import { createNpcUseCases } from '../application/npcs';
export function registerAdmin(app: FastifyInstance) {
  const useCases = createAdminUseCases();
  app.addHook('preHandler', useCases.addHook_preHandler);
  const npcs = createNpcUseCases();
  app.get('/api/admin/npcs', npcs.list);
  app.post('/api/admin/npcs', npcs.create);
  app.post('/api/admin/npcs/update', npcs.update);
  app.post('/api/admin/npcs/pause', npcs.pauseAll);
  app.get('/api/admin/config', useCases.get_api_admin_config);
  app.post('/api/admin/config', { bodyLimit: 262144 }, useCases.post_api_admin_config);
  app.get('/api/admin/players', useCases.get_api_admin_players);
  app.post('/api/admin/players/:id/moderate', useCases.post_api_admin_players_id_moderate);
  app.get('/api/admin/audit', useCases.get_api_admin_audit);
  app.get('/api/admin/events', useCases.get_api_admin_events);
  app.post('/api/admin/replay', useCases.post_api_admin_replay);
  app.post('/api/admin/events/:id/replay', useCases.post_api_admin_events_id_replay);
  app.post('/api/admin/movements/cancel', useCases.post_api_admin_movements_cancel);
  app.get('/api/admin/abuse', useCases.get_api_admin_abuse);
  app.post('/api/admin/abuse/:id', useCases.post_api_admin_abuse_id);
}
