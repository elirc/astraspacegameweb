import { useQuery } from '@tanstack/react-query';
import { api } from './api';
export function Legal() {
  const q = useQuery({ queryKey: ['legal'], queryFn: () => api('/legal') });
  const privacy = new URLSearchParams(location.search).get('legal') === 'privacy';
  return (
    <main className="panel legal-page">
      <h1>{privacy ? 'Privacy notice' : 'Game rules and terms'}</h1>
      <p>
        Warband is operated by {q.data?.operator || 'the operator of this server'}. Contact:{' '}
        {q.data?.support || 'see the server administrator'}.
      </p>
      {privacy ? (
        <>
          <h2>Information the game stores</h2>
          <p>
            Registered accounts store your email address and a password hash. The game stores your
            player name, villages, orders, reports, tribe posts and private messages. Your player
            name, tribe and village locations are public to other players.
          </p>
          <h2>Why it is used</h2>
          <p>
            These records run the persistent world, authenticate your account, resolve battles,
            recover passwords and investigate disputed outcomes or abuse. Private messages are
            available to their sender and recipient; server operators have database access for
            operating and moderating the service.
          </p>
          <h2>Cookies and notifications</h2>
          <p>
            Essential cookies maintain your session. Static files are cached on your device for the
            offline shell. If you enable attack alerts, the game stores your browser push
            subscription and sends notifications through your browser provider. You can disable
            alerts in account settings.
          </p>
          <h2>Retention and requests</h2>
          <p>
            Sessions expire after 30 days. Password recovery links expire after 30 minutes. Gameplay
            history and audit records are retained for world integrity and replay; archiving an
            inbox item hides it without deleting the underlying history. Contact the operator to
            request access, correction or deletion of account information. The operator will explain
            any records that must be retained for an ongoing world or applicable obligations.
          </p>
        </>
      ) : (
        <>
          <h2>Fair play</h2>
          <p>
            Use one account per person in each world. Do not automate commands, exploit defects,
            share passwords, impersonate others, or use messages and forums to harass, threaten or
            publish another person’s private information. Report defects to the operator.
          </p>
          <h2>A persistent competitive world</h2>
          <p>
            Other players can attack and conquer your villages while you are offline. Server event
            order determines outcomes. The operator may correct defects, change future rules,
            suspend abusive accounts, or end a world. Your troops, villages and points have no
            monetary value.
          </p>
          <h2>Accounts and availability</h2>
          <p>
            Use an email address you control and a unique password. The service may be unavailable
            during maintenance or outages. This world has no paid premium features, purchases or
            cash prizes.
          </p>
          <h2>Disputes</h2>
          <p>
            Contact the operator with your player name and report or event IDs. Do not include your
            password. The operator can inspect recorded event history when reviewing an outcome or
            moderation decision.
          </p>
        </>
      )}
      <p>
        <a href="/">Return to Warband</a> ·{' '}
        <a href={'/?legal=' + (privacy ? 'terms' : 'privacy')}>
          {privacy ? 'Game rules and terms' : 'Privacy notice'}
        </a>
      </p>
    </main>
  );
}
