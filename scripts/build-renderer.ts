import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = join(repositoryRoot, 'wasm/renderer/Cargo.toml');
const targetWasm = join(
  repositoryRoot,
  'wasm/renderer/target/wasm32-unknown-unknown/release/peerstellation_renderer.wasm',
);
// Keep the bindgen module under src so Vite can transform its adjacent WASM
// URL into a hashed asset in production. Public files are copied verbatim and
// Vite intentionally refuses to import them from application code.
const outputDirectory = join(repositoryRoot, 'src/scene/renderer-wasm');
const optimizedWasm = join(
  outputDirectory,
  'peerstellation_renderer_bg.opt.wasm',
);

const rustc = execFileSync('rustup', ['which', 'rustc'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();
const buildEnvironment = {
  ...process.env,
  PATH: `${dirname(rustc)}:${process.env.PATH ?? ''}`,
};

execFileSync(
  'rustup',
  [
    'run',
    'stable',
    'cargo',
    'build',
    '--manifest-path',
    manifest,
    '--target',
    'wasm32-unknown-unknown',
    '--release',
  ],
  { cwd: repositoryRoot, env: buildEnvironment, stdio: 'inherit' },
);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
execFileSync(
  'wasm-bindgen',
  [targetWasm, '--target', 'web', '--out-dir', outputDirectory],
  { cwd: repositoryRoot, stdio: 'inherit' },
);

const wasmOpt = findExecutable('wasm-opt');
const generatedWasm = join(outputDirectory, 'peerstellation_renderer_bg.wasm');
if (wasmOpt !== undefined && existsSync(generatedWasm)) {
  execFileSync(
    wasmOpt,
    // Do not pass Binaryen's --all-features here: it enables compact-imports
    // in wasm-bindgen output, which is still behind a flag in stable Chrome.
    ['-O3', generatedWasm, '-o', optimizedWasm],
    { cwd: repositoryRoot, stdio: 'inherit' },
  );
  await rm(generatedWasm, { force: true });
  // Keep the filename referenced by wasm-bindgen's generated JS stable while
  // using Binaryen's optimized bytes in production.
  const { rename } = await import('node:fs/promises');
  await rename(optimizedWasm, generatedWasm);
  console.log('Rust renderer: wasm-opt -O3 applied');
} else {
  console.log('Rust renderer: wasm-opt unavailable; release WASM retained');
}

function findExecutable(name: string): string | undefined {
  const knownPaths = [
    process.env.PATH?.split(':').find((entry) => entry.length > 0),
    `/opt/homebrew/opt/binaryen/bin/${name}`,
    `/usr/local/opt/binaryen/bin/${name}`,
  ].filter((entry): entry is string => entry !== undefined);
  for (const candidate of knownPaths) {
    if (candidate.endsWith(`/${name}`) && existsSync(candidate))
      return candidate;
    const pathCandidate = join(candidate, name);
    if (existsSync(pathCandidate)) return pathCandidate;
  }
  try {
    return execFileSync('which', [name], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}
