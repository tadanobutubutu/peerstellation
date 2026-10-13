# 品質ツール運用マトリクス

このリポジトリでは、品質を「コマンドが起動した」だけで合格にしない。各検査は実行結果、終了コード、標準出力の要約、実行時刻を `artifacts/quality/` に保存し、`pass`、`fail`、`skip`、`not-applicable` を区別する。`skip` は資格情報・ブラウザ・外部バイナリが必要な検査を無理に合格扱いしないための状態である。

IPFS/libp2p固有の検査（CID/CAR/Trustless、Helia Identify、Kubo、Gateway、Nebula、Testground、NOpfs/Badbits、公開境界）の全件は [`ipfs-tool-matrix.md`](ipfs-tool-matrix.md) に、出所・コマンド・オプトイン変数・安全境界付きで記載する。

## 毎回のローカル検査

`npm run quality:all` が、下表の「必須」を順番に実行する。失敗は終了コードに反映される。

| 領域 | 必須検査 | 合格条件 |
| --- | --- | --- |
| TypeScript | `tsc --noEmit` | 型エラー、未使用ローカル、暗黙 return がない |
| 入力契約 | Zod、Valibot、ArkType パリティ | 有効・無効な永続Peer fixtureを3実装で同じ判定にする |
| 静的解析 | Biome、ESLint + `eslint-plugin-security`、Vale + AIFluff規則 | 警告を含めて 0 件 |
| アクセシビリティ | `axe-core` (Playwright)、Pa11y (axe + HTMLCS)、`html-validate`、Lighthouse | WCAG 検査の違反 0 件。Lighthouse はしきい値を記録 |
| ブラウザ | Vitest、Playwright | 全テスト成功。通常の失敗時traceに加え、代表smokeは毎回 `artifacts/playwright-trace/` へtraceを保存 |
| CSS/HTML | Stylelint、Lightning CSS、Markuplint、dprint、PurgeCSS dry-run | 構文・Lint エラー 0 件。PurgeCSS は削除候補を表示するだけ |
| 依存関係 | `npm audit --omit=dev --audit-level=high`、Knip | 本番依存の high/critical 0 件、未使用ファイルの新規発生なし |
| CSP/HTTP | CSP 静的監査 + ローカルCSP Evaluator | `unsafe-eval`、ワイルドカード connect、`object-src` 欠落などを拒否。CSP Evaluatorの警告も保存 |
| Rust/WASM | `cargo fmt --check`、`cargo test`、`cargo clippy --lib`（出荷カーネル＋本番wgpuレンダラー）、`wasm-tools validate`、`wasm-opt -O3` | Rust ソース、物理カーネル、3Dレンダラー、最適化済み出荷 WASM が検証済み |
| バンドル | Rollup visualizer / Bundle Analyzer | レポートを生成し、チャンク警告を隠さない |
| 実測値 | web-vitals、Renderer benchmark、Chrome DevTools trace | LCP/CLS/INP とフレーム時間を同じブラウザで保存。DevTools trace はGPU/メインスレッドの因果を確認 |

## 認証または追加バイナリが必要な検査

次の検査も `quality:all` のレジストリに含める。ただし、環境に実行ファイルまたはトークンがない場合は `skip` と記録し、成功とは呼ばない。

- PageSpeed Insights API: `PAGESPEED_API_KEY` と対象 URL。
- Chrome DevTools trace/DWARF: Chrome DevTools MCP またはローカル Chrome。`performance_start_trace` が無い場合は Playwright trace を代替として記録する。
- Chromatic: `CHROMATIC_PROJECT_TOKEN`。
- Percy: `PERCY_TOKEN`。
- OWASP ZAP: `npm run security:zap`。公式の `zap-baseline.py`、`zap.sh`、または公式Docker/Podmanイメージが環境にある場合だけ受動ベースラインを実行する。pipで名前の似た非公式スクリプトを入れない。
- `cargo-audit`、`cargo-deny`、`cargo-vet`、`wasm-opt`、`twiggy`、`wasm-snip`、`wasm-tools`: PATH 上にある場合のみ実行する。
- BackstopJS、Cypress、Storybook: ヘッドレスブラウザを取得できる場合に実行する。Puppeteer は安全な25系へ override し、`npm audit --audit-level=high` の high/critical 0件を維持する。Percy/Markuplint の開発専用 moderate advisory は本番 audit と分離して報告する。
- CSP Evaluator: Google実装のローカル移植を `security:csp-evaluator` で毎回実行する。CSP4の `wasm-unsafe-eval` だけは旧Evaluatorの誤検知として明示的に除外し、静的監査で検証する。
- `test:renderer` は `benchmarks/renderer-workload.json` に固定した同一のヘッドレスChrome、1280×720、DPR 1、256/512/1024ノード、各240フレームを3回、実際の製品ページで測る。Rust `wgpu` は背景・線・ノードの3パスを本番で使い、Three.jsは診断用およびGPU初期化失敗時の機能等価フォールバックとして比較する。RAF値には合成・スケジューラーも含まれるため、単一端末の数字だけで速度倍率を断定しない。

## この構成で対象外にするもの

- Valibot と ArkType: 本番ランタイムにはZodだけを含め、開発時の `test:schema-parity` で同じ永続Peer契約を独立実装として再検証する。複数バリデータの結果を水増しせず、判定が一致しない場合は必須検査を失敗させる。
- `eslint-plugin-jsx-a11y` と AccessKit: アプリは JSX ではなく DOM TypeScript で、ネイティブ UI も提供しない。プラグインは将来の JSX 導入時に有効になる設定を保持し、現在は「JSX 0 ファイル」として記録する。
- `leptosfmt`、`dx fmt`: Leptos/Dioxus を使っていないため対象外。
- Rustywind: Tailwind のユーティリティクラスを採用していないため対象外。Stylelint と Lightning CSS で現行 CSS を検査する。
- `ammonia`、`lol-html`: 静的シェルにサーバー HTML サニタイズ経路がない。外部 HTML を受け付ける機能を追加した場合は Rust サニタイズ境界を追加してから有効化する。

## TypeScript 7 と ESLint

現行の TypeScript は 7 系を固定している。2026-09-11 時点の `typescript-eslint` は TypeScript 7 をサポートしないため導入せず、ESLint は Babel の TypeScript 構文パーサーと `eslint-plugin-security` に限定する。型・未使用判定は `tsc` と Biome が担当する。これにより、型解析ができない ESLint による誤警告を無視していない。

## Rust とレンダラーの判断

Rust版は物理・集計だけでなく、本番の3D描画と出荷WASM ABIを担当する。`wgpu` はWebGPUとWebGL2を同一Rust APIで扱い、TypeScriptは観測・入力・設定・DOMアクセシビリティの境界に限定する。Three.jsは `?renderer=three` の診断経路と、RustのWASM・GPU初期化が失敗した場合の最後の表示フォールバックとして残す。公式ドキュメントだけで速度を断定せず、同じ実シーンのRAFフレーム時間、長フレーム率、メモリ、機能・a11y検査を比較する。

本番Rust経路は、ネットワーク状態の色分け、遅延による距離、切断履歴、リレー線、ホバー/タップの情報表示、キーボード操作、WebGL2バックエンド、設定、axe/Pa11yの検査を通過したものだけを出荷する。比較結果は `artifacts/quality/renderer-benchmark.json` に保存し、RAF差が20%未満なら「同等範囲」として扱う。Macroquad、Notan、Nannou、Vello、Pietは調査したが、3Dの最小描画境界を増やす高レベル抽象または2Dベクター用途であり、本番バンドルへ追加していない。

### 外部サービスの扱い

PageSpeed Insights API、Chromatic、Percyは無料試用や無料枠があっても、無期限・無制限の匿名APIを保証しない。`quality:all` は資格情報が無い時に `skip` と記録し、ローカルのLighthouse、Playwright、Storybook、BackstopJSを必須検査として使う。公開URLとキーを設定した環境だけ `npm run test:pagespeed` を実行する。
