import { expect, test, type Page } from '@playwright/test';

async function openAlerts(page: Page, mode: 'enabled' | 'disabled' | 'unsupported' | 'start') {
  await page.addInitScript((mode) => {
    if (mode === 'unsupported') {
      Reflect.deleteProperty(window, 'PushManager');
      return;
    }
    let subscribed = mode === 'enabled';
    const calls = { permission: 0, ready: 0, subscribe: 0, unsubscribe: 0 };
    (window as any).__pushCalls = calls;
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'granted',
        requestPermission: async () => {
          calls.permission++;
          return 'granted';
        },
      },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-browser-alert',
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: 'test-public-key-for-browser', auth: 'test-auth-key-for-browser' },
        };
      },
      async unsubscribe() {
        calls.unsubscribe++;
        subscribed = false;
        return true;
      },
    };
    const registration = {
      pushManager: {
        getSubscription: async () => (subscribed ? subscription : null),
        subscribe: async () => {
          calls.subscribe++;
          subscribed = true;
          return subscription;
        },
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: async () => registration,
        getRegistration: async () => (subscribed ? registration : undefined),
        addEventListener() {},
        removeEventListener() {},
        get ready() {
          calls.ready++;
          return mode === 'start' ? Promise.resolve(registration) : new Promise(() => {});
        },
      },
    });
  }, mode);
  const guest = await page.request.post('/api/auth/guest', { data: {} });
  expect(guest.ok()).toBe(true);
  await page.goto('/?page=settings');
  const alerts = page.locator('.settings-account').filter({
    has: page.getByRole('heading', { name: 'Incoming attack alerts', exact: true }),
  });
  await expect(alerts).toBeVisible();
  return alerts;
}

test('notification permission alone does not claim attack alerts are enabled', async ({ page }) => {
  const alerts = await openAlerts(page, 'disabled');
  await expect(
    alerts.getByRole('button', { name: 'Enable attack alerts', exact: true }),
  ).toBeEnabled();
  await expect(alerts.getByRole('status')).toHaveText(
    'Attack alerts are disabled for this browser.',
  );
  expect(await page.evaluate(() => (window as any).__pushCalls.ready)).toBe(0);
});

test('an actual browser subscription can be disabled without waiting for a service worker', async ({
  page,
}) => {
  let removedEndpoint = '';
  await page.route('**/api/push/unsubscribe', async (route) => {
    removedEndpoint = route.request().postDataJSON().endpoint;
    await route.fulfill({ json: { ok: true } });
  });
  const alerts = await openAlerts(page, 'enabled');
  await alerts.getByRole('button', { name: 'Disable alerts', exact: true }).click();
  await expect(
    alerts.getByRole('button', { name: 'Enable attack alerts', exact: true }),
  ).toBeEnabled();
  expect(removedEndpoint).toBe('https://fcm.googleapis.com/fcm/send/test-browser-alert');
  expect(await page.evaluate(() => (window as any).__pushCalls)).toMatchObject({
    ready: 0,
    unsubscribe: 1,
  });
});

test('unsupported browsers explain why attack alerts cannot be enabled', async ({ page }) => {
  const alerts = await openAlerts(page, 'unsupported');
  await expect(
    alerts.getByRole('button', { name: 'Enable attack alerts', exact: true }),
  ).toBeDisabled();
  await expect(alerts.getByRole('status')).toHaveText(
    'This browser does not support push notifications.',
  );
});

test('enabling alerts waits for registration and prevents duplicate submissions', async ({
  page,
}) => {
  let finish!: () => void;
  const submitted = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/push/key', (route) => route.fulfill({ json: { publicKey: 'AQID' } }));
  await page.route('**/api/push/subscribe', async (route) => {
    await submitted;
    await route.fulfill({ json: { ok: true } });
  });
  const alerts = await openAlerts(page, 'start');
  try {
    await alerts.getByRole('button', { name: 'Enable attack alerts', exact: true }).click();
    await expect(
      alerts.getByRole('button', { name: 'Updating alerts…', exact: true }),
    ).toBeDisabled();
  } finally {
    finish();
  }
  await expect(alerts.getByRole('button', { name: 'Disable alerts', exact: true })).toBeEnabled();
  await expect(alerts.getByRole('status')).toHaveText(
    'Attack alerts are enabled for this browser.',
  );
  expect(await page.evaluate(() => (window as any).__pushCalls)).toMatchObject({
    permission: 1,
    subscribe: 1,
    unsubscribe: 0,
  });
});

test('a rejected registration cleans up the new browser subscription and allows retry', async ({
  page,
}) => {
  await page.route('**/api/push/key', (route) => route.fulfill({ json: { publicKey: 'AQID' } }));
  await page.route('**/api/push/subscribe', (route) =>
    route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' }),
  );
  const alerts = await openAlerts(page, 'start');
  await alerts.getByRole('button', { name: 'Enable attack alerts', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The server is temporarily unavailable.');
  await expect(
    alerts.getByRole('button', { name: 'Enable attack alerts', exact: true }),
  ).toBeEnabled();
  await expect(alerts.getByRole('status')).toHaveText(
    'Attack alerts are disabled for this browser.',
  );
  expect(await page.evaluate(() => (window as any).__pushCalls)).toMatchObject({
    subscribe: 1,
    unsubscribe: 1,
  });
});
