import { CarReader, CarWriter } from '@ipld/car';
import { CID } from 'multiformats/cid';
import type { MultihashDigest } from 'multiformats/hashes/interface';
import { sha256, sha512 } from 'multiformats/hashes/sha2';

export interface CidInspection {
  readonly cid: string;
  readonly version: 0 | 1;
  readonly codecCode: number;
  readonly codecName: string;
  readonly multihashCode: number;
  readonly multihashName: string;
  readonly digestHex: string;
}

export interface CarVerificationResult {
  readonly root: string;
  readonly blockCount: number;
  readonly verifiedBlockCount: number;
}

const CODEC_NAMES: Readonly<Record<number, string>> = {
  85: 'raw',
  112: 'dag-pb',
  113: 'dag-cbor',
  297: 'dag-json',
};

const MULTIHASH_NAMES: Readonly<Record<number, string>> = {
  18: 'sha2-256',
  19: 'sha2-512',
};

/** Decode the same core fields exposed by CID Inspector, without its hosted UI. */
export function inspectCid(input: string): CidInspection {
  const value = input.trim();
  if (value.length === 0) throw new Error('CID is empty.');
  const cid = CID.parse(value);
  return {
    cid: cid.toString(),
    version: cid.version,
    codecCode: cid.code,
    codecName: CODEC_NAMES[cid.code] ?? `multicodec-${cid.code}`,
    multihashCode: cid.multihash.code,
    multihashName:
      MULTIHASH_NAMES[cid.multihash.code] ?? `multihash-${cid.multihash.code}`,
    digestHex: bytesToHex(cid.multihash.digest),
  };
}

export async function createCarFixture(
  root: CID,
  blocks: readonly { readonly cid: CID; readonly bytes: Uint8Array }[],
): Promise<Uint8Array> {
  const { writer, out } = CarWriter.create([root]);
  const chunksPromise = collectChunks(out);
  for (const block of blocks) await writer.put(block);
  await writer.close();
  return concatenate(await chunksPromise);
}

/**
 * Verify CAR framing, roots, and every block's content-addressed hash.
 * @ipld/car deliberately does not hash blocks while reading, so this explicit
 * pass is required before a CAR is treated as evidence.
 */
export async function verifyCarBytes(
  bytes: Uint8Array,
  expectedRoot: CID,
): Promise<CarVerificationResult> {
  const reader = await CarReader.fromBytes(bytes);
  const roots = await reader.getRoots();
  if (!roots.some((root) => root.equals(expectedRoot))) {
    throw new Error(
      `CAR root mismatch: expected ${expectedRoot.toString()}, got ${roots.map((root) => root.toString()).join(', ') || 'none'}`,
    );
  }

  let blockCount = 0;
  for await (const block of reader.blocks()) {
    blockCount += 1;
    const digest = await digestForCid(block.cid, block.bytes);
    if (!bytesEqual(digest.bytes, block.cid.multihash.bytes)) {
      throw new Error(`CAR block hash mismatch for ${block.cid.toString()}.`);
    }
  }
  if (blockCount === 0) throw new Error('CAR contains no blocks.');
  return {
    root: expectedRoot.toString(),
    blockCount,
    verifiedBlockCount: blockCount,
  };
}

/** Verify either a trustless CAR response or a raw block response. */
export async function verifyTrustlessGatewayResponse(
  response: Response,
  expectedRoot: CID,
): Promise<CarVerificationResult> {
  if (!response.ok) {
    throw new Error(`Trustless gateway returned HTTP ${response.status}.`);
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const body = new Uint8Array(await response.arrayBuffer());
  if (contentType.includes('application/vnd.ipld.car')) {
    return verifyCarBytes(body, expectedRoot);
  }
  if (
    contentType.includes('application/vnd.ipld.raw') ||
    contentType.includes('application/octet-stream')
  ) {
    const digest = await digestForCid(expectedRoot, body);
    if (!bytesEqual(digest.bytes, expectedRoot.multihash.bytes)) {
      throw new Error('Trustless raw block hash mismatch.');
    }
    return {
      root: expectedRoot.toString(),
      blockCount: 1,
      verifiedBlockCount: 1,
    };
  }
  throw new Error(
    `Trustless response content-type must be CAR or raw, got ${contentType || 'missing'}.`,
  );
}

async function digestForCid(
  cid: CID,
  bytes: Uint8Array,
): Promise<MultihashDigest> {
  switch (cid.multihash.code) {
    case 0x12:
      return sha256.digest(bytes);
    case 0x13:
      return sha512.digest(bytes);
    default:
      throw new Error(
        `Unsupported multihash code ${String(cid.multihash.code)} for ${cid.toString()}.`,
      );
  }
}

async function collectChunks(
  out: AsyncIterable<Uint8Array>,
): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of out) chunks.push(chunk);
  return chunks;
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((value, index) => value === right[index]);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
