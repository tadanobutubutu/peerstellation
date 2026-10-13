import {
  execFileAsync,
  executable,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

const aegir = executable('aegir');
if (aegir === undefined) {
  skip(
    'AEgir is not part of the application toolchain; install the official CLI to run its package checks.',
  );
} else {
  const result = await execFileAsync(aegir, ['--version'], {
    timeout: 15_000,
    maxBuffer: 1_000_000,
  });
  await writeQualityArtifact('aegir.json', {
    version: result.stdout.trim().slice(0, 256),
  });
  console.log(`AEgir detected: ${result.stdout.trim()}`);
}
