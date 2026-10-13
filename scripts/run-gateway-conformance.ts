import {
  execFileAsync,
  executable,
  parseExplicitRemote,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

const enabled = requiresExplicitOptIn(process.env.GATEWAY_CONFORMANCE_ENABLE);
const binary = executable('gateway-conformance');
if (!enabled) {
  skip(
    'Gateway Conformance is opt-in; set GATEWAY_CONFORMANCE_ENABLE=1 and provide a gateway URL.',
  );
} else if (binary === undefined) {
  skip(
    'gateway-conformance binary is not installed (build the official Go tool when a gateway is available).',
  );
} else {
  const rawUrl = process.env.GATEWAY_CONFORMANCE_URL?.trim();
  if (rawUrl === undefined || rawUrl.length === 0)
    throw new Error(
      'GATEWAY_CONFORMANCE_ENABLE=1 requires GATEWAY_CONFORMANCE_URL.',
    );
  const url = parseExplicitRemote(rawUrl, 'GATEWAY_CONFORMANCE_ALLOW_REMOTE');
  const args = [
    'test',
    '--gateway-url',
    url.toString(),
    '--specs',
    '-subdomain-gateway',
    '--json-output',
    'artifacts/quality/gateway-conformance.json',
  ];
  const result = await execFileAsync(binary, args, {
    timeout: 15 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  await writeQualityArtifact('gateway-conformance-meta.json', {
    url: url.toString(),
    stdout: result.stdout.slice(0, 4_000),
  });
  console.log(`Gateway Conformance passed for ${url.toString()}.`);
}
