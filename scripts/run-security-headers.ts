import {
  fetchWithTimeout,
  parseExplicitRemote,
  readPublicHeaders,
  writeQualityArtifact,
} from './ipfs-script-common';

const staticHeaders = await readPublicHeaders();
const targetValue = process.env.SECURITY_HEADERS_URL?.trim();
const live: Record<string, string> = {};
if (targetValue !== undefined && targetValue.length > 0) {
  const target = parseExplicitRemote(
    targetValue,
    'SECURITY_HEADERS_ALLOW_REMOTE',
  );
  const response = await fetchWithTimeout(target, { method: 'GET' });
  if (response.status >= 500)
    throw new Error(`Security header target returned HTTP ${response.status}.`);
  for (const [name, value] of response.headers)
    live[name.toLowerCase()] = value;
}
const headers = Object.keys(live).length > 0 ? live : staticHeaders;
const expectations: Readonly<Record<string, RegExp>> = {
  'cross-origin-embedder-policy': /^require-corp$/iu,
  'cross-origin-opener-policy': /^same-origin$/iu,
  'cross-origin-resource-policy': /^same-origin$/iu,
  'origin-agent-cluster': /^\?1$/u,
  'x-content-type-options': /^nosniff$/iu,
  'x-frame-options': /^deny$/iu,
  'referrer-policy': /^no-referrer$/iu,
  'strict-transport-security': /^max-age=\d+/iu,
};
const failures = Object.entries(expectations)
  .filter(([name, pattern]) => !pattern.test(headers[name] ?? ''))
  .map(([name]) => name);
if ((headers['permissions-policy'] ?? '').trim().length === 0)
  failures.push('permissions-policy');
if (!/gamepad=\(self\)/iu.test(headers['permissions-policy'] ?? ''))
  failures.push('permissions-policy:gamepad-self');
const csp = headers['content-security-policy'] ?? '';
if (!/default-src\s+'none'/iu.test(csp))
  failures.push('content-security-policy:default-src');
if (!/object-src\s+'none'/iu.test(csp))
  failures.push('content-security-policy:object-src');
if (/'unsafe-eval'/u.test(csp))
  failures.push('content-security-policy:unsafe-eval');
if (/connect-src\s+\*/iu.test(csp))
  failures.push('content-security-policy:connect-wildcard');
if (failures.length > 0)
  throw new Error(`Security headers failed: ${failures.join(', ')}`);
await writeQualityArtifact('security-headers.json', {
  source: targetValue === undefined ? 'public/_headers' : targetValue,
  headerNames: Object.keys(headers).sort(),
});
console.log(
  `Security Headers / CSP policy passed (${Object.keys(headers).length} headers).`,
);
