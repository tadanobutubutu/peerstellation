import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  formatFailure,
  requireEnvironment,
  validateCid,
} from './deployment-shared.ts';

const pinListEndpoint = 'https://api.pinata.cloud/data/pinList';
const unpinEndpoint = 'https://api.pinata.cloud/pinning/unpin';
const managedPinName = 'ipfs-universe';
const pageLimit = 100;

interface PinataPin {
  ipfs_pin_hash: string;
}

interface PinataPinList {
  rows: unknown[];
}

interface PrunePinataOptions {
  currentCid: string;
  fetcher?: typeof fetch;
  token: string;
}

function parsePinList(body: unknown): PinataPinList {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('rows' in body) ||
    !Array.isArray(body.rows)
  ) {
    throw new Error('Pinata returned an invalid pin list.');
  }

  const rows = body.rows.map((row: unknown): PinataPin => {
    if (
      typeof row !== 'object' ||
      row === null ||
      !('ipfs_pin_hash' in row) ||
      typeof row.ipfs_pin_hash !== 'string'
    ) {
      throw new Error('Pinata returned a malformed pin record.');
    }
    return { ipfs_pin_hash: validateCid(row.ipfs_pin_hash) };
  });
  return { rows };
}

async function listManagedPins(
  fetcher: typeof fetch,
  token: string,
): Promise<PinataPin[]> {
  const pins: PinataPin[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(pinListEndpoint);
    url.searchParams.set('metadata[name]', managedPinName);
    url.searchParams.set('status', 'pinned');
    url.searchParams.set('pageLimit', String(pageLimit));
    url.searchParams.set('pageOffset', String(offset));

    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Pinata pin list failed with HTTP ${response.status}.`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('Pinata returned a non-JSON pin list.');
    }
    const rows = parsePinList(body).rows;
    pins.push(...rows);
    if (rows.length < pageLimit) break;
    offset += rows.length;
  }

  return pins;
}

export async function pruneSupersededPinataReleases({
  currentCid: currentCidInput,
  fetcher = fetch,
  token,
}: PrunePinataOptions): Promise<string[]> {
  const currentCid = validateCid(currentCidInput);
  const pins = await listManagedPins(fetcher, token);
  const oldCids = [...new Set(pins.map((pin) => pin.ipfs_pin_hash))].filter(
    (cid) => cid !== currentCid,
  );

  for (const cid of oldCids) {
    const response = await fetcher(
      `${unpinEndpoint}/${encodeURIComponent(cid)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        method: 'DELETE',
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Pinata could not unpin an old release (HTTP ${response.status}).`,
      );
    }
  }

  return oldCids;
}

async function main(): Promise<void> {
  const removed = await pruneSupersededPinataReleases({
    currentCid: requireEnvironment(process.env, 'CURRENT_CID'),
    token: requireEnvironment(process.env, 'PINATA_JWT'),
  });
  console.log(`Removed ${removed.length} superseded Peerstellation pin(s).`);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  main().catch((error: unknown) => {
    console.error(formatFailure(error));
    process.exitCode = 1;
  });
}
