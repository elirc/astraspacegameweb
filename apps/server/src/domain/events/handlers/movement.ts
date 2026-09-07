import type { EventContext } from '../types';
import { attack } from './attack';
import { scout } from './scout';
import { support } from './support';
export function movement(ctx: EventContext) {
  if (ctx.ev.payload.kind === 'support') support(ctx);
  else if (ctx.ev.payload.kind === 'scout') scout(ctx);
  else attack(ctx);
}
