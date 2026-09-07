import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { npcPaces, npcSettingsSchema, type NpcSettings } from '../../../packages/shared/npc';

export function Npcs({ act, pending, reason }: { act: any; pending: boolean; reason: string }) {
  const [count, setCount] = useState(5);
  const [settings, setSettings] = useState<NpcSettings>(npcSettingsSchema.parse({}));
  const [selected, setSelected] = useState<number[]>([]);
  const [cursor, setCursor] = useState(0),
    [search, setSearch] = useState('');
  const [created, setCreated] = useState<any[]>([]);
  const bots = useQuery({
    queryKey: ['admin', 'npcs', cursor, search],
    queryFn: () => api(`/admin/npcs?cursor=${cursor}&q=${encodeURIComponent(search)}`),
    refetchInterval: 5000,
  });
  const valid = npcSettingsSchema.safeParse(settings).success;
  const disabled = pending || reason.trim().length < 10;
  const change = (patch: Partial<NpcSettings>) =>
    setSettings((current) => ({ ...current, ...patch }));
  const update = (ids: number[], next: NpcSettings, message: string) =>
    act(async () => {
      await api('/admin/npcs/update', { ids, settings: next, reason });
      await bots.refetch();
    }, message);
  return (
    <div className="npc-panel">
      <div className="npc-heading">
        <div>
          <h3>NPC population</h3>
          <p>Create world residents with randomized names and independent routines.</p>
        </div>
        <button
          className="button outline danger"
          disabled={disabled || !bots.data?.totals.enabled}
          onClick={() =>
            act(async () => {
              await api('/admin/npcs/pause', { reason });
              await bots.refetch();
            }, 'All NPCs paused')
          }
        >
          Pause all NPCs
        </button>
      </div>
      <div className="npc-summary" aria-live="polite">
        <span>
          <b>{bots.data?.totals.total ?? 0}</b> NPC accounts
        </span>
        <span>
          <b>{bots.data?.totals.enabled ?? 0}</b> enabled
        </span>
        <span>
          <b>{bots.data?.totals.due ?? 0}</b> awaiting a turn
        </span>
      </div>
      <div className="npc-settings">
        <label>
          Accounts to create
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <label>
          Play style
          <select
            value={settings.style}
            onChange={(e) => change({ style: e.target.value as NpcSettings['style'] })}
          >
            <option value="builder">Builder · economy and defense</option>
            <option value="balanced">Balanced · growth and raids</option>
            <option value="raider">Raider · troops and attacks</option>
          </select>
        </label>
        <label>
          Development pace
          <select
            value={
              Object.entries(npcPaces).find(
                ([, pace]) =>
                  pace.minDelaySeconds === settings.minDelaySeconds &&
                  pace.maxDelaySeconds === settings.maxDelaySeconds,
              )?.[0] || 'custom'
            }
            onChange={(e) => {
              const pace = npcPaces[e.target.value as keyof typeof npcPaces];
              if (pace) change(pace);
            }}
          >
            <option value="relaxed">Relaxed · 5–15 minutes</option>
            <option value="steady">Steady · 30–120 seconds</option>
            <option value="active">Active · 5–20 seconds</option>
            <option value="custom">Custom intervals below</option>
          </select>
        </label>
        <label>
          Raid targets
          <select
            value={settings.targetMode}
            onChange={(e) => change({ targetMode: e.target.value as NpcSettings['targetMode'] })}
          >
            <option value="abandoned">Abandoned villages only</option>
            <option value="rivals">Rival players and abandoned villages</option>
          </select>
        </label>
        <label>
          Minimum action interval (seconds)
          <input
            type="number"
            min={5}
            max={86400}
            value={settings.minDelaySeconds}
            onChange={(e) => change({ minDelaySeconds: Number(e.target.value) })}
          />
        </label>
        <label>
          Maximum action interval (seconds)
          <input
            type="number"
            min={5}
            max={86400}
            value={settings.maxDelaySeconds}
            onChange={(e) => change({ maxDelaySeconds: Number(e.target.value) })}
          />
        </label>
        <label className="npc-check">
          <input
            type="checkbox"
            checked={settings.autoBuild}
            onChange={(e) => change({ autoBuild: e.target.checked })}
          />
          Automatically upgrade buildings
        </label>
        <label className="npc-check">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => change({ enabled: e.target.checked })}
          />
          Enable autonomous play
        </label>
      </div>
      <p className="npc-note">
        Each turn gets a random delay within this range. Buildings still need normal resources,
        prerequisites and construction time. Pausing stops new actions; queued construction and
        traveling armies finish normally. Builders do not raid. NPCs avoid their tribe and its
        allies.
      </p>
      {!valid && (
        <p role="alert">
          Use an interval between 5 and 86,400 seconds, with the maximum at least the minimum.
        </p>
      )}
      <div className="admin-actions flex flex-wrap gap-2">
        <button
          className="button primary"
          disabled={disabled || !valid || !Number.isInteger(count) || count < 1 || count > 50}
          onClick={() =>
            act(async () => {
              const result = await api('/admin/npcs', { count, settings, reason });
              setCreated(result.created);
              setCursor(0);
              setSearch('');
              await bots.refetch();
            }, 'NPC accounts created')
          }
        >
          Create NPC accounts
        </button>
        <button
          className="button outline"
          disabled={disabled || !valid || !selected.length}
          onClick={() => update(selected, settings, 'NPC settings saved')}
        >
          Apply settings to selected ({selected.length})
        </button>
      </div>
      {!!created.length && (
        <div className="npc-created" role="status">
          Created {created.length} NPC accounts: {created.map((p) => p.name).join(', ')}
        </div>
      )}
      <label>
        Find an NPC
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor(0);
            setSelected([]);
          }}
          placeholder="Search randomized player names"
        />
      </label>
      {bots.isError && <p role="alert">Could not load NPC accounts. Please try again.</p>}
      {bots.data?.npcs.length === 0 && (
        <p>No NPC accounts found. Create a group above to populate this world.</p>
      )}
      {bots.data?.npcs.map((bot: any) => (
        <article className="npc-card" key={bot.player_id}>
          <div className="npc-identity">
            <input
              type="checkbox"
              aria-label={`Select ${bot.name}`}
              checked={selected.includes(bot.player_id)}
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked
                    ? [...ids, bot.player_id]
                    : ids.filter((id) => id !== bot.player_id),
                )
              }
            />
            <div>
              <h4>{bot.name}</h4>
              <small>
                #{bot.player_id} · {bot.villages} villages · {bot.points} points ·{' '}
                {bot.settings.style}
              </small>
            </div>
            <span className={'npc-status ' + (bot.enabled ? 'enabled' : '')}>
              {bot.banned_until && new Date(bot.banned_until) > new Date()
                ? 'Banned'
                : bot.enabled
                  ? 'Playing'
                  : 'Paused'}
            </span>
          </div>
          <p>
            {bot.settings.autoBuild ? 'Automatic building' : 'Building paused'} ·{' '}
            {bot.settings.minDelaySeconds}–{bot.settings.maxDelaySeconds}s between turns ·{' '}
            {bot.settings.targetMode === 'rivals' ? 'Rival raids allowed' : 'Abandoned targets'}
          </p>
          <p className="npc-note">
            Last action:{' '}
            {bot.last_action?.message ||
              (bot.last_action
                ? `${bot.last_action.action}${bot.last_action.building ? ': ' + bot.last_action.building : ''}${bot.last_action.unit ? ': ' + bot.last_action.count + ' ' + bot.last_action.unit : ''}`
                : 'Waiting for first turn')}
            {bot.last_action_at ? ' · ' + new Date(bot.last_action_at).toLocaleTimeString() : ''}.{' '}
            {bot.enabled ? 'Next turn: ' + new Date(bot.next_action_at).toLocaleTimeString() : ''}
          </p>
          <div className="admin-actions flex flex-wrap gap-2">
            <button
              className="button outline"
              disabled={pending}
              onClick={() => {
                setSettings(bot.settings);
                setSelected([bot.player_id]);
              }}
            >
              Edit settings
            </button>
            <button
              className="button outline"
              disabled={disabled}
              onClick={() =>
                update(
                  [bot.player_id],
                  { ...bot.settings, enabled: !bot.enabled },
                  bot.enabled ? 'NPC paused' : 'NPC resumed',
                )
              }
            >
              {bot.enabled ? 'Pause NPC' : 'Resume NPC'}
            </button>
          </div>
        </article>
      ))}
      <div className="admin-actions flex flex-wrap gap-2">
        <button
          className="button outline"
          disabled={!cursor}
          onClick={() => {
            setCursor(0);
            setSelected([]);
          }}
        >
          First page
        </button>
        <button
          className="button outline"
          disabled={!bots.data?.nextCursor}
          onClick={() => {
            setCursor(bots.data.nextCursor);
            setSelected([]);
          }}
        >
          Next NPCs
        </button>
      </div>
    </div>
  );
}
