import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
export const options = {
  scenarios: {
    reads: {
      executor: 'constant-arrival-rate',
      exec: 'readState',
      rate: 10,
      timeUnit: '1s',
      duration: __ENV.DURATION || '10m',
      preAllocatedVUs: 8,
      maxVUs: 30,
    },
    commands: {
      executor: 'constant-arrival-rate',
      exec: 'renameVillage',
      rate: 1,
      timeUnit: '1s',
      duration: __ENV.DURATION || '10m',
      preAllocatedVUs: 2,
      maxVUs: 10,
    },
  },
  thresholds: {
    'http_req_duration{operation:state}': ['p(95)<150'],
    'http_req_duration{operation:command}': ['p(95)<150'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    dropped_iterations: ['count==0'],
  },
};
export function setup() {
  if (!__ENV.BASE_URL || (!__ENV.COOKIE && __ENV.CREATE_TEST_GUEST !== '1'))
    throw new Error(
      'BASE_URL and a dedicated test COOKIE (or explicit CREATE_TEST_GUEST=1) are required',
    );
  let cookie = __ENV.COOKIE;
  if (!cookie) {
    const guest = http.post(__ENV.BASE_URL + '/api/auth/guest', '{}', {
      headers: { 'Content-Type': 'application/json' },
    });
    if (guest.status !== 200) throw new Error('Could not create the isolated test guest');
    cookie = Object.entries(guest.cookies)
      .flatMap(([name, values]) => values.map((value) => name + '=' + value.value))
      .join('; ');
  }
  const response = http.get(__ENV.BASE_URL + '/api/state', { headers: { Cookie: cookie } });
  if (response.status !== 200) throw new Error('Dedicated test account is not authenticated');
  return {
    base: __ENV.BASE_URL,
    cookie,
    village: response.json('villages.0.id'),
    run: String(Date.now()),
  };
}
export function readState(data) {
  const response = http.get(data.base + '/api/state', {
    headers: { Cookie: data.cookie },
    tags: { operation: 'state' },
  });
  check(response, {
    'state is authenticated': (r) => r.status === 200,
    'authoritative clock exists': (r) => {
      try {
        return Number.isFinite(r.json('server_now'));
      } catch {
        return false;
      }
    },
  });
}
export function renameVillage(data) {
  const iteration = exec.scenario.iterationInTest;
  const response = http.post(
    data.base + '/api/villages/' + data.village + '/command',
    JSON.stringify({ action: 'rename', name: 'Capacity capital ' + (iteration % 2) }),
    {
      headers: {
        Cookie: data.cookie,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'k6-' + data.run + '-' + iteration,
      },
      tags: { operation: 'command' },
    },
  );
  check(response, { 'command committed': (r) => r.status === 200 });
}
export function handleSummary(data) {
  return { 'artifacts/load/k6.json': JSON.stringify(data, null, 2) };
}
