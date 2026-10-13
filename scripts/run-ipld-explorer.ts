import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import {
  createCarFixture,
  inspectCid,
  verifyCarBytes,
  writeQualityArtifact,
} from './ipfs-script-common';

const bytes = new TextEncoder().encode('IPLD Explorer deterministic DAG root');
const root = CID.createV1(0x55, await sha256.digest(bytes));
const car = await createCarFixture(root, [{ cid: root, bytes }]);
const inspection = inspectCid(root.toString());
const verification = await verifyCarBytes(car, root);
await writeQualityArtifact('ipld-explorer.json', {
  inspectedCid: inspection.cid,
  codec: inspection.codecName,
  traversal: 'single raw block',
  ...verification,
});
console.log(`IPLD Explorer local traversal passed: ${root.toString()}`);
