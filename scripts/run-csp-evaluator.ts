import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

interface CspFinding {
  readonly severity: number;
  readonly directive?: string;
  readonly value?: string;
  readonly description?: string;
}

interface CspApi {
  readonly CspParser: new (policy: string) => { readonly csp: unknown };
  readonly CspEvaluator: new (
    csp: unknown,
    version: number,
  ) => { evaluate(): readonly CspFinding[] };
  readonly Version: { readonly CSP3: number };
}

const require = createRequire(import.meta.url);
const csp = require('@doyensec/csp-evaluator') as CspApi;
const headers = await readFile('public/_headers', 'utf8');
const policyLine = headers
  .split('\n')
  .find((line) => line.trimStart().startsWith('Content-Security-Policy:'));
if (policyLine === undefined) {
  throw new Error('Content-Security-Policy header is missing.');
}
const policy = policyLine.slice(policyLine.indexOf(':') + 1).trim();
const parser = new csp.CspParser(policy);
const findings = new csp.CspEvaluator(parser.csp, csp.Version.CSP3).evaluate();

// This local port predates CSP4 and calls wasm-unsafe-eval an unknown keyword.
// The repository's dedicated CSP audit checks that modern directive separately;
// every other syntax/high-severity finding remains blocking here.
const compatibilityFinding = (finding: CspFinding): boolean =>
  finding.directive === 'script-src' && finding.value === "'wasm-unsafe-eval'";
const blocking = findings.filter(
  (finding) => finding.severity <= 20 && !compatibilityFinding(finding),
);
if (blocking.length > 0) {
  throw new Error(
    `CSP Evaluator found blocking issues: ${blocking
      .map((finding) => finding.description ?? 'unknown')
      .join(' | ')}`,
  );
}

console.log(
  `CSP Evaluator passed (${findings.length} advisory findings; ${blocking.length} blocking).`,
);
for (const finding of findings) {
  console.log(
    `  severity=${finding.severity} ${finding.directive ?? 'policy'}: ${finding.description ?? 'n/a'}`,
  );
}
