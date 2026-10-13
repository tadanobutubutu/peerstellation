import {
  execFileAsync,
  executable,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

const linter = executable('ipld-schema-linter') ?? executable('ipld-schema');
if (!requiresExplicitOptIn(process.env.IPLD_SCHEMA_LINTER_ENABLE)) {
  skip(
    'No official IPLD schema linter is assumed; Zod/Valibot/ArkType parity is the required local contract check.',
  );
} else if (linter === undefined) {
  skip('IPLD schema linter executable is not installed.');
} else {
  const result = await execFileAsync(linter, ['--help'], {
    timeout: 15_000,
    maxBuffer: 2_000_000,
  });
  await writeQualityArtifact('ipld-schema-linter.json', {
    executable: linter,
    help: result.stdout.slice(0, 4_000),
  });
  console.log(`IPLD schema linter detected: ${linter}`);
}
