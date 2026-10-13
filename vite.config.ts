import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

const bundleAnalysis =
  process.env.ANALYZE_BUNDLE === '1'
    ? visualizer({
        filename: 'artifacts/bundle/stats.html',
        gzipSize: true,
        brotliSize: true,
        open: false,
        template: 'treemap',
      })
    : undefined;

const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const securityHeaders = {
  ...isolationHeaders,
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https: wss: http://127.0.0.1:5001 http://localhost:5001; worker-src 'self' blob:; child-src 'self' blob:; manifest-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Permissions-Policy':
    'accelerometer=(), autoplay=(), bluetooth=(), browsing-topics=(), camera=(), clipboard-read=(), clipboard-write=(), compute-pressure=(), display-capture=(), fullscreen=(), gamepad=(self), geolocation=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), local-fonts=(), magnetometer=(), microphone=(), midi=(), otp-credentials=(), payment=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), storage-access=(), usb=(), web-share=(), xr-spatial-tracking=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

export default defineConfig({
  plugins: [
    tailwindcss(),
    ...(bundleAnalysis === undefined ? [] : [bundleAnalysis]),
  ],
  server: {
    // The local Docker-based ZAP runner reaches the preview through the
    // explicit host alias below. Keep Vite's DNS-rebinding protection enabled;
    // never use `true`/`all` here.
    allowedHosts: ['host.docker.internal'],
    headers: isolationHeaders,
  },
  preview: {
    allowedHosts: ['host.docker.internal'],
    headers: securityHeaders,
  },
  build: {
    target: 'es2022',
    // Keep source maps out of the static deployment: the public repository is
    // the source of truth, and production should not ship several extra MB.
    // Keep source maps and DWARF out of the static deployment. Local Chrome
    // DevTools diagnostics use a separate opt-in debug artifact instead.
    sourcemap: false,
    // The WebGPU entry intentionally carries both the WebGPU and WebGL2
    // backends for runtime fallback. It is lazy and cacheable, so keep the
    // warning budget honest while splitting the network graph into cacheable
    // transport/runtime chunks instead of hiding one oversized asset.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // Keep the render and network graphs out of the first shell chunk.
        // They are imported after the first paint, so independent cacheable
        // assets can be fetched in parallel without making Helia's large
        // transport graph one monolithic warning-sized file.
        manualChunks: (id) => {
          if (id.includes('/node_modules/three/')) {
            // Three publishes the core, TSL node graph, and WebGPU/WebGL
            // backends as separate entry points. Keep those cache boundaries
            // explicit; otherwise Rollup combines the renderer and node
            // compiler into an 800+ kB first-use chunk even though only one
            // backend is needed on a given device.
            if (
              id.includes('/three/build/three.webgpu') ||
              id.includes('/three/src/renderers/webgpu') ||
              id.includes('/three/src/renderers/webgl-fallback')
            ) {
              return 'three-renderer';
            }
            if (
              id.includes('/three/build/three.tsl') ||
              id.includes('/three/src/nodes') ||
              id.includes('/three/src/Three.TSL')
            ) {
              return 'three-nodes';
            }
            return 'three-core';
          }
          if (
            id.includes('/node_modules/helia/') ||
            id.includes('/node_modules/@helia/')
          ) {
            return 'helia-vendor';
          }
          if (
            id.includes('/node_modules/@libp2p/') ||
            id.includes('/node_modules/@chainsafe/') ||
            id.includes('/node_modules/multiformats/')
          ) {
            return 'libp2p-vendor';
          }
          return null;
        },
      },
    },
  },
});
