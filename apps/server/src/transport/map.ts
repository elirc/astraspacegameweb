import type { FastifyInstance } from 'fastify';
import { createMapUseCases } from '../application/map';
export function registerMap(app: FastifyInstance) {
  const useCases = createMapUseCases();
  app.get('/api/map/tiles', useCases.get_api_map_tiles);
  app.get('/api/map/search', useCases.get_api_map_search);
}
