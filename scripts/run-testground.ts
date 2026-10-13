import {
  execFileAsync,
  executable,
  fetchWithTimeout,
  parseTargetUrl,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

const enabled = requiresExplicitOptIn(process.env.TESTGROUND_ENABLE);
const binary = executable('testground');
if (!enabled) {
  skip(
    'Testground requires explicit TESTGROUND_ENABLE=1, a plan/testcase, Docker, and a daemon.',
  );
} else if (binary === undefined) {
  skip('Testground binary is not installed.');
} else {
  const plan = process.env.TESTGROUND_PLAN?.trim();
  const testcase = process.env.TESTGROUND_TESTCASE?.trim();
  if (
    plan === undefined ||
    testcase === undefined ||
    plan.length === 0 ||
    testcase.length === 0
  ) {
    throw new Error(
      'TESTGROUND_ENABLE=1 requires TESTGROUND_PLAN and TESTGROUND_TESTCASE.',
    );
  }
  const daemon = parseTargetUrl(
    process.env.TESTGROUND_DAEMON_URL?.trim() || 'http://127.0.0.1:8042',
  );
  const daemonResponse = await fetchWithTimeout(
    daemon,
    { method: 'GET' },
    5_000,
  );
  if (daemonResponse.status >= 500) {
    throw new Error(
      `Testground daemon is not healthy at ${daemon.toString()} (HTTP ${daemonResponse.status}).`,
    );
  }
  const args = [
    'run',
    'single',
    `--plan=${plan}`,
    `--testcase=${testcase}`,
    '--builder=docker:go',
    '--runner=local:docker',
    '--instances=1',
  ];
  const result = await execFileAsync(binary, args, {
    timeout: 15 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  await writeQualityArtifact('testground.json', {
    plan,
    testcase,
    daemon: daemon.toString(),
    stdout: result.stdout.slice(0, 8_000),
  });
  console.log(`Testground passed for ${plan}/${testcase}.`);
}
