import * as Dialog from '@radix-ui/react-dialog';
import {
  memo,
  startTransition,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Axe,
  Bell,
  BookOpen,
  Castle,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Compass,
  Crown,
  Flag,
  Hammer,
  House,
  Leaf,
  LogOut,
  Mail,
  Map,
  Menu,
  MessageSquare,
  Mountain,
  Package,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Shovel,
  Sparkles,
  Store,
  Swords,
  Target,
  Tractor,
  TreePine,
  Trophy,
  Users,
  Warehouse,
  Wheat,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { api, duration, format, serverOffset } from './api';
import {
  buildings,
  defaultConfig,
  definition,
  buildingCost,
  buildDuration,
  capacity,
  farmCapacity,
  population,
  production,
  recruitDuration,
  resources,
  travelTime,
  merchantTravelTime,
  units,
  battle,
  type Army,
} from '../../../packages/shared/game';
import { VillageScene as VillageSceneContent } from './VillageScene';
import { WorldMap as WorldMapContent } from './TileMap';
import { RulesContext, useGameRules } from './Rules';
import { useSearchParams } from 'react-router-dom';
import { useUI } from './ui';
import { Admin } from './Admin';
import { PushSettings } from './AccountExtras';
import { InboxTools } from './InboxTools';
import { TribeMembers } from './TribeMembers';
import { createQueryRefresher, resetAccountQueries } from './queryRefresh';
const VillageScene = memo(VillageSceneContent);
const WorldMap = memo(WorldMapContent);
const buildingIcons: Record<string, LucideIcon> = {
  main: Castle,
  wood: TreePine,
  clay: Shovel,
  iron: Mountain,
  farm: Wheat,
  storage: Warehouse,
  barracks: Swords,
  stable: Flag,
  smithy: Hammer,
  workshop: Axe,
  wall: Shield,
  academy: BookOpen,
  market: Store,
};
const navigation: [string, string, LucideIcon][] = [
  ['overview', 'Village overview', House],
  ['buildings', 'Buildings', Hammer],
  ['barracks', 'Barracks', Swords],
  ['map', 'World map', Map],
  ['commands', 'Commands', Flag],
  ['reports', 'Reports', BookOpen],
  ['tribe', 'My tribe', Shield],
  ['messages', 'Messages', Mail],
  ['rankings', 'Rankings', Trophy],
];
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const Component = buildingIcons[name] || Swords;
  return <Component size={size} strokeWidth={1.7} />;
}
function ResourceIcon({ type }: { type: string }) {
  return (
    <span className={'resource-icon ' + type}>
      <Icon name={type} size={17} />
    </span>
  );
}
function Cost({ cost }: { cost: any }) {
  return (
    <span className="cost">
      {resources.map((r) => (
        <span key={r}>
          <ResourceIcon type={r} />
          {format(cost[r])}
        </span>
      ))}
    </span>
  );
}
function Empty({
  icon: Component = Compass,
  title,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Component size={30} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const previous = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content
            className="modal"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              previous.current?.focus();
            }}
          >
            <div className="panel-heading">
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="icon-button" aria-label="Close dialog">
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>
            <div className="modal-body">{children}</div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function QueryFeedback({ query, label }: { query: any; label: string }) {
  if (query.isPending)
    return (
      <p className="empty" role="status">
        Loading {label}…
      </p>
    );
  if (!query.isError) return null;
  return (
    <div className="query-feedback" role="alert">
      <p>
        Could not load {label}. {query.error.message}
      </p>
      <button
        className="button outline"
        disabled={query.isFetching}
        onClick={() => query.refetch()}
      >
        {query.isFetching ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  );
}

function AppContent({ state }: { state: UseQueryResult<any, Error> }) {
  const { buildings, units, buildingCost, capacity, farmCapacity, population, production, battle } =
    useGameRules();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = searchParams.get('page') || 'overview';
  const page = [...navigation.map(([id]) => id), 'simulator', 'admin', 'settings'].includes(
    requestedPage,
  )
    ? requestedPage
    : 'overview';
  const setPage = (page: string) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('page', page);
      return next;
    });
  const selectedId = useUI((s) => s.selectedId),
    setSelectedId = useUI((s) => s.select);
  const [building, setBuilding] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [auth, setAuth] = useState<'login' | 'register' | null>(null);
  const [help, setHelp] = useState(false);
  const [mobile, setMobile] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const data = state.data;
  const stateUnavailable = state.isError && (state.error as any).status !== 401;
  const refreshRef = useRef<ReturnType<typeof createQueryRefresher> | null>(null);
  useEffect(() => {
    const refresher = createQueryRefresher(qc);
    refreshRef.current = refresher;
    return () => {
      refreshRef.current?.dispose();
      refreshRef.current = null;
    };
  }, [qc, data?.player.id]);
  const village = data?.villages.find((v: any) => v.id === selectedId) || data?.villages[0];
  const hasVillage = Boolean(village);
  useEffect(() => {
    if (!mobile) return;
    if (!hasVillage) {
      setMobile(false);
      return;
    }
    const sidebar = navigationRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (
      sidebar?.querySelector<HTMLButtonElement>('nav button[aria-current="page"]') ||
      sidebar?.querySelector<HTMLButtonElement>('nav button')
    )?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog opened from navigation manages its own keyboard focus.
      if (!sidebar?.contains(document.activeElement)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobile(false);
      }
      if (event.key === 'Tab') {
        const controls = Array.from(
          sidebar.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'),
        );
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const desktop = matchMedia('(min-width: 761px)');
    const onResize = () => {
      if (desktop.matches) setMobile(false);
    };
    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onResize);
      menuRef.current?.focus();
    };
  }, [mobile, hasVillage]);
  useEffect(() => {
    if (!village) return;
    // Clock redraws should not interrupt navigation or rebuild the village artwork.
    const tick = () => startTransition(() => setNow(Date.now() + serverOffset));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [village?.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!data) return;
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let attempt = 0;
    function connect() {
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/ws`,
      );
      socket.onopen = () => {
        if (stopped) return;
        setConnected(true);
        attempt = 0;
        refreshRef.current?.request();
      };
      socket.onmessage = (e) => {
        if (stopped) return;
        try {
          const hint = JSON.parse(e.data);
          if (hint.type !== 'server_time' && hint.type !== 'connected')
            refreshRef.current?.request();
        } catch {}
      };
      socket.onclose = () => {
        if (stopped) return;
        setConnected(false);
        if (!stopped)
          timer = setTimeout(
            async () => {
              try {
                await api('/state');
              } catch {}
              if (!stopped) connect();
            },
            Math.min(30000, 1000 * 2 ** attempt++),
          );
      };
      socket.onerror = () => socket.close();
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [data?.player.id]);
  const flash = (text: string, error = false) => setToast({ text, error });
  async function act(fn: () => Promise<any>, message: string) {
    if (pending) return false;
    const refresher = refreshRef.current;
    setPending(true);
    try {
      const result = await fn();
      // A committed command should not wait for unrelated map/inbox refreshes.
      // Authentication waits only for the new player's initial state.
      if (result?.playerId) {
        refresher?.dispose();
        try {
          await resetAccountQueries(qc);
        } finally {
          // Same-player registration may finish without remounting this component.
          if (refresher && refreshRef.current === refresher)
            refreshRef.current = createQueryRefresher(qc);
        }
      } else refresher?.request();
      flash(message);
      return true;
    } catch (e: any) {
      flash(e.message, true);
      return false;
    } finally {
      setPending(false);
    }
  }
  const command = (body: any, message: string) =>
    act(() => api(`/villages/${village.id}/command`, body), message);
  function navigate(p: string) {
    setPage(p);
    setMobile(false);
    setSelectedTarget(null);
  }
  if (!data)
    return (
      <>
        <div className="landing">
          <div className="landing-nav">
            <Brand />
            <button className="button light" onClick={() => setAuth('login')}>
              Sign in <ArrowRight size={16} />
            </button>
          </div>
          <div className="landing-content">
            <span className="eyebrow">
              <span className="dot gold" /> A PERSISTENT MEDIEVAL WORLD
            </span>
            <h1>
              Every kingdom
              <br />
              begins with
              <br />
              <em>one stronghold.</em>
            </h1>
            <p>
              Raise your banner. Fortify your keep. Muster your warband.
              <br />
              Your story in the Crownlands is waiting to be written.
            </p>
            <div className="landing-actions">
              <button
                className="button primary large"
                disabled={pending || state.isPending || stateUnavailable}
                onClick={() => act(() => api('/auth/guest', {}), 'Welcome to the Crownlands')}
              >
                {state.isPending
                  ? 'Connecting…'
                  : pending
                    ? 'Preparing your keep…'
                    : 'Enter the Crownlands'}
                <ArrowRight size={18} />
              </button>
              <button className="text-button" onClick={() => setAuth('register')}>
                Create an account
              </button>
            </div>
            <div className="landing-details">
              <span>
                <ShieldCheck size={16} /> No pay to win
              </span>
              <span>
                <Clock size={16} /> A world that keeps moving
              </span>
              <span>
                <Users size={16} /> Better together
              </span>
            </div>
            {stateUnavailable && (
              <div className="query-feedback" role="alert">
                <p>Could not load your world. Try again.</p>
                <button
                  className="button"
                  disabled={state.isFetching}
                  onClick={() => void state.refetch()}
                >
                  {state.isFetching ? 'Retrying…' : 'Try again'}
                </button>
              </div>
            )}
          </div>
          <div className="landing-art">
            <VillageScene levels={{ main: 5 }} onBuilding={() => {}} />
          </div>
          <div className="landing-footer">
            WARBAND <span>Build something worth defending.</span>
            <small>LOCAL WORLD · ACCELERATED TIMERS</small>
          </div>
        </div>
        {auth && (
          <Auth
            mode={auth}
            setMode={setAuth}
            close={() => setAuth(null)}
            act={act}
            pending={pending}
          />
        )}
        <Toast toast={toast} />
      </>
    );
  if (!village)
    return (
      <main className="restart">
        <Brand />
        <Empty icon={Flag} title="A new chapter awaits">
          Your last village has been conquered. Settle again and rebuild your warband.
        </Empty>
        <button
          className="button primary"
          disabled={pending}
          onClick={() => act(() => api('/restart', {}), 'Your new village is ready')}
        >
          {pending ? 'Settling your village…' : 'Settle a new village'}
        </button>
        <Toast toast={toast} />
      </main>
    );
  const localEvents = data.events.filter((e: any) => e.village_id === village.id);
  const builds = localEvents.filter((e: any) => e.kind === 'build');
  const recruits = localEvents.filter((e: any) => e.kind === 'recruit');
  const outgoing = data.events.filter(
    (e: any) => e.payload.origin === village.id && e.kind === 'movement',
  );
  const incoming = localEvents.filter((e: any) => e.kind === 'movement');
  const score = data.villages.reduce((s: number, v: any) => s + v.points, 0);
  const pop = population(village.state);
  const activeTitle =
    navigation.find((n) => n[0] === page)?.[1] ||
    (page === 'simulator'
      ? 'Battle simulator'
      : page === 'admin'
        ? 'Administration'
        : 'Village settings');
  return (
    <div className="app-shell">
      <aside
        id="campaign-navigation"
        ref={navigationRef}
        aria-label="Campaign navigation"
        className={'sidebar ' + (mobile ? 'open' : '')}
      >
        <Brand />
        <div className="world-selector">
          <span className="world-emblem">
            <Compass size={21} />
          </span>
          <span>
            <b>The Crownlands</b>
            <small>
              World 1 <span className="dot green" /> Open world
            </small>
          </span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">YOUR CAMPAIGN</div>
        <nav>
          {navigation.map(([id, label, Component], i) => (
            <button
              key={id}
              aria-label={label}
              aria-current={page === id ? 'page' : undefined}
              className={(page === id ? 'active ' : '') + (i === 6 ? 'nav-separated' : '')}
              onClick={() => navigate(id)}
            >
              <Component size={19} strokeWidth={1.65} />
              <span>{label}</span>
              {id === 'reports' && data.unread > 0 && <b className="nav-count">{data.unread}</b>}
              {id === 'commands' && outgoing.length > 0 && (
                <b className="nav-count neutral">{outgoing.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {data.player.is_admin && (
            <button onClick={() => navigate('admin')}>
              <Shield size={18} /> Administration
            </button>
          )}
          <button onClick={() => navigate('simulator')}>
            <Target size={18} />
            Battle simulator
          </button>
          <button onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            Field guide
            <ArrowUpRight size={14} />
          </button>
          <div className="world-status">
            <span className={'dot ' + (connected ? 'green' : 'gold')} />
            {connected ? 'World is live' : 'Reconnecting to world'}
            <span>{data.config.speed}×</span>
          </div>
          <button
            className="profile"
            onClick={() => (!data.player.user_id ? setAuth('register') : navigate('settings'))}
          >
            <span className="avatar">{data.player.name.slice(0, 1)}</span>
            <span>
              <b>{data.player.name}</b>
              <small>
                {data.player.user_id ? 'Lord of ' + village.name : 'Guest · Save your progress'}
              </small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell" inert={mobile || undefined}>
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            ref={menuRef}
            aria-label="Open navigation"
            aria-expanded={mobile}
            aria-controls="campaign-navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="village-switch">
            <Castle size={22} />
            <select
              aria-label="Current village"
              value={village.id}
              onChange={(e) => setSelectedId(Number(e.target.value))}
            >
              {data.villages.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <span>
              {village.x}|{village.y}{' '}
              <small>
                K{Math.floor(village.y / 100)}
                {Math.floor(village.x / 100)}
              </small>
            </span>
          </div>
          <div className="resource-bar">
            {resources.map((r) => (
              <div
                className="resource-stat"
                key={r}
                title={`${format(production(village.state.buildings[r], data.config.speed))} per hour · Capacity ${format(capacity(village.state.buildings.storage))}`}
              >
                <ResourceIcon type={r} />
                <div>
                  <b>
                    {format(
                      Math.min(
                        capacity(village.state.buildings.storage),
                        village.state.resources[r] +
                          (Math.max(0, now - village.state.updatedAt) / 3600000) *
                            production(village.state.buildings[r], data.config.speed),
                      ),
                    )}
                  </b>
                  <small>{r}</small>
                </div>
              </div>
            ))}
            <div className="resource-stat population">
              <Users size={18} />
              <div>
                <b>
                  {format(pop)}
                  <em> / {format(farmCapacity(village.state.buildings.farm))}</em>
                </b>
                <small>Population</small>
              </div>
            </div>
          </div>
          <button
            className="notification icon-button"
            aria-label="View reports"
            onClick={() => navigate('reports')}
          >
            <Bell size={20} />
            {data.unread > 0 && <i />}
          </button>
        </header>
        <main className="content">
          <div className="breadcrumb">
            The Crownlands <ChevronRight size={12} /> {village.name} <ChevronRight size={12} />{' '}
            <span>{activeTitle}</span>
          </div>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === 'overview' ? 'YOUR HOME. YOUR LEGACY.' : 'THE CROWNLANDS · WORLD 1'}
              </div>
              <h1>
                {page === 'overview' ? village.name : activeTitle}
                <span className="heading-flourish" aria-hidden="true">
                  {page === 'overview' ? '✦' : ''}
                </span>
              </h1>
              <p>
                {page === 'overview'
                  ? 'A quiet village today. The heart of an empire tomorrow.'
                  : (
                      {
                        buildings: 'Lay the foundations for everything that comes next.',
                        barracks: 'A strong village needs a stronger warband.',
                        map: 'Beyond the tree line, a world of opportunity awaits.',
                        commands: 'Every march has a purpose. Keep an eye on yours.',
                        reports: 'News from your village and the front lines.',
                        tribe: 'Find your people. Stand for something together.',
                        messages: 'A few words can change the course of a world.',
                        rankings: 'Those who are leaving their mark on the Crownlands.',
                        simulator: 'Plan your next battle before committing your troops.',
                        settings: 'Make this corner of the world your own.',
                      } as any
                    )[page]}
              </p>
            </div>
            <div className="heading-meta">
              <span>
                <ShieldCheck size={16} /> Loyalty <b>{Math.floor(village.state.loyalty)}%</b>
              </span>
              <span>
                <Trophy size={16} />
                <b>{format(score)}</b> points
              </span>
            </div>
          </div>
          {page === 'overview' && (
            <>
              <div className="welcome-banner">
                <div className="banner-icon">
                  <Flag size={24} strokeWidth={1.4} />
                </div>
                <div>
                  <h3>Your next chapter starts here</h3>
                  <p>
                    Grow your village, strengthen your army, and make your mark on the Crownlands.
                  </p>
                </div>
                <button className="text-button" onClick={() => setHelp(true)}>
                  Open field guide <ArrowRight size={16} />
                </button>
              </div>
              <div className="overview-grid">
                <section className="panel village-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>
                        <Castle size={17} />
                        Your village
                      </h3>
                      <span className="subtle">
                        {Object.values(village.state.buildings).filter((n: any) => n > 0).length}{' '}
                        buildings · {format(village.points)} points
                      </span>
                    </div>
                    <button className="text-button" onClick={() => navigate('buildings')}>
                      Manage buildings <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="village-art">
                    <VillageScene levels={village.state.buildings} onBuilding={setBuilding} />
                    <span className="scene-caption">
                      <span className="dot green" /> A new day in {village.name}
                    </span>
                    <span className="scene-hint">Select a building to manage it</span>
                  </div>
                  <div className="village-footer">
                    <span>
                      <Compass size={16} />
                      {village.x} | {village.y}{' '}
                      <em>
                        Continent {Math.floor(village.y / 100)}
                        {Math.floor(village.x / 100)}
                      </em>
                    </span>
                    <button className="text-button" onClick={() => navigate('map')}>
                      Explore world map <ArrowRight size={15} />
                    </button>
                  </div>
                </section>
                <div className="overview-aside">
                  <section className="panel">
                    <div className="panel-heading">
                      <h3>
                        <Hammer size={17} />
                        Construction
                      </h3>
                      <span className="pill">
                        {builds.length} / {data.config.maxQueue}
                      </span>
                    </div>
                    {builds.length ? (
                      <Queue
                        events={builds}
                        now={now}
                        cancel={(id) =>
                          command(
                            { action: 'cancelBuild', eventId: id },
                            'Construction cancelled and resources refunded',
                          )
                        }
                      />
                    ) : (
                      <div className="queue-empty">
                        <span className="round-icon">
                          <Hammer size={23} strokeWidth={1.3} />
                        </span>
                        <b>Your builders are ready</b>
                        <p>
                          A stronger village starts
                          <br />
                          with the next stone.
                        </p>
                      </div>
                    )}
                    <div className="panel-padding">
                      <button className="button outline full" onClick={() => navigate('buildings')}>
                        <Plus size={16} />
                        Upgrade a building
                      </button>
                    </div>
                  </section>
                  <section className="panel recruitment-card">
                    <div className="panel-heading">
                      <h3>
                        <Swords size={17} />
                        Recruitment
                      </h3>
                      {recruits.length > 0 && <span className="pill">{recruits.length}</span>}
                    </div>
                    <div className="compact-status">
                      <span className="round-icon">
                        <Shield size={22} strokeWidth={1.3} />
                      </span>
                      <div>
                        <b>{recruits.length ? 'Your warband is growing' : 'Rally your warband'}</b>
                        <p>
                          {recruits.length
                            ? `${definition(units, recruits[0].payload.unit).name} ready in ${duration(new Date(recruits[0].due_at).getTime() - now)}`
                            : 'Train troops to defend and conquer.'}
                        </p>
                      </div>
                    </div>
                    <div className="panel-padding">
                      <button className="text-button" onClick={() => navigate('barracks')}>
                        Visit the barracks <ArrowRight size={16} />
                      </button>
                    </div>
                  </section>
                </div>
              </div>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h3>
                      <Swords size={17} />
                      Your warband
                    </h3>
                    <button className="text-button" onClick={() => navigate('barracks')}>
                      Manage troops <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="troop-summary">
                    {['spear', 'sword', 'axe', 'scout', 'light'].map((u, i) => (
                      <div key={u}>
                        <span className={'unit-medallion unit-' + i}>
                          {i === 3 ? (
                            <Compass />
                          ) : i === 4 ? (
                            <Flag />
                          ) : i === 2 ? (
                            <Axe />
                          ) : i === 1 ? (
                            <Swords />
                          ) : (
                            <Shield />
                          )}
                        </span>
                        <strong>{format(village.state.units[u] || 0)}</strong>
                        <small>
                          {definition(units, u).name}
                          {u === 'light' ? '' : 's'}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="quiet-footer">
                    <span className="dot green" />
                    {format(
                      Object.values(village.state.units).reduce((s: number, n: any) => s + n, 0),
                    )}{' '}
                    troops stationed at home
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h3>
                      <Flag size={17} />
                      Movements
                    </h3>
                    <span className="pill">{outgoing.length + incoming.length}</span>
                  </div>
                  {outgoing.length + incoming.length ? (
                    <div className="movement-preview">
                      {[...incoming, ...outgoing].slice(0, 3).map((e: any) => (
                        <div key={e.id}>
                          <Swords size={17} />
                          <span>
                            <b>
                              {e.payload.kind} · {e.payload.targetName || village.name}
                            </b>
                            <small>{duration(new Date(e.due_at).getTime() - now)} to arrival</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="compact-status calm">
                      <span className="round-icon">
                        <Leaf size={24} strokeWidth={1.3} />
                      </span>
                      <div>
                        <b>All is quiet at the gates</b>
                        <p>No incoming or outgoing commands.</p>
                      </div>
                    </div>
                  )}
                  <div className="panel-padding">
                    <button className="text-button" onClick={() => navigate('map')}>
                      Plan your next move <ArrowRight size={16} />
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
          {page === 'buildings' && (
            <>
              <div className="section-toolbar">
                <span>
                  <Hammer size={17} />
                  {builds.length} of {data.config.maxQueue} construction slots used
                </span>
                <span>Warehouse capacity: {format(capacity(village.state.buildings.storage))}</span>
              </div>
              {builds.length > 0 && (
                <section className="panel queue-strip">
                  <Queue
                    events={builds}
                    now={now}
                    cancel={(id) =>
                      command(
                        { action: 'cancelBuild', eventId: id },
                        'Construction cancelled and refunded',
                      )
                    }
                  />
                </section>
              )}
              <div className="building-grid">
                {Object.entries(buildings).map(([key, b]) => {
                  const level = village.state.buildings[key] || 0;
                  const queued = builds.filter((e: any) => e.payload.building === key);
                  const next = queued.at(-1)?.payload.level ?? level;
                  const price = buildingCost(key, next);
                  const requirements = Object.entries(b.requires || {}).filter(
                    ([k, l]) => (village.state.buildings[k] || 0) < l,
                  );
                  const reason = requirements.length
                    ? requirements
                        .map(([k, l]) => `${definition(buildings, k).name} ${l}`)
                        .join(', ')
                    : next >= b.max
                      ? 'Maximum level'
                      : builds.length >= data.config.maxQueue
                        ? 'Queue full'
                        : resources.some((r) => price[r] > village.state.resources[r])
                          ? 'Not enough resources'
                          : null;
                  return (
                    <section className="panel building-card" key={key}>
                      <div className="building-card-top">
                        <span className={'building-emblem ' + key}>
                          <Icon name={key} size={29} />
                        </span>
                        <span className="level-badge">
                          Level {level}
                          {queued.length ? ` → ${next}` : ''}
                        </span>
                      </div>
                      <h3>{b.name}</h3>
                      <p>{b.description}</p>
                      <div className="building-cost">
                        <Cost cost={price} />
                        <span>
                          <Clock size={13} />
                          {duration(
                            buildDuration(key, next, village.state.buildings.main, data.config),
                          )}
                        </span>
                      </div>
                      <button
                        className="button outline full"
                        disabled={!!reason || pending}
                        onClick={() =>
                          command(
                            { action: 'build', building: key },
                            `${b.name} added to construction queue`,
                          )
                        }
                      >
                        {reason || (
                          <>
                            <Plus size={15} />
                            {level ? 'Upgrade to level ' + (next + 1) : 'Construct building'}
                          </>
                        )}
                      </button>
                    </section>
                  );
                })}
              </div>
            </>
          )}
          {page === 'barracks' && (
            <>
              <div className="stats-row">
                <Stat
                  icon={Users}
                  label="Troops at home"
                  value={format(
                    Object.values(village.state.units).reduce((s: number, n: any) => s + n, 0),
                  )}
                />
                <Stat
                  icon={Wheat}
                  label="Population available"
                  value={format(Math.max(0, farmCapacity(village.state.buildings.farm) - pop))}
                />
                <Stat icon={Clock} label="In training" value={format(recruits.length)} />
              </div>
              {recruits.length > 0 && (
                <section className="panel training-summary">
                  <Clock size={18} />
                  <div>
                    <b>Training in progress</b>
                    <p>
                      {Object.entries(
                        recruits.reduce(
                          (a: any, e: any) => ({
                            ...a,
                            [e.payload.unit]: (a[e.payload.unit] || 0) + 1,
                          }),
                          {},
                        ),
                      )
                        .map(([k, n]) => `${n} ${definition(units, k).name.toLowerCase()}`)
                        .join(' · ')}
                    </p>
                  </div>
                  <span>Next unit in {duration(new Date(recruits[0].due_at).getTime() - now)}</span>
                </section>
              )}
              <section className="panel">
                <div className="panel-heading">
                  <h3>Recruit your army</h3>
                  <span className="subtle">
                    Each unit joins your village as soon as training finishes.
                  </span>
                </div>
                <div className="unit-grid">
                  {Object.entries(units).map(([key, u]) => (
                    <RecruitCard
                      key={key}
                      unitKey={key}
                      village={village}
                      config={data.config}
                      command={command}
                      pending={pending}
                    />
                  ))}
                </div>
              </section>
              {data.stationed.length > 0 && (
                <section className="panel spaced">
                  <div className="panel-heading">
                    <h3>Support stationed abroad</h3>
                  </div>
                  {data.stationed.map((s: any) => (
                    <div className="list-row" key={s.targetId}>
                      <div>
                        <b>{s.targetName}</b>
                        <p>
                          {Object.entries(s.units)
                            .filter(([, n]) => Number(n) > 0)
                            .map(([k, n]) => `${n} ${definition(units, k).name}`)
                            .join(', ')}
                        </p>
                      </div>
                      <button
                        className="button outline"
                        onClick={() =>
                          command(
                            { action: 'withdraw', targetId: s.targetId },
                            'Your support has been called home',
                          )
                        }
                      >
                        Recall support
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {page === 'map' && (
            <>
              <WorldMap
                config={data.config}
                own={village}
                onSelect={setSelectedTarget}
                selected={selectedTarget}
              />
              {selectedTarget && (
                <TargetPanel
                  target={selectedTarget}
                  village={village}
                  config={data.config}
                  command={command}
                  pending={pending}
                  close={() => setSelectedTarget(null)}
                />
              )}
            </>
          )}
          {page === 'commands' && (
            <section className="panel">
              <div className="panel-heading">
                <h3>Active movements</h3>
                <button className="button outline" onClick={() => navigate('map')}>
                  <Plus size={15} />
                  New command
                </button>
              </div>
              {data.events.filter((e: any) =>
                ['movement', 'return', 'market', 'merchantReturn', 'withdraw'].includes(e.kind),
              ).length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Mission</th>
                        <th>Route</th>
                        <th>Troops / cargo</th>
                        <th>Arrival</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.events
                        .filter((e: any) =>
                          ['movement', 'return', 'market', 'merchantReturn', 'withdraw'].includes(
                            e.kind,
                          ),
                        )
                        .map((e: any) => (
                          <tr key={e.id}>
                            <td>
                              <span
                                className={
                                  'status-badge ' + (e.payload.kind === 'attack' ? 'red' : '')
                                }
                              >
                                <Flag size={13} />
                                {e.kind === 'merchantReturn'
                                  ? 'Merchants returning'
                                  : e.payload.kind || e.kind}
                              </span>
                            </td>
                            <td>
                              {e.payload.originName || 'Your warband'}
                              <ArrowRight size={12} />
                              {e.payload.targetName ||
                                (['return', 'merchantReturn'].includes(e.kind)
                                  ? village.name
                                  : 'Destination')}
                            </td>
                            <td>
                              {e.payload.units ? (
                                Object.entries(e.payload.units)
                                  .filter(([, n]) => Number(n) > 0)
                                  .map(([k, n]) => `${n} ${definition(units, k).name}`)
                                  .join(', ')
                              ) : e.payload.resources ? (
                                <Cost cost={e.payload.resources} />
                              ) : (
                                <span className="subtle">Unknown</span>
                              )}
                            </td>
                            <td>
                              <b>{duration(new Date(e.due_at).getTime() - now)}</b>
                              <small>{new Date(e.due_at).toLocaleTimeString()}</small>
                            </td>
                            <td>
                              {e.kind === 'movement' &&
                                e.payload.origin === village.id &&
                                now - e.payload.sent < data.config.cancelSeconds * 1000 && (
                                  <button
                                    className="text-button danger"
                                    disabled={pending}
                                    onClick={() =>
                                      command(
                                        { action: 'cancelMovement', eventId: e.id },
                                        'Movement cancelled. Troops are returning home.',
                                      )
                                    }
                                  >
                                    Recall
                                  </button>
                                )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon={Flag} title="Your banners are at rest">
                  Select a village on the world map to send a raid, scout or support mission.
                </Empty>
              )}
            </section>
          )}
          {page === 'reports' && <Reports act={act} />}
          {page === 'tribe' && (
            <>
              <Tribes player={data.player} act={act} pending={pending} />
              <TribeMembers player={data.player} act={act} pending={pending} />
            </>
          )}
          {page === 'messages' && <Messages player={data.player} act={act} pending={pending} />}
          {page === 'rankings' && <Rankings playerId={data.player.id} />}
          {page === 'simulator' && <Simulator village={village} />}
          {page === 'admin' && data.player.is_admin && <Admin act={act} pending={pending} />}
          {page === 'settings' && (
            <section className="panel settings-panel">
              <div className="panel-heading">
                <h3>Village & account</h3>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  command({ action: 'rename', name: f.get('name') }, 'Village renamed');
                }}
              >
                <label>
                  Village name
                  <input
                    key={village.id}
                    name="name"
                    defaultValue={village.name}
                    minLength={3}
                    maxLength={32}
                    required
                  />
                </label>
                <button className="button primary" disabled={pending}>
                  Save village name
                </button>
              </form>
              <PushSettings act={act} />
              <div className="settings-account">
                <h3>{data.player.name}</h3>
                <p>
                  {data.player.user_id
                    ? 'Your campaign is saved to your account.'
                    : 'Create an account to keep access to this village after your guest session expires.'}
                </p>
                {!data.player.user_id && (
                  <button className="button outline" onClick={() => setAuth('register')}>
                    Save your campaign
                  </button>
                )}
                <button
                  className="text-button danger"
                  disabled={pending}
                  onClick={async () => {
                    if (await act(() => api('/auth/logout', {}), 'Signed out')) {
                      qc.clear();
                      location.assign('/');
                    }
                  }}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </section>
          )}
          <footer className="content-footer">
            <span>
              <Shield size={13} /> WARBAND <i>·</i> The Crownlands
            </span>
            <span>
              {new Date(now).toLocaleTimeString('en-GB')} server time <i>·</i> {data.config.speed}×
              world speed
            </span>
          </footer>
        </main>
      </div>
      {building && (
        <Modal title={definition(buildings, building).name} close={() => setBuilding(null)}>
          <div className="building-dialog">
            <span className="building-emblem">
              <Icon name={building} size={40} />
            </span>
            <span className="level-badge">Level {village.state.buildings[building] || 0}</span>
            <p>{definition(buildings, building).description}</p>
            <Cost
              cost={buildingCost(
                building,
                builds.filter((e: any) => e.payload.building === building).at(-1)?.payload.level ??
                  village.state.buildings[building] ??
                  0,
              )}
            />
            <button
              className="button primary full"
              disabled={pending}
              onClick={async () => {
                if (
                  await command(
                    { action: 'build', building },
                    'Building added to the construction queue',
                  )
                )
                  setBuilding(null);
              }}
            >
              <Hammer size={17} />
              Queue upgrade
            </button>
            <button
              className="text-button"
              onClick={() => {
                setBuilding(null);
                navigate('buildings');
              }}
            >
              View all buildings <ArrowRight size={14} />
            </button>
          </div>
        </Modal>
      )}
      {auth && (
        <Auth
          mode={auth}
          setMode={setAuth}
          close={() => setAuth(null)}
          act={act}
          pending={pending}
        />
      )}{' '}
      {help && (
        <Modal title="The field guide" close={() => setHelp(false)}>
          <div className="guide">
            <span className="eyebrow">YOUR FIRST DAYS IN THE CROWNLANDS</span>
            <h2>Build something worth defending.</h2>
            {[
              [
                '1',
                'Lay your foundations',
                'Upgrade your timber camp, clay pit and iron mine. Keep your warehouse and farm growing alongside them.',
              ],
              [
                '2',
                'Rally a warband',
                'Train troops in the barracks. Spearmen hold the line; axemen and light cavalry make excellent raiders.',
              ],
              [
                '3',
                'Know your neighbors',
                'Open the world map and send scouts before an attack. Abandoned villages are a good place to begin.',
              ],
              [
                '4',
                'Bring your people together',
                'Join a tribe, share plans in its forum, and send support when an ally needs you.',
              ],
              [
                '5',
                'Grow your realm',
                'Build an academy and train noblemen. Successful attacks with a surviving noble lower loyalty. At zero, the village is yours.',
              ],
            ].map(([n, t, d]) => (
              <div className="guide-step" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </div>
            ))}
            <div className="info-note">
              <Zap size={18} />
              This local world runs at {data.config.speed}× speed. Buildings and armies keep
              progressing while you are away. Guest access depends on this browser; create an
              account to preserve access.
            </div>
          </div>
        </Modal>
      )}
      <Toast toast={toast} />
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <img src="/crest.svg" alt="Warband crest" />
      <div>
        WARBAND<small>WRITE YOUR LEGACY</small>
      </div>
    </div>
  );
}
function Toast({ toast }: { toast: any }) {
  return (
    <div aria-live={toast?.error ? 'assertive' : 'polite'} aria-atomic="true">
      {toast && (
        <div
          className={'toast ' + (toast.error ? 'error' : '')}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <CircleHelp size={19} /> : <Check size={19} />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
function Stat({
  icon: Component,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <section className="panel stat-card">
      <span className="round-icon">
        <Component />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </section>
  );
}
function Queue({
  events,
  now,
  cancel,
}: {
  events: any[];
  now: number;
  cancel: (id: number) => void;
}) {
  const { buildings, units, buildingCost, capacity, farmCapacity, population, production, battle } =
    useGameRules();
  return (
    <div className="queue-list">
      {events.map((e, i) => (
        <div className="queue-item" key={e.id}>
          <span className="queue-icon">
            <Icon name={e.payload.building} />
          </span>
          <div>
            <b>{definition(buildings, e.payload.building).name}</b>
            <small>
              Level {e.payload.level} <span>·</span> {duration(new Date(e.due_at).getTime() - now)}
            </small>
            {i === 0 && (
              <div className="progress">
                <span
                  style={{
                    width:
                      Math.max(
                        0,
                        Math.min(
                          100,
                          ((now - e.payload.start) /
                            (new Date(e.due_at).getTime() - e.payload.start)) *
                            100,
                        ),
                      ) + '%',
                  }}
                />
              </div>
            )}
          </div>
          <button
            className="icon-button"
            aria-label={`Cancel ${definition(buildings, e.payload.building).name} and following upgrades`}
            title="Cancel this and all following upgrades; resources refunded"
            onClick={() => cancel(e.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
function RecruitCard({ unitKey, village, config, command, pending }: any) {
  const { buildings, units, buildingCost, capacity, farmCapacity, population, production, battle } =
    useGameRules();
  const u = definition(units, unitKey);
  const [count, setCount] = useState(1);
  const locked = (village.state.buildings[u.building] || 0) < u.level;
  const max = Math.max(
    0,
    Math.min(
      1000,
      ...resources.map((r) => Math.floor(village.state.resources[r] / u.cost[r])),
      Math.floor(
        (farmCapacity(village.state.buildings.farm) - population(village.state)) / u.population,
      ),
    ),
  );
  return (
    <div className="recruit-card">
      <div className="recruit-card-title">
        <span className="unit-medallion">
          <Swords size={25} />
        </span>
        <div>
          <h3>{u.name}</h3>
          <span>{format(village.state.units[unitKey] || 0)} at home</span>
        </div>
        <span className="pill">
          <Users size={12} />
          {u.population}
        </span>
      </div>
      <p>{u.description}</p>
      <div className="unit-attributes">
        <span>
          <Swords size={13} />
          {u.attack} attack
        </span>
        <span>
          <Shield size={13} />
          {u.defense} defense
        </span>
        <span>
          <Clock size={13} />
          {duration(recruitDuration(unitKey, village.state.buildings[u.building] || 0, config))}
        </span>
      </div>
      <Cost cost={u.cost} />
      <div className="recruit-controls">
        <input
          type="number"
          aria-label={`${u.name} quantity`}
          min="1"
          max="1000"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <button className="text-button" disabled={!max} onClick={() => setCount(max)}>
          Max {max}
        </button>
        <button
          className="button primary"
          disabled={locked || pending || count < 1 || count > max}
          onClick={() =>
            command(
              { action: 'recruit', unit: unitKey, count },
              `${count} ${u.name.toLowerCase()} queued for training`,
            )
          }
        >
          Recruit
        </button>
      </div>
      {locked && (
        <small className="requirement">
          Requires {definition(buildings, u.building).name} level {u.level}
        </small>
      )}
    </div>
  );
}
function Auth({ mode, setMode, close, act, pending }: any) {
  return (
    <Modal title={mode === 'register' ? 'Begin your legacy' : 'Welcome back'} close={close}>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          if (
            await act(
              () => api('/auth/' + mode, f),
              mode === 'register'
                ? 'Your campaign is saved. Welcome to Warband.'
                : 'Welcome back to your village',
            )
          )
            close();
        }}
      >
        <p>
          {mode === 'register'
            ? 'Create an account to save your campaign and return to your village from any browser.'
            : 'Your village has been waiting for you.'}
        </p>
        {mode === 'register' && (
          <label>
            Player name
            <input
              name="name"
              autoComplete="nickname"
              minLength={3}
              maxLength={24}
              placeholder="Your name in the Crownlands"
              required
            />
          </label>
        )}
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={10}
            maxLength={128}
            placeholder="At least 10 characters"
            required
          />
        </label>
        <button className="button primary full" disabled={pending}>
          {pending ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
        >
          {mode === 'register'
            ? 'Already have an account? Sign in'
            : 'New to the Crownlands? Create an account'}
        </button>
        <a href="/?recover=1">Forgot your password?</a>
        <p className="subtle">
          By playing, you agree to the <a href="/?legal=terms">game rules and terms</a>. Read our{' '}
          <a href="/?legal=privacy">privacy notice</a>.
        </p>
      </form>
    </Modal>
  );
}
function TargetPanel({ target, village, config, command, pending, close }: any) {
  const { buildings, units, buildingCost, capacity, farmCapacity, population, production, battle } =
    useGameRules();
  const [kind, setKind] = useState('scout');
  const [army, setArmy] = useState<Army>({});
  const [cargo, setCargo] = useState({ wood: 0, clay: 0, iron: 0 });
  const [catapultTarget, setCatapultTarget] = useState('main');
  const [confirm, setConfirm] = useState(false);
  const distance = Math.hypot(target.x - village.x, target.y - village.y);
  const hasArmy = Object.values(army).some((n) => n > 0);
  const merchants = Math.max(
      0,
      (village.state.buildings.market || 0) - (village.state.merchantsAway || 0),
    ),
    cargoTotal = Object.values(cargo).reduce((a, b) => a + b, 0);
  return (
    <Modal title={target.name} close={close}>
      <div className="target-header">
        <span className="building-emblem">
          <Castle size={33} />
        </span>
        <div>
          <h3>{target.player_name || 'Abandoned village'}</h3>
          <p>
            {target.x}|{target.y} · {distance.toFixed(1)} fields away · {format(target.points)}{' '}
            points
          </p>
        </div>
      </div>
      {target.id === village.id ? (
        <Empty icon={House} title="Home, sweet home">
          This is your current village. Choose a neighbor to send a command.
        </Empty>
      ) : (
        <>
          <div className="tabs">
            {['scout', 'attack', 'support', ...(config.features.market ? ['market'] : [])].map(
              (k) => (
                <button
                  key={k}
                  className={kind === k ? 'active' : ''}
                  onClick={() => {
                    setKind(k);
                    setArmy({});
                    setConfirm(false);
                  }}
                >
                  {k === 'market' ? 'Resources' : k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ),
            )}
          </div>
          {kind === 'market' ? (
            <>
              <p>
                {merchants} of {village.state.buildings.market || 0} merchants available. Each
                carries {format(config.economy.merchantCapacity)} resources and returns after the
                round trip.
              </p>
              {resources.map((r) => (
                <label key={r} className="army-input">
                  <span>
                    <ResourceIcon type={r} />
                    {r}
                  </span>
                  <input
                    aria-label={`${r} to send`}
                    type="number"
                    min="0"
                    max={Math.floor(village.state.resources[r])}
                    value={cargo[r]}
                    onChange={(e) => setCargo({ ...cargo, [r]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </>
          ) : (
            <>
              <p className="subtle">
                {kind === 'scout'
                  ? 'Scouts reveal the village’s defenses without committing your main army.'
                  : kind === 'attack'
                    ? 'A successful raid brings resources home. Your troops may be lost in battle.'
                    : 'Support troops stay to defend this village until you recall them.'}
              </p>
              <div className="army-inputs">
                {Object.entries(units)
                  .filter(([k]) => kind !== 'scout' || k === 'scout')
                  .map(([k, u]) => (
                    <label key={k} className="army-input">
                      <span>
                        {u.name}
                        <small>{format(village.state.units[k] || 0)} available</small>
                      </span>
                      <input
                        aria-label={`${u.name} to send`}
                        type="number"
                        min="0"
                        max={village.state.units[k] || 0}
                        value={army[k] || 0}
                        onChange={(e) => {
                          setArmy({ ...army, [k]: Number(e.target.value) });
                          setConfirm(false);
                        }}
                      />
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setArmy({ ...army, [k]: village.state.units[k] || 0 });
                          setConfirm(false);
                        }}
                      >
                        All
                      </button>
                    </label>
                  ))}
              </div>
              {(army.catapult || 0) > 0 && (
                <label>
                  Catapult target
                  <select
                    value={catapultTarget}
                    onChange={(e) => setCatapultTarget(e.target.value)}
                  >
                    {Object.entries(buildings).map(([k, b]) => (
                      <option key={k} value={k}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <div className="travel-preview">
            <Clock size={16} />
            <span>Travel time</span>
            <b>
              {hasArmy
                ? duration(travelTime(village, target, army, config))
                : kind === 'market'
                  ? duration(merchantTravelTime(village, target, config))
                  : 'Select units'}
            </b>
          </div>
          {confirm && (
            <div className="info-note">
              <Flag size={18} />
              Ready to send{' '}
              {kind === 'market'
                ? 'this caravan'
                : `${Object.values(army).reduce((s, n) => s + n, 0)} troops`}{' '}
              to {target.name} ({target.x}|{target.y})?
            </div>
          )}
          <button
            className="button primary full"
            disabled={
              pending ||
              (kind !== 'market' && !hasArmy) ||
              (kind === 'market' &&
                (cargoTotal <= 0 ||
                  Math.ceil(cargoTotal / config.economy.merchantCapacity) > merchants))
            }
            onClick={async () => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              const ok = await command(
                kind === 'market'
                  ? { action: 'market', targetId: target.id, resources: cargo }
                  : { action: 'movement', targetId: target.id, kind, units: army, catapultTarget },
                kind === 'market' ? 'Your caravan is on its way' : 'Your warband is on the march',
              );
              if (ok) close();
            }}
          >
            {confirm ? 'Confirm and send' : 'Review ' + (kind === 'market' ? 'shipment' : kind)}
            <ArrowRight size={16} />
          </button>
        </>
      )}
    </Modal>
  );
}
function Reports({ act }: any) {
  const [pages, setPages] = useState<(number | null)[]>([null]);
  const [archived, setArchive] = useState(false);
  const cursor = pages.at(-1) || null;
  const setArchived = (v: boolean) => {
    setArchive(v);
    setPages([null]);
  };
  const [selected, setSelected] = useState<any>(null);
  const [filter, setReportFilter] = useState('all');
  const setFilter = (value: string) => {
    setReportFilter(value);
    setPages([null]);
  };
  const q = useQuery({
    queryKey: ['reports', cursor, archived, filter],
    queryFn: () =>
      api(
        '/reports?archived=' +
          archived +
          (cursor ? '&cursor=' + cursor : '') +
          (filter === 'unread' ? '&unread=true' : filter === 'all' ? '' : '&kind=' + filter),
      ),
  });
  const rows = q.data?.reports || [];
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div className="tabs compact">
            {['all', 'unread', 'battle', 'scout', 'support'].map((f) => (
              <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All reports' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <span className="subtle">{rows.length} reports</span>
        </div>
        {q.isPending || q.isError ? (
          <QueryFeedback query={q} label="reports" />
        ) : rows.length ? (
          rows.map((r: any) => (
            <button
              className={'report-row ' + (!r.read ? 'unread' : '')}
              key={r.id}
              onClick={() => {
                setSelected(r);
                void act(() => api(`/reports/${r.id}/read`, {}), 'Report opened');
              }}
            >
              <span className={'report-icon ' + (r.subject.startsWith('Defeat') ? 'loss' : '')}>
                {r.kind === 'battle' ? (
                  <Swords size={20} />
                ) : r.kind === 'scout' ? (
                  <Compass size={20} />
                ) : r.kind === 'welcome' ? (
                  <Sparkles size={20} />
                ) : (
                  <Flag size={20} />
                )}
              </span>
              <span>
                <b>{r.subject}</b>
                <small>{r.kind[0].toUpperCase() + r.kind.slice(1)} report</small>
              </span>
              <time>{new Date(r.created_at).toLocaleString()}</time>
              {!r.read && <span className="dot gold" />}
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <Empty icon={BookOpen} title="No reports here yet">
            Your scouts and commanders will send news as your campaign unfolds.
          </Empty>
        )}
        <InboxTools
          kind="reports"
          cursor={cursor}
          next={q.data?.next_cursor}
          back={() => setPages((p) => p.slice(0, -1))}
          older={() => setPages((p) => [...p, q.data.next_cursor])}
          ids={q.data?.reports.map((r: any) => r.id) || []}
          act={act}
          archived={archived}
          setArchived={setArchived}
        />
      </section>
      {selected && (
        <Modal title={selected.subject} close={() => setSelected(null)}>
          <ReportDetail report={selected} />
        </Modal>
      )}
    </>
  );
}
function ReportDetail({ report: r }: any) {
  const { buildings, units, buildingCost, capacity, farmCapacity, population, production, battle } =
    useGameRules();
  const p = r.payload;
  return (
    <div className="report-detail">
      <span className="eyebrow">
        {r.kind.toUpperCase()} REPORT · {new Date(r.created_at).toLocaleString()}
      </span>
      {p.text && <p className="welcome-text">{p.text}</p>}
      {p.attacker && (
        <>
          <div className={'battle-result ' + (p.won ? 'victory' : 'defeat')}>
            <ShieldCheck size={34} />
            <h2>{p.won ? 'The attacker prevailed' : 'The village held its ground'}</h2>
            <p>
              {p.origin} → {p.target}
            </p>
          </div>
          <div className="battle-modifiers">
            <span>
              Luck <b>{(p.luck * 100).toFixed(1)}%</b>
            </span>
            <span>
              Morale <b>{Math.round(p.morale * 100)}%</b>
            </span>
            <span>
              Wall{' '}
              <b>
                {p.wallBefore} → {p.wallAfter}
              </b>
            </span>
          </div>
          <ArmyTable title="Attacking warband" before={p.attacker} after={p.attackingSurvivors} />
          <ArmyTable title="Village defenders" before={p.defender} after={p.defendingSurvivors} />
          {p.haul && (
            <div className="report-loot">
              <h3>Resources plundered</h3>
              <Cost cost={p.haul} />
            </div>
          )}
          {p.loyaltyHit > 0 && (
            <div className="info-note">
              <Crown size={20} />
              {p.conquered
                ? 'The village is now yours.'
                : `Loyalty reduced by ${p.loyaltyHit}. ${Math.floor(p.loyalty)} loyalty remains.`}
            </div>
          )}
        </>
      )}
      {p.scoutsSent !== undefined && (
        <p>
          <b>{p.success ? 'Your scouts returned with intelligence.' : 'No scouts returned.'}</b>
          <br />
          {p.scoutsLost} of {p.scoutsSent} scouts lost.
        </p>
      )}
      {p.resources && (
        <div className="report-loot">
          <h3>Resources</h3>
          <Cost cost={p.resources} />
        </div>
      )}
      {p.units && <ArmyTable title="Troops" before={p.units} />}{' '}
      {p.buildings && (
        <>
          <h3>Buildings</h3>
          <div className="intel-grid">
            {Object.entries(p.buildings).map(([k, n]) => (
              <span key={k}>
                {buildings[k]?.name || k}
                <b>Level {String(n)}</b>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function ArmyTable({ title, before, after }: { title: string; before: Army; after?: Army }) {
  const { buildings, units, buildingCost, capacity, farmCapacity, population, production, battle } =
    useGameRules();
  return (
    <div className="army-table">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>Unit</th>
            <th>{after ? 'Sent / present' : 'Count'}</th>
            {after && (
              <>
                <th>Lost</th>
                <th>Survived</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {Object.entries(before)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => (
              <tr key={k}>
                <td>{units[k]?.name || k}</td>
                <td>{format(n)}</td>
                {after && (
                  <>
                    <td className="danger">{format(n - (after[k] || 0))}</td>
                    <td>{format(after[k] || 0)}</td>
                  </>
                )}
              </tr>
            ))}
        </tbody>
      </table>
      {!Object.values(before).some((n) => n > 0) && <p className="subtle">No troops.</p>}
    </div>
  );
}
function Messages({ player, act, pending }: any) {
  const [pages, setPages] = useState<(number | null)[]>([null]);
  const [archived, setArchive] = useState(false);
  const cursor = pages.at(-1) || null;
  const setArchived = (v: boolean) => {
    setArchive(v);
    setPages([null]);
  };
  const q = useQuery({
    queryKey: ['messages', cursor, archived],
    queryFn: () => api('/messages?archived=' + archived + (cursor ? '&cursor=' + cursor : '')),
  });
  const [compose, setCompose] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h3>Your correspondence</h3>
          <button className="button primary" onClick={() => setCompose(true)}>
            <Plus size={15} />
            Write a message
          </button>
        </div>
        {q.isPending || q.isError ? (
          <QueryFeedback query={q} label="messages" />
        ) : q.data?.messages.length ? (
          q.data.messages.map((m: any) => (
            <button
              className="report-row"
              key={m.id}
              onClick={() => {
                setSelected(m);
                if (m.recipient_id === player.id)
                  void act(() => api(`/messages/${m.id}/read`, {}), 'Message opened');
              }}
            >
              <span className="report-icon">
                <Mail size={20} />
              </span>
              <span>
                <b>{m.subject}</b>
                <small>
                  {m.sender_id === player.id ? 'To ' + m.recipient : 'From ' + m.sender}
                </small>
              </span>
              <time>{new Date(m.created_at).toLocaleString()}</time>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <Empty icon={Mail} title="A quiet inbox">
            Introduce yourself to a neighbor or coordinate your next move with an ally.
          </Empty>
        )}
        <InboxTools
          kind="messages"
          cursor={cursor}
          next={q.data?.next_cursor}
          back={() => setPages((p) => p.slice(0, -1))}
          older={() => setPages((p) => [...p, q.data.next_cursor])}
          ids={q.data?.messages.map((r: any) => r.id) || []}
          act={act}
          archived={archived}
          setArchived={setArchived}
        />
      </section>
      {compose && (
        <Modal title="Send a raven" close={() => setCompose(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  () => api('/messages', Object.fromEntries(new FormData(e.currentTarget))),
                  'Your message has been delivered',
                )
              )
                setCompose(false);
            }}
          >
            <label>
              To
              <input name="recipient" required placeholder="Exact player name" />
            </label>
            <label>
              Subject
              <input
                name="subject"
                required
                maxLength={100}
                placeholder="A word from your neighbor"
              />
            </label>
            <label>
              Message
              <textarea
                name="body"
                required
                maxLength={4000}
                rows={6}
                placeholder="Write your message…"
              />
            </label>
            <button className="button primary full" disabled={pending}>
              Send message
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.subject} close={() => setSelected(null)}>
          <p className="subtle">
            {selected.sender} → {selected.recipient} ·{' '}
            {new Date(selected.created_at).toLocaleString()}
          </p>
          <p className="message-body">{selected.body}</p>
        </Modal>
      )}
    </>
  );
}
function Rankings({ playerId }: any) {
  const q = useQuery({ queryKey: ['rankings'], queryFn: () => api('/rankings') });
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>
          <Trophy size={18} />
          The lords of the Crownlands
        </h3>
        <span className="subtle">Ranked by completed building points</span>
      </div>
      <QueryFeedback query={q} label="rankings" />
      <div className="table-scroll">
        <table className="rankings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Tribe</th>
              <th>Villages</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.players.map((p: any, i: number) => (
              <tr key={p.id} className={p.id === playerId ? 'own-rank' : ''}>
                <td>
                  <span className={'rank rank-' + i}>{i < 3 ? <Crown size={18} /> : i + 1}</span>
                </td>
                <td>
                  <span className="small-avatar">{p.name[0]}</span>
                  <b>{p.name}</b>
                  {p.id === playerId && <span className="pill">You</span>}
                </td>
                <td>{p.tribe_tag ? <span className="tribe-tag">{p.tribe_tag}</span> : '—'}</td>
                <td>{p.villages}</td>
                <td>
                  <b>{format(p.points)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Tribes({ player, act, pending }: any) {
  const q = useQuery({ queryKey: ['tribes'], queryFn: () => api('/tribes') });
  const [create, setCreate] = useState(false);
  const [post, setPost] = useState(false);
  const [thread, setThread] = useState<number | null>(null);
  const my = q.data?.tribes.find((t: any) => t.id === player.tribe_id);
  return (
    <>
      {my ? (
        <>
          <div className="tribe-banner">
            <span className="tribe-crest">
              <Shield size={58} strokeWidth={1} />
              <b>{my.tag}</b>
            </span>
            <div>
              <span className="eyebrow">YOUR BANNER. YOUR PEOPLE.</span>
              <h2>{my.name}</h2>
              <p>{my.description}</p>
              <span>
                <Users size={15} />
                {my.members} members <i>·</i>{' '}
                {player.role === 'founder' ? 'You are the founder' : 'You are a member'}
              </span>
            </div>
            {player.role !== 'founder' && (
              <button
                className="button outline"
                onClick={() => act(() => api('/tribes/leave', {}), 'You have left the tribe')}
              >
                Leave tribe
              </button>
            )}
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h3>
                <MessageSquare size={18} />
                Tribe forum
              </h3>
              <button className="button primary" onClick={() => setPost(true)}>
                <Plus size={15} />
                New discussion
              </button>
            </div>
            {q.data?.threads.length ? (
              q.data.threads.map((t: any) => (
                <button className="report-row" key={t.id} onClick={() => setThread(t.id)}>
                  <span className="report-icon">
                    <MessageSquare size={20} />
                  </span>
                  <span>
                    <b>{t.title}</b>
                    <small>
                      {t.author} · {new Date(t.created_at).toLocaleDateString()}
                    </small>
                  </span>
                  <time>{t.replies} replies</time>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <Empty icon={MessageSquare} title="Gather around the war table">
                Start a discussion, share a plan, or introduce yourself to your tribe.
              </Empty>
            )}
          </section>
          {player.role === 'founder' && (
            <section className="panel spaced">
              <div className="panel-heading">
                <h3>Diplomacy</h3>
                <span className="subtle">Your tribe’s stance toward other banners</span>
              </div>
              {q.data.tribes
                .filter((t: any) => t.id !== my.id)
                .map((t: any) => (
                  <div className="list-row" key={t.id}>
                    <span>
                      <b>{t.name}</b> [{t.tag}]
                    </span>
                    <select
                      aria-label={`Diplomacy with ${t.name}`}
                      value={
                        q.data.diplomacy.find((d: any) => d.tribe_b === t.id)?.status || 'neutral'
                      }
                      onChange={(e) =>
                        act(
                          () => api('/tribes/diplomacy', { tribeId: t.id, status: e.target.value }),
                          'Diplomacy updated',
                        )
                      }
                    >
                      <option value="neutral">Neutral</option>
                      <option value="ally">Ally</option>
                      <option value="enemy">Enemy</option>
                    </select>
                  </div>
                ))}
            </section>
          )}
        </>
      ) : (
        <>
          <div className="welcome-banner">
            <span className="banner-icon">
              <Shield size={26} />
            </span>
            <div>
              <h3>No one builds a kingdom alone</h3>
              <p>Join an existing tribe or raise a new banner of your own.</p>
            </div>
            <button className="button primary" onClick={() => setCreate(true)}>
              <Plus size={15} />
              Found a tribe
            </button>
          </div>
          <div className="tribe-grid">
            {q.data?.tribes.map((t: any) => (
              <section className="panel tribe-card" key={t.id}>
                <span className="tribe-crest">
                  <Shield size={54} strokeWidth={1} />
                  <b>{t.tag}</b>
                </span>
                <h2>{t.name}</h2>
                <p>{t.description}</p>
                <span className="subtle">
                  <Users size={15} />
                  {t.members} members
                </span>
                <button
                  className="button outline full"
                  disabled={pending}
                  onClick={() => act(() => api(`/tribes/${t.id}/join`, {}), `You joined ${t.name}`)}
                >
                  Join tribe <ArrowRight size={16} />
                </button>
              </section>
            ))}
          </div>
        </>
      )}
      {create && (
        <Modal title="Raise your banner" close={() => setCreate(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  () => api('/tribes', Object.fromEntries(new FormData(e.currentTarget))),
                  'Your tribe has been founded',
                )
              )
                setCreate(false);
            }}
          >
            <label>
              Tribe name
              <input name="name" required minLength={3} maxLength={40} />
            </label>
            <label>
              Tag
              <input
                name="tag"
                required
                minLength={2}
                maxLength={6}
                pattern="[A-Za-z0-9]+"
                placeholder="2–6 letters or numbers"
              />
            </label>
            <label>
              About your tribe
              <textarea name="description" rows={4} maxLength={1000} />
            </label>
            <button className="button primary full" disabled={pending}>
              Found tribe <Flag size={16} />
            </button>
          </form>
        </Modal>
      )}
      {post && (
        <Modal title="Start a discussion" close={() => setPost(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  () => api('/tribes/forum', Object.fromEntries(new FormData(e.currentTarget))),
                  'Discussion posted',
                )
              )
                setPost(false);
            }}
          >
            <label>
              Title
              <input name="title" minLength={3} maxLength={100} required />
            </label>
            <label>
              Your message
              <textarea name="body" rows={6} maxLength={4000} required />
            </label>
            <button className="button primary full" disabled={pending}>
              Post discussion
            </button>
          </form>
        </Modal>
      )}
      {thread && (
        <ForumThread id={thread} close={() => setThread(null)} act={act} pending={pending} />
      )}
    </>
  );
}
function ForumThread({ id, close, act, pending }: any) {
  const q = useQuery({ queryKey: ['thread', id], queryFn: () => api(`/tribes/forum/${id}`) });
  return (
    <Modal title={q.data?.thread.title || 'Discussion'} close={close}>
      {q.data && (
        <>
          <div className="forum-post">
            <b>{q.data.thread.author}</b>
            <small>{new Date(q.data.thread.created_at).toLocaleString()}</small>
            <p>{q.data.thread.body}</p>
          </div>
          {q.data.posts.map((p: any) => (
            <div className="forum-post" key={p.id}>
              <b>{p.author}</b>
              <small>{new Date(p.created_at).toLocaleString()}</small>
              <p>{p.body}</p>
            </div>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = new FormData(form).get('body');
              if (await act(() => api(`/tribes/forum/${id}`, { body }), 'Reply posted'))
                form.reset();
            }}
          >
            <label>
              Your reply
              <textarea name="body" rows={3} maxLength={4000} required />
            </label>
            <button className="button primary" disabled={pending}>
              Post reply
            </button>
          </form>
        </>
      )}
    </Modal>
  );
}
function Simulator({ village }: any) {
  const { buildings, units, buildingCost, capacity, farmCapacity, population, production, battle } =
    useGameRules();
  const [attacker, setAttacker] = useState<Army>({ axe: 25, light: 8 });
  const [defender, setDefender] = useState<Army>({ spear: 35, sword: 20 });
  const [wall, setWall] = useState(2);
  const [result, setResult] = useState<any>(null);
  return (
    <div className="simulator">
      <div className="sim-columns">
        {[
          ['Attacking warband', attacker, setAttacker],
          ['Village defenders', defender, setDefender],
        ].map(([title, army, setter]: any) => (
          <section className="panel" key={title}>
            <div className="panel-heading">
              <h3>{title}</h3>
              {title === 'Attacking warband' && (
                <button
                  className="text-button"
                  onClick={() => setAttacker({ ...village.state.units })}
                >
                  Use home troops
                </button>
              )}
            </div>
            <div className="panel-padding">
              {Object.entries(units).map(([k, u]) => (
                <label className="army-input" key={k}>
                  <span>{u.name}</span>
                  <input
                    aria-label={`${title} ${u.name}`}
                    type="number"
                    min="0"
                    max="1000000"
                    value={army[k] || 0}
                    onChange={(e) =>
                      setter({
                        ...army,
                        [k]: Math.max(0, Math.min(1000000, Math.floor(Number(e.target.value)))),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="panel sim-controls">
        <label>
          Defender wall level
          <input
            type="number"
            min="0"
            max="20"
            value={wall}
            onChange={(e) => setWall(Math.max(0, Math.min(20, Number(e.target.value))))}
          />
        </label>
        <p className="subtle">
          Fixed seed · 100% morale. Live battles use their own luck roll and player morale.
        </p>
        <button
          className="button primary"
          onClick={() => setResult(battle(attacker, defender, wall, 7139))}
        >
          <Target size={17} />
          Simulate battle
        </button>
      </section>
      {result && (
        <section className="panel panel-padding">
          <ReportDetail
            report={{
              kind: 'simulation',
              created_at: Date.now(),
              payload: { ...result, origin: 'Attacking warband', target: 'Village defenders' },
            }}
          />
        </section>
      )}
    </div>
  );
}

export default function App() {
  const state = useQuery({
    queryKey: ['state'],
    queryFn: () => api('/state'),
    retry: false,
    refetchInterval: 10000,
  });
  return (
    <RulesContext.Provider value={state.data?.config || defaultConfig}>
      <AppContent key={state.data?.player.id ?? 'anonymous'} state={state} />
    </RulesContext.Provider>
  );
}
