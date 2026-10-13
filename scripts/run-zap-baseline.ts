import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const requestedTarget = process.env.ZAP_URL?.trim() || 'http://127.0.0.1:4178/';
const target = new URL(requestedTarget);
if (!['http:', 'https:'].includes(target.protocol)) {
  throw new Error('ZAP_URL must use http or https.');
}
if (
  process.env.ZAP_ALLOW_REMOTE !== '1' &&
  !['127.0.0.1', 'localhost', '::1'].includes(target.hostname)
) {
  throw new Error(
    'ZAP baseline is restricted to a local target. Set ZAP_ALLOW_REMOTE=1 only after an explicit review.',
  );
}

const outputDirectory = resolve('artifacts/quality/zap');
await mkdir(outputDirectory, { recursive: true });
const runner = await selectRunner();
if (runner === undefined) {
  throw new Error(
    'OWASP ZAP runner is unavailable. Install the official ZAP application (zap.sh/zap-baseline.py) or start a Docker/Podman daemon for ghcr.io/zaproxy/zaproxy:stable.',
  );
}

let server: ReturnType<typeof spawn> | undefined;
try {
  if (!(await reachable(target))) {
    if (!isLocal(target))
      throw new Error(`ZAP target is not reachable: ${target}`);
    server = startPreviewServer(target);
    await waitForTarget(target);
  }
  const effectiveTarget =
    runner.kind === 'container' ? containerTarget(target) : target.toString();
  const args =
    runner.kind === 'python'
      ? [
          '-t',
          effectiveTarget,
          '-I',
          '-J',
          join(outputDirectory, 'zap.json'),
          '-r',
          join(outputDirectory, 'zap.html'),
        ]
      : runner.kind === 'shell'
        ? [
            '-cmd',
            '-quickurl',
            effectiveTarget,
            '-quickout',
            join(outputDirectory, 'zap.json'),
            '-quickprogress',
          ]
        : [
            'run',
            '--rm',
            '--network=host',
            '--workdir',
            '/zap/wrk',
            '-v',
            `${outputDirectory}:/zap/wrk:rw`,
            runner.image ?? 'ghcr.io/zaproxy/zaproxy:stable',
            'zap-baseline.py',
            '-t',
            effectiveTarget,
            '-I',
            '-J',
            'zap.json',
            '-r',
            'zap.html',
          ];
  console.log(
    `OWASP ZAP passive baseline: ${effectiveTarget} (${runner.kind})`,
  );
  run(runner.executable, args);
} finally {
  server?.kill('SIGTERM');
}

interface Runner {
  readonly kind: 'python' | 'shell' | 'container';
  readonly executable: string;
  readonly image?: string;
}

async function selectRunner(): Promise<Runner | undefined> {
  const python = executable('zap-baseline.py');
  if (python !== undefined) return { kind: 'python', executable: python };
  const shell = executable('zap.sh');
  if (shell !== undefined) return { kind: 'shell', executable: shell };
  for (const candidate of ['docker', 'podman']) {
    const container = executable(candidate);
    if (container === undefined || !containerHealthy(container)) continue;
    return {
      kind: 'container',
      executable: container,
      image: process.env.ZAP_IMAGE?.trim() || 'ghcr.io/zaproxy/zaproxy:stable',
    };
  }
  return undefined;
}

function executable(name: string): string | undefined {
  const explicit = [
    `/opt/homebrew/bin/${name}`,
    `/opt/homebrew/opt/zaproxy/bin/${name}`,
    `/usr/local/bin/${name}`,
  ];
  for (const candidate of explicit) if (existsSync(candidate)) return candidate;
  try {
    const value = execFileSync('which', [name], { encoding: 'utf8' }).trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function containerHealthy(command: string): boolean {
  try {
    execFileSync(command, ['info'], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function isLocal(value: URL): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(value.hostname);
}

function containerTarget(value: URL): string {
  const copy = new URL(value);
  if (copy.hostname === '127.0.0.1' || copy.hostname === 'localhost') {
    copy.hostname = 'host.docker.internal';
  }
  return copy.toString();
}

async function reachable(value: URL): Promise<boolean> {
  try {
    const response = await fetch(value, { method: 'HEAD', redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

function startPreviewServer(target: URL): ReturnType<typeof spawn> {
  const vite = resolve('node_modules/.bin/vite');
  if (!existsSync(resolve('dist/index.html'))) {
    execFileSync('npm', ['run', 'build'], {
      stdio: 'inherit',
      timeout: 15 * 60 * 1_000,
    });
  }
  const child = spawn(
    vite,
    [
      'preview',
      '--host',
      '0.0.0.0',
      '--port',
      previewPort(target),
      '--strictPort',
    ],
    {
      stdio: 'ignore',
      detached: false,
    },
  );
  child.once('error', (error) => {
    throw new Error(`Could not start the local Vite server: ${error.message}`);
  });
  return child;
}

function previewPort(target: URL): string {
  const requested = Number.parseInt(target.port, 10);
  // Keep the historical default for a URL without an explicit port. Ports
  // below 1024 require elevated privileges and are not suitable for a local
  // test server; use the unprivileged preview port in that case.
  return Number.isInteger(requested) && requested >= 1024
    ? String(requested)
    : '4178';
}

async function waitForTarget(value: URL): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await reachable(value)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for ${value}`);
}

function run(command: string, args: readonly string[]): void {
  try {
    execFileSync(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ZAP_MAX_BODY_SIZE: process.env.ZAP_MAX_BODY_SIZE || '5m',
      },
    });
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'status' in error
        ? String(error.status)
        : 'unknown';
    throw new Error(`OWASP ZAP baseline failed (exit ${code}).`, {
      cause: error,
    });
  }
}
