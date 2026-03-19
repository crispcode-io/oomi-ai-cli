import net from 'node:net';

function listenOnce({ port, host }) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.listen({ port, host }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort({
  preferredPort,
  host = '127.0.0.1',
  basePort = 4789,
  maxAttempts = 50,
} = {}) {
  const preferred = Number(preferredPort);
  const startPort = Number.isFinite(preferred) && preferred > 0 ? Math.floor(preferred) : Math.floor(basePort);

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    const available = await listenOnce({ port, host });
    if (available) {
      return port;
    }
  }

  throw new Error(`Unable to find an available port starting at ${startPort}.`);
}
