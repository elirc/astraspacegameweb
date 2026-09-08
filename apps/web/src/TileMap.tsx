import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  Application,
  Container,
  Graphics,
  ParticleContainer,
  Particle,
  Rectangle,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { Castle, Crosshair, Minus, Plus, Search } from 'lucide-react';
import { api } from './api';
import { useUI } from './ui';
import { CASTLE_FRAME, CASTLE_SIZE, castleFrame, createMapArt } from './mapArt';
import { prepareMapCanvasFrame } from './mapCanvas';
import './map.css';

export function WorldMap({
  own,
  onSelect,
  selected,
  config,
}: {
  villages?: any[];
  own: any;
  onSelect: (v: any) => void;
  selected: any;
  config?: any;
}) {
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<any>(null),
    render = useRef<() => void>(() => {});
  const [size, setSize] = useState({ w: 800, h: 600 });
  const saved = useUI.getState().camera,
    save = useUI((s) => s.setCamera);
  const [camera, setCamera] = useState(saved || { x: own.x, y: own.y, zoom: 1 });
  const live = useRef(camera);
  const frame = useRef<number | null>(null),
    sync = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateCamera = (next: typeof camera | ((current: typeof camera) => typeof camera)) => {
    live.current = typeof next === 'function' ? next(live.current) : next;
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        render.current();
      });
    if (sync.current === null)
      sync.current = setTimeout(() => {
        sync.current = null;
        const current = { ...live.current };
        setCamera(current);
        save(current);
      }, 100);
  };
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (sync.current !== null) clearTimeout(sync.current);
      save(live.current);
    },
    [],
  );
  const [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState('');
  const [backend, setBackend] = useState('loading');
  const tileSize = config?.map?.tileSize || 100,
    mapSize = config?.map?.size || 1000;
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const tiles = useMemo(() => {
    const radiusX = size.w / (84 * camera.zoom),
      radiusY = size.h / (84 * camera.zoom),
      out: { x: number; y: number }[] = [];
    for (
      let x = Math.max(0, Math.floor((camera.x - radiusX) / tileSize) - 1);
      x <=
      Math.min(Math.ceil(mapSize / tileSize) - 1, Math.floor((camera.x + radiusX) / tileSize) + 1);
      x++
    )
      for (
        let y = Math.max(0, Math.floor((camera.y - radiusY) / tileSize) - 1);
        y <=
        Math.min(
          Math.ceil(mapSize / tileSize) - 1,
          Math.floor((camera.y + radiusY) / tileSize) + 1,
        );
        y++
      )
        out.push({ x, y });
    return out;
  }, [camera.x, camera.y, camera.zoom, size, tileSize, mapSize]);
  const queries = useQueries({
    queries: tiles.map((t) => ({
      queryKey: ['map', 'tile', t.x, t.y],
      queryFn: () => api(`/map/tiles?x=${t.x}&y=${t.y}`),
      staleTime: 10000,
      gcTime: 60000,
      refetchInterval: 15000,
    })),
  });
  const nearby = useQuery({
    queryKey: ['map', 'search', debounced, own.id],
    queryFn: () => api(`/map/search?q=${encodeURIComponent(debounced)}&x=${own.x}&y=${own.y}`),
    staleTime: 10000,
  });
  const chunks = queries.map((q) => q.data);
  const snapshot = useRef<{
    chunks: any[];
    villages: any[];
    groups: Map<string, any[]>;
    buckets: Map<string, any[]>;
  }>({
    chunks: [],
    villages: [],
    groups: new Map(),
    buckets: new Map(),
  });
  const indexes = useRef(new WeakMap<object, Map<string, any[]>>());
  if (
    chunks.length !== snapshot.current.chunks.length ||
    chunks.some((chunk, i) => chunk?.villages !== snapshot.current.chunks[i]?.villages)
  ) {
    const villages = chunks.flatMap((chunk) => chunk?.villages || []),
      groups = new Map<string, any[]>();
    chunks.forEach((chunk, i) => {
      if (chunk?.villages?.length) groups.set(tiles[i]!.x + ':' + tiles[i]!.y, chunk.villages);
    });
    const buckets = new Map<string, any[]>();
    for (const chunk of chunks) {
      if (!chunk?.villages) continue;
      let index = indexes.current.get(chunk.villages);
      if (!index) {
        index = new Map();
        for (const village of chunk.villages) {
          const key = Math.floor(village.x / 10) + ':' + Math.floor(village.y / 10);
          const rows = index.get(key) || [];
          rows.push(village);
          index.set(key, rows);
        }
        indexes.current.set(chunk.villages, index);
      }
      for (const [key, rows] of index) {
        const previous = buckets.get(key);
        buckets.set(key, previous ? previous.concat(rows) : rows);
      }
    }
    snapshot.current = { chunks, villages, groups, buckets };
  }
  const selection = useRef(onSelect);
  selection.current = onSelect;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const mapSnapshot = snapshot.current;
  useEffect(() => {
    render.current();
  }, [mapSnapshot, selected?.id]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const target: HTMLDivElement = element;
    let disposed = false,
      fallbackActive = false,
      candidateInitialized = false,
      candidateDestroyed = false,
      candidate: Application | undefined,
      app: Application | undefined,
      canvas: HTMLCanvasElement | undefined,
      canvasContext: CanvasRenderingContext2D | null = null,
      terrainPattern: CanvasPattern | null = null,
      atlas: Texture | undefined,
      terrainTexture: Texture | undefined,
      terrain: TilingSprite | undefined,
      highlights: Graphics | undefined,
      layer: Container | undefined;
    let initializationTimer: ReturnType<typeof setTimeout> | undefined;
    let initializationFrame: number | undefined;
    const textures: Texture[] = [];
    let artwork: ReturnType<typeof createMapArt> | undefined;
    const mounted = new Map<
      string,
      { container: ParticleContainer; data: string; particles: Map<number, Particle> }
    >();
    const pixels = () => live.current.zoom * 42;
    const visibleVillages = (c: typeof camera, w: number, h: number, scale: number) => {
      const left = c.x - (w / 2 + 50) / scale,
        right = c.x + (w / 2 + 50) / scale;
      const top = c.y - (h / 2 + 50) / scale,
        bottom = c.y + (h / 2 + 50) / scale;
      const visible: any[] = [];
      for (let x = Math.floor(left / 10); x <= Math.floor(right / 10); x++)
        for (let y = Math.floor(top / 10); y <= Math.floor(bottom / 10); y++)
          for (const village of snapshot.current.buckets.get(x + ':' + y) || [])
            if (village.x >= left && village.x <= right && village.y >= top && village.y <= bottom)
              visible.push(village);
      return visible;
    };
    const drawCanvas = () => {
      if (!canvas || !canvasContext) return;
      const ctx = canvasContext;
      const ratio = Math.min(devicePixelRatio, 2),
        w = target.clientWidth,
        h = target.clientHeight,
        c = live.current,
        s = pixels();
      prepareMapCanvasFrame(canvas, ctx, w, h, ratio);
      ctx.fillStyle = '#1c2927';
      ctx.fillRect(0, 0, w, h);
      if (terrainPattern) {
        terrainPattern.setTransform(
          new DOMMatrix().translate(w / 2 - c.x * s, h / 2 - c.y * s).scale(c.zoom),
        );
        ctx.fillStyle = terrainPattern;
        ctx.fillRect(0, 0, w, h);
      }
      for (const [v, color] of [
        [own, '#d5a661'],
        [selectedRef.current, '#f5e4b8'],
      ] as const) {
        if (!v) continue;
        const x = (v.x - c.x) * s + w / 2;
        const y = (v.y - c.y) * s + h / 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(x, y + 9 * c.zoom, 23 * c.zoom, 12 * c.zoom, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const v of visibleVillages(c, w, h, s)) {
        const x = (v.x - c.x) * s + w / 2,
          y = (v.y - c.y) * s + h / 2;
        const variant = castleFrame(v, own.player_id);
        const extent = CASTLE_SIZE * c.zoom;
        if (artwork)
          ctx.drawImage(
            artwork.castles,
            Math.floor(variant / 3) * CASTLE_FRAME,
            (variant % 3) * CASTLE_FRAME,
            CASTLE_FRAME,
            CASTLE_FRAME,
            x - extent / 2,
            y - extent * 0.65,
            extent,
            extent,
          );
      }
    };
    const drawGPU = () => {
      if (!app || !layer || !atlas || !terrain || !highlights) return;
      const c = live.current,
        s = pixels();
      terrain.width = target.clientWidth;
      terrain.height = target.clientHeight;
      terrain.tileScale.set(c.zoom);
      terrain.tilePosition.set(target.clientWidth / 2 - c.x * s, target.clientHeight / 2 - c.y * s);
      highlights.clear();
      for (const [v, color] of [
        [own, 0xd5a661],
        [selectedRef.current, 0xf5e4b8],
      ] as const) {
        if (!v) continue;
        const x = (v.x - c.x) * s + target.clientWidth / 2;
        const y = (v.y - c.y) * s + target.clientHeight / 2;
        highlights
          .ellipse(x, y + 9 * c.zoom, 23 * c.zoom, 12 * c.zoom)
          .stroke({ color, width: 1.5 });
      }
      layer.position.set(target.clientWidth / 2 - c.x * s, target.clientHeight / 2 - c.y * s);
      layer.scale.set(c.zoom);
      const grouped = new Map<string, any[]>();
      for (const village of visibleVillages(c, target.clientWidth, target.clientHeight, s)) {
        const key = Math.floor(village.x / tileSize) + ':' + Math.floor(village.y / tileSize);
        const rows = grouped.get(key) || [];
        rows.push(village);
        grouped.set(key, rows);
      }
      for (const [key, entry] of mounted) {
        if (!snapshot.current.groups.has(key)) {
          entry.container.destroy();
          mounted.delete(key);
        } else entry.container.visible = grouped.has(key);
      }
      for (const [key, rows] of grouped) {
        const fingerprint = rows.map((v) => v.id + ':' + castleFrame(v, own.player_id)).join(',');
        let entry = mounted.get(key);
        if (!entry) {
          const container = new ParticleContainer({
            dynamicProperties: { position: false, color: false, rotation: false, vertex: false },
          });
          entry = { container, data: '', particles: new Map() };
          mounted.set(key, entry);
          layer.addChild(container);
        }
        entry.container.visible = true;
        if (entry.data === fingerprint) continue;
        const particles: Particle[] = [];
        for (const village of rows) {
          let particle = entry.particles.get(village.id);
          const texture = textures[castleFrame(village, own.player_id)]!;
          if (!particle) {
            particle = new Particle({
              texture,
              x: village.x * 42,
              y: village.y * 42,
              anchorX: 0.5,
              anchorY: 0.65,
              scaleX: CASTLE_SIZE / CASTLE_FRAME,
              scaleY: CASTLE_SIZE / CASTLE_FRAME,
            });
            entry.particles.set(village.id, particle);
          }
          particle.texture = texture;
          particles.push(particle);
        }
        entry.container.particleChildren = particles;
        entry.container.update();
        entry.data = fingerprint;
      }
      app.render();
    };
    const releaseCandidate = () => {
      // Pixi cannot destroy an Application whose asynchronous init is still
      // pending. Its completion handler owns disposal after a timeout/unmount.
      if (!candidate || !candidateInitialized || candidateDestroyed) return;
      candidateDestroyed = true;
      try {
        candidate.destroy(true, { children: true });
      } catch {
        // A failed plugin can also throw during Application.destroy. Release
        // its already initialized renderer directly so the context is not kept.
        try {
          candidate.renderer?.destroy(true);
        } catch {}
        try {
          candidate.stage?.destroy({ children: true });
        } catch {}
      }
    };
    const showCanvas = () => {
      if (disposed || fallbackActive) return;
      fallbackActive = true;
      clearTimeout(initializationTimer);
      releaseCandidate();
      app = undefined;
      artwork ||= createMapArt();
      canvas = document.createElement('canvas');
      canvasContext = canvas.getContext('2d');
      terrainPattern = canvasContext?.createPattern(artwork.terrain, 'repeat') || null;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      target.appendChild(canvas);
      render.current = drawCanvas;
      renderer.current = { draw: drawCanvas };
      setBackend('Canvas');
      drawCanvas();
    };
    async function init() {
      const deadline = performance.now() + 8000;
      setBackend('loading');
      // Include the first RAF in the deadline: cold/background tabs can delay
      // that callback as well as Pixi's dynamic renderer import.
      initializationTimer = setTimeout(showCanvas, 8000);
      await new Promise<void>((resolve) => {
        initializationFrame = requestAnimationFrame(() => {
          initializationFrame = undefined;
          resolve();
        });
      });
      if (disposed || fallbackActive) return;
      try {
        if (new URLSearchParams(location.search).get('renderer') === 'canvas') {
          showCanvas();
          return;
        }
        artwork = createMapArt();
        candidate = new Application();
        await candidate.init({
          background: '#1c2927',
          resizeTo: target,
          preference: ['webgl'],
          resolution: Math.min(devicePixelRatio, 2),
          autoDensity: true,
          autoStart: false,
          antialias: true,
        });
        candidateInitialized = true;
        if (disposed || fallbackActive || performance.now() >= deadline) {
          if (!disposed) showCanvas();
          releaseCandidate();
          return;
        }
        app = candidate;
        atlas = Texture.from(artwork.castles);
        for (let i = 0; i < 9; i++)
          textures.push(
            new Texture({
              source: atlas.source,
              frame: new Rectangle(
                Math.floor(i / 3) * CASTLE_FRAME,
                (i % 3) * CASTLE_FRAME,
                CASTLE_FRAME,
                CASTLE_FRAME,
              ),
            }),
          );
        terrainTexture = Texture.from(artwork.terrain);
        terrain = new TilingSprite({
          texture: terrainTexture,
          width: target.clientWidth,
          height: target.clientHeight,
        });
        highlights = new Graphics();
        layer = new Container();
        app.stage.addChild(terrain, highlights, layer);
        target.appendChild(app.canvas);
        render.current = drawGPU;
        // Validate the first frame before ending the fallback deadline.
        drawGPU();
        clearTimeout(initializationTimer);
        setBackend('WebGL');
      } catch {
        // A plugin can reject after autoDetectRenderer has assigned a ready
        // renderer. The promise has settled, so partial initialization is now
        // safe to dispose as well; a genuinely pending candidate is left alone.
        if (candidate?.renderer) candidateInitialized = true;
        releaseCandidate();
        showCanvas();
      }
      if (disposed) return;
      renderer.current = { draw: render.current };
    }
    void init();
    const observer = new ResizeObserver(() => {
      setSize({ w: target.clientWidth, h: target.clientHeight });
      render.current();
    });
    observer.observe(target);
    const pointers = new Map<number, { x: number; y: number }>();
    let start: any = null,
      moved = false;
    const point = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });
    const begin = (e: PointerEvent) => {
      target.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, point(e));
      moved = false;
      const all = [...pointers.values()];
      start = {
        camera: { ...live.current },
        point: point(e),
        distance: all.length === 2 ? Math.hypot(all[0]!.x - all[1]!.x, all[0]!.y - all[1]!.y) : 0,
      };
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, point(e));
      const all = [...pointers.values()];
      if (all.length === 2 && start.distance) {
        const distance = Math.hypot(all[0]!.x - all[1]!.x, all[0]!.y - all[1]!.y);
        moved = true;
        updateCamera({
          ...start.camera,
          zoom: Math.max(0.25, Math.min(3, (start.camera.zoom * distance) / start.distance)),
        });
      } else if (all.length === 1) {
        const dx = e.clientX - start.point.x,
          dy = e.clientY - start.point.y;
        if (Math.hypot(dx, dy) > 5) moved = true;
        if (moved)
          updateCamera({
            ...start.camera,
            x: Math.max(0, Math.min(mapSize, start.camera.x - dx / (42 * start.camera.zoom))),
            y: Math.max(0, Math.min(mapSize, start.camera.y - dy / (42 * start.camera.zoom))),
          });
      }
    };
    const end = (e: PointerEvent) => {
      if (!moved && pointers.size === 1) {
        const rect = target.getBoundingClientRect(),
          c = live.current,
          x = c.x + (e.clientX - rect.left - rect.width / 2) / pixels(),
          y = c.y + (e.clientY - rect.top - rect.height / 2) / pixels();
        // Match the full scaled castle silhouette. When zoomed out, retain a
        // usable touch target and choose the nearest keep rather than the first
        // row in the tile response when several targets occupy the same area.
        const padding = 0.5 / c.zoom;
        let nearest: any = null;
        let distance = Infinity;
        for (const village of visibleVillages(c, rect.width, rect.height, pixels())) {
          if (
            Math.abs(village.x - x) > Math.max(0.5, padding) ||
            y < village.y - Math.max(0.65, padding) ||
            y > village.y + Math.max(0.35, padding)
          )
            continue;
          const candidate = Math.hypot(village.x - x, village.y - 0.15 - y);
          if (candidate < distance) {
            distance = candidate;
            nearest = village;
          }
        }
        if (nearest) selection.current(nearest);
      }
      pointers.delete(e.pointerId);
      start = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      updateCamera((c) => ({
        ...c,
        zoom: Math.max(0.25, Math.min(3, c.zoom * Math.exp(-e.deltaY * 0.001))),
      }));
    };
    target.addEventListener('pointerdown', begin);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('wheel', wheel, { passive: false });
    return () => {
      disposed = true;
      clearTimeout(initializationTimer);
      if (initializationFrame !== undefined) cancelAnimationFrame(initializationFrame);
      observer.disconnect();
      target.removeEventListener('pointerdown', begin);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('wheel', wheel);
      render.current = () => {};
      try {
        releaseCandidate();
        for (const texture of textures) texture.destroy();
        atlas?.destroy(true);
        terrainTexture?.destroy(true);
      } catch {}
      canvas?.remove();
    };
  }, [own.id, tileSize, mapSize]);
  const zoom = (factor: number) =>
    updateCamera((c) => ({ ...c, zoom: Math.max(0.25, Math.min(3, c.zoom * factor)) }));
  return (
    <div className="map-layout fortress-map">
      <div className="map-board">
        <div
          ref={host}
          className="pixi-map"
          aria-label="Interactive world map"
          tabIndex={0}
          style={{ touchAction: 'none' }}
          onKeyDown={(e) => {
            const delta = 5 / live.current.zoom;
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault();
              updateCamera((c) => ({
                ...c,
                x: c.x + (e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0),
                y: c.y + (e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0),
              }));
            }
            if (e.key === '+') zoom(1.25);
            if (e.key === '-') zoom(0.8);
          }}
        />
        <div className="map-coordinate">
          {Math.round(camera.x)} | {Math.round(camera.y)} <span>·</span> {backend}
        </div>
        <div className="map-atmosphere" aria-hidden="true" />
        <div className="map-realm" aria-hidden="true">
          The Crownlands <span>Borderlands & strongholds</span>
        </div>
        <div className="map-tools">
          <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
            <Plus size={17} />
          </button>
          <button aria-label="Zoom out" onClick={() => zoom(0.8)}>
            <Minus size={17} />
          </button>
          <button
            aria-label="Center on your village"
            onClick={() => updateCamera({ x: own.x, y: own.y, zoom: 1 })}
          >
            <Crosshair size={17} />
          </button>
        </div>
        <div className="map-legend">
          <span>
            <i className="dot gold" />
            Your keeps
          </span>
          <span>
            <i className="dot crimson" />
            Other lords
          </span>
          <span>
            <i className="dot gray" />
            Ruined keeps
          </span>
        </div>
      </div>
      <div className="panel nearby">
        <div className="panel-heading">
          <h3>Strongholds nearby</h3>
        </div>
        <label className="search-input">
          <Search size={16} />
          <input
            aria-label="Search villages"
            placeholder="Keep, lord or coordinates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="village-list">
          {nearby.data?.villages.map((v: any) => (
            <button
              key={v.id}
              className={selected?.id === v.id ? 'selected' : ''}
              onClick={() => onSelect(v)}
            >
              <span
                className={
                  'map-dot ' +
                  (v.player_id === own.player_id ? 'own' : v.player_id ? 'enemy' : 'barbarian')
                }
              >
                <Castle size={25} strokeWidth={1.4} aria-hidden="true" />
              </span>
              <span>
                <b>{v.name}</b>
                <small>
                  {v.player_name || 'Ruined keep'} · {v.x}|{v.y}
                </small>
              </span>
              <span className="distance">
                {Math.hypot(v.x - own.x, v.y - own.y).toFixed(1)}
                <small>fields</small>
              </span>
            </button>
          ))}
          {nearby.isPending && <p className="empty">Scouting nearby strongholds…</p>}
          {nearby.isError && <p className="empty">Could not load strongholds. Please reconnect.</p>}
          {nearby.data?.villages.length === 0 && (
            <p className="empty">No strongholds match your search.</p>
          )}
        </div>
      </div>
    </div>
  );
}
