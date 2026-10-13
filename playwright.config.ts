import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // A cold WebGPU/WASM context can spend several seconds in adapter and
  // shader setup before the first scene-ready marker. Keep that startup
  // budget distinct from normal interaction assertions.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  // Four simultaneous WebGPU/WebGL contexts make headless macOS startup
  // nondeterministic and do not increase coverage. Two workers keep the
  // browser matrix parallel while preserving a stable renderer budget.
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    // Headless macOS may expose neither a hardware adapter nor a WebGL
    // context. SwiftShader keeps the WebGPU -> WebGL2 fallback path alive so
    // renderer E2E tests exercise the app instead of failing at browser setup.
    launchOptions: {
      args: [
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--use-gl=swiftshader',
      ],
    },
    baseURL: 'http://127.0.0.1:4175',
    ...(process.env.CI ? {} : { channel: 'chrome' }),
    screenshot: 'only-on-failure',
    trace: process.env.PLAYWRIGHT_TRACE === '1' ? 'on' : 'retain-on-failure',
  },
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    // CI normally owns a clean server, while local diagnostics can opt into
    // an already warmed Vite instance without inheriting the npm predev
    // renderer rebuild (`PLAYWRIGHT_REUSE_SERVER=1`).
    reuseExistingServer:
      !process.env.CI || process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 120_000,
  },
});
