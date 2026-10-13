import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { PurgeCSS } from 'purgecss';

const outputDirectory = resolve('artifacts/purgecss');
await mkdir(outputDirectory, { recursive: true });

const cssFiles = await findFiles(
  resolve('dist'),
  (path) => extname(path) === '.css',
);
const contentFiles = await findFiles(resolve('dist'), (path) =>
  ['.html', '.js'].includes(extname(path)),
);
if (cssFiles.length === 0) {
  throw new Error(
    'PurgeCSS found no CSS in dist; run the production build first.',
  );
}

const content = await Promise.all(
  contentFiles.map((path) => readFile(path, 'utf8')),
);
const cssInputs = await Promise.all(
  cssFiles.map(async (path) => ({
    raw: await readFile(path, 'utf8'),
    path,
  })),
);
const results = await new PurgeCSS().purge({
  css: cssInputs,
  content: content.map((raw, index) => ({
    raw,
    extension: extname(contentFiles[index] ?? '').slice(1),
  })),
  safelist: {
    standard: [/^peer-/, /^settings-/, /^scene-/u, /^node-/u, /^motion-/u],
  },
});

const report = results.map((result, index) => ({
  file: result.file ?? cssInputs[index]?.path,
  originalBytes: cssInputs[index]?.raw.length ?? result.css.length,
  purgedBytes: result.css.length,
  removedBytes: Math.max(
    0,
    (cssInputs[index]?.raw.length ?? result.css.length) - result.css.length,
  ),
}));
await writeFile(
  resolve(outputDirectory, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify(report));

async function findFiles(
  directory: string,
  predicate: (path: string) => boolean,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await findFiles(path, predicate)));
    else if (entry.isFile() && predicate(path)) files.push(path);
  }
  return files.sort();
}
