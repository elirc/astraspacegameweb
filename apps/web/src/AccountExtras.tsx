import { useEffect, useState } from 'react';
import { api } from './api';

async function readyWorker() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Notifications could not start. Reload the page and try again.')),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export function PushSettings({
  act,
}: {
  act: (fn: () => Promise<void>, message: string) => Promise<unknown>;
}) {
  const supported =
    'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    let cancelled = false;
    async function checkSubscription() {
      try {
        if (!supported) return;
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (!cancelled) setEnabled(Boolean(subscription));
      } catch {
        if (!cancelled) setStatus('Could not check your alerts. Try enabling them again.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void checkSubscription();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function subscribe() {
    if (!supported) throw new Error('This browser does not support push notifications.');
    // Ask during the click gesture; some browsers reject prompts after a network request.
    if ((await Notification.requestPermission()) !== 'granted') {
      setStatus('Allow notifications in your browser settings to enable attack alerts.');
      throw new Error('Notification permission was not granted.');
    }
    const { publicKey } = await api('/push/key');
    if (!publicKey)
      throw new Error("Push notifications have not been configured by this world's administrator.");
    await navigator.serviceWorker.register('/sw.js');
    const registration = await readyWorker();
    const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
      c.charCodeAt(0),
    );
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      }));
    try {
      await api('/push/subscribe', subscription.toJSON());
    } catch (error) {
      if (!existing) await subscription.unsubscribe().catch(() => false);
      throw error;
    }
    setEnabled(true);
    setStatus('Attack alerts are enabled for this browser.');
  }
  async function unsubscribe() {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await api('/push/unsubscribe', { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    setEnabled(false);
    setStatus('Attack alerts are disabled for this browser.');
  }
  return (
    <div className="settings-account">
      <h3>Incoming attack alerts</h3>
      <p>
        Receive an alert when another army approaches. On iPhone or iPad, add Warband to your Home
        Screen first.
      </p>
      <p role="status" id="push-status">
        {!supported
          ? 'This browser does not support push notifications.'
          : checking
            ? 'Checking attack alerts…'
            : status ||
              (Notification.permission === 'denied'
                ? 'Allow notifications in your browser settings to enable attack alerts.'
                : enabled
                  ? 'Attack alerts are enabled for this browser.'
                  : 'Attack alerts are disabled for this browser.')}
      </p>
      <button
        className="button outline"
        disabled={!supported || checking || busy}
        aria-describedby="push-status"
        onClick={async () => {
          setBusy(true);
          try {
            await act(
              enabled ? unsubscribe : subscribe,
              enabled ? 'Alerts disabled' : 'Attack alerts enabled',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Updating alerts…' : enabled ? 'Disable alerts' : 'Enable attack alerts'}
      </button>
    </div>
  );
}
export function Recovery() {
  const token = new URLSearchParams(location.search).get('reset');
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="recovery panel">
      <h1>{token ? 'Choose a new password' : 'Recover your account'}</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const r = await api(
              token ? '/auth/reset' : '/auth/forgot',
              token ? { token, password: data.get('password') } : { email: data.get('email') },
            );
            setMessage(r.message || 'Password changed. You can now sign in.');
          } catch (e: any) {
            setMessage(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {token ? 'New password' : 'Account email'}
          <input
            name={token ? 'password' : 'email'}
            type={token ? 'password' : 'email'}
            required
            minLength={token ? 10 : undefined}
            autoComplete={token ? 'new-password' : 'email'}
          />
        </label>
        <button className="button primary" disabled={busy}>
          {token ? 'Reset password' : 'Send reset link'}
        </button>
        <p role="status">{message}</p>
        <a href="/">Return to Warband</a>
      </form>
    </main>
  );
}
