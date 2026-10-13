import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import {
  fetchWithTimeout,
  withViteServer,
  writeQualityArtifact,
} from './ipfs-script-common';

const executablePath = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].find((candidate) => candidate !== undefined && existsSync(candidate));

await withViteServer(async (baseUrl) => {
  const deepRoute = new URL('/observatory/unknown-route', baseUrl);
  const notFound = new URL('/404.html', baseUrl);
  const deepResponse = await fetchWithTimeout(deepRoute, { method: 'GET' });
  const notFoundResponse = await fetchWithTimeout(notFound, { method: 'GET' });
  if (deepResponse.status >= 500 || notFoundResponse.status >= 500) {
    throw new Error(
      `SPA routing returned ${deepResponse.status}/${notFoundResponse.status}.`,
    );
  }
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath === undefined
      ? { channel: 'chrome' as const }
      : { executablePath }),
  });
  try {
    const page = await browser.newPage();
    const deepPage = await page.goto(deepRoute.toString(), {
      waitUntil: 'domcontentloaded',
    });
    if (
      deepPage?.status() !== 200 ||
      (await page.locator('#universe-main').count()) !== 1
    ) {
      throw new Error('Unknown SPA route did not serve the application shell.');
    }
    const notFoundPage = await page.goto(notFound.toString(), {
      waitUntil: 'domcontentloaded',
    });
    if (
      notFoundPage?.status() !== 200 ||
      (await page.getByRole('heading', { level: 1 }).count()) !== 1
    ) {
      throw new Error(
        '404.html did not serve the accessible fallback document.',
      );
    }
  } finally {
    await browser.close();
  }
  await writeQualityArtifact('spa-routing.json', {
    deepRoute: deepRoute.toString(),
    deepRouteStatus: deepResponse.status,
    notFoundStatus: notFoundResponse.status,
  });
});
console.log(
  'SPA routing check passed: deep route shell and /404.html are reachable.',
);
