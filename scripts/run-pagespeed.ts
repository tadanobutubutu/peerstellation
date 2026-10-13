import { mkdir, writeFile } from 'node:fs/promises';

const apiKey = process.env.PAGESPEED_API_KEY?.trim();
const target = process.env.PAGESPEED_URL?.trim() || 'https://ipfsuniverse.xyz/';
if (apiKey === undefined || apiKey.length === 0) {
  console.log('PageSpeed Insights API skipped: PAGESPEED_API_KEY is not set.');
  process.exit(0);
}

const targetUrl = new URL(target);
if (!['http:', 'https:'].includes(targetUrl.protocol)) {
  throw new Error('PAGESPEED_URL must use http or https.');
}
const endpoint = new URL(
  'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
);
endpoint.searchParams.set('url', targetUrl.toString());
endpoint.searchParams.set('key', apiKey);
endpoint.searchParams.append('category', 'PERFORMANCE');
endpoint.searchParams.append('category', 'ACCESSIBILITY');
endpoint.searchParams.append('category', 'BEST_PRACTICES');
endpoint.searchParams.append('category', 'SEO');
endpoint.searchParams.set(
  'strategy',
  process.env.PAGESPEED_STRATEGY ?? 'mobile',
);

const response = await fetch(endpoint, {
  headers: { accept: 'application/json' },
});
const body = (await response.json()) as PageSpeedResponse;
if (!response.ok) {
  throw new Error(
    `PageSpeed Insights API failed (${response.status}): ${body.error?.message ?? 'unknown error'}`,
  );
}

const scores = Object.fromEntries(
  Object.entries(body.lighthouseResult?.categories ?? {}).map(
    ([category, result]) => [
      category,
      result.score === null ? null : result.score * 100,
    ],
  ),
);
const report = {
  generatedAt: new Date().toISOString(),
  target: targetUrl.toString(),
  strategy: process.env.PAGESPEED_STRATEGY ?? 'mobile',
  scores,
};
await mkdir('artifacts/quality', { recursive: true });
await writeFile(
  'artifacts/quality/pagespeed.json',
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify(report));

if (process.env.PAGESPEED_STRICT === '1') {
  const performanceScore = scores.performance;
  if (typeof performanceScore !== 'number' || performanceScore < 90) {
    throw new Error(
      `PageSpeed performance score ${String(performanceScore)} is below the strict 90 threshold.`,
    );
  }
}

interface PageSpeedResponse {
  readonly error?: { readonly message?: string };
  readonly lighthouseResult?: {
    readonly categories?: Record<string, { readonly score: number | null }>;
  };
}
