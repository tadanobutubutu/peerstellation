import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import {
  createCarFixture,
  verifyTrustlessGatewayResponse,
  writeQualityArtifact,
} from './ipfs-script-common';

const block = new TextEncoder().encode(
  'peerstellation trustless gateway fixture',
);
const root = CID.createV1(0x55, await sha256.digest(block));
const car = await createCarFixture(root, [{ cid: root, bytes: block }]);
const response = new Response(car.slice().buffer as ArrayBuffer, {
  headers: { 'content-type': 'application/vnd.ipld.car; version=1' },
});
const result = await verifyTrustlessGatewayResponse(response, root);
await writeQualityArtifact('trustless-gateway.json', {
  ...result,
  contentType: response.headers.get('content-type'),
  fixtureOnly: true,
});
console.log(
  `Trustless Gateway local hash check passed: ${String(result.verifiedBlockCount)} block(s)`,
);
