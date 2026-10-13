import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = join(repositoryRoot, 'wasm/renderer-benchmark/Cargo.toml');
const targetWasm = join(
  repositoryRoot,
  'wasm/renderer-benchmark/target/wasm32-unknown-unknown/release/peerstellation_renderer_benchmark.wasm',
);
const outputDirectory = join(repositoryRoot, 'public/__renderer-benchmark');

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

await writeFile(
  // nosemgrep: javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag -- outputDirectory is a repository-local fixed path, never request data.
  join(outputDirectory, 'index.html'),
  `<!doctype html>
<meta charset="utf-8">
<title>Peerstellation Rust renderer benchmark</title>
<canvas id="renderer-benchmark-canvas" width="640" height="360"></canvas>
<script type="module">
  import init, { render_frames } from './peerstellation_renderer_benchmark.js';
  await init();
  const canvas = document.querySelector('#renderer-benchmark-canvas');
  window.__rendererBenchmarkReady = true;
  window.__rendererBenchmarkRun = async (nodeCount, frameCount) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('benchmark canvas missing');
    const started = performance.now();
    const renderedNodes = await render_frames(canvas, nodeCount, frameCount);
    return { elapsedMs: performance.now() - started, renderedNodes };
  };
</script>
`,
  'utf8',
);

console.log(`Rust wgpu benchmark module generated at ${outputDirectory}`);
