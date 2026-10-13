import { readFile } from 'node:fs/promises';
import { CID } from 'multiformats/cid';
import {
  execFileAsync,
  executable,
  fetchWithTimeout,
  parseExplicitRemote,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

const enabled =
  requiresExplicitOptIn(process.env.NOPFS_ENABLE) ||
  requiresExplicitOptIn(process.env.BADBITS_ENABLE);
const nopfsEnabled = requiresExplicitOptIn(process.env.NOPFS_ENABLE);
const badbitsEnabled = requiresExplicitOptIn(process.env.BADBITS_ENABLE);
if (!enabled) {
  skip(
    'NOpfs/Badbits are local Kubo denylist controls; enable explicitly to read a list without mutating content.',
  );
} else {
  const path = process.env.BADBITS_DENYLIST_PATH?.trim();
  const urlValue = process.env.BADBITS_DENYLIST_URL?.trim();
  let nopfsStatus = 'not requested';
  if (nopfsEnabled) {
    const ipfs = executable('ipfs');
    if (ipfs === undefined)
      throw new Error('NOPFS_ENABLE=1 requires a Kubo ipfs executable.');
    const help = await execFileAsync(ipfs, ['--help'], {
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (!help.stdout.includes('plugin'))
      throw new Error(
        'This Kubo build has no plugin command; NOpfs cannot be verified.',
      );
    const plugins = await execFileAsync(ipfs, ['plugin', 'ls'], {
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (!/nopfs/iu.test(plugins.stdout))
      throw new Error(
        'NOpfs is not listed by the explicitly selected Kubo daemon.',
      );
    nopfsStatus = 'plugin listed';
  }
  if (
    badbitsEnabled &&
    (path === undefined || path.length === 0) &&
    (urlValue === undefined || urlValue.length === 0)
  ) {
    throw new Error(
      'BADBITS_ENABLE=1 requires BADBITS_DENYLIST_PATH or BADBITS_DENYLIST_URL.',
    );
  }
  let raw = '[]';
  let source = 'empty local fixture';
  if (path !== undefined && path.length > 0) {
    raw = await readFile(path, 'utf8');
    source = path;
  } else if (urlValue !== undefined && urlValue.length > 0) {
    const url = parseExplicitRemote(urlValue, 'BADBITS_ALLOW_REMOTE');
    const response = await fetchWithTimeout(
      url,
      { headers: { accept: 'application/json' } },
      15_000,
    );
    if (!response.ok)
      throw new Error(`Badbits denylist returned HTTP ${response.status}.`);
    const contentLength = Number.parseInt(
      response.headers.get('content-length') ?? '',
      10,
    );
    if (Number.isFinite(contentLength) && contentLength > 64 * 1024 * 1024) {
      throw new Error('Badbits denylist exceeds the 64 MiB safety budget.');
    }
    raw = await response.text();
    source = url.toString();
  }
  const parsed: unknown = JSON.parse(raw);
  const entries = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' &&
        parsed !== null &&
        'cids' in parsed &&
        Array.isArray(parsed.cids)
      ? parsed.cids
      : [];
  const cids: string[] = [];
  for (const value of entries) {
    if (typeof value === 'string') {
      cids.push(CID.parse(value).toString());
      continue;
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      'anchor' in value &&
      typeof value.anchor === 'string' &&
      /^[0-9a-f]{64}$/iu.test(value.anchor)
    ) {
      cids.push(`anchor:${value.anchor.toLowerCase()}`);
      continue;
    }
    throw new Error('Badbits denylist entries must be CIDs or 64-hex anchors.');
  }
  const uniqueCids = [...new Set(cids)];
  await writeQualityArtifact('nopfs-badbits.json', {
    source,
    entryCount: uniqueCids.length,
    duplicateCount: cids.length - uniqueCids.length,
    cids: uniqueCids.slice(0, 1_000),
    nopfsStatus,
    nopfsPolicy: 'read-only denylist validation',
  });
  console.log(
    `NOpfs/Badbits denylist validation passed (${String(uniqueCids.length)} unique entries).`,
  );
}
