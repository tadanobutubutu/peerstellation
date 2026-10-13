import {
  fetchWithTimeout,
  inspectCid,
  parseExplicitRemote,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

if (!requiresExplicitOptIn(process.env.IPFS_CHECK_ENABLE)) {
  skip(
    'IPFS Check is an external DHT/IPNI service; set IPFS_CHECK_ENABLE=1 and IPFS_CHECK_URL explicitly.',
  );
} else {
  const cid = process.env.IPFS_CHECK_CID?.trim();
  const endpointValue = process.env.IPFS_CHECK_URL?.trim();
  if (
    cid === undefined ||
    endpointValue === undefined ||
    endpointValue.length === 0
  ) {
    throw new Error(
      'IPFS_CHECK_ENABLE=1 requires IPFS_CHECK_CID and IPFS_CHECK_URL.',
    );
  }
  const parsed = inspectCid(cid);
  const endpoint = parseExplicitRemote(
    endpointValue,
    'IPFS_CHECK_ALLOW_REMOTE',
  );
  endpoint.searchParams.set('cid', parsed.cid);
  const multiaddr = process.env.IPFS_CHECK_MULTIADDR?.trim();
  if (multiaddr !== undefined && multiaddr.length > 0)
    endpoint.searchParams.set('multiaddr', multiaddr.slice(0, 512));
  const response = await fetchWithTimeout(
    endpoint,
    { headers: { accept: 'application/json' } },
    60_000,
  );
  const body = (await response.text()).slice(0, 1_000_000);
  if (!response.ok || body.length === 0)
    throw new Error(`IPFS Check returned HTTP ${response.status}.`);
  await writeQualityArtifact('ipfs-check.json', {
    endpoint: endpoint.toString(),
    status: response.status,
    bodyPreview: body.slice(0, 2_000),
  });
  console.log(`IPFS Check passed for ${parsed.cid} (HTTP ${response.status}).`);
}
