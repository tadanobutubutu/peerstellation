import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const backstopBin = resolve('node_modules/.bin/backstop');
const sourceConfig = resolve('backstop.json');
const reference = resolve('backstop_data/bitmaps_reference');
const browserPath = findBrowser();
if (browserPath === undefined) {
  throw new Error('BackstopJS requires a local Chrome or Edge executable.');
}
const config = resolve('artifacts/backstop.config.json');
await mkdir('artifacts', { recursive: true });
const parsedConfig = JSON.parse(await readFile(sourceConfig, 'utf8')) as {
  readonly engineOptions?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
};
const runtimeConfig = {
  ...parsedConfig,
  engineOptions: {
    ...parsedConfig.engineOptions,
    executablePath: browserPath,
  },
};
await writeFile(config, `${JSON.stringify(runtimeConfig, null, 2)}\n`, 'utf8');
const args = ['--configPath', config, '--docker=false'];

if (process.env.BACKSTOP_REBASELINE === '1' && existsSync(reference)) {
  await rm(reference, { recursive: true, force: true });
}

if (!existsSync(reference)) {
  console.log(
    'BackstopJS reference baseline is absent; generating a local baseline first.',
  );
  execFileSync(backstopBin, ['reference', ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}
execFileSync(backstopBin, ['test', ...args], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

function findBrowser(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  return candidates.find(
    (candidate) => candidate !== undefined && existsSync(candidate),
  );
}
