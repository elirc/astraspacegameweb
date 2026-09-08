import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { Npcs } from './Npcs';
export function Admin({ act, pending }: { act: any; pending: boolean }) {
  const [eventCursor, setEventCursor] = useState(0);
  const [replayFrom, setReplayFrom] = useState(
    new Date(Date.now() - 86400000).toISOString().slice(0, 16),
  );
  const [replayTo, setReplayTo] = useState(new Date().toISOString().slice(0, 16));
  const [selected, setSelected] = useState<number[]>([]),
    [auditActor, setAuditActor] = useState(''),
    [auditAction, setAuditAction] = useState('');
  const [tab, setTab] = useState('config'),
    [source, setSource] = useState<string | null>(null),
    [reason, setReason] = useState(''),
    [preview, setPreview] = useState<any>(null),
    [search, setSearch] = useState(''),
    [villageId, setVillageId] = useState(''),
    [result, setResult] = useState<any>(null);
  const cfg = useQuery({ queryKey: ['admin', 'config'], queryFn: () => api('/admin/config') });
  const players = useQuery({
    queryKey: ['admin', 'players', search],
    queryFn: () => api('/admin/players?q=' + encodeURIComponent(search)),
    enabled: tab === 'players',
  });
  const audit = useQuery({
    queryKey: ['admin', 'audit', auditActor, auditAction],
    queryFn: () =>
      api(
        '/admin/audit?action=' +
          encodeURIComponent(auditAction) +
          (auditActor ? '&actor=' + auditActor : ''),
      ),
    enabled: tab === 'audit',
  });
  const events = useQuery({
    queryKey: ['admin', 'events', villageId, eventCursor],
    queryFn: () => api('/admin/events?villageId=' + villageId + '&cursor=' + eventCursor),
    refetchInterval: 5000,
    enabled: tab === 'events' && /^\d+$/.test(villageId),
  });
  const abuse = useQuery({
    queryKey: ['admin', 'abuse'],
    queryFn: () => api('/admin/abuse'),
    enabled: tab === 'abuse',
  });
  const configReady = Boolean(cfg.data?.config);
  const text =
    source ??
    (configReady
      ? JSON.stringify({ ...cfg.data.config, version: cfg.data.config.version + 1 }, null, 2)
      : '');
  return (
    <section className="panel admin-panel">
      <div className="panel-heading">
        <h3>World administration</h3>
        <div className="tabs compact">
          {['config', 'players', 'npcs', 'events', 'audit', 'abuse'].map((t) => (
            <button
              className={tab === t ? 'active' : ''}
              key={t}
              onClick={() => {
                setTab(t);
                setResult(null);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <label>
        Reason for changes
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          placeholder="Record why this change is needed"
        />
      </label>
      {tab === 'npcs' && <Npcs act={act} pending={pending} reason={reason} />}
      {tab === 'config' && (
        <>
          <p>
            Queued events keep their original rules. Resource rates change at the version boundary.
            Validate before applying.
          </p>
          {cfg.isError ? (
            <div className="query-feedback" role="alert">
              <p>
                {configReady
                  ? 'Could not refresh world configuration. Try again.'
                  : 'Could not load world configuration. Try again.'}
              </p>
              <button
                className="button outline"
                disabled={cfg.isFetching}
                onClick={() => void cfg.refetch()}
              >
                {cfg.isFetching ? 'Retrying…' : 'Try again'}
              </button>
            </div>
          ) : !configReady ? (
            <p role="status">Loading world configuration…</p>
          ) : null}
          <label>
            World configuration JSON
            <textarea
              aria-label="World configuration JSON"
              className="config-editor"
              rows={20}
              value={text}
              disabled={!configReady}
              onChange={(e) => {
                setSource(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <div className="admin-actions flex flex-wrap gap-2">
            <button
              className="button outline"
              disabled={!configReady || pending || reason.length < 10}
              onClick={() =>
                act(async () => {
                  const p = await api('/admin/config', {
                    config: JSON.parse(text),
                    dryRun: true,
                    reason,
                  });
                  setPreview(p);
                }, 'Configuration validated')
              }
            >
              Validate configuration
            </button>
            <button
              className="button primary"
              disabled={!configReady || pending || !preview?.valid || reason.length < 10}
              onClick={() =>
                act(async () => {
                  await api('/admin/config', { config: JSON.parse(text), dryRun: false, reason });
                  setSource(null);
                  setPreview(null);
                }, 'World configuration applied')
              }
            >
              Apply validated configuration
            </button>
          </div>
          {preview && <pre className="admin-result">{JSON.stringify(preview, null, 2)}</pre>}
        </>
      )}
      {tab === 'players' && (
        <>
          <label>
            Find a player or email
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {players.data?.players.map((p: any) => (
            <div className="admin-row" key={p.id}>
              <div>
                <b>
                  {p.name} · #{p.id}
                </b>
                <small>
                  {p.is_npc ? 'NPC account' : p.email || 'Guest'} · {p.villages} villages ·{' '}
                  {p.banned_until
                    ? 'Banned until ' + new Date(p.banned_until).toLocaleDateString()
                    : 'Active'}
                </small>
              </div>
              <div className="admin-actions flex flex-wrap gap-2">
                {['ban', 'unban', 'strip'].map((action) => (
                  <button
                    key={action}
                    className={'button outline ' + (action === 'strip' ? 'danger' : '')}
                    disabled={pending || reason.length < 10}
                    onClick={() =>
                      act(
                        () => api(`/admin/players/${p.id}/moderate`, { action, reason, days: 30 }),
                        `Player ${action} completed`,
                      )
                    }
                  >
                    {action === 'strip'
                      ? 'Ban and strip villages'
                      : action === 'ban'
                        ? 'Ban 30 days'
                        : 'Unban'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
      {tab === 'events' && (
        <>
          <div className="admin-actions flex flex-wrap gap-2">
            <button
              className="button outline danger"
              disabled={pending || !selected.length || reason.length < 10}
              onClick={() =>
                act(async () => {
                  await api('/admin/movements/cancel', { ids: selected, reason });
                  setSelected([]);
                }, 'Selected movements cancelled')
              }
            >
              Cancel selected movements ({selected.length})
            </button>
          </div>
          <label>
            Village ID
            <input
              inputMode="numeric"
              value={villageId}
              onChange={(e) => {
                setVillageId(e.target.value);
                setEventCursor(0);
                setSelected([]);
              }}
            />
          </label>
          <div className="admin-actions flex flex-wrap gap-2">
            <label>
              From (UTC)
              <input
                type="datetime-local"
                value={replayFrom}
                onChange={(e) => setReplayFrom(e.target.value)}
              />
            </label>
            <label>
              To (UTC, exclusive)
              <input
                type="datetime-local"
                value={replayTo}
                onChange={(e) => setReplayTo(e.target.value)}
              />
            </label>
            <button
              className="button outline"
              disabled={
                pending ||
                !/^\d+$/.test(villageId) ||
                !replayFrom ||
                !replayTo ||
                replayFrom >= replayTo
              }
              onClick={() =>
                act(
                  async () =>
                    setResult(
                      await api('/admin/replay', {
                        villageId: Number(villageId),
                        from: new Date(replayFrom + 'Z').toISOString(),
                        to: new Date(replayTo + 'Z').toISOString(),
                      }),
                    ),
                  'Timeline replay completed',
                )
              }
            >
              Replay time range
            </button>
          </div>
          {events.data?.events.map((e: any) => (
            <div className="admin-row" key={e.id}>
              {e.kind === 'movement' && e.status === 'pending' && (
                <input
                  type="checkbox"
                  aria-label={'Select movement ' + e.id}
                  checked={selected.includes(e.id)}
                  onChange={(event) =>
                    setSelected((ids) =>
                      event.target.checked ? [...ids, e.id] : ids.filter((id) => id !== e.id),
                    )
                  }
                />
              )}
              <div>
                <b>
                  #{e.id} · {e.kind} · {e.status}
                </b>
                <small>
                  {new Date(e.due_at).toLocaleString()} · rules v{e.config_version}
                </small>
              </div>
              <button
                className="button outline"
                disabled={!e.replayable || pending}
                onClick={() =>
                  act(
                    async () => setResult(await api(`/admin/events/${e.id}/replay`, {})),
                    'Replay completed',
                  )
                }
              >
                Replay event
              </button>
            </div>
          ))}
          <div className="admin-actions">
            <button
              className="button outline"
              disabled={!eventCursor}
              onClick={() => setEventCursor(0)}
            >
              First events
            </button>
            <button
              className="button outline"
              disabled={events.data?.events.length !== 100}
              onClick={() => setEventCursor(events.data.events.at(-1).id)}
            >
              Next events
            </button>
          </div>
          {result && (
            <>
              <h4>
                {result.matches
                  ? 'Replay matches the recorded result'
                  : 'Replay diverged: investigate before changing state'}
              </h4>
              <pre className="admin-result">{JSON.stringify(result, null, 2)}</pre>
            </>
          )}
        </>
      )}
      {tab === 'audit' && (
        <div className="admin-actions flex flex-wrap gap-2">
          <label>
            Filter by actor ID
            <input
              type="number"
              min={1}
              value={auditActor}
              onChange={(e) => setAuditActor(e.target.value)}
            />
          </label>
          <label>
            Filter by action
            <input
              value={auditAction}
              onChange={(e) => setAuditAction(e.target.value)}
              placeholder="admin.config"
            />
          </label>
        </div>
      )}
      {tab === 'audit' &&
        audit.data?.entries.map((e: any) => (
          <div className="admin-row" key={e.id}>
            <div>
              <b>
                #{e.id} · {e.action} · player {e.actor}
              </b>
              <small>{new Date(e.created_at).toLocaleString()}</small>
              <p>{JSON.stringify(e.detail)}</p>
            </div>
          </div>
        ))}
      {tab === 'abuse' && (
        <>
          <p>
            Heuristics flag patterns for human review. Flags never automatically punish players.
          </p>
          {abuse.data?.flags.map((f: any) => (
            <div className="admin-row" key={f.id}>
              <div>
                <b>
                  {f.name} · {f.kind}
                </b>
                <p>{JSON.stringify(f.evidence)}</p>
              </div>
              {['dismissed', 'actioned'].map((status) => (
                <button
                  className="button outline"
                  key={status}
                  disabled={pending || reason.length < 10}
                  onClick={() =>
                    act(() => api(`/admin/abuse/${f.id}`, { status, reason }), 'Review saved')
                  }
                >
                  {status}
                </button>
              ))}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
