import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const headers = await readFile(resolve('public/_headers'), 'utf8');
const cspLine = headers
  .split('\n')
  .find((line) => line.trimStart().startsWith('Content-Security-Policy:'));
if (cspLine === undefined) {
  throw new Error('public/_headers does not define Content-Security-Policy.');
}

const policy = cspLine.slice(cspLine.indexOf(':') + 1).trim();
const directives = new Map<string, string[]>();
for (const clause of policy.split(';')) {
  const tokens = clause.trim().split(/\s+/u).filter(Boolean);
  const name = tokens.shift();
  if (name !== undefined) directives.set(name, tokens);
}

const required: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'none'"],
};
for (const [name, values] of Object.entries(required)) {
  const actual = directives.get(name);
  if (actual === undefined || values.some((value) => !actual.includes(value))) {
    throw new Error(`CSP directive ${name} is missing the required value.`);
  }
}

const scriptSources = directives.get('script-src') ?? [];
const connectSources = directives.get('connect-src') ?? [];
if (scriptSources.includes("'unsafe-eval'")) {
  throw new Error("CSP must not permit 'unsafe-eval'.");
}
if (connectSources.includes('*')) {
  throw new Error('CSP connect-src must not contain a wildcard.');
}
if (!scriptSources.includes("'wasm-unsafe-eval'")) {
  throw new Error(
    "CSP must explicitly scope WebAssembly to 'wasm-unsafe-eval'.",
  );
}

console.log(`CSP audit passed (${directives.size} directives).`);
