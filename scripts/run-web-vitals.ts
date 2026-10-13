import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const target = process.env.WEB_VITALS_URL?.trim() || 'http://127.0.0.1:4178/';
const executablePath = findBrowser();
const browser = await chromium.launch({
  ...(executablePath === undefined
    ? { channel: 'chrome' as const }
    : { executablePath }),
  headless: true,
});
const page = await browser.newPage();
await page.addInitScript(() => {
  const state = { cls: 0, inp: 0, lcp: 0 };
  const globalWindow = window as Window & {
    __peerstellationVitals?: typeof state;
  };
  globalWindow.__peerstellationVitals = state;
});
try {
  await page.goto(target, { waitUntil: 'networkidle' });
  await page.addScriptTag({
    path: resolve('node_modules/web-vitals/dist/web-vitals.iife.js'),
  });
  await page.evaluate(() => {
    const globalWindow = window as Window & {
      __peerstellationVitals?: { cls: number; inp: number; lcp: number };
      webVitals?: {
        onCLS: (
          callback: (metric: { value: number }) => void,
          options?: { reportAllChanges?: boolean },
        ) => void;
        onINP: (
          callback: (metric: { value: number }) => void,
          options?: { reportAllChanges?: boolean; durationThreshold?: number },
        ) => void;
        onLCP: (
          callback: (metric: { value: number }) => void,
          options?: { reportAllChanges?: boolean },
        ) => void;
      };
    };
    const state = globalWindow.__peerstellationVitals;
    const vitals = globalWindow.webVitals;
    if (state === undefined || vitals === undefined) {
      throw new Error('web-vitals IIFE did not initialize after navigation');
    }
    vitals.onCLS(
      (metric) => {
        state.cls = metric.value;
      },
      { reportAllChanges: true },
    );
    vitals.onINP(
      (metric) => {
        state.inp = metric.value;
      },
      { reportAllChanges: true, durationThreshold: 16 },
    );
    vitals.onLCP(
      (metric) => {
        state.lcp = metric.value;
      },
      { reportAllChanges: true },
    );
  });
  await page.waitForTimeout(2_000);
  const result = await page.evaluate(() => {
    const globalWindow = window as Window & {
      __peerstellationVitals?: { cls: number; inp: number; lcp: number };
      webVitals?: unknown;
    };
    return {
      ...globalWindow.__peerstellationVitals,
      webVitalsLoaded:
        typeof globalWindow.webVitals === 'object' ||
        typeof globalWindow.webVitals === 'function',
      lcpEntries: performance
        .getEntriesByType('largest-contentful-paint')
        .map((entry) => entry.startTime),
      supportedEntryTypes: PerformanceObserver.supportedEntryTypes,
      navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
    };
  });
  console.log(JSON.stringify({ target, ...result }));
} finally {
  await browser.close();
}

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
