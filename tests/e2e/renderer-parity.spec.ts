import { expect, type Page, test } from '@playwright/test';

// Three.js is the visual reference for the Rust renderer. These checks stay
// deterministic and short: they read the diagnostics the Rust path exposes
// for the visual contract instead of comparing screenshots.

const SETTINGS_KEY = 'peerstellation.settings.v1';
const SCENE_READY_TIMEOUT_MS = 90_000;

async function openRustScene(
  page: Page,
  overrides: Record<string, unknown>,
): Promise<boolean> {
  await page.addInitScript(
    ([key, patch]) => {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Record<
        string,
        unknown
      > | null;
      localStorage.setItem(
        key,
        JSON.stringify({
          ...(stored ?? {}),
          version: 1,
          qualityMode: 'manual',
          preset: 'high',
          pixelRatio: 1,
          ...patch,
        }),
      );
    },
    [SETTINGS_KEY, overrides] as const,
  );
  // Probe the blank document first. This avoids paying the full renderer
  // startup cost in a known WebGL-only headless worker. The same check is
  // repeated against the canvas after navigation below because browser GPU
  // availability can still change while the page is booting.
  const adapterAvailable = await page.evaluate(async () => {
    const gpu = (
      navigator as Navigator & {
        readonly gpu?: {
          requestAdapter?: (options?: {
            powerPreference?: 'low-power' | 'high-performance';
          }) => Promise<unknown>;
        };
      }
    ).gpu;
    if (gpu?.requestAdapter === undefined) return false;
    let timer: number | undefined;
    try {
      const adapter = await Promise.race([
        gpu.requestAdapter({ powerPreference: 'high-performance' }),
        new Promise<null>((resolve) => {
          timer = window.setTimeout(() => resolve(null), 1_500);
        }),
      ]);
      return adapter !== null;
    } catch {
      return false;
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
    }
  });
  if (!adapterAvailable) {
    test.skip(true, 'WebGPU adapter unavailable in this headless runtime');
    return false;
  }
  await page.goto('/');
  // The canvas diagnostics are the source of truth here. An adapter probe made
  // before scene startup is racy in headless Chromium: requestAdapter() can
  // resolve after the app's bounded startup probe has already selected the
  // production WebGL fallback. Wait for the real scene state, then skip only
  // when the app explicitly reports that WebGPU is unavailable. Other fallback
  // reasons remain failures so a broken Rust initialisation is not hidden.
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready', {
    timeout: SCENE_READY_TIMEOUT_MS,
  });
  const canvas = page.locator('#universe-canvas');
  const engine = await canvas.getAttribute('data-renderer-engine');
  const fallback = await canvas.getAttribute('data-renderer-fallback');
  if (engine !== 'rust-wgpu' && fallback === 'webgpu-unavailable') {
    test.skip(true, 'WebGPU adapter unavailable in this headless runtime');
    return false;
  }
  await expect(canvas).toHaveAttribute('data-renderer-engine', 'rust-wgpu');
  return true;
}

test('keeps world-space dust and nebula after the Rust panorama loads', async ({
  page,
}) => {
  // The product queues the panorama 5.5 s after startup and then decodes it.
  // Listen before navigation so a busy full-suite run cannot miss the real
  // response. A boolean event marker also remains safe when the Rust-only test
  // is skipped before navigation in a WebGL-only headless worker.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  let panoramaLoaded = false;
  page.on('response', (response) => {
    if (
      response.url().endsWith('/skybox/nightsky-2k.webp') &&
      response.status() < 400
    ) {
      panoramaLoaded = true;
    }
  });
  if (!(await openRustScene(page, { skyboxMode: 'space-2k' }))) return;
  const canvas = page.locator('#universe-canvas');
  await expect.poll(() => panoramaLoaded, { timeout: 45_000 }).toBe(true);
  await expect(canvas).toHaveAttribute('data-skybox-status', 'ready', {
    timeout: 12_000,
  });
  await expect(canvas).toHaveAttribute('data-dust-points', '2400');
  await expect(canvas).toHaveAttribute('data-nebula-points', '140');
  // 2,400 dust + 140 nebula Points + the Three cloud and the deep cloud.
  await expect(canvas).toHaveAttribute('data-decoration-instances', '2542');
});

test('freezes Rust shader motion time at zero motion scale', async ({
  page,
}) => {
  if (!(await openRustScene(page, { skyboxMode: 'off', motionScale: 0 })))
    return;
  const canvas = page.locator('#universe-canvas');
  await expect(canvas).toHaveAttribute('data-motion-time-ms', /^\d+$/);
  const frames = Number(await canvas.getAttribute('data-rendered-frames'));
  const before = await canvas.getAttribute('data-motion-time-ms');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-rendered-frames')))
    .toBeGreaterThan(frames + 5);
  expect(await canvas.getAttribute('data-motion-time-ms')).toBe(before);
});

test('keeps Rust shader motion time still while motion is paused', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (!(await openRustScene(page, { skyboxMode: 'off' }))) return;
  const canvas = page.locator('#universe-canvas');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await expect(canvas).toHaveAttribute('data-motion-time-ms', '0');
});

test('keeps a 1,024-peer frame within the renderer draw-call budget', async ({
  page,
}) => {
  // Cold WebGPU shader compilation for the dense scene can exceed the default.
  test.setTimeout(90_000);
  await page.addInitScript(
    ([key]) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          qualityMode: 'manual',
          preset: 'high',
          pixelRatio: 1,
          skyboxMode: 'off',
        }),
      );
    },
    [SETTINGS_KEY] as const,
  );
  await page.goto('/?renderer=three');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready', {
    timeout: 30_000,
  });
  const canvas = page.locator('#universe-canvas');
  await expect(canvas).not.toHaveAttribute('data-renderer-engine', 'rust-wgpu');
  await page.evaluate(() => {
    const transports = ['websocket', 'webrtc', 'webtransport', 'tcp'];
    const id = (index: number): string =>
      `12D3KooWBudget${String(index).padStart(5, '0')}`;
    const peers = Array.from({ length: 1_024 }, (_, index) => {
      const band = index % 8;
      const kubo = band === 5 || band === 6;
      const status =
        band === 7
          ? 'disconnected'
          : band === 3 || band === 4
            ? 'discovered'
            : 'connected';
      return {
        peerId: id(index),
        status,
        source: kubo ? 'kubo' : 'browser',
        statusObservedAt: 1,
        firstSeenAt: 1,
        lastSeenAt: 1,
        transport: kubo ? 'quic-v1' : transports[index % 4],
        ...(status === 'connected' && index % 3
          ? { latencyMs: 10 + (index % 400), latencyObservedAt: 1 }
          : {}),
      };
    });
    (
      window as Window & {
        __peerstellationSetPeers?: (peers: readonly unknown[]) => void;
      }
    ).__peerstellationSetPeers?.(peers);
  });
  await expect(canvas).toHaveAttribute('data-browser-node-count', '384');
  await expect(canvas).toHaveAttribute('data-kubo-node-count', '256');
  await expect(canvas).toHaveAttribute('data-disconnected-node-count', '128');
  // Every marker class, halo, host layer and evidence line is on screen, so
  // the sampled per-frame count covers the dense scene (plus the output pass).
  await expect
    .poll(
      async () => Number(await canvas.getAttribute('data-gpu-draw-calls')),
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThan(8);
  await page.waitForTimeout(2_500);
  const drawCalls = Number(await canvas.getAttribute('data-gpu-draw-calls'));
  const renderer = await canvas.getAttribute('data-renderer');
  // Rust/wgpu has one linear scene plan (16 draws including the output pass).
  // Three's WebGL2 compatibility path retains its richer material layers and
  // has a separately measured 24-call ceiling. This keeps the test honest on
  // both backends instead of pretending WebGL has the Rust budget.
  expect(drawCalls).toBeLessThanOrEqual(renderer === 'WebGPU' ? 16 : 24);
});

test('reports the draw calls the Rust renderer actually executed', async ({
  page,
}) => {
  if (!(await openRustScene(page, { skyboxMode: 'off' }))) return;
  const canvas = page.locator('#universe-canvas');
  await expect(canvas).toHaveAttribute(
    'data-surface-format',
    /^(Rgba8Unorm|Bgra8Unorm)$/,
  );
  await page.evaluate(() => {
    (
      window as Window & {
        __peerstellationSetPeers?: (peers: readonly unknown[]) => void;
      }
    ).__peerstellationSetPeers?.([
      {
        peerId: '12D3KooWParityBrowserEdge',
        status: 'connected',
        source: 'browser',
        statusObservedAt: 1,
        firstSeenAt: 1,
        lastSeenAt: 1,
        transport: 'websocket',
        latencyMs: 40,
      },
    ]);
  });
  await expect(canvas).toHaveAttribute('data-edge-segments', '1');
  // One draw per step of the Three-ordered draw plan in the linear scene
  // pass, plus the ACES/sRGB output pass.
  await expect
    .poll(
      async () =>
        Number(await canvas.getAttribute('data-draw-calls')) -
        Number(await canvas.getAttribute('data-draw-plan-steps')),
    )
    .toBe(1);
  await expect(canvas).toHaveAttribute('data-render-passes', '2');
  await expect(canvas).toHaveAttribute(
    'data-color-pipeline',
    /^(hdr-rgba16float|ldr-rgba8unorm)$/,
  );
});
