import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const artifact = resolve('public/physics.wasm');
if (!existsSync(artifact)) throw new Error('public/physics.wasm is missing.');
await mkdir(resolve('artifacts/wasm'), { recursive: true });

const tools = [
  ['wasm-tools', ['validate', artifact]],
  ['wasm-opt', ['--all-features', '-O3', artifact, '-o', '/dev/null']],
  [
    'wasm-snip',
    [
      '--snip-rust-panicking-code',
      artifact,
      '-o',
      resolve('artifacts/wasm/physics-snip.wasm'),
    ],
  ],
  ['wasm-objdump', ['-x', artifact]],
] as const;
for (const [command, args] of tools) {
  const executable = findExecutable(command);
  if (executable === undefined) {
    console.log(`[${command}] skip: executable is not installed`);
    continue;
  }
  const output = execFileSync(executable, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log(
    `[${command}] pass${output.trim() ? `: ${output.trim().slice(0, 200)}` : ''}`,
  );
}
if (!WebAssembly.validate(await readFile(artifact))) {
  throw new Error('WebAssembly.validate rejected public/physics.wasm.');
}

function findExecutable(command: string): string | undefined {
  const candidates = [
    command,
    `/opt/homebrew/opt/binaryen/bin/${command}`,
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
  ];
  for (const candidate of candidates) {
    try {
      execFileSync('which', [candidate], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Try the next explicit Homebrew/system location.
    }
  }
  return undefined;
}
