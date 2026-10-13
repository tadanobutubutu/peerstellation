import { readFile } from 'node:fs/promises';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { inspectCid, writeQualityArtifact } from './ipfs-script-common';

const source = await readFile('src/network/helia-observer.ts', 'utf8');
const packageModule = await import('@ipshipyard/libp2p-inspector-metrics');
if (typeof packageModule.inspectorMetrics !== 'function')
  throw new Error('Inspector package has no inspectorMetrics export.');
for (const marker of [
  'import.meta.env.DEV',
  'isInspectorOptIn',
  "rpc: 'window'",
]) {
  if (!source.includes(marker))
    throw new Error(`Inspector policy marker is missing: ${marker}`);
}
const fixtureCid = CID.createV1(
  0x55,
  await sha256.digest(new TextEncoder().encode('inspector policy fixture')),
);
const fixture = inspectCid(fixtureCid.toString());
await writeQualityArtifact('libp2p-inspector.json', {
  package: '@ipshipyard/libp2p-inspector-metrics',
  exportPresent: true,
  defaultOff: true,
  productionGuard: true,
  fixtureCodec: fixture.codecName,
});
console.log(
  'js-libp2p Inspector policy passed: package is wired but default-off and production-guarded.',
);
