export interface Argv {
  attach: boolean;
  bidiUrl?: string;
  rdpPort?: number;
  firefoxPath?: string;
  stealth: 'auto' | 'off';
}

export function parseArgv(args: string[]): Argv {
  const out: Argv = { attach: false, stealth: 'auto' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    switch (a) {
      case '--attach': out.attach = true; break;
      case '--bidi-url': out.bidiUrl = args[++i]; break;
      case '--rdp-port': out.rdpPort = Number(args[++i]); break;
      case '--firefox-path': out.firefoxPath = args[++i]; break;
      case '--stealth': out.stealth = args[++i] === 'off' ? 'off' : 'auto'; break;
    }
  }
  return out;
}
