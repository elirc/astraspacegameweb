import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
export function TribeMembers({
  player,
  act,
  pending,
}: {
  player: any;
  act: any;
  pending: boolean;
}) {
  const q = useQuery({ queryKey: ['tribe', 'members'], queryFn: () => api('/tribes/members') });
  const [invite, setInvite] = useState('');
  const leader = ['founder', 'officer'].includes(player.role);
  return (
    <section className="panel tribe-members">
      <div className="panel-heading">
        <h3>Members & invitations</h3>
      </div>
      {q.data?.invitations.map((i: any) => (
        <div className="admin-row" key={i.tribe_id}>
          <b>
            Invitation from {i.name} [{i.tag}]
          </b>
          <button
            className="button primary"
            disabled={pending || !!player.tribe_id}
            onClick={() => act(() => api(`/tribes/${i.tribe_id}/join`, {}), 'Invitation accepted')}
          >
            Accept invitation
          </button>
        </div>
      ))}
      {q.data?.members.map((m: any) => (
        <div className="admin-row" key={m.id}>
          <div>
            <b>
              {m.name} · #{m.id}
            </b>
            <small>{m.role}</small>
          </div>
          {leader && m.id !== player.id && m.role !== 'founder' && (
            <div className="admin-actions">
              {(player.role === 'founder'
                ? ['promote', 'demote', 'transfer', 'kick']
                : m.role === 'member'
                  ? ['kick']
                  : []
              ).map((action) => (
                <button
                  className="button outline"
                  key={action}
                  disabled={pending}
                  onClick={() =>
                    act(
                      () => api('/tribes/members', { action, playerId: m.id }),
                      'Tribe membership updated',
                    )
                  }
                >
                  {action === 'transfer' ? 'Transfer leadership' : action}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {leader && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () => api('/tribes/members', { action: 'invite', playerId: Number(invite) }),
              'Invitation sent',
            );
          }}
        >
          <label>
            Invite a player by ID
            <input
              type="number"
              min={1}
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              required
            />
          </label>
          <button className="button outline" disabled={pending}>
            Send invitation
          </button>
        </form>
      )}
      {player.role === 'founder' && (
        <div className="admin-actions">
          <button
            className="button outline"
            onClick={() =>
              act(
                () => api('/tribes/members', { action: 'open', open: false }),
                'Tribe now requires invitations',
              )
            }
          >
            Require invitations
          </button>
          <button
            className="button outline"
            onClick={() =>
              act(
                () => api('/tribes/members', { action: 'open', open: true }),
                'Tribe is open to join',
              )
            }
          >
            Allow open joining
          </button>
        </div>
      )}
    </section>
  );
}
