import { createServer, request } from 'node:http';
import { connect, type Socket } from 'node:net';
export async function offlineOrigin(upstream: string) {
  const target = new URL(upstream),
    sockets = new Set<Socket>();
  let offline = false;
  const server = createServer((incoming, outgoing) => {
    if (offline) {
      incoming.socket.destroy();
      return;
    }
    const remote = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode || 502, response.headers);
        response.pipe(outgoing);
      },
    );
    remote.on('error', () => outgoing.destroy());
    incoming.on('aborted', () => remote.destroy());
    incoming.pipe(remote);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (req, client, head) => {
    if (offline) {
      client.destroy();
      return;
    }
    const remote = connect(Number(target.port), target.hostname, () => {
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
    client.on('close', () => remote.destroy());
    remote.on('close', () => client.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Proxy did not bind');
  return {
    url: 'http://127.0.0.1:' + address.port,
    setOffline(value: boolean) {
      offline = value;
      if (value) for (const socket of sockets) socket.destroy();
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) socket.destroy();
      }),
  };
}
