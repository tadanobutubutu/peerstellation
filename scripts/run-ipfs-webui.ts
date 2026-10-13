import {
  fetchWithTimeout,
  parseTargetUrl,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

if (!requiresExplicitOptIn(process.env.KUBO_WEBUI_ENABLE)) {
  skip(
    'IPFS WebUI requires KUBO_WEBUI_ENABLE=1 and an explicitly opted-in local Kubo daemon.',
  );
} else {
  const target = parseTargetUrl(
    process.env.KUBO_API_URL?.trim() || 'http://127.0.0.1:5001',
  );
  const webui = new URL('/webui/', target);
  const version = new URL('/api/v0/version', target);
  const webuiResponse = await fetchWithTimeout(webui, {
    method: 'GET',
    redirect: 'manual',
  });
  const versionResponse = await fetchWithTimeout(version, { method: 'POST' });
  if (webuiResponse.status >= 500 || versionResponse.status >= 500) {
    throw new Error(
      `IPFS WebUI/Kubo API returned ${webuiResponse.status}/${versionResponse.status}.`,
    );
  }
  const allowOrigin = webuiResponse.headers.get('access-control-allow-origin');
  if (allowOrigin === '*') throw new Error('Kubo WebUI exposes wildcard CORS.');
  await writeQualityArtifact('ipfs-webui.json', {
    target: target.toString(),
    webuiStatus: webuiResponse.status,
    versionStatus: versionResponse.status,
    wildcardCors: false,
  });
  console.log(
    `IPFS WebUI local smoke passed (${webuiResponse.status}/${versionResponse.status}).`,
  );
}
