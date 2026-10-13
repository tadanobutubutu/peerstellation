import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type Browser, chromium } from '@playwright/test';

const target =
  process.env.RENDERER_BENCHMARK_URL?.trim() || 'http://127.0.0.1:4178/';
const candidatePath = resolve('public/__renderer-benchmark');
const reportPath = resolve('artifacts/quality/renderer-benchmark.json');
const workload = readWorkload();
const nodeCounts = workload.nodeCounts;
const threeFrameCount = workload.threeFrameCount;
const rustFrameCount = workload.rustFrameCount;
const runCount = workload.runCount;

execFileSync('npm', ['run', 'build:renderer-benchmark'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

const browserPath = findBrowser();
const browser = await chromium.launch({
  ...(browserPath === undefined
    ? { channel: 'chrome' as const }
    : { executablePath: browserPath }),
  headless: true,
});

try {
  const metadata = await browserMetadata(browser);
  const three =
    process.env.RENDERER_BENCHMARK_SKIP_THREE === '1'
      ? []
      : await measureThree(browser);
  const rust = await measureRust(browser);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target,
    device: metadata,
    workload: {
      nodeCounts,
      threeFrameCount,
      rustFrameCount,
      runCount,
      viewport: workload.viewport,
      deviceScaleFactor: workload.deviceScaleFactor,
      note: 'Rust wgpu is a focused GPU submission candidate, not a feature-equivalent replacement. Compare the recorded metrics before any renderer promotion.',
    },
    three,
    rust,
    decision: decide(three, rust),
  };
  await mkdir('artifacts/quality', { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await rm(candidatePath, { recursive: true, force: true });
}

interface Measurement {
  readonly nodeCount: number;
  readonly runs: readonly RunMeasurement[];
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

async function measureThree(browser: Browser): Promise<readonly Measurement[]> {
  const page = await browser.newPage({
    viewport: workload.viewport,
    deviceScaleFactor: workload.deviceScaleFactor,
  });
  try {
    await page.goto(target, { waitUntil: 'networkidle' });
    await page.evaluate('globalThis.__name = (fn) => fn');
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.scene === 'ready' &&
        (window as Window & { __peerstellationHooksReady?: boolean })
          .__peerstellationHooksReady === true,
      undefined,
      { timeout: 15_000 },
    );
    return await page.evaluate(
      async ({ nodeCounts: counts, frameCount, runCount: repetitions }) => {
        const roundValue = (value: number): number =>
          Math.round(value * 100) / 100;
        const medianValue = (values: readonly number[]): number => {
          const sorted = [...values].sort((a, b) => a - b);
          return sorted[Math.floor(sorted.length / 2)] ?? 0;
        };
        type FixturePeer = {
          peerId: string;
          status: 'connected';
          source: 'kubo' | 'browser';
          statusObservedAt: number;
          firstSeenAt: number;
          lastSeenAt: number;
          direction: 'inbound' | 'outbound';
          transport: string;
          latencyMs?: number;
        };
        const setPeers = (
          window as Window & {
            __peerstellationSetPeers?: (peers: readonly FixturePeer[]) => void;
          }
        ).__peerstellationSetPeers;
        if (setPeers === undefined)
          throw new Error('Three.js fixture unavailable');
        const measure = async (count: number): Promise<RunMeasurement> => {
          const peers: FixturePeer[] = Array.from(
            { length: count },
            (_, index) => ({
              peerId: `12D3KooWThreeBenchmark${String(index).padStart(4, '0')}`,
              status: 'connected',
              source: index % 7 === 0 ? 'browser' : 'kubo',
              statusObservedAt: 1,
              firstSeenAt: 1,
              lastSeenAt: 1,
              direction: index % 2 === 0 ? 'outbound' : 'inbound',
              transport: 'quic-v1',
              latencyMs: 12 + (index % 80),
            }),
          );
          setPeers(peers);
          await new Promise<void>((resolve) => setTimeout(resolve, 500));
          const samples: number[] = [];
          let previous = performance.now();
          return await new Promise<RunMeasurement>((resolve) => {
            const frame = (now: number): void => {
              samples.push(now - previous);
              previous = now;
              if (samples.length >= frameCount) {
                const sorted = [...samples].sort((a, b) => a - b);
                const at = (ratio: number): number =>
                  sorted[
                    Math.min(
                      sorted.length - 1,
                      Math.floor(sorted.length * ratio),
                    )
                  ] ?? 0;
                resolve({
                  frameP50Ms: roundValue(at(0.5)),
                  frameP95Ms: roundValue(at(0.95)),
                  frameMaxMs: roundValue(sorted.at(-1) ?? 0),
                  fps: roundValue(1_000 / Math.max(0.001, at(0.5))),
                  samples: samples.length,
                });
                return;
              }
              requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          });
        };
        const measurements: Measurement[] = [];
        for (const count of counts) {
          const runs: RunMeasurement[] = [];
          for (let repetition = 0; repetition < repetitions; repetition += 1) {
            runs.push(await measure(count));
          }
          measurements.push({
            nodeCount: count,
            runs,
            medianFrameP95Ms: medianValue(runs.map((run) => run.frameP95Ms)),
            medianFrameMaxMs: medianValue(runs.map((run) => run.frameMaxMs)),
            medianFrameFps: medianValue(runs.map((run) => run.fps)),
          });
        }
        return measurements;
      },
      { nodeCounts, frameCount: threeFrameCount, runCount },
    );
  } finally {
    await page.close();
  }
}

async function measureRust(browser: Browser): Promise<readonly Measurement[]> {
  const page = await browser.newPage({
    viewport: workload.viewport,
    deviceScaleFactor: workload.deviceScaleFactor,
  });
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  try {
    await page.goto(`${target}__renderer-benchmark/index.html`, {
      waitUntil: 'networkidle',
    });
    await page.evaluate('globalThis.__name = (fn) => fn');
    try {
      await page.waitForFunction(
        () =>
          (window as Window & { __rendererBenchmarkReady?: boolean })
            .__rendererBenchmarkReady === true,
        undefined,
        { timeout: 15_000 },
      );
    } catch (error) {
      const body = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      throw new Error(
        `Rust wgpu module did not initialize: ${String(error)}; body=${body}; runtimeErrors=${runtimeErrors.join(' | ')}`,
        { cause: error },
      );
    }
    return await page.evaluate(
      async ({ nodeCounts: counts, frameCount, runCount: repetitions }) => {
        const roundValue = (value: number): number =>
          Math.round(value * 100) / 100;
        const medianValue = (values: readonly number[]): number => {
          const sorted = [...values].sort((a, b) => a - b);
          return sorted[Math.floor(sorted.length / 2)] ?? 0;
        };
        type CandidateWindow = Window & {
          __rendererBenchmarkRun?: (
            nodeCount: number,
            frameCount: number,
          ) => Promise<{ elapsedMs: number; renderedNodes: number }>;
        };
        const run = (window as CandidateWindow).__rendererBenchmarkRun;
        if (run === undefined)
          throw new Error('Rust wgpu candidate unavailable');
        const measurements: Measurement[] = [];
        for (const count of counts) {
          const runs: RunMeasurement[] = [];
          for (let repetition = 0; repetition < repetitions; repetition += 1) {
            const result = await run(count, frameCount);
            const frameMs = result.elapsedMs / frameCount;
            runs.push({
              frameP50Ms: roundValue(frameMs),
              frameP95Ms: roundValue(frameMs),
              frameMaxMs: roundValue(frameMs),
              fps: roundValue(1_000 / Math.max(0.001, frameMs)),
              samples: frameCount,
            });
          }
          measurements.push({
            nodeCount: count,
            runs,
            medianFrameP95Ms: medianValue(runs.map((run) => run.frameP95Ms)),
            medianFrameMaxMs: medianValue(runs.map((run) => run.frameMaxMs)),
            medianFrameFps: medianValue(runs.map((run) => run.fps)),
          });
        }
        return measurements;
      },
      { nodeCounts, frameCount: rustFrameCount, runCount },
    );
  } finally {
    await page.close();
  }
}

async function browserMetadata(
  browser: Browser,
): Promise<Record<string, unknown>> {
  const page = await browser.newPage({
    viewport: workload.viewport,
    deviceScaleFactor: workload.deviceScaleFactor,
  });
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded' });
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
  if (!Number.isFinite(threeWorst) || !Number.isFinite(rustWorst)) {
    return 'inconclusive: missing measurements';
  }
  if (rustWorst < threeWorst * 0.8) {
    return 'candidate-faster: requires feature-parity and accessibility review before promotion';
  }
  return 'retain-three: Rust candidate is not a proven product-level win';
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
  const threeFrameCount = parsed.threeFrameCount;
  const rustFrameCount = parsed.rustFrameCount;
  const runCount = parsed.runCount;
  if (
    parsed.schemaVersion !== 1 ||
    parsed.nodeCounts === undefined ||
    parsed.nodeCounts.length === 0 ||
    parsed.nodeCounts.some(
      (value) => !Number.isInteger(value) || value < 1 || value > 10_000,
    ) ||
    typeof threeFrameCount !== 'number' ||
    !Number.isInteger(threeFrameCount) ||
    threeFrameCount < 30 ||
    typeof rustFrameCount !== 'number' ||
    !Number.isInteger(rustFrameCount) ||
    rustFrameCount < 30 ||
    typeof runCount !== 'number' ||
    !Number.isInteger(runCount) ||
    runCount < 1 ||
    parsed.viewport === undefined ||
    !Number.isInteger(parsed.viewport.width) ||
    parsed.viewport.width < 320 ||
    !Number.isInteger(parsed.viewport.height) ||
    parsed.viewport.height < 200 ||
    typeof parsed.deviceScaleFactor !== 'number' ||
    !Number.isFinite(parsed.deviceScaleFactor) ||
    parsed.deviceScaleFactor < 1 ||
    parsed.deviceScaleFactor > 2
  ) {
    throw new Error('Invalid renderer workload fixture.');
  }
  return parsed as RendererWorkload;
}
