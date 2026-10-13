import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

execFileSync('cargo', ['vet', 'check', '--no-registry-suggestions'], {
  cwd: resolve('wasm'),
  stdio: 'inherit',
});
execFileSync('cargo', ['vet', 'check', '--no-registry-suggestions'], {
  cwd: resolve('wasm/renderer'),
  stdio: 'inherit',
});
