// Test-only loopback proxy keeps service workers on a secure localhost origin inside Docker.
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
const upstream = new URL(process.env.BROWSER_UPSTREAM || 'http://host.docker.internal:3001');
if (
  upstream.protocol !== 'http:' ||
  !['host.docker.internal', '127.0.0.1', 'localhost'].includes(upstream.hostname)
)
  throw new Error('Browser test upstream must be local');
const server = createServer((incoming, outgoing) => {
  const remote = request(
    {
      hostname: upstream.hostname,
      port: upstream.port,
      path: incoming.url,
      method: incoming.method,
      headers: incoming.headers,
    },
    (response) => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    },
  );
  remote.on('error', () => {
    outgoing.writeHead(502);
    outgoing.end('Local test upstream unavailable');
  });
  incoming.pipe(remote);
});
server.on('upgrade', (req, client, head) => {
  const remote = connect(Number(upstream.port), upstream.hostname, () => {
    remote.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => k + ': ' + v)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (head.length) remote.write(head);
    client.pipe(remote);
    remote.pipe(client);
  });
  remote.on('error', () => client.destroy());
  client.on('error', () => remote.destroy());
});
await new Promise((resolve) => server.listen(3001, '127.0.0.1', resolve));
console.log('Browser test loopback proxy ready');
process.on('SIGTERM', () => server.close());
