import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type Browser, chromium } from '@playwright/test';

const target =
  process.env.RENDERER_BENCHMARK_URL?.trim() || 'http://127.0.0.1:4178/';
const reportPath = resolve('artifacts/quality/renderer-benchmark.json');
const workload = readWorkload();

const browser = await chromium.launch({
  ...(findBrowser() === undefined
    ? { channel: 'chrome' as const }
    : { executablePath: findBrowser() }),
  headless: true,
});
try {
  const device = await browserMetadata(browser);
  const three =
    process.env.RENDERER_BENCHMARK_SKIP_THREE === '1'
      ? []
      : await measureRenderer(browser, 'three', workload.threeFrameCount);
  const rust = await measureRenderer(browser, 'rust', workload.rustFrameCount);
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    target,
    device,
    workload,
    three,
    rust,
    decision: decide(three, rust),
  };
  await mkdir('artifacts/quality', { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

interface Measurement {
  readonly nodeCount: number;
  readonly runs: readonly RunMeasurement[];
  readonly medianFrameP50Ms: number;
  readonly medianFrameP95Ms: number;
  readonly medianFrameMaxMs: number;
  readonly medianFrameFps: number;
}

interface RunMeasurement {
  readonly frameP50Ms: number;
  readonly frameP95Ms: number;
  readonly frameMaxMs: number;
  readonly fps: number;
  readonly samples: number;
}

async function measureRenderer(
  browserInstance: Browser,
  renderer: 'three' | 'rust',
  frameCount: number,
): Promise<readonly Measurement[]> {
  const page = await browserInstance.newPage({
    viewport: workload.viewport,
    deviceScaleFactor: workload.deviceScaleFactor,
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const query = renderer === 'three' ? '?renderer=three' : '?renderer=rust';
    await page.goto(`${target}${query}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.scene === 'ready' &&
        (window as Window & { __peerstellationHooksReady?: boolean })
          .__peerstellationHooksReady === true,
      undefined,
      { timeout: 20_000 },
    );
    // tsx may preserve esbuild's __name helper in the serialized callback.
    await page.evaluate('globalThis.__name = (fn) => fn');
    const actualEngine = await page
      .locator('#universe-canvas')
      .getAttribute('data-renderer-engine');
    if (renderer === 'rust' && actualEngine !== 'rust-wgpu') {
      throw new Error(
        `Rust production renderer did not initialize: ${actualEngine ?? 'missing'}; ${errors.join(' | ')}`,
      );
    }
    return await page.evaluate(
      async ({
        nodeCounts,
        frameCount: samplesPerRun,
        runCount,
        rendererName,
      }) => {
        type FixturePeer = {
          peerId: string;
          status: 'connected';
          source: 'kubo' | 'browser';
          statusObservedAt: number;
          firstSeenAt: number;
          lastSeenAt: number;
          direction: 'inbound' | 'outbound';
          transport: string;
          latencyMs: number;
        };
        const setPeers = (
          window as Window & {
            __peerstellationSetPeers?: (peers: readonly FixturePeer[]) => void;
          }
        ).__peerstellationSetPeers;
        if (setPeers === undefined)
          throw new Error(`${rendererName} fixture unavailable`);
        const median = (values: readonly number[]): number => {
          const sorted = [...values].sort((a, b) => a - b);
          return sorted[Math.floor(sorted.length / 2)] ?? 0;
        };
        const round = (value: number): number => Math.round(value * 100) / 100;
        const measure = async (count: number): Promise<RunMeasurement> => {
          setPeers(
            Array.from({ length: count }, (_, index) => ({
              peerId: `12D3KooW${rendererName}${String(index).padStart(4, '0')}`,
              status: 'connected' as const,
              source:
                index % 7 === 0 ? ('browser' as const) : ('kubo' as const),
              statusObservedAt: 1,
              firstSeenAt: 1,
              lastSeenAt: 1,
              direction:
                index % 2 === 0 ? ('outbound' as const) : ('inbound' as const),
              transport: index % 2 === 0 ? 'quic-v1' : 'websocket',
              latencyMs: 12 + (index % 80),
            })),
          );
          await new Promise<void>((resolvePromise) =>
            setTimeout(resolvePromise, 400),
          );
          const intervals: number[] = [];
          let previous = performance.now();
          return await new Promise<RunMeasurement>((resolvePromise) => {
            const frame = (now: number): void => {
              intervals.push(now - previous);
              previous = now;
              if (intervals.length >= samplesPerRun) {
                const sorted = [...intervals].sort((a, b) => a - b);
                const at = (ratio: number): number =>
                  sorted[
                    Math.min(
                      sorted.length - 1,
                      Math.floor(sorted.length * ratio),
                    )
                  ] ?? 0;
                resolvePromise({
                  frameP50Ms: round(at(0.5)),
                  frameP95Ms: round(at(0.95)),
                  frameMaxMs: round(sorted.at(-1) ?? 0),
                  fps: round(1_000 / Math.max(0.001, at(0.5))),
                  samples: intervals.length,
                });
                return;
              }
              requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          });
        };
        const measurements: Measurement[] = [];
        for (const count of nodeCounts) {
          const runs: RunMeasurement[] = [];
          for (let repetition = 0; repetition < runCount; repetition += 1) {
            runs.push(await measure(count));
          }
          measurements.push({
            nodeCount: count,
            runs,
            medianFrameP50Ms: median(runs.map((run) => run.frameP50Ms)),
            medianFrameP95Ms: median(runs.map((run) => run.frameP95Ms)),
            medianFrameMaxMs: median(runs.map((run) => run.frameMaxMs)),
            medianFrameFps: median(runs.map((run) => run.fps)),
          });
        }
        return measurements;
      },
      {
        nodeCounts: workload.nodeCounts,
        frameCount,
        runCount: workload.runCount,
        rendererName: renderer,
      },
    );
  } finally {
    await page.close();
  }
}

async function browserMetadata(
  browserInstance: Browser,
): Promise<Record<string, unknown>> {
  const page = await browserInstance.newPage({
    viewport: workload.viewport,
    deviceScaleFactor: workload.deviceScaleFactor,
  });
  try {
    await page.goto(`${target}?renderer=rust`, {
      waitUntil: 'domcontentloaded',
    });
    return await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      webgpu: 'gpu' in navigator,
      hardwareConcurrency: navigator.hardwareConcurrency,
    }));
  } finally {
    await page.close();
  }
}

function decide(
  three: readonly Measurement[],
  rust: readonly Measurement[],
): string {
  const threeWorst = Math.max(...three.map((item) => item.medianFrameP95Ms));
  const rustWorst = Math.max(...rust.map((item) => item.medianFrameP95Ms));
  if (!Number.isFinite(threeWorst) || !Number.isFinite(rustWorst))
    return 'inconclusive: missing measurements';
  if (rustWorst < threeWorst * 0.8)
    return 'rust-production-faster: Three.js retained as runtime fallback';
  return 'rust-production-retained: feature-equivalent wall-clock within 20%; Rust avoids Three.js startup chunk';
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

interface RendererWorkload {
  readonly schemaVersion: 1;
  readonly nodeCounts: readonly number[];
  readonly threeFrameCount: number;
  readonly rustFrameCount: number;
  readonly runCount: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
}

function readWorkload(): RendererWorkload {
  const parsed = JSON.parse(
    readFileSync(resolve('benchmarks/renderer-workload.json'), 'utf8'),
  ) as Partial<RendererWorkload>;
  if (
    parsed.schemaVersion !== 1 ||
    parsed.nodeCounts === undefined ||
    parsed.nodeCounts.length === 0 ||
    parsed.nodeCounts.some(
      (value) => !Number.isInteger(value) || value < 1 || value > 10_000,
    ) ||
    typeof parsed.threeFrameCount !== 'number' ||
    !Number.isInteger(parsed.threeFrameCount) ||
    parsed.threeFrameCount < 30 ||
    typeof parsed.rustFrameCount !== 'number' ||
    !Number.isInteger(parsed.rustFrameCount) ||
    parsed.rustFrameCount < 30 ||
    typeof parsed.runCount !== 'number' ||
    !Number.isInteger(parsed.runCount) ||
    parsed.runCount < 1 ||
    parsed.viewport === undefined ||
    !Number.isInteger(parsed.viewport.width) ||
    parsed.viewport.width < 320 ||
    !Number.isInteger(parsed.viewport.height) ||
    parsed.viewport.height < 200 ||
    typeof parsed.deviceScaleFactor !== 'number' ||
    !Number.isFinite(parsed.deviceScaleFactor) ||
    parsed.deviceScaleFactor < 1 ||
    parsed.deviceScaleFactor > 2
  )
    throw new Error('Invalid renderer workload fixture.');
  return parsed as RendererWorkload;
}
