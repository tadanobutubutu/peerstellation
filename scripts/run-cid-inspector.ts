import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { inspectCid, writeQualityArtifact } from './ipfs-script-common';

const bytes = new TextEncoder().encode('peerstellation cid inspector fixture');
const cid = CID.createV1(0x55, await sha256.digest(bytes));
const inspection = inspectCid(cid.toString());
if (
  inspection.version !== 1 ||
  inspection.codecCode !== 0x55 ||
  inspection.multihashCode !== 0x12 ||
  inspection.digestHex.length !== 64
) {
  throw new Error('CID Inspector fixture fields are inconsistent.');
}
await writeQualityArtifact('cid-inspector.json', inspection);
console.log(`CID Inspector local check passed: ${inspection.cid}`);
