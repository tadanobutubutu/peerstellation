# IPFS エコシステム検査マトリクス

この表は、Peerstellation が採用する IPFS/libp2p 検査の出所、実行条件、既定状態を固定する。`npm run quality:all` は未実行の外部検査を合格に変換しない。`pass` はコマンドが実際に完了した場合だけ、`skip` は明示的な環境条件がない場合、`not-applicable` はこの静的 Web アプリに実行境界がない場合に使う。

## 毎回実行するローカル検査

| ツール / 検査 | Peerstellation での実装 | コマンド | 既定状態 |
| --- | --- | --- | --- |
| js-libp2p Inspector | `@ipshipyard/libp2p-inspector-metrics` を開発ビルドかつ `?inspector=1` の時だけ有効化。window RPC を通常公開しないことをソース検査する | `npm run test:ipfs:inspector` | pass |
| CID Inspector | Hosted UIをスクレイピングせず、同じ multiformats でCIDのversion、codec、multihash、digestを検査 | `npm run test:ipfs:cid` | pass |
| CAR Verification Tools | `@ipld/car`でCARを読み、各ブロックをmultihashで再計算。改ざんfixtureも拒否 | `npm run test:ipfs:car` | pass |
| Trustless Gateway hash verification | CARのroot/content-typeと全ブロック、raw応答のCIDを検証する共通実装 | `npm run test:ipfs:trustless` | pass |
| Origin Isolation Check | `_headers`のCOOP、COEP、CORP、Origin-Agent-Cluster、CSP、HSTSを検査 | `npm run test:ipfs:origin` | pass |
| Security Headers / CSP Evaluator | 静的ヘッダーとCSPの危険な wildcard、`unsafe-eval`、必須directiveを検査。既存のCSP Evaluator移植も併用 | `npm run test:ipfs:headers`、`npm run security:csp-evaluator` | pass |
| SPA Routing & 404 Fallback Tester | ヘッドレスChromiumで未知のSPAパス、`/404.html`、アクセシブルな見出しを確認 | `npm run test:ipfs:spa` | pass |
| IPLD Explorer | Hosted Explorerに依存せず、決定的なraw DAG fixtureをCID検査・CAR traversalする | `npm run test:ipfs:ipld` | pass |
| Helia Identify | 既存の実Helia browser identity E2Eを単独でも実行し、simulation fallbackがないことを確認 | `npm run test:ipfs:helia-identify` | pass |

公式のHosted UIは補助的な手動確認に使える。[CID Inspector](https://cid.ipfs.tech/)、[IPLD Explorer](https://explore.ipld.io/)、[IPFS diagnostic tools](https://docs.ipfs.tech/reference/diagnostic-tools/)を、公開ページから無断で大量アクセスする検査には使わない。

Inspectorの開発依存は2.0.0を使用し、既知のgossipsub high advisoryを含む15系を避けるため、`package.json` のnpm overrideで`@libp2p/gossipsub` 17.1.1へ固定している。`npm audit --audit-level=high` はこの状態で0件である。

## 明示的な環境がある時だけ実行する検査

| ツール | 実行条件とコマンド | 既定状態 | 境界 |
| --- | --- | --- | --- |
| IPFS Check | `IPFS_CHECK_ENABLE=1 IPFS_CHECK_URL=https://... IPFS_CHECK_CID=... npm run test:ipfs:check` | skip | `IPFS_CHECK_ALLOW_REMOTE=1`がない遠隔URLを拒否。公開backendは共有・レート制限付き。[IPFS Check](https://github.com/ipfs/ipfs-check) |
| Public Gateway Checker | `PUBLIC_GATEWAY_CHECK_ENABLE=1 PUBLIC_GATEWAY_URLS=... npm run test:ipfs:public-gateways` | skip | URLを最大16件、remoteは`PUBLIC_GATEWAY_ALLOW_REMOTE=1`で明示。SLAを仮定しない。[公式一覧](https://github.com/ipfs/public-gateway-checker) |
| Gateway Conformance Test Suite | `GATEWAY_CONFORMANCE_ENABLE=1 GATEWAY_CONFORMANCE_URL=... npm run test:ipfs:gateway-conformance` | skip | 公式Go binaryが必要。subdomain仕様はURLを別指定しない限り除外。[gateway-conformance](https://github.com/ipfs/gateway-conformance) |
| Testground | `TESTGROUND_ENABLE=1`、`TESTGROUND_PLAN`、`TESTGROUND_TESTCASE`、daemon、Dockerが必要 | skip | 分散P2P負荷を発生させるため自動起動しない。[Testground](https://github.com/testground/testground) |
| Nebula | `NEBULA_ENABLE=1`と公式binary。既定は`--dry-run`、実crawlは`NEBULA_LIVE=1`かつ上限1000 | skip | IPFSネットワークへのcrawlは外部負荷。ProbeLabの公開グラフ相当を自動取得しない。[Nebula](https://github.com/dennis-tra/nebula) |
| ProbeLab | `PROBELAB_ENABLE=1 PROBELAB_URL=... npm run test:ipfs:probelab` | skip | hosted endpointの到達性だけを検査。資格情報や商用機能を前提にしない |
| NOpfs & Badbits | `NOPFS_ENABLE=1`または`BADBITS_ENABLE=1`。denylist JSONをCIDとして厳密にparse | skip | NOpfsはKubo plugin（IPIP-383）、Badbitsは実験的list。ローカルread-onlyのみ。[NOpfs](https://github.com/ipfs-shipyard/nopfs)、[Badbits](https://github.com/olizilla/badbits) |
| Node Security / RPC exposure | `NODE_SCAN_ENABLE=1 npm run test:ipfs:node-exposure`。Nmapは既定loopback、port最大64件。Shodanは`SHODAN_ENABLE=1`とkey/hostが全て必要 | skip | 公開IPスキャンは禁止。remoteは`NODE_SCAN_ALLOW_REMOTE=1`を別途指定。Shodanの無料継続利用を保証しない |
| Kubo内蔵整合性検査 | `KUBO_INTEGRITY_ENABLE=1 npm run test:ipfs:kubo` | skip | `ipfs id`、`version`、`repo verify`、`repo fsck`のみ。`IPFS_PATH`を使い、pin/gc/config変更をしない。[Kubo CLI](https://docs.ipfs.tech/reference/kubo/cli/) |
| IPFS WebUI | `KUBO_WEBUI_ENABLE=1 npm run test:ipfs:webui` | skip | `127.0.0.1:5001`の`/webui/`とversionだけ。認証ヘッダーを転送せず、wildcard CORSを拒否。[ipfs-webui](https://github.com/ipfs/ipfs-webui) |
| AEgir | `aegir`公式CLIがPATHにある場合だけ`npm run test:ipfs:aegir` | skip | Peerstellationの製品依存ではないため、無い環境にインストールを強制しない |
| IPLD Schema Linter | `IPLD_SCHEMA_LINTER_ENABLE=1`と`ipld-schema-linter`または`ipld-schema` binary | skip | exact nameの公式保守linterを確認できない環境では、既存のZod/Valibot/ArkType parityを本検査とする。無名packageを追加しない |

## 公式仕様と検査の出所

- [libp2p Inspector](https://github.com/ipshipyard/js-libp2p-inspector): browser DevTools向けmetrics adapter。開発専用の観測面として扱う。
- [IPFS diagnostic tools](https://docs.ipfs.tech/reference/diagnostic-tools/): CID Inspector、IPFS Check、Helia Identify、Public Gateway Checkerの位置付け。
- [Trustless Gateway specification](https://specs.ipfs.tech/http-gateways/trustless-gateway/): raw/CAR content type、root、block hash検証の根拠。
- [Kubo](https://github.com/ipfs/kubo) と [IPFS WebUI](https://github.com/ipfs/ipfs-webui): ローカルRPC/WebUIの境界。

Nebula、Testground、gateway-conformance、NOpfsは有用だが、静的なブラウザ配信物のビルドに組み込むライブラリではない。外部daemon・DHT crawl・公開gatewayの状態を、固定fixtureのローカル合格へ水増ししない。
