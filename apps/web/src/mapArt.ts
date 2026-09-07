// All map artwork is drawn once into shared atlases. Both renderers use the
// same silhouettes, so a lost WebGL context never changes what a player sees.
export const CASTLE_FRAME = 128;
export const CASTLE_SIZE = 42;
export const TERRAIN_SIZE = 1008;

export function castleFrame(
  village: { player_id: number | null; points?: number },
  playerId: number,
) {
  const allegiance = village.player_id === playerId ? 0 : village.player_id ? 1 : 2;
  const tier = (village.points || 0) >= 1500 ? 2 : (village.points || 0) >= 500 ? 1 : 0;
  return allegiance * 3 + tier;
}

function polygon(ctx: CanvasRenderingContext2D, points: number[], fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }
}

function drawCastle(ctx: CanvasRenderingContext2D, allegiance: number, tier: number) {
  const abandoned = allegiance === 2;
  const banner = ['#daa85c', '#cb584b', '#83938a'][allegiance]!;
  const stone = abandoned ? '#889187' : '#b4b5a9';
  const edge = abandoned ? '#b4b8a4' : '#e0d9bc';
  const shadow = '#343d3b';
  ctx.fillStyle = '#080d0dcc';
  ctx.beginPath();
  ctx.ellipse(33, 53, 29, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, [3, 49, 31, 37, 61, 48, 33, 60], '#26332d', banner + '90');
  polygon(ctx, [7, 48, 31, 39, 56, 48, 33, 56], '#384039');

  const tower = (x: number, y: number, width: number, height: number, broken = false) => {
    const face = ctx.createLinearGradient(x, y, x + width, y + height);
    face.addColorStop(0, stone);
    face.addColorStop(1, abandoned ? '#4f5c55' : '#606c66');
    ctx.fillStyle = face;
    ctx.fillRect(x, y + 4, width, height - 4);
    polygon(
      ctx,
      [
        x + width,
        y + 4,
        x + width + 3,
        y + 2,
        x + width + 3,
        y + height - 2,
        x + width,
        y + height,
      ],
      shadow,
    );
    ctx.fillStyle = stone;
    for (let i = 0; i < 3; i++) {
      if (broken && i === 1) continue;
      ctx.fillRect(x + (i * width) / 3, y, width / 5, 5);
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x, y + height);
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x + width, y + 5);
    ctx.stroke();
    ctx.strokeStyle = '#27312e77';
    for (let row = y + 10; row < y + height - 2; row += 5) {
      ctx.beginPath();
      ctx.moveTo(x + 1, row);
      ctx.lineTo(x + width - 1, row);
      ctx.stroke();
    }
    ctx.fillStyle = '#172120';
    ctx.fillRect(x + width / 2 - 0.8, y + 9, 1.6, 5);
  };

  if (tier === 2) {
    tower(11, 17, 9, 27);
    tower(44, 15, 8, 28, abandoned);
  }
  tower(23, 17 - tier * 4, 18, 29 + tier * 4, abandoned);
  polygon(
    ctx,
    [23, 21 - tier * 4, 41, 21 - tier * 4, 44, 19 - tier * 4, 26, 19 - tier * 4],
    '#dad4b8',
  );
  ctx.fillStyle = '#141e1d';
  ctx.fillRect(27, 28 - tier * 4, 2, 5);
  ctx.fillRect(35, 28 - tier * 4, 2, 5);

  // A curtain wall and two crenellated gate towers read as a fortress even at
  // the lowest points tier; larger holdings gain a taller keep and outer towers.
  tower(14, 34, 35, 18, abandoned);
  tower(8, 28 - tier, 12, 23 + tier, abandoned);
  tower(45, 28 - tier, 11, 23 + tier);
  ctx.fillStyle = '#131b1b';
  ctx.beginPath();
  ctx.moveTo(27, 53);
  ctx.lineTo(27, 44);
  ctx.quadraticCurveTo(32, 36, 37, 44);
  ctx.lineTo(37, 53);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d0c8a16e';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.strokeStyle = '#5e6760';
  for (let x = 29; x <= 35; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, 43);
    ctx.lineTo(x, 52);
    ctx.stroke();
  }
  polygon(ctx, [28, 53, 36, 53, 40, 58, 24, 58], '#888574');

  const mastY = 18 - tier * 3;
  ctx.strokeStyle = '#d5c7a4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(33, mastY + 3);
  ctx.lineTo(33, mastY - 9);
  ctx.stroke();
  polygon(ctx, [34, mastY - 9, 44, mastY - 7, 42, mastY - 4, 34, mastY - 5], banner);
  if (!abandoned) {
    for (const x of [23, 41]) {
      const glow = ctx.createRadialGradient(x, 43, 0, x, 43, 5);
      glow.addColorStop(0, '#ee97327a');
      glow.addColorStop(1, '#ee973200');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 5, 38, 10, 10);
      ctx.fillStyle = '#f5c369';
      ctx.fillRect(x - 0.7, 41, 1.4, 2.5);
    }
  } else {
    polygon(ctx, [12, 49, 15, 39, 17, 50], '#374e3b');
    polygon(ctx, [46, 50, 49, 44, 51, 53], '#3e5140');
  }
}

export function createMapArt() {
  const castles = document.createElement('canvas');
  castles.width = castles.height = CASTLE_FRAME * 3;
  const ctx = castles.getContext('2d')!;
  for (let allegiance = 0; allegiance < 3; allegiance++) {
    for (let tier = 0; tier < 3; tier++) {
      ctx.save();
      ctx.translate(allegiance * CASTLE_FRAME, tier * CASTLE_FRAME);
      ctx.scale(2, 2);
      drawCastle(ctx, allegiance, tier);
      ctx.restore();
    }
  }

  const terrain = document.createElement('canvas');
  terrain.width = terrain.height = TERRAIN_SIZE;
  const ground = terrain.getContext('2d')!;
  ground.fillStyle = '#1c2927';
  ground.fillRect(0, 0, TERRAIN_SIZE, TERRAIN_SIZE);
  let seed = 71931;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 45; i++) {
    const x = random() * TERRAIN_SIZE;
    const y = random() * TERRAIN_SIZE;
    const radius = 35 + random() * 150;
    const wash = ground.createRadialGradient(x, y, 0, x, y, radius);
    wash.addColorStop(0, i % 3 ? '#6d705023' : '#07191780');
    wash.addColorStop(1, '#17242100');
    ground.fillStyle = wash;
    ground.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 62; i++) {
    const x = 25 + random() * (TERRAIN_SIZE - 90);
    const y = 30 + random() * (TERRAIN_SIZE - 90);
    for (let j = 0; j < 5; j++) {
      const tx = x + random() * 55;
      const ty = y + random() * 40;
      const height = 8 + random() * 9;
      polygon(
        ground,
        [
          tx,
          ty - height,
          tx - 5,
          ty - 3,
          tx - 3,
          ty - 3,
          tx - 7,
          ty + 3,
          tx + 7,
          ty + 3,
          tx + 3,
          ty - 3,
          tx + 5,
          ty - 3,
        ],
        '#11221e',
      );
      polygon(
        ground,
        [tx, ty - height, tx - 5, ty - 3, tx - 3, ty - 3, tx - 7, ty + 3, tx, ty + 1],
        '#40504655',
      );
    }
  }
  for (let i = 0; i < 2700; i++) {
    ground.fillStyle = i % 2 ? '#abb29408' : '#070e131a';
    ground.fillRect(random() * TERRAIN_SIZE, random() * TERRAIN_SIZE, 1 + random() * 3, 1);
  }
  ground.strokeStyle = '#b0b39a0c';
  ground.lineWidth = 1;
  ground.beginPath();
  for (let i = 0.5; i < TERRAIN_SIZE; i += 42) {
    ground.moveTo(i, 0);
    ground.lineTo(i, TERRAIN_SIZE);
    ground.moveTo(0, i);
    ground.lineTo(TERRAIN_SIZE, i);
  }
  ground.stroke();
  return { castles, terrain };
}
