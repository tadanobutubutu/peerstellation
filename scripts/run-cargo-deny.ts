import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

execFileSync(
  'cargo-deny',
  ['check', 'advisories', 'bans', 'licenses', 'sources'],
  {
    cwd: resolve('wasm'),
    stdio: 'inherit',
  },
);
execFileSync(
  'cargo-deny',
  ['check', 'advisories', 'bans', 'licenses', 'sources'],
  {
    cwd: resolve('wasm/renderer'),
    stdio: 'inherit',
  },
);
