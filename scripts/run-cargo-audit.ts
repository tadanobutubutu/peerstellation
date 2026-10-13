import { execFileSync } from 'node:child_process';

execFileSync('cargo', ['audit', '--file', 'wasm/Cargo.lock'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
execFileSync('cargo', ['audit', '--file', 'wasm/renderer/Cargo.lock'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
