import { build } from './handlers/build';
import { recruit } from './handlers/recruit';
import { market } from './handlers/market';
import { merchantReturn } from './handlers/merchantReturn';
import { release } from './handlers/release';
import { returnArmy } from './handlers/return';
import { withdraw } from './handlers/withdraw';
import { movement } from './handlers/movement';
import type { EventContext, EventKind } from './types';
export const handlers = {
  build,
  recruit,
  market,
  merchantReturn,
  release,
  return: returnArmy,
  withdraw,
  movement,
} satisfies Record<EventKind, (ctx: EventContext) => void>;
