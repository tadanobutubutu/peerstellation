# Peerstellation


<!-- AUTO-PACKAGE-BADGES:START -->

<!-- AUTO-PACKAGE-BADGES:END -->
![Peerstellation live peer observatory](./public/hero.png)

> **A browser's reachable neighbourhood, rendered as a living sky.**

Peerstellation is a web-only 3D observatory for real Helia/libp2p observations. The first viewport is intentionally quiet: the sky is the interface, and a node reveals its own details only when hovered, focused, or tapped. No peer, latency, or topology claim is invented.

[![Live site](https://img.shields.io/badge/live-ipfsuniverse.xyz-ccff66?style=for-the-badge)](https://ipfsuniverse.xyz)
[![TypeScript](https://img.shields.io/badge/TypeScript-only-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-ccff66?style=for-the-badge)](LICENSE)

## 体験

- ページ内で起動した Helia ブラウザノードの接続・発見・切断・ping・identify をリアルタイムに観測し、WebTransport、WebRTC、WebRTC Direct、WebSocket、リレーなど[Helia のブラウザ対応トランスポート](https://github.com/ipfs/helia/wiki/FAQ)と Amino Kad-DHT の bounded routing query で最大512件の追加候補も取得します。
- DHTの近傍問い合わせは起動時と60秒ごとに1回だけ、最大20秒・512候補で再実行します。接続済みピアは最大4本のpingを同時に測り、30秒間隔で更新するため、長時間開いた観測所でも新しい近傍を拾いながらブラウザをping洪水にしません。
- ノードをカーソルで指す、キーボードで選ぶ、スマホでタップする、とその場所にアンカーされたカードへ Peer ID、状態、遅延、方向、transport、protocols、agent/protocol version、アドレス件数を表示します。
- 接続線はこの観測ノードから実際に開いたブラウザ接続の証拠です。接続成立後は到着アニメーションに左右されず安定して残り、明示的な切断または観測集合からの退場でだけ消えます。`/p2p-circuit` のアドレスから中継ピアIDまで取得でき、同じ中継ピアが観測集合にも存在する場合だけ、ブラウザまたはKuboの実ノード同士の中継線を追加します。裏付けのない近接線は描かず、見栄えのためにトポロジーを捏造しません。
- Rust WebAssembly は安定した全方位の配置、近遠の分布、反発、線分生成、接続数・遅延統計を担当し、軽い制御と表示は厳密な TypeScript で実装しています。ローカル Kubo の明示インポートは最大1,024件を3Dへ載せ、アプリ内の追跡上限は2,048件です。Kubo観測は金色、ブラウザliveはライム、ブラウザ発見候補は紫、切断済みの履歴は死んだスレート色で分けます。
- 1,024件を描画し続けても操作を止めないため、RustのO(n²)反発計算は品質に応じた近傍予算（デスクトップ最大256、モバイル最大96）だけを毎フレーム更新します。予算外の外周ノードは実測半径と決定的な初期位置を保ち、表示数・距離・選択可能性を削りません。
- ピア数が増えても自動フレーミングはワールド距離360を上限（縦長は220）にし、最初のライブピアを十分に見せつつ中心のホスト星が小さく潰れないようにします。手動のWASD／矢印・ホイール移動には自動フレーミング由来の上限がありません。
- 一度でも手動で旋回・移動・ズームを始めた後は、後着ピアや切断更新で自動ズームを再開しません。`Home`、`0`、または `R` を押した時だけ現在の観測集合へ自動フレーミングを戻します。タッチ端末では二本指ピンチも使え、ピンチアウトはズームイン、ピンチインはズームアウトです。
- ピアのワールド配置はカメラの上限とは別です。測定できたpingを対数スケールで距離へ反映し、高遅延・遠いピアはカメラの外側へ残します。製品上の距離に人工的な上限は設けず、有限値だけを受け入れる数値ガードとレンダー遠平面1,000,000を最後の安全境界にします。自動カメラは360（縦長220）で止まるため、密な観測でも中心星の存在感を失わず、左ドラッグ、右クリック切替で外周を探索できます。手動探索はこの自動構図を超えて続けられます。
- 自動フレーミングは、ブラウザliveとping実測済みの観測を優先し、未計測Kuboの大量インポートでカメラを引きません。ブラウザliveがまだ無い初回だけ、決定的に近い24件を導入点として使い、残りの遠いノードは同じ世界座標のまま外周へ残します。
- 右上の歯車から、最低〜最高のプリセットまたは自動品質を選べます。ピクセル比、アンチエイリアス、星雲・星屑密度、ノード詳細度、線の明るさ、露出、深度フォグ、モーション、カメラ感度、表示ソース、到着パルスを個別に調整できます。設定は端末内だけに保存され、初期値は自動品質です。スカイボックスはライセンスとSHA256を確認した素材だけをクレジット画面へ追加します。
- Settings の `Controls` では移動・旋回・俯仰・ズーム・速度ブースト（既定は左Shift）のキーを、任意のキーボードコードへ再割り当てできます。`Language and region` では自動に加えてISO 639-1の184タグと`zh-CN`を選べます。185タグすべてに197キーのロケールパックを用意し、長尾パックだけ選択時に遅延読み込みします。`en`、`ja`、`zh-CN`、`ko`、`es`、`fr`、`de`は編集済み製品文言、低リソース言語は橋渡し言語を明示した暫定パックです。185タグすべての母語レビュー承認は未完了で、完全なネイティブ品質とは保証していません（状態・承認条件は [`docs/i18n-languages.md`](docs/i18n-languages.md)）。設定画面の言語カバレッジ一覧には生成パックの実測翻訳率と橋渡し先も表示します。ライセンス名や作者名などの法的識別子は原表記を保ち、クレジット欄の説明文は選択言語へ切り替わります。地域ヒントは端末の言語とタイムゾーンだけから大まかに推測し、IPアドレスやmultiaddrを収集・送信・保存しません。

## Helia と IPFS Desktop の数字が違う理由

IPFS Desktop の Kubo は TCP/QUIC の常駐ノードです。一方、ブラウザの Helia はブラウザが扱える WebSocket、WebRTC、リレー等だけで別の短命ノードを起動します。そのため Desktop に多数のピアがいても、ページの `connected` が 0〜数件になるのは正常です。ピア表は共有されません。

ヘッダーの **Kubo** ボタンを明示的に押した時だけ、`127.0.0.1:5001/api/v0/id` と詳細付き `swarm/peers` を読みます（仕様は [Kubo RPC リファレンス](https://docs.ipfs.tech/reference/kubo/rpc/)）。成功後は同じ利用者のオプトイン状態を保ったまま15秒周期で更新し、ページを離れるかエラーになると停止します。Kubo RPC は管理者権限相当なので、公開インターネットへ露出させてはいけません。現在の IPFS Desktop の既定設定は `https://webui.ipfs.io` だけを許可するため、Peerstellation のオリジンからは CORS で止まります。ローカル開発で試す場合だけ、実際に使う開発オリジンを列挙してから Desktop を再起動してください（`*` は使わない）。Kubo の数百件を読み込めても、それらはこのブラウザの live 接続ではないため、ヘッダーの live 数・ping 統計には混ぜません。

Kuboの更新は、切り捨てられていない成功スナップショット同士だけを比較し、前回だけ存在したKubo専用Peerには明示的な切断イベントを発行します（1,024件を超える応答では欠落を切断とみなしません）。そのため線は切断時だけ消え、死んだ星として履歴を残します。同じPeerをブラウザHeliaとKuboの両方が観測している場合は、片方の切断で他方を切断扱いにせず、出所ごとの接続状態を保ちます。CORS・HTTPエラーやタイムアウトは切断の証拠ではないため、前回集合を破棄しません。

```bash
# 例: 開発時だけ許可する Origin。* は使わない
KUBO="/Applications/IPFS Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/kubo/kubo/ipfs"
"$KUBO" config --json API.HTTPHeaders.Access-Control-Allow-Origin \
  '["http://127.0.0.1:4178"]'
"$KUBO" swarm peers --verbose --latency --direction --identify --enc=json \
  > /tmp/peerstellation-kubo-peers.json
```

CLI の `swarm peers` は Kubo が長時間保持している接続を一覧化するため、ブラウザ Helia の一時的な接続より桁違いに多くなることがあります。JSON スナップショットは監査用に保存できますが、サイトがそれを自動的に読み込むことはありません。ローカル RPC の管理権限をブラウザへ渡したくない場合は、サイトの Helia 観測だけを使ってください。

本番ページから利用者のローカルデーモンを自動探索することはありません。WebTransport/WebRTC の公告アドレスがあり、ユーザーが明示的に接続を選んだ場合だけ、別途対応します。

### 地域ヒントとプライバシーの境界

現行の静的配信では、ブラウザーが受け取れるのは `navigator.language` と IANA タイムゾーンだけです。その2つから国レベルより粗い表示用ヒントを作り、`approximate` として表示します。IPアドレス、peerのmultiaddr、GPS、外部GeoIP APIへの送信は行いません。言語・タイムゾーンはVPN、翻訳設定、端末共有などで実際の場所と一致しないため、位置情報として扱えません。

Cloudflare Workerへ移行する場合は、エッジの `request.cf` に含まれる国コードを同じオプトイン境界で使う余地があります（[Cloudflare Request API](https://developers.cloudflare.com/workers/runtime-apis/request/)）。ただし本リポジトリの静的アセットはその値へ直接アクセスできないため、現状は実装していません。将来追加する場合も、国コードをレスポンスへ一時的に返すだけにし、ログ・Cookie・localStorageへ保存せず、利用者が設定で無効化できることを条件にします。

## 開発

```bash
git clone https://github.com/tadanobutubutu/peerstellation.git
cd peerstellation
npm install
npm run dev
```

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | Vite 開発サーバー |
| `npm run build` | Rust WASMを生成し、`wasm-opt -O3`が利用できる環境では最適化して静的配布物を生成 |
| `npm run check` | 型検査・単体テスト・本番ビルド |
| `npm run quality` | Biome 2.5 のフォーマット・Lint・import整理を一括検査 |
| `npm run quality:all` | 適用可能な axe-core、Pa11y、Lighthouse、Playwright、Cypress、Backstop、Rust/npm監査を状態付きレポートへ集約 |
| `npm run test:renderer` | 同一ヘッドレスChromeで実製品のRust `wgpu` 経路とThree.jsフォールバックを同一ノード数で計測 |
| `npm run security:semgrep` | Semgrep の自動セキュリティ検査 |
| `npm run security:npm` | 本番依存だけの high/critical npm audit |
| `npm run security:csp` | 配信CSPと unsafe な接続先の静的監査 |
| `npm run security:zap` | 公式OWASP ZAPの受動ベースライン（実行環境がない場合は明示的にskip） |
| `npm run format` | Biomeでコードを整形 |
| `npm run lint` | BiomeのLintだけを実行 |
| `npm run test:e2e` | Playwright、axe、レスポンシブ、WebGPU → WebGL2 フォールバック |
| `npm run test:a11y` | html-validate と Pa11y（axe + HTML CodeSniffer）の WCAG 2 AA 監査 |
| `npm run lint:docs` | Vale の自作 AI-fluff 規則で README と docs を検査（vale-ai-tells を使う場合も同じ入口） |
| `npm run test:lighthouse` | 本番ビルドを Lighthouse CLI（性能・アクセシビリティ・ベストプラクティス・SEO・Agentic Browsing）で計測 |
| `npm run test:wasm-tools` | Rust WASMを wasm-tools、wasm-opt、wasm-snip、wasm-objdumpで検証 |
| `npm run test:storybook` / `npm run test:cypress` / `npm run test:backstop` | コンポーネント、ヘッドレススモーク、静的ビジュアル回帰 |
| `npm run test:pagespeed` | `PAGESPEED_API_KEY` がある時だけPageSpeed Insights APIを呼び出し（未設定はskip） |
| `npm run test:ipfs:cid` / `test:ipfs:car` / `test:ipfs:trustless` | CID Inspector相当、CAR全ブロックhash、Trustless Gateway raw/CAR検証（決定的fixture） |
| `npm run test:ipfs:origin` / `test:ipfs:headers` / `test:ipfs:spa` | Origin isolation、Security Headers/CSP、SPA深いURLと404フォールバックのヘッドレス検査 |
| `npm run test:ipfs:helia-identify` / `test:ipfs:inspector` | 実Helia Identify E2Eと、開発時だけ有効なjs-libp2p Inspector配線のポリシー検査 |
| `npm run test:ipfs:ipld` | IPLD Explorer相当のローカルCID/CAR traversal（Hosted UIに依存しない） |
| `npm run test:ipfs:kubo` / `test:ipfs:webui` | 明示的opt-in時だけ、ローカルKuboのread-only integrityとWebUI/RPC smokeを実行 |
| `docs/quality/ipfs-tool-matrix.md` | IPFS Check、Public Gateway、Gateway Conformance、Nebula、ProbeLab、Testground、NOpfs/Badbits、Nmap/Shodanなどのskip条件と安全境界 |
| `npm run deploy:cloudflare` | Wrangler で静的配信を更新 |
| `npm run deploy:pinata` | `PINATA_JWT` がある時だけ CID をピン |

GitHub Actions は pull request の検証だけを自動実行します。本番のCloudflare、Pinata、DNSLink更新は `workflow_dispatch` を明示的に実行した場合だけです。`main` へのpushだけで本番配信は始まりません。

### 操作と品質設定

操作方法は右上の歯車にある「Controls」カテゴリーにも常時掲載しています。各キー欄へフォーカスして任意のキーを押すと再割り当てでき、既定の左Shiftは移動速度を2.4倍にします。3Dキャンバスがフォーカスされている時、`W`／`S` は前後移動、`A`／`D` と左右矢印は旋回、上下矢印は俯仰です。左ボタンを押している間はカメラを回し、右クリックでカメラモードを固定できます。標準的なゲームパッドも接続後すぐに使え、左スティックで前後・左右、右スティックで旋回・俯仰、肩ボタンまたはトリガーで速度ブーストになります。右クリックまたは `Escape` でホバーモードへ戻ると、ポインターをノードへ重ねた時にそのノードから詳細カードが伸びます。スマートフォンではスワイプ・ピンチ・タップを使います。

歯車の設定は、画質（自動、最低、低、中、高、最高）、描画密度、空気遠近、モーション、入力感度、Kubo／発見ピアの表示、レイテンシリングを同じダイアログで調整します。自動モードだけが実測フレームp95に応じて降格・回復し、手動プリセットは選択値を勝手に変更しません。設定ダイアログのクレジット欄には、採用した宇宙パノラマの作者・出所・ライセンス・解像度・ハッシュを掲載します。

### 評価ツール

品質ゲートはブラウザ実機と静的検査を分けています。`test:a11y` は HTML の構文と、実際の Chromium での Pa11y axe／HTML CodeSniffer を連続実行します。Chrome DevTools MCP は Lighthouse（性能、アクセシビリティ、ベストプラクティス、SEO、Agentic Browsing）と Performance trace を確認するために使います。Agentic Browsing の WebMCP 検査対象が無い場合は Lighthouse が `n/a` と記録しますが、`llms.txt` の検査は必ず実行されます。

Codex で MCP を有効にする場合は、`~/.codex/config.toml` の `mcp_servers.chrome_devtools` に公式サーバーを登録し、Codex を再起動してください。OpenCode／mcporter にも同じサーバー設定を用意しています。認証情報や計測データはリポジトリへ保存しません。

Comet/Edgeの実機確認には、Tencentの[BrowserSkill](https://github.com/Tencent/BrowserSkill)を使えます。公式拡張をブラウザーへ追加した後、CLI側で `bsk doctor --json` が `extension connected` と `browser protocol compatible` を返すことを確認します。ゲーム画面へフォーカスを奪わせない場合は、次のようにエージェント窓をバックグラウンドで起動します。

```bash
bsk browsers
bsk session start --browser <instance-id> --no-focus
bsk navigate https://ipfsuniverse.xyz/ --session <session-id>
bsk observe --session <session-id> --json
bsk session stop <session-id>
```

Cometでの直近ローカルプレビュー実測は、Rust `wgpu` の `data-renderer-engine=rust-wgpu`、追跡89件、ブラウザー接続19件、設定ダイアログのキーボード操作を確認しています。拡張が未接続の環境ではBrowserSkill検査を合格扱いにせず、Playwrightの同じヘッドレス検査結果だけを品質ゲートへ反映します。

CLI で同梱 Kubo を確認する場合（アプリを停止・変更しません）:

```bash
/Applications/IPFS\ Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/kubo/kubo/ipfs swarm peers --verbose
```

## 設計と安全境界

```text
Helia/libp2p ── typed observations ── PeerReducer (最大2,048)
       │                                  ├── IndexedDB (公開IDの端末内履歴のみ)
       │                                  └── RustUniverse (wgpu WebGPU → WebGL2 + picking tooltip, 最大1,024描画)
       ├── Kubo probe (明示操作後だけ Kubo RPC/CORSを15秒更新)
       └── ThreeUniverse: Rust経路が初期化できない場合だけ使う完全フォールバック
```

Helia/libp2p のブラウザノードは module Web Worker（`peerstellation-helia`）で起動します。鍵生成、依存モジュール評価、transport 初期化、DHT探索、ping は描画用メインスレッドと分離され、Workerが使えないブラウザだけ厳密なメインスレッドfallbackへ切り替わります。

秘密鍵、Kubo 認証情報、Pinata トークンはブラウザへ渡しません。CSP、COOP/COEP/CORP、HSTS、厳格な Permissions Policy、ハッシュ付き静的資産キャッシュを配信します。IPFS はプロトコル名として技術文書で扱いますが、製品名・ロゴは独自の **Peerstellation** に分離しました。名称は GitHub/npm/一般検索の完全一致を予備調査した結果であり、商標の法的なクリアランスを意味しません。

### ツールチェーンとThree UIの判断

TypeScriptはnpmの現行安定版 **7.0.2** を固定し、通常の静的解析と整形は **Biome 2.5.11**、セキュリティ補助は **ESLint 10 + eslint-plugin-security**、将来のJSX導入監査は **eslint-plugin-jsx-a11y** で分担しています。型解析は `tsc`、未使用依存はKnip、本番の外部境界はZodで検証し、開発時の `test:schema-parity` ではValibotとArkTypeも同じfixtureを独立検証します。CSSは **Tailwind CSS 4.3.3** のViteプラグインを使い、色・文字の設計トークンをコンパイル時に生成します。現在のClaudeデザイン固有の軌道・星空・ホバー配置は既存のCSSで保持し、Tailwindユーティリティへ段階的に移行できる構成です。

「three-ui」というnpmパッケージ（1.1.1）は2020年公開のReact 16 + Material UI部品集で、Three.jsの3D UIではありません。現行の `@darrylondil/react-three-ui`（0.2.0）はReact Three Fiber専用の別設計です。Peerstellationは軽量なバニラTypeScript、DOMの意味構造、WCAG向けキーボード操作を既に採用しているため、これらを全画面へ置き換えると初期JSとアクセシビリティの保証を失います。Claudeの宇宙デザインは維持し、情報カードと一覧は意味のあるDOM、3D空間はRust `wgpu` が描画します。Rust経路が初期化できない場合や `?renderer=three` を明示した場合だけ、同じ契約を持つThree.js WebGPU/WebGL2フォールバックを使います。Tailwindは静的HTMLとバニラTypeScriptに適したゼロランタイムの選択であり、React/Babel/PostCSSを前提とするStyleXはこの構成へ導入していません。

### WASMとレンダラーの境界

Rust WebAssemblyはノード位置、速度、中心引力、反発、減衰、中心/リレー線分の位置と輝度、ピア集計と遅延統計に加え、製品の3描画パス（背景・線・ノード）を担当します。背景はThree.jsと同じCC0パノラマをRustのテクスチャへコピーし、同じFogExp2密度・露出・品質ティア・パルス式を適用します。ホストはシェル、ハート、気圏、3コロナ、2静的リング、パルス、Kubo軌道の10層で両経路の順序と半径を固定し、ピア数に応じたコロナ拡大率（最大1.22倍）とモバイルの星屑上限480点も共有します。軽い観測の正規化、入力、設定、DOMの意味構造はTypeScriptが担当し、Rust `wgpu` には固定容量の描画バッファだけを渡します。

Three.js自身はブラウザのWebGPU/WebGL APIを呼び出すJavaScriptライブラリであり、DOM/GPUコンテキストなしにRustだけで実行できません。そこでRust側はブラウザのCanvasへ `wgpu` で直接3パスを投入し、入力・観測・アクセシビリティはTypeScriptへ残します。`wgpu` のWebGPU初期化に失敗した場合は同じRust ABIでWebGL2バックエンドを試し、それも使えない場合はThree.jsのWebGPU → WebGL2経路へ自動フォールバックします。`?renderer=three` は診断用にThree.js経路を明示できます。両経路でノードの状態・遅延距離・切断履歴・リレー線・選択カード・設定を同じ契約で検査し、診断属性の名前・単位・品質予算も共有します。描画プリミティブはThreeがIcosahedron/Torus、Rustが解析的ビルボードで、ピクセル単位の一致ではなく視覚階層と空間投影を一致させています。Rustは固定3パスを優先するため、Kubo/切断マーカーのブレンド方程式とGPUタイムスタンプはバックエンド固有です（Rustは `gpuTimer=unavailable` を正直に報告）。これは「Three.jsの処理を全部WASMにした」と偽装せず、ブラウザの実行モデルに沿った構成です。直接 `wgpu` を採用したのは、Macroquad/Notan/Nannouが提供する高レベルのゲーム／クリエイティブ抽象を3D観測製品へ追加するより、描画パス・バッファ・バックエンドを最小化できるためです。Vello/Pietは2Dベクター向けであり、この3D経路には適用していません。

同一端末（Headless Chrome 149、1280×720、DPR 1、8論理コア）で256/512/1024ノードを各240フレーム×3回、実際のPeerstellationページに投入して測定します。直近の品質行列では、Three.jsフォールバックとRust `wgpu` のフレームp95差は全ノード数で20%未満の「同等範囲」でした。これはRAFと合成の時間でありGPUタイマーの純粋な描画時間ではないため、単一端末で「何倍速い」とは断定しません。Rust経路は機能等価性、WebGL2フォールバック、axe/Pa11y、キーボード操作を満たしたうえで、固定3パスの本番経路として採用しています。ブラウザやGPUでRust初期化が失敗した時はThree.jsへ戻るため、失敗時に空白画面を出しません。生データ（端末情報・各反復・p50/p95/max・判断）は `artifacts/quality/renderer-benchmark.json` に保存されます。

### 参考作品と独自性

GPU手続き生成のシネマティック作品 [ABYSSAL / natural-disasters](https://github.com/Token-Gremlin/natural-disasters) の品質プリセット、動的な負荷計測、決定的な実機スクリーンショットという設計思想を参考にしました。Peerstellationのノード配置、到着演出、色、UI、WASM ABI、コード、シェーダー、文章、命名は独自に実装しており、参照リポジトリのソースは取り込んでいません。ABYSSALはMITライセンスで公開されていますが、Peerstellationの観測対象は実際に取得したHelia/libp2p情報だけに限定されます。

品質は一方向の「軽量化」ではなく、120フレームのp95と最大フレーム時間を基準に `cinema → balanced → efficient → still` を往復します。p95が目標の1.25倍を超えた場合、または約20.0ms（16.7msの1.2倍）超のスパイクを直近5回中2回検出した場合にピクセル比と星屑の描画数を下げます。最大フレームは同じ窓のp50 cadenceを使って正規化し、2.5 cadence以上を反復スパイク、3 cadence以上を即時の深刻な停止として扱います。これにより60Hzの1〜2ティックや低リフレッシュの揺らぎを過剰反応せず、3フレーム級の停止は保護します。GPUはThree.jsのtimestamp-queryが利用できる場合、約500ms間隔で直近値、サンプル数、p50/p95/maxを別々にCanvas診断属性へ残します。新しいピアは discovery → ping → link → settle → reframe の段階を持ち、到着段階は星の大きさだけに適用します。証拠線は接続成立後に安定して残り、明示的な切断または観測集合からの退場でだけ消えます。状態と計測値のCanvas診断属性は開発時の実機テストで利用し、利用者向けの画面には増殖するテキストを置きません。

## 無料運用と収益化の境界

静的配信は Cloudflare Workers Static Assets を既定にし、無料枠内の公開体験を維持します。広告、指紋採取、第三者トラッカーは入れません。支援導線は別リリースで GitHub Sponsors 等を設定できるようにし、運営費が必要になった場合だけ、次の順序で拡張します。

1. 透明な個人支援（GitHub Sponsors / Ko-fi）
2. CID 固定の到達性レポートと CSV/JSON エクスポート
3. 企業向けの認証済み履歴・監視機能（公開版の観測範囲とは分離）

## ライセンス

MIT © [tadanobutubutu](https://github.com/tadanobutubutu)
