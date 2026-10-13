import {
  fetchWithTimeout,
  parseExplicitRemote,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

if (!requiresExplicitOptIn(process.env.PROBELAB_ENABLE)) {
  skip(
    'ProbeLab is a hosted network-observability service; no external crawl is performed by default.',
  );
} else {
  const value = process.env.PROBELAB_URL?.trim();
  if (value === undefined || value.length === 0)
    throw new Error('PROBELAB_ENABLE=1 requires PROBELAB_URL.');
  const url = parseExplicitRemote(value, 'PROBELAB_ALLOW_REMOTE');
  const response = await fetchWithTimeout(url, { method: 'HEAD' }, 15_000);
  if (response.status >= 500)
    throw new Error(`ProbeLab endpoint returned HTTP ${response.status}.`);
  await writeQualityArtifact('probelab.json', {
    url: url.toString(),
    status: response.status,
    metadataOnly: true,
  });
  console.log(`ProbeLab endpoint check passed (${response.status}).`);
}
