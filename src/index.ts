#!/usr/bin/env node
import 'dotenv/config';
import { WebSocket } from 'ws';
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { parseArgv } from './server/argv.js';
import { FirefoxLauncher } from './drivers/launcher/FirefoxLauncher.js';
import { BidiDriver } from './drivers/bidi/BidiDriver.js';
import { RdpDriver } from './drivers/rdp/RdpDriver.js';
import { Session } from './session/Session.js';
import { startServer } from './server/server.js';
import { pageStateTools } from './tools/page-state/index.js';
import { scriptsTools } from './tools/scripts/index.js';
import { hooksTools } from './tools/hooks/index.js';
import { networkTools } from './tools/network/index.js';
import { storageTools } from './tools/storage/index.js';

async function main(): Promise<void> {
  const argv = parseArgv(process.argv.slice(2));

  const launcher = new FirefoxLauncher({
    spawn: spawn as any,
    mkdtemp: (p: string) => fs.mkdtemp(p),
    writeFile: (p: string, c: string) => fs.writeFile(p, c, 'utf8'),
    rm: (p: string, opts) => fs.rm(p, opts),
    firefoxPath: argv.firefoxPath ?? process.env['FIREFOX_PATH'] ?? 'firefox',
  });

  const session = new Session({
    launcher,
    makeBidi: async (bidiUrl) => {
      const ws = new WebSocket(bidiUrl);
      await new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
      return new BidiDriver({ socket: ws as any });
    },
    makeRdp: async (rdpPort) => {
      const tcp = createConnection({ host: '127.0.0.1', port: rdpPort });
      await new Promise<void>((res, rej) => { tcp.once('connect', () => res()); tcp.once('error', rej); });
      const d = new RdpDriver({ socket: tcp as any });
      d.markConnected();
      return d;
    },
  });

  await session.init({
    mode: argv.attach ? 'attach' : 'launch',
    bidiUrl: argv.bidiUrl,
    rdpPort: argv.rdpPort,
    stealth: argv.stealth,
  });

  await startServer(session, [...pageStateTools, ...scriptsTools, ...hooksTools, ...networkTools, ...storageTools]);
}

main().catch((e) => { console.error(e); process.exit(1); });
