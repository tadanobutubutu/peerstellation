import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { describe, expect, it } from 'vitest';
import {
  createCarFixture,
  inspectCid,
  verifyCarBytes,
  verifyTrustlessGatewayResponse,
} from '../src/ipfs/ipfs-tooling';

describe('IPFS integrity tooling', () => {
  it('inspects CID version, codec, multihash, and canonical text', async () => {
    const cid = await fixtureCid('cid-inspector');
    const result = inspectCid(cid.toString());

    expect(result).toMatchObject({
      cid: cid.toString(),
      version: 1,
      codecCode: 0x55,
      multihashCode: 0x12,
      digestHex: expect.any(String),
    });
    expect(result.digestHex).toHaveLength(64);
  });

  it('round-trips a CAR and verifies every block against its CID', async () => {
    const block = new TextEncoder().encode('peerstellation car fixture');
    const blockCid = await sha256.digest(block);
    const root = CID.createV1(0x55, blockCid);
    const car = await createCarFixture(root, [{ cid: root, bytes: block }]);

    await expect(verifyCarBytes(car, root)).resolves.toEqual({
      root: root.toString(),
      blockCount: 1,
      verifiedBlockCount: 1,
    });
  });

  it('rejects tampered CAR block bytes even when the CAR framing is valid', async () => {
    const block = new TextEncoder().encode('immutable fixture');
    const root = CID.createV1(0x55, await sha256.digest(block));
    const car = await createCarFixture(root, [{ cid: root, bytes: block }]);
    const tampered = new Uint8Array(car);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff;

    await expect(verifyCarBytes(tampered, root)).rejects.toThrow(
      /hash mismatch/iu,
    );
  });

  it('validates trustless gateway headers and CAR integrity', async () => {
    const block = new TextEncoder().encode('trustless response');
    const root = CID.createV1(0x55, await sha256.digest(block));
    const car = await createCarFixture(root, [{ cid: root, bytes: block }]);

    await expect(
      verifyTrustlessGatewayResponse(
        new Response(car.slice().buffer as ArrayBuffer, {
          headers: { 'content-type': 'application/vnd.ipld.car' },
        }),
        root,
      ),
    ).resolves.toMatchObject({ root: root.toString(), blockCount: 1 });
  });

  it('rejects a trustless response without CAR content type', async () => {
    const root = CID.createV1(0x55, await sha256.digest(new Uint8Array([1])));
    await expect(
      verifyTrustlessGatewayResponse(new Response(new Uint8Array([1])), root),
    ).rejects.toThrow(/content-type/iu);
  });
});

async function fixtureCid(value: string): Promise<CID> {
  return CID.createV1(
    0x55,
    await sha256.digest(new TextEncoder().encode(value)),
  );
}
