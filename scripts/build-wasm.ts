import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDirectory = resolve(repositoryRoot, 'public');
const physicsOutput = resolve(publicDirectory, 'physics.wasm');
const analyticsOutput = resolve(publicDirectory, 'analytics.wasm');
const rustManifest = resolve(repositoryRoot, 'wasm/Cargo.toml');
const rustArtifact = resolve(
  repositoryRoot,
  'wasm/target/wasm32-unknown-unknown/release/peerstellation_analytics.wasm',
);

await mkdir(publicDirectory, { recursive: true });

const rustCompiler = rustupToolPath('rustc');
const rustCargo = rustupToolPath('cargo');
execFileSync(
  rustCargo,
  [
    'build',
    '--manifest-path',
    rustManifest,
    '--target',
    'wasm32-unknown-unknown',
    '--release',
  ],
  {
    cwd: repositoryRoot,
    env: { ...process.env, RUSTC: rustCompiler },
    stdio: 'inherit',
  },
);

const wasmOpt = findExecutable('wasm-opt');
const optimizedArtifact = resolve(
  publicDirectory,
  '.peerstellation-optimized.wasm',
);
const publicArtifact = wasmOpt === undefined ? rustArtifact : optimizedArtifact;
if (wasmOpt !== undefined) {
  execFileSync(
    wasmOpt,
    ['--all-features', '-O3', rustArtifact, '-o', optimizedArtifact],
    { cwd: repositoryRoot, stdio: 'inherit' },
  );
}

await copyFile(publicArtifact, analyticsOutput);
await copyFile(publicArtifact, physicsOutput);
if (publicArtifact === optimizedArtifact) {
  await rm(optimizedArtifact, { force: true });
}
await Promise.all([
  assertWebAssembly(physicsOutput),
  assertWebAssembly(analyticsOutput),
]);

console.log(
  wasmOpt === undefined
    ? 'Rust物理・解析WASMを検証して生成しました。wasm-optは未導入のためRust最適化成果物を使用しています。'
    : 'Rust物理・解析WASMをwasm-opt -O3で最適化し、検証して生成しました。',
);

function rustupToolPath(tool: 'cargo' | 'rustc'): string {
  try {
    const resolved = execFileSync('rustup', ['which', tool], {
      encoding: 'utf8',
    }).trim();
    return resolved.length > 0 ? resolved : tool;
  } catch {
    return tool;
  }
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
      return execFileSync('which', [candidate], { encoding: 'utf8' }).trim();
    } catch {
      // Try the next explicit Homebrew/system location.
    }
  }
  return undefined;
}

async function assertWebAssembly(path: string): Promise<void> {
  const bytes = await readFile(path);
  if (!WebAssembly.validate(bytes)) {
    throw new Error(`${path} は有効なWebAssembly moduleではありません。`);
  }
}
