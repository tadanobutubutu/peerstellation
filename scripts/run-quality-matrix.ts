import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

type QualityStatus = 'pass' | 'fail' | 'skip' | 'not-applicable';
type QualityCategory =
  | 'accessibility'
  | 'browser'
  | 'dependencies'
  | 'performance'
  | 'rust'
  | 'security'
  | 'static';

interface CheckResult {
  readonly id: string;
  readonly category: QualityCategory;
  readonly status: QualityStatus;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly reason?: string;
  readonly command?: readonly string[];
  readonly stdout?: string;
  readonly stderr?: string;
}

interface CheckDefinition {
  readonly id: string;
  readonly category: QualityCategory;
  readonly command?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly required?: boolean;
  readonly skip?: () => string | undefined;
  readonly notApplicable?: string;
}

interface ExecFailure {
  readonly code?: number | string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly message?: string;
}

const execFileAsync = promisify(execFile);
const startedAt = new Date();
const dryRun = process.argv.includes('--dry-run');
const definitions: readonly CheckDefinition[] = [
  npmCheck('typecheck', 'static', 'typecheck', true),
  npmCheck('quality-biome', 'static', 'quality', true),
  npmCheck('lint-eslint-security', 'security', 'lint:eslint', true),
  npmCheck('lint-stylelint', 'static', 'lint:style', true),
  npmCheck('test-lightningcss', 'static', 'test:lightningcss', true),
  npmCheck('lint-markuplint', 'accessibility', 'lint:markup', true),
  npmCheck('lint-dprint', 'static', 'lint:dprint', true),
  npmCheck('lint-knip', 'static', 'lint:knip', true),
  conditionalNpmCheck('lint-vale', 'static', 'lint:docs', true, ['vale']),
  npmCheck('test-unit-vitest', 'browser', 'test:unit', true),
  npmCheck('test-axe-pa11y-html', 'accessibility', 'test:a11y', true),
  npmCheck('test-playwright-trace-axe', 'browser', 'test:e2e', true),
  npmCheck(
    'test-playwright-trace-artifact',
    'browser',
    'test:playwright-trace',
    true,
  ),
  conditionalNpmCheck('test-cypress', 'browser', 'test:cypress', true, [
    'cypress',
  ]),
  conditionalNpmCheck('test-backstop', 'browser', 'test:backstop', true, [
    'backstop',
  ]),
  npmCheck('test-lighthouse', 'performance', 'test:lighthouse', true),
  npmCheck('test-web-vitals', 'performance', 'test:web-vitals', true),
  npmCheck('test-renderer-benchmark', 'performance', 'test:renderer', true),
  npmCheck('test-purgecss', 'performance', 'test:purgecss', true),
  npmCheck('test-schema-parity', 'static', 'test:schema-parity', true),
  npmCheck('ipfs-cid-inspector-local', 'static', 'test:ipfs:cid', true),
  npmCheck('car-verification-local', 'security', 'test:ipfs:car', true),
  npmCheck(
    'trustless-gateway-hash-local',
    'security',
    'test:ipfs:trustless',
    true,
  ),
  npmCheck('origin-isolation-check', 'security', 'test:ipfs:origin', true),
  npmCheck(
    'security-headers-live-policy',
    'security',
    'test:ipfs:headers',
    true,
  ),
  npmCheck('spa-routing-404-fallback', 'browser', 'test:ipfs:spa', true),
  npmCheck('ipld-explorer-local-traversal', 'static', 'test:ipfs:ipld', true),
  npmCheck(
    'js-libp2p-inspector-policy',
    'browser',
    'test:ipfs:inspector',
    true,
  ),
  npmCheck(
    'helia-identify-headless',
    'browser',
    'test:ipfs:helia-identify',
    true,
  ),
  npmCheck('test-wasm-diagnostics', 'rust', 'test:wasm-tools', true),
  npmCheck('test-storybook', 'browser', 'test:storybook', true),
  npmCheck('security-npm-production', 'dependencies', 'security:npm', true),
  npmCheck('security-csp', 'security', 'security:csp', true),
  npmCheck(
    'security-csp-evaluator',
    'security',
    'security:csp-evaluator',
    true,
  ),
  npmCheck('analyze-bundle', 'performance', 'analyze:bundle', true, {
    ANALYZE_BUNDLE: '1',
  }),
  commandCheck(
    'cargo-fmt',
    'rust',
    [
      'rustup',
      'run',
      'stable',
      'cargo',
      'fmt',
      '--manifest-path',
      'wasm/Cargo.toml',
      '--all',
      '--',
      '--check',
    ],
    true,
    rustEnvironment(),
  ),
  commandCheck(
    'cargo-clippy',
    'rust',
    [
      'rustup',
      'run',
      'stable',
      'cargo',
      'clippy',
      '--manifest-path',
      'wasm/Cargo.toml',
      '--target',
      'wasm32-unknown-unknown',
      '--lib',
      '--all-features',
      '--',
      '-D',
      'warnings',
    ],
    true,
    rustEnvironment(),
  ),
  commandCheck(
    'cargo-fmt-renderer',
    'rust',
    [
      'rustup',
      'run',
      'stable',
      'cargo',
      'fmt',
      '--manifest-path',
      'wasm/renderer/Cargo.toml',
      '--all',
      '--',
      '--check',
    ],
    true,
    rustEnvironment(),
  ),
  commandCheck(
    'cargo-clippy-renderer',
    'rust',
    [
      'rustup',
      'run',
      'stable',
      'cargo',
      'clippy',
      '--manifest-path',
      'wasm/renderer/Cargo.toml',
      '--target',
      'wasm32-unknown-unknown',
      '--lib',
      '--all-features',
      '--',
      '-D',
      'warnings',
    ],
    true,
    rustEnvironment(),
  ),
  commandCheck(
    'cargo-test',
    'rust',
    [
      'rustup',
      'run',
      'stable',
      'cargo',
      'test',
      '--manifest-path',
      'wasm/Cargo.toml',
      '--all-features',
    ],
    true,
    rustEnvironment(),
  ),
  commandCheck(
    'cargo-test-renderer',
    'rust',
    [
      'rustup',
      'run',
      'stable',
      'cargo',
      'test',
      '--manifest-path',
      'wasm/renderer/Cargo.toml',
      '--all-features',
    ],
    true,
    rustEnvironment(),
  ),
  optionalNpmCheck('security-npm-development', 'dependencies', [
    'audit',
    '--audit-level=high',
  ]),
  optionalScriptCheck('cargo-audit', 'security', 'scripts/run-cargo-audit.ts', [
    'cargo-audit',
  ]),
  optionalScriptCheck('cargo-deny', 'security', 'scripts/run-cargo-deny.ts', [
    'cargo-deny',
  ]),
  optionalScriptCheck('cargo-vet', 'security', 'scripts/run-cargo-vet.ts', [
    'cargo-vet',
  ]),
  gatedScriptCheck('aegir', 'static', 'test:ipfs:aegir', undefined, ['aegir']),
  gatedScriptCheck(
    'ipld-schema-linter',
    'static',
    'test:ipfs:schema',
    'IPLD_SCHEMA_LINTER_ENABLE',
    ['ipld-schema-linter', 'ipld-schema'],
  ),
  gatedScriptCheck(
    'ipfs-check',
    'security',
    'test:ipfs:check',
    'IPFS_CHECK_ENABLE',
  ),
  gatedScriptCheck(
    'public-gateway-checker',
    'security',
    'test:ipfs:public-gateways',
    'PUBLIC_GATEWAY_CHECK_ENABLE',
  ),
  gatedScriptCheck(
    'gateway-conformance-suite',
    'security',
    'test:ipfs:gateway-conformance',
    'GATEWAY_CONFORMANCE_ENABLE',
    ['gateway-conformance'],
  ),
  gatedScriptCheck(
    'nebula-network-crawler',
    'security',
    'test:ipfs:nebula',
    'NEBULA_ENABLE',
  ),
  gatedScriptCheck(
    'probelab-endpoint',
    'performance',
    'test:ipfs:probelab',
    'PROBELAB_ENABLE',
  ),
  gatedScriptCheck(
    'testground-distributed',
    'performance',
    'test:ipfs:testground',
    'TESTGROUND_ENABLE',
    ['testground'],
  ),
  gatedAnyScriptCheck(
    'nopfs-badbits-denylist',
    'security',
    'test:ipfs:nopfs-badbits',
    ['NOPFS_ENABLE', 'BADBITS_ENABLE'],
  ),
  gatedScriptCheck(
    'node-security-rpc-exposure',
    'security',
    'test:ipfs:node-exposure',
    'NODE_SCAN_ENABLE',
    ['nmap'],
  ),
  gatedScriptCheck(
    'kubo-integrity-read-only',
    'security',
    'test:ipfs:kubo',
    'KUBO_INTEGRITY_ENABLE',
    ['ipfs'],
  ),
  gatedScriptCheck(
    'ipfs-webui-local',
    'browser',
    'test:ipfs:webui',
    'KUBO_WEBUI_ENABLE',
  ),
  optionalCommandCheck('wasm-tools-validate', 'rust', [
    'wasm-tools',
    'validate',
    'public/physics.wasm',
  ]),
  optionalCommandCheck('wasm-tools-validate-renderer', 'rust', [
    'wasm-tools',
    'validate',
    'src/scene/renderer-wasm/peerstellation_renderer_bg.wasm',
  ]),
  optionalCommandCheck('wasm-opt-validate', 'rust', [
    'wasm-opt',
    '--all-features',
    '-O3',
    'public/physics.wasm',
    '-o',
    '/dev/null',
  ]),
  optionalCommandCheck('wasm-opt-validate-renderer', 'rust', [
    'wasm-opt',
    '-O3',
    'src/scene/renderer-wasm/peerstellation_renderer_bg.wasm',
    '-o',
    '/dev/null',
  ]),
  optionalCommandCheck('twiggy-top', 'performance', [
    'twiggy',
    'top',
    'public/physics.wasm',
  ]),
  optionalCommandCheck('wasm-snip', 'performance', [
    'wasm-snip',
    '--snip-rust-panicking-code',
    'public/physics.wasm',
    '-o',
    'artifacts/wasm/physics-snip.wasm',
  ]),
  optionalCommandCheck('semgrep', 'security', [
    'semgrep',
    'scan',
    '--config=auto',
    '--error',
  ]),
  zapBaselineCheck(),
  optionalTokenCheck('chromatic', 'browser', 'CHROMATIC_PROJECT_TOKEN', [
    'chromatic',
    '--exit-zero-on-changes',
  ]),
  optionalTokenCheck('pagespeed-insights', 'performance', 'PAGESPEED_API_KEY', [
    'npm',
    'run',
    'test:pagespeed',
  ]),
  {
    id: 'eslint-plugin-jsx-a11y-scope',
    category: 'accessibility',
    notApplicable:
      'アプリは JSX 0 ファイルの DOM TypeScript 構成。JSX 導入時に eslint.config.ts の flat config が有効化される。',
  },
  {
    id: 'native-accesskit',
    category: 'accessibility',
    notApplicable:
      'ネイティブ UI を出荷しない Web アプリのため対象外。ブラウザのアクセシビリティ API と axe/Pa11y を使用する。',
  },
  {
    id: 'leptosfmt-dx-fmt-rustywind',
    category: 'static',
    notApplicable:
      'Leptos、Dioxus、Tailwind utility class を製品コードに採用していない。',
  },
  {
    id: 'ammonia-lol-html',
    category: 'security',
    notApplicable:
      '外部 HTML をサーバーで受け付ける境界がない。静的シェルは CSP と DOM API で検査する。',
  },
  {
    id: 'tracing-wasm',
    category: 'rust',
    notApplicable:
      '出荷するRustカーネルはno_stdの決定的数値処理で、利用者へデバッグログを送らない。開発時はChrome DevToolsとWASM ABIテストで検査する。',
  },
  {
    id: 'axe-devtools-extension',
    category: 'accessibility',
    notApplicable:
      '有料の拡張機能ではなく、同じaxe-coreエンジンをPlaywright/Pa11y/Lighthouseで自動実行する。',
  },
  {
    id: 'chrome-devtools-dwarf',
    category: 'rust',
    notApplicable:
      '本番WASMにDWARF・source mapを含めないリリースポリシー。Chrome DevTools MCPの実行トレースは行うが、DWARF付きデバッグ成果物を公開物へ混ぜない。',
  },
];

const results: CheckResult[] = [];
for (const definition of definitions) {
  results.push(await runCheck(definition));
}

const finishedAt = new Date();
const report = {
  schemaVersion: 1 as const,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  gitRevision: gitRevision(),
  results,
};
await mkdir('artifacts/quality', { recursive: true });
await writeFile(
  'artifacts/quality/report.json',
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile('artifacts/quality/report.md', markdownReport(report), 'utf8');

for (const result of results) {
  const reason = result.reason === undefined ? '' : ` — ${result.reason}`;
  console.log(
    `${result.status.toUpperCase().padEnd(15)} ${result.id}${reason}`,
  );
}

const requiredFailures = results.filter(
  (result, index) =>
    definitions[index]?.required === true && result.status === 'fail',
);
if (requiredFailures.length > 0) {
  process.exitCode = 1;
}

async function runCheck(definition: CheckDefinition): Promise<CheckResult> {
  const started = performance.now();
  if (definition.notApplicable !== undefined) {
    return result(
      definition,
      'not-applicable',
      started,
      null,
      definition.notApplicable,
    );
  }
  const skipped = definition.skip?.();
  if (skipped !== undefined)
    return result(definition, 'skip', started, null, skipped);
  if (definition.command === undefined) {
    return result(
      definition,
      'fail',
      started,
      null,
      'No command was registered.',
    );
  }
  if (dryRun) return result(definition, 'skip', started, null, 'dry-run');

  try {
    const command = definition.command[0];
    if (command === undefined) throw new Error('Empty command.');
    const { stdout, stderr } = await execFileAsync(
      command,
      definition.command.slice(1),
      {
        cwd: process.cwd(),
        env: { ...process.env, ...definition.env },
        maxBuffer: 16 * 1024 * 1024,
        timeout: 15 * 60 * 1_000,
      },
    );
    return result(definition, 'pass', started, 0, undefined, stdout, stderr);
  } catch (error) {
    const failure = error as ExecFailure;
    const exitCode = typeof failure.code === 'number' ? failure.code : null;
    const reason =
      failure.message ?? `exit code ${String(failure.code ?? 'unknown')}`;
    return result(
      definition,
      'fail',
      started,
      exitCode,
      reason,
      failure.stdout,
      failure.stderr,
    );
  }
}

function result(
  definition: CheckDefinition,
  status: QualityStatus,
  started: number,
  exitCode: number | null,
  reason?: string,
  stdout?: string,
  stderr?: string,
): CheckResult {
  return {
    id: definition.id,
    category: definition.category,
    status,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
    exitCode,
    ...(reason === undefined ? {} : { reason }),
    ...(definition.command === undefined
      ? {}
      : { command: definition.command }),
    ...(stdout === undefined ? {} : { stdout: truncate(stdout) }),
    ...(stderr === undefined ? {} : { stderr: truncate(stderr) }),
  };
}

function npmCheck(
  id: string,
  category: QualityCategory,
  script: string,
  required: boolean,
  env?: Readonly<Record<string, string>>,
): CheckDefinition {
  return {
    id,
    category,
    required,
    command: ['npm', 'run', script],
    env,
    skip: () =>
      process.env.CI === '1' && id === 'test-lighthouse'
        ? 'CI_LIGHTHOUSE_DISABLED'
        : undefined,
  };
}

function optionalNpmCheck(
  id: string,
  category: QualityCategory,
  npmArgs: readonly string[],
): CheckDefinition {
  return {
    id,
    category,
    required: false,
    command: ['npm', ...npmArgs],
  };
}

function conditionalNpmCheck(
  id: string,
  category: QualityCategory,
  script: string,
  required: boolean,
  requiredExecutables: readonly string[],
): CheckDefinition {
  const missing = requiredExecutables.find(
    (command) => resolveExecutable(command) === undefined,
  );
  return {
    id,
    category,
    required,
    command: ['npm', 'run', script],
    skip:
      missing === undefined ? undefined : () => `${missing} is not installed`,
  };
}

function commandCheck(
  id: string,
  category: QualityCategory,
  command: readonly string[],
  required: boolean,
  env?: Readonly<Record<string, string>>,
): CheckDefinition {
  const executable = resolveExecutable(command[0]);
  return {
    id,
    category,
    command:
      executable === undefined ? command : [executable, ...command.slice(1)],
    required,
    env,
    skip: executable === undefined ? missingExecutable(command[0]) : undefined,
  };
}

function rustEnvironment(): Readonly<Record<string, string>> | undefined {
  try {
    const rustc = execFileSync('rustup', ['which', 'rustc'], {
      encoding: 'utf8',
    }).trim();
    const directory = rustc.slice(0, rustc.lastIndexOf('/'));
    if (directory.length === 0) return undefined;
    return { PATH: `${directory}:${process.env.PATH ?? ''}` };
  } catch {
    return undefined;
  }
}

function optionalCommandCheck(
  id: string,
  category: QualityCategory,
  command: readonly string[],
): CheckDefinition {
  const executable = resolveExecutable(command[0]);
  return {
    id,
    category,
    command:
      executable === undefined ? command : [executable, ...command.slice(1)],
    required: false,
    skip: executable === undefined ? missingExecutable(command[0]) : undefined,
  };
}

function optionalScriptCheck(
  id: string,
  category: QualityCategory,
  script: string,
  requiredExecutables: readonly string[],
): CheckDefinition {
  const missing = requiredExecutables.find(
    (command) => resolveExecutable(command) === undefined,
  );
  return {
    id,
    category,
    command: ['npx', 'tsx', script],
    required: false,
    skip:
      missing === undefined ? undefined : () => `${missing} is not installed`,
  };
}

function gatedScriptCheck(
  id: string,
  category: QualityCategory,
  script: string,
  gate?: string,
  requiredExecutables: readonly string[] = [],
): CheckDefinition {
  const missingExecutable = requiredExecutables.find(
    (command) => resolveExecutable(command) === undefined,
  );
  return {
    id,
    category,
    command: ['npm', 'run', script],
    required: false,
    skip: () => {
      if (gate !== undefined && !isEnabled(process.env[gate])) {
        return `${gate} is not set to an explicit opt-in value`;
      }
      if (missingExecutable !== undefined) {
        return `${missingExecutable} is not installed`;
      }
      return undefined;
    },
  };
}

function gatedAnyScriptCheck(
  id: string,
  category: QualityCategory,
  script: string,
  gates: readonly string[],
  requiredExecutables: readonly string[] = [],
): CheckDefinition {
  const missingExecutable = requiredExecutables.find(
    (command) => resolveExecutable(command) === undefined,
  );
  return {
    id,
    category,
    command: ['npm', 'run', script],
    required: false,
    skip: () => {
      if (!gates.some((gate) => isEnabled(process.env[gate]))) {
        return `${gates.join(' or ')} is not set to an explicit opt-in value`;
      }
      if (missingExecutable !== undefined)
        return `${missingExecutable} is not installed`;
      return undefined;
    },
  };
}

function isEnabled(value: string | undefined): boolean {
  return /^(?:1|true|yes|on)$/iu.test(value?.trim() ?? '');
}

function optionalTokenCheck(
  id: string,
  category: QualityCategory,
  tokenName: string,
  command: readonly string[],
): CheckDefinition {
  return {
    id,
    category,
    command,
    required: false,
    skip: () =>
      process.env[tokenName]?.trim() ? undefined : `${tokenName} is not set`,
  };
}

function zapBaselineCheck(): CheckDefinition {
  const direct =
    resolveExecutable('zap-baseline.py') ?? resolveExecutable('zap.sh');
  const container = ['docker', 'podman'].find((command) => {
    const executable = resolveExecutable(command);
    if (executable === undefined) return false;
    try {
      execFileSync(executable, ['info'], { stdio: 'ignore', timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  });
  const available = direct ?? container;
  return {
    id: 'zap-baseline',
    category: 'security',
    command: ['npm', 'run', 'security:zap'],
    required: false,
    skip:
      available === undefined
        ? () =>
            '公式OWASP ZAP実行ファイルまたは稼働中のDocker/Podman daemonがありません（公式Dockerイメージ/アプリを導入すると有効化）'
        : undefined,
  };
}

function missingExecutable(
  command: string | undefined,
): (() => string) | undefined {
  if (command === undefined) return () => 'empty command';
  return resolveExecutable(command) === undefined
    ? () => `${command} is not installed`
    : undefined;
}

function resolveExecutable(command: string | undefined): string | undefined {
  if (command === undefined) return undefined;
  const explicit = [
    `/opt/homebrew/opt/binaryen/bin/${command}`,
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
  ];
  for (const candidate of explicit) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    return (
      execFileSync('which', [command], { encoding: 'utf8' }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

function gitRevision(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return undefined;
  }
}

function truncate(value: string): string {
  return value.length <= 20_000
    ? value
    : `${value.slice(0, 20_000)}\n…[truncated]`;
}

function markdownReport(report: {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly gitRevision?: string;
  readonly results: readonly CheckResult[];
}): string {
  const lines = [
    '# Peerstellation quality report',
    '',
    `- started: ${report.startedAt}`,
    `- finished: ${report.finishedAt}`,
    `- revision: ${report.gitRevision ?? 'unknown'}`,
    '',
    '| id | category | status | duration | reason |',
    '| --- | --- | --- | ---: | --- |',
  ];
  for (const result of report.results) {
    lines.push(
      `| ${result.id} | ${result.category} | ${result.status} | ${result.durationMs} ms | ${(result.reason ?? '').replaceAll('|', '\\|')} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
