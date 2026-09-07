import type { FastifyInstance } from 'fastify';
import { createExtendedUseCases } from '../application/extended';
export function registerExtended(app: FastifyInstance) {
  const useCases = createExtendedUseCases((app as any).warbandRoutes.get('GET /api/state'));
  app.get('/api/me', useCases.state);
  app.get('/api/villages/:id', useCases.get_api_villages_id);
  for (const [path, action] of [
    ['build', 'build'],
    ['build/cancel', 'cancelBuild'],
    ['recruit', 'recruit'],
    ['movements', 'movement'],
    ['garrison/withdraw', 'withdraw'],
  ] as const)
    app.post('/api/villages/:id/' + path, useCases.commandAlias(action));
  app.post('/api/movements/:id/cancel', useCases.post_api_movements_id_cancel);
  app.get('/api/map/village/:id', useCases.get_api_map_village_id);
  app.get('/api/reports/:id', useCases.get_api_reports_id);
  app.post('/api/reports/bulk', useCases.post_api_reports_bulk);
  app.post('/api/messages/:id/read', useCases.post_api_messages_id_read);
  app.post('/api/messages/bulk', useCases.post_api_messages_bulk);
  app.get('/api/sim/battle', useCases.get_api_sim_battle);
  app.get('/api/tribes/members', useCases.get_api_tribes_members);
  app.post('/api/tribes/members', useCases.post_api_tribes_members);
  app.get('/api/push/key', useCases.get_api_push_key);
  app.post('/api/push/subscribe', useCases.post_api_push_subscribe);
  app.post('/api/push/unsubscribe', useCases.post_api_push_unsubscribe);
}
