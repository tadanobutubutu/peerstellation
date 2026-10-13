import {
  execFileAsync,
  executable,
  parsePortList,
  requiresExplicitOptIn,
  skip,
  writeQualityArtifact,
} from './ipfs-script-common';

if (!requiresExplicitOptIn(process.env.NODE_SCAN_ENABLE)) {
  skip(
    'Node exposure scanning is disabled by default; set NODE_SCAN_ENABLE=1 for a bounded loopback Nmap run.',
  );
} else {
  const nmap = executable('nmap');
  if (nmap === undefined) {
    skip('Nmap is not installed.');
  } else {
    const host = process.env.NODE_SCAN_HOST?.trim() || '127.0.0.1';
    const remoteAllowed = requiresExplicitOptIn(
      process.env.NODE_SCAN_ALLOW_REMOTE,
    );
    if (!remoteAllowed && !['127.0.0.1', 'localhost', '::1'].includes(host))
      throw new Error(
        'Nmap target is not loopback; set NODE_SCAN_ALLOW_REMOTE=1 only after review.',
      );
    const ports = parsePortList(
      process.env.NODE_SCAN_PORTS,
      [4001, 5001, 8080],
    );
    const result = await execFileAsync(
      nmap,
      ['-Pn', '-T3', '--version-light', '-p', ports.join(','), host],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );
    await writeQualityArtifact('node-exposure-nmap.json', {
      host,
      ports,
      remoteAllowed,
      stdout: result.stdout.slice(0, 8_000),
    });
    console.log(
      `Nmap bounded exposure check passed (${host}, ${ports.join(',')}).`,
    );
  }
}

if (requiresExplicitOptIn(process.env.SHODAN_ENABLE)) {
  const key = process.env.SHODAN_API_KEY?.trim();
  const host = process.env.SHODAN_HOST?.trim();
  if (
    key === undefined ||
    host === undefined ||
    key.length === 0 ||
    host.length === 0
  )
    throw new Error('SHODAN_ENABLE=1 requires SHODAN_API_KEY and SHODAN_HOST.');
  const response = await fetch(
    `https://api.shodan.io/shodan/host/${encodeURIComponent(host)}?key=${encodeURIComponent(key)}`,
  );
  if (!response.ok)
    throw new Error(`Shodan host lookup returned HTTP ${response.status}.`);
  await writeQualityArtifact('node-exposure-shodan.json', {
    host,
    status: response.status,
    queried: true,
  });
  console.log(`Shodan explicit host lookup passed (${host}).`);
}
