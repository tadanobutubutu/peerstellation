import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import {
  createCarFixture,
  verifyCarBytes,
  writeQualityArtifact,
} from './ipfs-script-common';

const block = new TextEncoder().encode(
  'peerstellation CAR verification fixture',
);
const root = CID.createV1(0x55, await sha256.digest(block));
const car = await createCarFixture(root, [{ cid: root, bytes: block }]);
const result = await verifyCarBytes(car, root);
const tampered = new Uint8Array(car);
tampered[tampered.length - 1] ^= 0xff;
let tamperRejected = false;
try {
  await verifyCarBytes(tampered, root);
} catch (error) {
  tamperRejected = /hash mismatch/iu.test(
    error instanceof Error ? error.message : String(error),
  );
}
if (!tamperRejected) throw new Error('CAR tamper fixture was not rejected.');
await writeQualityArtifact('car-verification.json', {
  ...result,
  tamperRejected,
});
console.log(
  `CAR verification passed: ${String(result.verifiedBlockCount)} block(s), tamper rejection=${String(tamperRejected)}`,
);
