import { readPublicHeaders, writeQualityArtifact } from './ipfs-script-common';

const headers = await readPublicHeaders();
const required: Readonly<Record<string, string>> = {
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'origin-agent-cluster': '?1',
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};
const missing = Object.entries(required)
  .filter(
    ([name, value]) => headers[name]?.toLowerCase() !== value.toLowerCase(),
  )
  .map(([name]) => name);
if ((headers['permissions-policy'] ?? '').trim().length === 0) {
  missing.push('permissions-policy');
}
const csp = headers['content-security-policy'] ?? '';
if (!csp.includes("default-src 'none'")) missing.push('csp:default-src');
if (!csp.includes("object-src 'none'")) missing.push('csp:object-src');
if (csp.includes("'unsafe-eval'")) missing.push('csp:unsafe-eval');
if (csp.includes('connect-src *')) missing.push('csp:connect-wildcard');
if (missing.length > 0) {
  throw new Error(`Origin isolation policy failed: ${missing.join(', ')}`);
}
await writeQualityArtifact('origin-isolation.json', {
  checked: Object.keys(required),
  cspDirectives: csp.split(';').length,
  source: 'public/_headers',
});
console.log(
  'Origin isolation check passed: COOP/COEP/CORP/CSP policy is explicit.',
);
