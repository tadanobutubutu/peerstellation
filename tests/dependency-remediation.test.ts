import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface LockPackage {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface PackageLock {
  readonly packages: Readonly<Record<string, LockPackage>>;
}

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest;
const lock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
) as PackageLock;
const lockRoot = lock.packages[''];
if (lockRoot === undefined) {
  throw new Error('package-lock.json is missing its root package entry');
}

const matrix = readFileSync(
  new URL('../scripts/run-quality-matrix.ts', import.meta.url),
  'utf8',
);
const installedPackageNames = Object.keys(lock.packages).flatMap((path) => {
  const marker = 'node_modules/';
  const markerIndex = path.lastIndexOf(marker);
  return markerIndex < 0 ? [] : [path.slice(markerIndex + marker.length)];
});
const removedPackages = new Set([
  '@percy/cli',
  '@percy/cli-pdf',
  'fast-xml-parser',
  'pdfjs-dist',
]);

describe('dependency remediation policy', () => {
  it('keeps direct manifest dependencies aligned with the lockfile root', () => {
    expect(lockRoot.dependencies).toEqual(manifest.dependencies);
    expect(lockRoot.devDependencies).toEqual(manifest.devDependencies);
  });

  it('does not restore the removed Percy PDF and XML parser dependency tree', () => {
    expect(manifest.devDependencies).not.toHaveProperty('@percy/cli');
    expect(matrix).not.toMatch(/optionalTokenCheck\(\s*['"]percy['"]/u);
    expect(
      installedPackageNames.filter((name) => removedPackages.has(name)),
    ).toEqual([]);
  });
});
