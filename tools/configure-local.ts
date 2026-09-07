import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';
let content = '';
try {
  content = await readFile('.env', 'utf8');
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e;
}
const keys = webpush.generateVAPIDKeys();
const defaults: Record<string, string> = {
  JWT_SECRET: randomBytes(48).toString('base64url'),
  METRICS_TOKEN: randomBytes(32).toString('hex'),
  VAPID_PUBLIC_KEY: keys.publicKey,
  VAPID_PRIVATE_KEY: keys.privateKey,
  VAPID_SUBJECT: 'mailto:admin@warband.test',
  PUBLIC_ORIGIN: 'http://127.0.0.1:3001',
  SMTP_URL: 'smtp://127.0.0.1:51025',
  MAIL_FROM: 'Warband <noreply@warband.test>',
  OPERATOR_NAME: 'Local Warband operator',
  SUPPORT_EMAIL: 'admin@warband.test',
};
for (const [key, value] of Object.entries(defaults))
  if (!new RegExp('^' + key + '=', 'm').test(content)) content += `\n${key}=${value}`;
await writeFile('.env', content.trim() + '\n');
await mkdir('infra/runtime', { recursive: true });
const token = content.match(/^METRICS_TOKEN=(.+)$/m)?.[1];
if (!token) throw new Error('METRICS_TOKEN must not be empty');
await writeFile('infra/runtime/metrics_token', token);
console.log(
  'Local configuration created. Existing values were preserved. Secrets were written only to ignored files.',
);
