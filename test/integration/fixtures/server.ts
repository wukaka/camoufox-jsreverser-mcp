import express from 'express';
import { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as http from 'node:http';
import { WebSocketServer } from 'ws';

const PAGES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'pages');

export interface FixtureServer {
  /** http://127.0.0.1:<port> */
  url: string;
  /** ws://127.0.0.1:<port>/ws */
  wsUrl: string;
  close(): Promise<void>;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const app = express();
  app.use(express.json());

  // /strict-csp gets a strict Content-Security-Policy header.
  // Must be registered before express.static so the CSP route wins.
  app.get(['/strict-csp', '/strict-csp.html'], (_req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'");
    res.sendFile(path.join(PAGES_DIR, 'strict-csp.html'));
  });

  // Static fixture pages.
  app.use(express.static(PAGES_DIR, { extensions: ['html'] }));

  // Echo + signature endpoint used by fixture-sig / fixture-xhr-pause.
  const handleSecret = (req: express.Request, res: express.Response): void => {
    const sig = req.header('x-sig') ?? '';
    res.json({ ok: sig === 'EXPECTED_SIG', sig });
  };
  app.get('/api/secret', handleSecret);
  app.post('/api/secret', handleSecret);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (sock) => {
    sock.on('message', (msg, isBinary) => {
      // Echo every frame back, prefixed for text frames so tests can distinguish.
      if (isBinary) sock.send(msg);
      else sock.send(`echo:${msg.toString()}`);
    });
    sock.send('hello');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  return {
    url,
    wsUrl,
    async close() {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}
