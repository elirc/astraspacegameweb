import { test, expect } from '@playwright/test';
test.use({ baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001' });
test('password recovery reaches the local mail server and invalidates the old session', async ({
  page,
  request,
}) => {
  const email = `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const registered = await page.request.post('/api/auth/register', {
    data: { email, password: 'RecoveryCampaign2026!', name: 'Recovery ' + Date.now().toString(36) },
  });
  expect(registered.ok()).toBe(true);
  await page.goto('/?recover');
  await page.getByRole('textbox', { name: 'Account email' }).fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists');
  let messageId = '';
  await expect
    .poll(
      async () => {
        const response = await request.get('http://127.0.0.1:58025/api/v1/search', {
          params: { query: 'to:' + email },
        });
        const result = await response.json();
        messageId = result.messages?.[0]?.ID || '';
        return messageId;
      },
      { timeout: 45000 },
    )
    .not.toBe('');
  const mail = await (
    await request.get('http://127.0.0.1:58025/api/v1/message/' + messageId)
  ).json();
  const token = mail.Text.match(/reset=([a-f0-9]{64})/)[1];
  await page.goto('/?reset=' + token);
  await page.getByLabel('New password', { exact: true }).fill('NewRecoveryCampaign2026!');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Password changed');
  expect((await page.request.get('/api/state')).status()).toBe(401);
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { email, password: 'NewRecoveryCampaign2026!' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
  expect(
    (
      await page.request.post('/api/auth/reset', {
        data: { token, password: 'AttemptedReplay2026!' },
      })
    ).status(),
  ).toBe(400);
});
