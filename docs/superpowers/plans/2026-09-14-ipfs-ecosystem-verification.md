# IPFS Ecosystem Verification Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible, security-bounded verification layer for the IPFS/libp2p, content-integrity, gateway, browser, routing, and local Kubo tools requested by the product owner, without pretending that unavailable credentials, daemons, or public crawlers passed.

**Architecture:** Keep the production browser graph unchanged except for an opt-in development Inspector metrics hook. Put every external or host-level integration behind a typed `scripts/` runner with explicit environment gates, loopback/timeout limits, and `pass`/`fail`/`skip`/`not-applicable` output. Register all runners in the existing quality matrix and write a user-readable tool matrix documenting provenance and boundaries. Local CID/CAR verification, SPA routing, response-header isolation, and Helia identity checks remain required and headless.

**Tech Stack:** TypeScript 7, Node `tsx`, Vitest, Playwright, Helia/libp2p, `multiformats`, optional `@ipld/car`, Vite preview, Kubo CLI/RPC, Go gateway-conformance, Testground, Nebula, Nmap, official ZAP runners, and the existing Rust/wgpu renderer.

**Spec:**

- No public network scan, DHT crawl, Shodan query, gateway probe, or Kubo mutation runs by default. Explicit opt-in variables are required and every remote URL is validated.
- A missing binary, daemon, token, or hosted service is `skip`; a tool that has no meaningful web-app integration is `not-applicable`. Neither state is reported as a pass.
- CAR verification hashes every block and checks roots; trustless-gateway checks validate content type, CAR structure, root, and block hashes when a target is explicitly supplied.
- Inspector metrics are development-only and opt-in (`LIBP2P_INSPECTOR=1` or `?inspector=1`); production sessions must not expose the inspector RPC.
- All scripts use `execFile`/`fetch` with bounded timeouts and no shell interpolation. Reports are written only under `artifacts/quality/`.

## Task 1: Establish typed local IPFS integrity checks (TDD)

- [x] Add tests for CID parsing, CAR round-trip/hash verification, tamper rejection, and trustless response validation in `tests/ipfs-integrity.test.ts`.
- [x] Run the focused tests and record the expected red result before implementation.
- [x] Implement `src/ipfs/ipfs-tooling.ts` with pure helpers for CID inspection, CAR block hashing, trustless response validation, URL policy, and bounded fetch.
- [x] Implement `scripts/run-cid-inspector.ts` and `scripts/run-car-verification.ts`; use deterministic fixtures and reject malformed/tampered data.
- [x] Add `test:ipfs:cid` and `test:ipfs:car` scripts and matrix entries as required checks.
- [x] Re-run focused tests and confirm green output.

## Task 2: Add local browser/network boundary checks

- [x] Implement `scripts/run-origin-isolation.ts` to inspect COOP, COEP, CORP, Origin-Agent-Cluster, CSP, HSTS, Permissions-Policy, and content type on an explicitly local preview target.
- [x] Implement `scripts/run-spa-routing.ts` to verify the app shell, an unknown route, and `/404.html` without 5xx responses.
- [x] Implement `scripts/run-security-headers.ts` as a standalone header/CSP report wrapper and add a required local matrix entry.
- [x] Implement `scripts/run-ipfs-webui.ts` for an explicitly enabled local Kubo API/WebUI smoke check, with no credentials sent by default.
- [x] Add headless Playwright coverage for the unknown-route fallback and ensure `test:ipfs:spa`, `test:ipfs:origin`, and `test:ipfs:headers` are deterministic checks.

## Task 3: Add real Helia/libp2p and content-tool integrations

- [x] Inspect the Helia worker factory and add an opt-in development Inspector metrics adapter using `@ipshipyard/libp2p-inspector-metrics`; assert that it is absent from the default production path.
- [x] Add `test:ipfs:helia-identify`, a focused headless test of the existing real Helia identity path, and register `js-libp2p-inspector`/`helia-identify` with explicit status semantics.
- [x] Implement gated runners for IPFS Check, Public Gateway Checker, Gateway Conformance, and optional trustless-gateway HTTP verification. Remote targets require explicit opt-in and strict URL/timeout limits.
- [x] Implement a local IPLD/CID traversal check and document the hosted IPLD Explorer/CID Inspector links without scraping their UIs in CI.
- [x] Add an optional IPLD schema linter detector; use the maintained IPLD schema packages when present and report `skip`/`not-applicable` when no official linter executable is available.

## Task 4: Add host/distributed-network diagnostics with safe gates

- [x] Implement optional `run-nebula.ts`/ProbeLab metadata check. Default to `--dry-run`; a real crawl requires `NEBULA_ENABLE=1`, network selection, and a bounded limit.
- [x] Implement optional NOpfs/Badbits denylist validation in `run-nopfs-badbits.ts`; run only read-only local Kubo checks or an explicitly enabled denylist URL.
- [x] Implement `run-node-exposure.ts` for loopback-only Nmap by default and explicit Shodan host/API-key use; reject public hosts unless `NODE_SCAN_ALLOW_REMOTE=1`.
- [x] Implement `run-testground.ts` detector/runner requiring an explicit plan, testcase, daemon, and healthy container runtime.
- [x] Implement `run-kubo-integrity.ts` for read-only `ipfs id`, `ipfs version`, and supported `repo verify`/`repo fsck` commands only when explicitly enabled.
- [x] Register all optional diagnostics in the matrix so unavailable infrastructure is visible as `skip`, never silently omitted.

## Task 5: Documentation, tooling registry, and Inspector policy

- [x] Add `docs/quality/ipfs-tool-matrix.md` with every requested tool, official source, command, default status, enablement variable, and security boundary.
- [x] Update `docs/quality/tool-matrix.md`, `README.md`, and the quality report schema/command table with the new scripts and status vocabulary.
- [x] Add focused policy tests for loopback/remote URL gates, opt-in crawlers/scanners, and Inspector default-off behavior in `tests/network-tool-policy.test.ts`.
- [x] Run Biome/ESLint/typecheck and fix all warnings before broad verification.

## Task 6: Full verification and evidence handoff

- [x] Run focused Vitest tests, then `npm run check`, headless Playwright/Cypress/Pa11y/Lighthouse/renderer checks, and `npm run quality:all`.
- [x] Run `git diff --check`, inspect `artifacts/quality/report.json` for every new ID, and retain explicit skip/N/A reasons.
- [x] Run `bsk doctor --json`/Comet background smoke and `agent-reach check-update`; do not claim external tools passed unless their commands actually ran.
- [x] Report exact pass/fail/skip/N/A counts, local evidence paths, and the remaining requirements for optional tools.

## Self-review checklist

- [x] No production fake-peer/topology path or public scan was introduced.
- [x] No standalone unofficial `zap-baseline.py`, random schema linter, or paid API dependency was added.
- [x] Every user-named tool appears exactly once in the documentation matrix with a truthful status policy.
- [x] New scripts are typed, bounded, auditable, and covered by tests where behavior is local and deterministic.
