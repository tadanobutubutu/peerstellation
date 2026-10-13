export interface TargetUrlOptions {
  readonly allowRemote?: boolean;
  readonly allowedProtocols?: readonly ('http:' | 'https:')[];
}

export function isLoopbackHostname(hostname: string): boolean {
  const value = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/gu, '')
    .replace(/\.$/u, '');
  return value === 'localhost' || value === '::1' || value === '127.0.0.1';
}

export function parseTargetUrl(
  raw: string,
  options: TargetUrlOptions = {},
): URL {
  const value = raw.trim();
  if (value.length === 0) throw new Error('Target URL is empty.');
  let target: URL;
  try {
    target = new URL(value);
  } catch (error) {
    throw new Error('Target URL is invalid.', { cause: error });
  }
  const protocols = options.allowedProtocols ?? ['http:', 'https:'];
  if (!protocols.includes(target.protocol as 'http:' | 'https:')) {
    throw new Error(`Target URL protocol ${target.protocol} is not allowed.`);
  }
  if (target.username.length > 0 || target.password.length > 0) {
    throw new Error('Target URL must not contain credentials.');
  }
  if (!options.allowRemote && !isLoopbackHostname(target.hostname)) {
    throw new Error(
      'Target URL must use a loopback hostname unless remote access is explicitly enabled.',
    );
  }
  return target;
}

export function requiresExplicitOptIn(value: string | undefined): boolean {
  return /^(?:1|true|yes|on)$/iu.test(value?.trim() ?? '');
}

export function isInspectorOptIn(
  search: string,
  developmentBuild: boolean,
): boolean {
  if (!developmentBuild) return false;
  try {
    return requiresExplicitOptIn(
      new URLSearchParams(search).get('inspector') ?? undefined,
    );
  } catch {
    return false;
  }
}

export function parseBoundedLimit(
  value: string | undefined,
  maximum: number,
  fallback = maximum,
): number {
  const safeMaximum = Math.max(1, Math.trunc(maximum));
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  if (!Number.isFinite(parsed))
    return Math.min(safeMaximum, Math.max(1, fallback));
  return Math.min(safeMaximum, Math.max(1, parsed));
}

export function parsePortList(
  value: string | undefined,
  fallback: readonly number[],
): readonly number[] {
  const ports = (value?.split(',') ?? [])
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((port) => Number.isInteger(port) && port >= 1 && port <= 65_535);
  return ports.length > 0 ? [...new Set(ports)].slice(0, 64) : fallback;
}
