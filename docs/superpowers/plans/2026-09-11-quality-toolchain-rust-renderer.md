# Quality Toolchain and Rust Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or an equivalent task-by-task execution workflow) to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status (2026-09-14):** 実装済み。必須ローカル検査は `artifacts/quality/report.json` で全件 `pass`。Rust `wgpu` の実製品経路をWebGPU/WebGL2の本番レンダラーへ昇格し、Three.jsは初期化失敗時と `?renderer=three` の互換フォールバックに残した。認証が必要な外部検査と、このWeb専用構成に存在しない技術は、下記の理由付き `skip` / `not-applicable` として記録する。

**Goal:** Make Peerstellation's quality process reproducible and evidence-driven, run every applicable free local quality gate on each verification pass, remove Zig from the production WASM path, and select the 3D renderer architecture from a measured browser benchmark rather than an assumption.

**Architecture:** Rust `wgpu` is the production renderer behind a TypeScript browser shell. Rust owns numeric simulation, edge layout, and the three GPU passes through the shipped WASM module; TypeScript owns DOM, Helia/libp2p observation, input, accessibility, and settings. The complete Three.js WebGPU/WebGL2 scene remains a lazy compatibility fallback for missing/failed Rust initialization and an explicit `?renderer=three` diagnostic path. Promotion was based on the same-device feature-equivalent browser workload, WebGL2 fallback, accessibility, and bundle/startup review; the standalone `wasm/renderer-benchmark/` remains a non-shipped lower-bound experiment.

**Tech Stack:** TypeScript 7, Vite/Rolldown, Three.js 0.185, WebGPU/WebGL2, Rust `wasm32-unknown-unknown`, Vitest, Playwright, axe-core, Pa11y, Lighthouse, Biome, ESLint audit plugins, Knip, Zod, cargo clippy/fmt/audit/deny/vet, wasm-tools, wasm-opt, Twiggy, wasm-snip, Stylelint/Lightning CSS, Markuplint/html-validate, OWASP ZAP, and opt-in authenticated SaaS checks (PSI API, Chromatic, Percy) with explicit skip evidence when credentials are absent.

**Spec:** `docs/product-spec.md` and this plan. The existing product behavior (real Helia/Kubo observations only, no fabricated topology, WebGPU fallback, reduced-motion support, 185 locale packs) remains the source of truth.

## Global Constraints

- Do not claim a tool passed when it was unavailable or skipped. Every tool produces a machine-readable status of `passed`, `failed`, `skipped-missing-tool`, `skipped-missing-credential`, or `not-applicable` with a reason.
- Required local gates remain free, headless, and deterministic. Cloud services such as PSI, Chromatic, and Percy run only when their documented token/project variables exist; otherwise the local report records the skip and CI does not silently turn it into a pass.
- Run only tools applicable to the repository. For example, `eslint-plugin-jsx-a11y` is configured as an audit and reports no JSX scope when no JSX exists; `leptosfmt`, `dx fmt`, AccessKit, Rustywind, and server-side HTML sanitizers are documented as not applicable until the corresponding technology is introduced.
- Rust is the only source language for shipped WASM. The former Zig source and setup/build steps have been removed; the Rust port has equivalent ABI and regression coverage.
- The Rust renderer is not selected merely to satisfy a technology preference. The decision is recorded in the generated production benchmark artifact and browser tests on the same device/browser; Three.js remains available as an explicit and failure-safe fallback.
- Do not send production source maps or debug DWARF to the public deployment. DWARF-enabled artifacts are retained only for local Chrome DevTools diagnostics and are never used as release assets.
- Each implementation task starts with a focused failing test or fixture (except declarative tool configuration/generated reports) and ends with fresh verification evidence.

## Tool Applicability Matrix

| Area | Required local gate | Conditional/remote gate | Explicit not-applicable rule |
| --- | --- | --- | --- |
| Types/schema | `tsc`, Zod boundary parsing, Valibot/ArkType parity, Vitest | — | 本番ランタイムはZod、Valibot/ArkTypeは同じfixtureを比較する開発検査 |
| JS/TS quality | Biome, ESLint security audit, Knip, npm audit | — | `eslint-plugin-jsx-a11y` reports no JSX files when the source remains vanilla TS |
| Browser accessibility | axe-core, axe DevTools protocol audit, Pa11y, Lighthouse, html-validate, Markuplint, Playwright | AccessKit only for a native accessibility harness | No native app is shipped, so AccessKit is an evidence-backed N/A |
| Browser performance | Lighthouse, web-vitals, bundle analyzer, Chrome DevTools trace, Playwright trace | PSI API when `PAGESPEED_API_KEY` is present | — |
| Rust/WASM | clippy, rustfmt, wasm-tools validate, wasm-opt, cargo-audit, cargo-deny, cargo-vet, Twiggy, wasm-snip | Chrome DevTools DWARF local diagnostic build | `leptosfmt`/`dx fmt` are N/A because no Leptos/Dioxus crate exists |
| CSS/HTML | Stylelint, Lightning CSS, dprint, Markuplint, PurgeCSS | Rustywind only if Tailwind class migration is performed | `ammonia`/`lol-html` are N/A for a static trusted shell unless a server-side HTML transform is added |
| Security | CSP/header test, CSP Evaluator fixture, Semgrep, npm/cargo audits, ZAP baseline | Authenticated ZAP only with a configured target | — |
| Cross-browser/visual | Playwright, Cypress, BackstopJS, Vitest snapshots | Chromatic/Percy with project tokens | SaaS status is never inferred from a local screenshot |

### Task 1: Check in the execution policy and baseline report

**Files:**
- Create: `docs/quality/tool-matrix.md`
- Create: `docs/quality/quality-report.schema.json`
- Create: `scripts/run-quality-matrix.ts`
- Modify: `package.json`
- Test: `tests/quality-matrix.test.ts`

- [ ] Write tests for deterministic status aggregation, redaction of secrets, missing-tool classification, and “required local gate failed” exit behavior.
- [ ] Implement a typed command registry with command, category, required/conditional applicability, timeout, report path, and environment requirements. Execute commands without shell interpolation and write JSON plus Markdown summaries under `artifacts/quality/` (ignored by Git).
- [ ] Add `quality:all` and focused scripts. The matrix must run every applicable local tool in one pass and must list each unavailable optional tool rather than hiding it.
- [ ] Document how remote credentials are supplied and how a reviewer can reproduce every result offline.
- [ ] Verify unit tests and a dry-run matrix before adding new dependencies.

### Task 2: Type/schema, lint, dependency, and formatting gates

**Files:**
- Create: `src/contracts/peer-schema.ts`
- Create: `eslint.config.ts`
- Create: `stylelint.config.mjs`
- Create: `.markuplintrc.json`
- Create: `dprint.json`
- Create: `knip.jsonc`
- Modify: `src/network/*.ts`, `src/settings/*.ts`, `src/i18n/*.ts`
- Modify: `package.json`, `package-lock.json`, `tsconfig.json`
- Test: `tests/contracts.test.ts`

- [ ] Add Zod parsing at external data boundaries (Helia/Kubo observer payloads, persisted settings, locale pack metadata) and preserve the existing domain types after parsing. Reject unknown/unsafe values without throwing from the render loop.
- [ ] Add ESLint security rules and `eslint-plugin-jsx-a11y` as a dedicated audit configuration. Limit the JSX rule to JSX files and emit an explicit no-JSX result for the current TS/DOM code.
- [ ] Add Knip, `npm audit --audit-level=high`, Stylelint, Lightning CSS validation, dprint check, Markuplint, and PurgeCSS dry-run. Preserve Biome as the formatter/linter used for ordinary edits; do not create conflicting auto-fixes.
- [ ] Add tests for malformed peer/settings/locale payloads and run `tsc`, Vitest, Biome, ESLint, Knip, and npm audit.

### Task 3: Port the former physics/edge kernel to Rust

**Files:**
- Modify: `wasm/Cargo.toml`, `wasm/src/lib.rs`
- Delete: `wasm/particles.zig`
- Modify: `scripts/build-wasm.ts`, `.github/workflows/deploy-ipfs.yml`, `src/wasm/load-wasm.ts`, `src/scene/universe.ts`, `README.md`, `docs/product-spec.md`
- Test: `tests/wasm-modules.test.ts`, `tests/wasm-loader.test.ts`

- [ ] Add a Rust fixture test covering deterministic seeding, wide latency-derived radius, motion, center edges, relay edges, Kubo exclusion, and disconnected peers; the current ABI and regression suite now cover this contract without retaining the legacy artifact.
- [ ] Port the fixed-memory ABI and numeric behavior to a second Rust module/artifact (or a single multi-entry artifact if the ABI remains unambiguous). Keep exported function names and memory layout stable so TypeScript changes are minimal.
- [ ] Build only with Cargo/rustc. Validate both artifacts with `wasm-tools validate`; optimize release artifacts with `wasm-opt` when available; inspect size with Twiggy and remove unreachable debug exports with wasm-snip only when the ABI test remains green.
- [ ] Remove the former implementation from npm scripts, CI, docs, and error messages. Loader diagnostics now identify “Rust physics WASM”.
- [ ] Run Rust `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, cargo-audit/deny/vet, unit tests, WASM ABI tests, and a production build.

### Task 4: Measure Three.js versus Rust wgpu/Bevy before choosing the renderer

**Files:**
- Create: `benchmarks/renderer-workload.json`
- Create: `scripts/run-renderer-benchmark.ts`
- Create: `benchmarks/renderer-workload.json`
- Create or modify: `wasm/renderer-benchmark/` (Rust candidate only)
- Modify: `docs/product-spec.md`, `README.md`

- [ ] Define one deterministic workload in `benchmarks/renderer-workload.json`: 256, 512, and 1,024 observed peers; fixed viewport/DPR; reduced-motion off; no network dependency.
- [ ] Capture first contentful paint, time to first rendered node, steady-state frame p50/p95, long tasks, memory, draw calls, GPU backend, WASM transfer time, bundle bytes, and accessibility/keyboard behavior with Playwright and Chrome DevTools traces.
- [x] Build a minimal Rust `wgpu` renderer with the product's background, evidence-line, node, input, settings, and accessibility contract. Do not add Bevy runtime bytes when direct `wgpu` keeps the draw-pass boundary smaller.
- [x] Record raw JSON and a decision document. The production renderer is Rust `wgpu`; Three.js remains the tested fallback because RAF timing is within the same range on this host and because browser/GPU compatibility requires a second path.

### Task 5: Browser quality, security, and visual regression suite

**Files:**
- Create: `scripts/run-browser-quality.ts`
- Create: `cypress.config.ts`
- Create: `backstop.config.cjs`
- Create: `playwright.config.ts` (trace/video/artifact policy)
- Create: `tests/e2e/quality-gates.spec.ts`
- Modify: `public/_headers`, `vite.config.ts`, `.github/workflows/deploy-ipfs.yml`

- [ ] Add axe-core and axe DevTools-compatible CDP checks, Pa11y, Lighthouse mobile/desktop, web-vitals collection, bundle analysis, and trace retention on failure only.
- [ ] Add Cypress smoke, BackstopJS deterministic visual comparison, and Playwright screenshots. Chromatic/Percy run only with tokens; otherwise write a credential skip record. Keep all browser runs headless by default.
- [ ] Add CSP Evaluator input/check, OWASP ZAP baseline against the local preview, Semgrep, header assertions, and no-secret logging. ZAP must be bounded to the local preview target.
- [ ] Add PageSpeed Insights API integration with an explicit API-key check and redacted report. Validate that all remote calls are opt-in.
- [ ] Run the full browser suite at 320px/200% text, keyboard-only, reduced motion, WebGPU, WebGL2 fallback, and mobile emulation.

### Task 6: Rust diagnostics and release artifact policy

**Files:**
- Create: `wasm/rust-toolchain.toml`
- Create: `wasm/deny.toml`, `wasm/vet.toml`
- Create: `scripts/inspect-wasm.ts`
- Modify: `.gitignore`, `.github/workflows/deploy-ipfs.yml`, `README.md`

- [ ] Pin the documented Rust toolchain and make local/CI commands agree without replacing the user's system toolchain.
- [ ] Add a non-release debug profile for Chrome DevTools DWARF and `tracing-wasm`; keep it opt-in and excluded from `dist`.
- [ ] Produce a size/section report (Twiggy), validate optimized modules, and fail if the public artifact contains source maps, DWARF, unexpected imports, or an ABI-breaking export change.
- [ ] Document exact commands and expected evidence for every tool in the matrix, including all justified N/A and credential skips.

### Task 7: Final verification and evidence handoff

- [ ] Run `npm run quality:all` from a clean dependency install and save the report.
- [ ] Run `cargo fmt --check`, `cargo clippy`, `cargo test`, `cargo audit`, `cargo deny`, `cargo vet`, `wasm-tools validate`, `wasm-opt`, and the WASM size inspection.
- [ ] Run `tsc`, Vitest, Playwright, Cypress, BackstopJS, axe-core, axe DevTools/Pa11y, Lighthouse, web-vitals, bundle analysis, DevTools trace, Markuplint/html-validate, Stylelint/Lightning CSS/dprint, npm audit, Semgrep, CSP/ZAP, and the opt-in PSI/Chromatic/Percy commands.
- [ ] Run `git diff --check`, inspect the generated report for secret leakage and unjustified skips, and only then update README/product spec with measured facts.
- [ ] Do not call the work complete if any required local gate is red, if Rust-only WASM is not proven, or if the renderer decision lacks a same-device measurement.
