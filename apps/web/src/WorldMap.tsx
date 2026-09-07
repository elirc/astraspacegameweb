import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { Crosshair, Minus, Plus, Search } from 'lucide-react';
export function WorldMap({
  villages,
  own,
  onSelect,
  selected,
}: {
  villages: any[];
  own: any;
  onSelect: (v: any) => void;
  selected: any;
}) {
  const host = useRef<HTMLDivElement>(null),
    camera = useRef<any>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let disposed = false;
    let ready = false;
    let app: Application | undefined;
    let resize: ResizeObserver | undefined;
    const target = host.current;
    if (!target) return;
    const init = async () => {
      // StrictMode's discarded first mount must not initialize a second GPU renderer.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (disposed) return;
      app = new Application();
      await app.init({
        background: '#d9deca',
        resizeTo: target,
        antialias: true,
        preference: 'webgl',
        resolution: Math.min(devicePixelRatio, 2),
        autoDensity: true,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }
      ready = true;
      target.appendChild(app.canvas);
      const layer = new Container();
      app.stage.addChild(layer);
      camera.current = { layer, app };
      const grid = new Graphics();
      for (let x = -1200; x <= 1200; x += 42) {
        grid.moveTo(x, -1200).lineTo(x, 1200);
        grid.moveTo(-1200, x).lineTo(1200, x);
      }
      grid.stroke({ color: 0x94a484, alpha: 0.22, width: 1 });
      layer.addChild(grid);
      const river = new Graphics()
        .moveTo(-800, -600)
        .bezierCurveTo(-150, -500, -650, 100, -250, 400)
        .bezierCurveTo(0, 500, -250, 800, 0, 1000)
        .stroke({ color: 0xa6c4bc, width: 52, alpha: 0.7 });
      layer.addChild(river);
      for (let i = 0; i < 270; i++) {
        const x = ((i * 137) % 2000) - 1000,
          y = ((i * 227) % 1800) - 900;
        const tree = new Graphics()
          .poly([x, y - 9, x - 6, y + 4, x + 6, y + 4])
          .fill({ color: i % 2 ? 0x879975 : 0x9aaa86, alpha: 0.55 });
        layer.addChild(tree);
      }
      for (const v of villages) {
        const x = (v.x - own.x) * 42,
          y = (v.y - own.y) * 42;
        const color = v.player_id === own.player_id ? 0xa77942 : v.player_id ? 0x66795b : 0x989683;
        const mark = new Graphics()
          .roundRect(x - 9, y - 4, 18, 13, 2)
          .fill(color)
          .poly([x - 12, y - 4, x, y - 15, x + 12, y - 4])
          .fill(color)
          .rect(x - 2, y + 1, 4, 8)
          .fill(0xdedecb);
        if (v.id === own.id)
          mark.circle(x, y - 2, 23).stroke({ color: 0xa77942, width: 2, alpha: 0.8 });
        mark.eventMode = 'static';
        mark.cursor = 'pointer';
        mark.on('pointertap', () => onSelect(v));
        layer.addChild(mark);
      }
      layer.position.set(target.clientWidth / 2, target.clientHeight / 2);
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;
      let drag: any = null;
      app.stage.on('pointerdown', (e: any) => {
        drag = { x: e.global.x, y: e.global.y, lx: layer.x, ly: layer.y };
      });
      app.stage.on('pointermove', (e: any) => {
        if (drag) {
          layer.x = drag.lx + e.global.x - drag.x;
          layer.y = drag.ly + e.global.y - drag.y;
        }
      });
      app.stage.on('pointerup', () => {
        drag = null;
      });
      app.stage.on('pointerupoutside', () => {
        drag = null;
      });
      resize = new ResizeObserver(() => {
        if (app) app.stage.hitArea = app.screen;
      });
      resize.observe(target);
    };
    init().catch(() => setError(true));
    return () => {
      disposed = true;
      resize?.disconnect();
      if (ready && app?.renderer) app.destroy(true, { children: true });
      camera.current = null;
    };
  }, [villages, own.id]);
  useEffect(() => {
    camera.current?.layer.scale.set(zoom);
  }, [zoom]);
  function center() {
    if (camera.current) {
      camera.current.layer.position.set(
        host.current!.clientWidth / 2,
        host.current!.clientHeight / 2,
      );
      setZoom(1);
      camera.current.layer.scale.set(1);
    }
  }
  const visible = villages
    .filter(
      (v) =>
        !search ||
        `${v.name} ${v.x}|${v.y} ${v.player_name || 'barbarian'}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => Math.hypot(a.x - own.x, a.y - own.y) - Math.hypot(b.x - own.x, b.y - own.y));
  return (
    <div className="map-layout">
      <div className="map-board">
        <div ref={host} className="pixi-map" aria-label="Interactive world map" />
        {error && (
          <div className="map-fallback">
            Map rendering is unavailable. Select a village from the nearby list.
          </div>
        )}
        <div className="map-coordinate">
          K55 <span>•</span> {own.x} | {own.y}
        </div>
        <div className="map-tools">
          <button aria-label="Zoom in" onClick={() => setZoom(Math.min(2.5, zoom + 0.25))}>
            <Plus size={17} />
          </button>
          <button aria-label="Zoom out" onClick={() => setZoom(Math.max(0.4, zoom - 0.25))}>
            <Minus size={17} />
          </button>
          <button aria-label="Center on your village" onClick={center}>
            <Crosshair size={17} />
          </button>
        </div>
        <div className="map-legend">
          <span>
            <i className="dot gold" />
            Your villages
          </span>
          <span>
            <i className="dot green" />
            Other players
          </span>
          <span>
            <i className="dot gray" />
            Abandoned
          </span>
        </div>
      </div>
      <div className="panel nearby">
        <div className="panel-heading">
          <h3>Beyond your borders</h3>
        </div>
        <label className="search-input">
          <Search size={16} />
          <input
            aria-label="Search villages"
            placeholder="Village, player or coordinates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="village-list">
          {visible.slice(0, 60).map((v) => (
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
                ♜
              </span>
              <span>
                <b>{v.name}</b>
                <small>
                  {v.player_name || 'Abandoned village'} · {v.x}|{v.y}
                </small>
              </span>
              <span className="distance">
                {Math.hypot(v.x - own.x, v.y - own.y).toFixed(1)}
                <small>fields</small>
              </span>
            </button>
          ))}
          {!visible.length && <p className="empty">No villages match your search.</p>}
        </div>
      </div>
    </div>
  );
}
