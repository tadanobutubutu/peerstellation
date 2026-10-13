import {
  execFileAsync,
  executable,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

const enabled = requiresExplicitOptIn(process.env.KUBO_INTEGRITY_ENABLE);
const ipfs = executable('ipfs');
if (!enabled) {
  skip(
    'Kubo integrity commands require KUBO_INTEGRITY_ENABLE=1; no repository mutation is implicit.',
  );
} else if (ipfs === undefined) {
  skip('Kubo ipfs executable is not installed.');
} else {
  const env = { ...process.env };
  const id = await execFileAsync(ipfs, ['id'], {
    env,
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const version = await execFileAsync(ipfs, ['version'], {
    env,
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const checks: Record<string, string> = {
    id: id.stdout.trim().slice(0, 512),
    version: version.stdout.trim().slice(0, 512),
  };
  const help = await execFileAsync(ipfs, ['repo', '--help'], {
    env,
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  for (const command of ['verify', 'fsck'] as const) {
    if (!help.stdout.includes(`repo ${command}`)) {
      checks[`repo-${command}`] = 'not supported by this Kubo build';
      continue;
    }
    try {
      const result = await execFileAsync(ipfs, ['repo', command], {
        env,
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      checks[`repo-${command}`] = result.stdout.trim().slice(0, 4_096);
    } catch (error) {
      throw new Error(
        `Kubo repo ${command} failed; read-only integrity was explicitly enabled.`,
        { cause: error },
      );
    }
  }
  await writeQualityArtifact('kubo-integrity.json', checks);
  console.log('Kubo read-only id/version/repo integrity checks passed.');
}
