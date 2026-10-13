import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  isLoopbackHostname,
  parseBoundedLimit,
  parsePortList,
  parseTargetUrl,
  requiresExplicitOptIn,
} from '../src/ipfs/network-policy';

export {
  createCarFixture,
  inspectCid,
  verifyCarBytes,
  verifyTrustlessGatewayResponse,
} from '../src/ipfs/ipfs-tooling';

export {
  isLoopbackHostname,
  parseBoundedLimit,
  parsePortList,
  parseTargetUrl,
  requiresExplicitOptIn,
};

export const execFileAsync = promisify(execFile);

export function executable(name: string): string | undefined {
  const explicit = [
    `/opt/homebrew/bin/${name}`,
    `/opt/homebrew/opt/${name}/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/Applications/IPFS Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/kubo/kubo/${name}`,
  ];
  for (const candidate of explicit) if (existsSync(candidate)) return candidate;
  try {
    const value = execFileSync('which', [name], { encoding: 'utf8' }).trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function skip(message: string): void {
  console.log(`SKIP: ${message}`);
}

export async function fetchWithTimeout(
  input: URL | string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function readPublicHeaders(): Promise<
  Readonly<Record<string, string>>
> {
  const source = await readFile(resolve('public/_headers'), 'utf8');
  const firstBlock = source.split(/\n\s*\n/u)[0] ?? '';
  const headers: Record<string, string> = {};
  for (const line of firstBlock.split('\n')) {
    const match = /^\s*([A-Za-z0-9-]+):\s*(.*?)\s*$/u.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      headers[match[1].toLowerCase()] = match[2];
    }
  }
  return headers;
}

export async function withViteServer<T>(
  callback: (baseUrl: URL) => Promise<T>,
): Promise<T> {
  const port = 4182;
  const baseUrl = new URL(`http://127.0.0.1:${String(port)}`);
  const target = process.env.LOCAL_APP_URL?.trim();
  if (target !== undefined && target.length > 0) {
    return callback(parseTargetUrl(target));
  }

  const vite = resolve('node_modules/.bin/vite');
  const server = spawn(
    vite,
    ['--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      stdio: 'ignore',
    },
  );
  try {
    await waitForHttp(baseUrl);
    return await callback(baseUrl);
  } finally {
    server.kill('SIGTERM');
  }
}

export async function waitForHttp(url: URL, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(url, { method: 'HEAD' }, 2_000);
      if (response.status < 500) return;
    } catch {
      // The Vite process may still be binding its socket.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for ${url.toString()}`);
}

export async function writeQualityArtifact(
  name: string,
  value: unknown,
): Promise<void> {
  await mkdir(resolve('artifacts/quality'), { recursive: true });
  const path = resolve('artifacts/quality', name);
  const serialised = `${JSON.stringify(value, null, 2)}\n`;
  await (await import('node:fs/promises')).writeFile(path, serialised, 'utf8');
}

export function parseExplicitRemote(
  raw: string,
  allowRemoteVariable: string,
): URL {
  return parseTargetUrl(raw, {
    allowRemote: requiresExplicitOptIn(process.env[allowRemoteVariable]),
  });
}
