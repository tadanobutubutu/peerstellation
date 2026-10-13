import {
  execFileAsync,
  executable,
  parseBoundedLimit,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

const enabled = requiresExplicitOptIn(process.env.NEBULA_ENABLE);
const binary = executable(process.env.NEBULA_BINARY?.trim() || 'nebula');
if (!enabled) {
  skip(
    'Nebula/ProbeLab crawling is disabled by default; set NEBULA_ENABLE=1 for an explicit bounded run.',
  );
} else if (binary === undefined) {
  skip('Nebula binary is not installed.');
} else {
  const network = (process.env.NEBULA_NETWORK?.trim() || 'IPFS').toUpperCase();
  if (!/^[A-Z0-9_-]{2,32}$/u.test(network))
    throw new Error('NEBULA_NETWORK contains invalid characters.');
  const limit = parseBoundedLimit(process.env.NEBULA_LIMIT, 1_000, 100);
  const live = requiresExplicitOptIn(process.env.NEBULA_LIVE);
  const args = [
    ...(live ? [] : ['--dry-run']),
    'crawl',
    '--network',
    network,
    '--limit',
    String(limit),
  ];
  const result = await execFileAsync(binary, args, {
    timeout: live ? 15 * 60_000 : 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  await writeQualityArtifact('nebula.json', {
    network,
    limit,
    live,
    stdout: result.stdout.slice(0, 8_000),
  });
  console.log(
    `Nebula ${live ? 'crawl' : 'dry-run'} passed (${network}, limit ${String(limit)}).`,
  );
}
