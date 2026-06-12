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
import { domTools } from './tools/dom/index.js';
import { consoleTools } from './tools/console/index.js';
import { websocketTools } from './tools/websocket/index.js';
import { workersTools } from './tools/workers/index.js';
import { debuggerTools } from './tools/debugger/index.js';
import { prefsTools } from './tools/prefs/index.js';
import { stealthTools } from './tools/stealth/index.js';
import { aiAstTools } from './tools/ai-ast/index.js';
import { rebuildTools } from './tools/rebuild/index.js';

const DEFAULT_CAMOUFOX = '/Applications/Camoufox.app/Contents/MacOS/camoufox';
const DEFAULT_GECKODRIVER = '/usr/local/bin/geckodriver';

async function main(): Promise<void> {
  const argv = parseArgv(process.argv.slice(2));
  const camoufoxPath = argv.camoufoxPath ?? process.env['CAMOUFOX_PATH'] ?? DEFAULT_CAMOUFOX;
  const geckodriverPath = argv.geckodriverPath ?? process.env['GECKODRIVER_PATH'] ?? DEFAULT_GECKODRIVER;

  const launcher = new FirefoxLauncher({
    spawn: spawn as any,
    mkdtemp: (p: string) => fs.mkdtemp(p),
    writeFile: (p: string, c: string) => fs.writeFile(p, c, 'utf8'),
    rm: (p: string, opts) => fs.rm(p, opts),
    camoufoxPath,
    geckodriverPath,
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
      // Session.ensureRdp consumes the server greeting before any RDP call.
      return new RdpDriver({ socket: tcp as any });
    },
  });

  const initOpts = {
    mode: (argv.attach ? 'attach' : 'launch') as 'attach' | 'launch',
    bidiUrl: argv.bidiUrl,
    rdpPort: argv.rdpPort,
    stealth: argv.stealth,
    ...(argv.userAgent ? { userAgentOverride: argv.userAgent } : {}),
  };

  await startServer(
    session,
    [
      ...pageStateTools,
      ...scriptsTools,
      ...hooksTools,
      ...networkTools,
      ...storageTools,
      ...domTools,
      ...consoleTools,
      ...websocketTools,
      ...workersTools,
      ...debuggerTools,
      ...prefsTools,
      ...stealthTools,
      ...aiAstTools,
      ...rebuildTools,
    ],
    { ensureInit: () => session.init(initOpts) },
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
