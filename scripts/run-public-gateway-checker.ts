import {
  fetchWithTimeout,
  parseExplicitRemote,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

if (!requiresExplicitOptIn(process.env.PUBLIC_GATEWAY_CHECK_ENABLE)) {
  skip(
    'Public Gateway Checker is opt-in because public gateways are rate-limited and have no SLA.',
  );
} else {
  const rawUrls =
    process.env.PUBLIC_GATEWAY_URLS?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  if (rawUrls.length === 0)
    throw new Error(
      'PUBLIC_GATEWAY_CHECK_ENABLE=1 requires PUBLIC_GATEWAY_URLS.',
    );
  const cid = process.env.PUBLIC_GATEWAY_CID?.trim();
  const results: Array<Record<string, unknown>> = [];
  for (const rawUrl of rawUrls.slice(0, 16)) {
    const base = parseExplicitRemote(rawUrl, 'PUBLIC_GATEWAY_ALLOW_REMOTE');
    const target =
      cid === undefined || cid.length === 0
        ? base
        : new URL(`/ipfs/${encodeURIComponent(cid)}`, base);
    const response = await fetchWithTimeout(target, { method: 'HEAD' }, 15_000);
    results.push({
      url: target.toString(),
      status: response.status,
      originIsolation:
        response.headers.get('access-control-allow-origin') !== '*',
    });
    if (response.status >= 500)
      throw new Error(
        `Public gateway returned HTTP ${response.status}: ${target}`,
      );
  }
  await writeQualityArtifact('public-gateway-checker.json', { results });
  console.log(
    `Public Gateway Checker passed for ${String(results.length)} explicitly supplied gateway(s).`,
  );
}
