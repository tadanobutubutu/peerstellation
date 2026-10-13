# サイトの配信経路

## 通常のWebアクセス

ブラウザーから `ipfsuniverse.xyz` と `www.ipfsuniverse.xyz` へ来た通信は、Cloudflare の Worker Route `*ipfsuniverse.xyz/*` で受け、Worker Assets が `dist/` の静的ファイルを返します。

```text
ブラウザー → Cloudflare DNS proxy → ipfs-universe-gateway → Worker Assets (dist/)
```

Wrangler の `name` は既存 Route が指す `ipfs-universe-gateway` と一致させます。別名でデプロイすると、新しいWorkerができても本番Routeは旧Workerを呼び続けます。Worker Routeを使うapexと`www`のDNSレコードはCloudflare proxyを有効にします。

## IPFS上の不変リリース

GitHub ActionsはPinataの通常の `pinFileToIPFS` multipart APIへ `dist/` の各ファイルを相対パス付きで送信し、`_dnslink.ipfsuniverse.xyz` を返されたCIDへ向けます。DNSLinkの更新に成功した後、同じプロジェクト名で管理している古いpinを削除し、無料枠を使い切らないようにします。CAR uploadや有料のimport機能は使いません。DNSLinkはIPFSクライアントが不変リリースを見つけるための記録であり、通常のWebリクエストの配信先ではありません。

Pinata の公開ゲートウェイはこのアカウントのHTML配信を拒否するため、公開サイトのHTTP配信元として使いません。Cloudflare Workers Static Assetsを通常Webの配信元にします。

## リリース

pull requestでは品質ゲートだけを実行し、本番を変更しません。品質ゲートを通った`main`へのpush、および`main`からの`workflow_dispatch`で、ビルド後にCloudflare Worker、Pinata、DNSLinkを更新します。積み上げPRの前段階では、Wrangler設定が本番Worker名・entry point・Routeを一致して指している場合だけWorker deploymentを実行します。

ローカルで個別操作する場合は、次のコマンドを使います。

1. `npm run build` で `dist/` を作ります。
2. `npm run deploy:cloudflare` で同じWorkerに静的ファイルを発行します。
3. `PINATA_JWT` を設定して `npm run deploy:pinata` を実行します。
4. `CID`、`CLOUDFLARE_DNS_API_TOKEN`、`CLOUDFLARE_ZONE_ID` を設定して `npm run deploy:dnslink` を実行します。
5. DNSLink更新後に `CURRENT_CID` と `PINATA_JWT` を設定して `npm run deploy:pinata:prune` を実行します。

Cloudflare配信を直すだけなら、Pinata pinとDNSLinkの更新は不要です。DNSLinkを更新してもCloudflare Workerの配信内容は変わりません。

## GitHub Actions secrets

リポジトリの **Settings → Secrets and variables → Actions** に次を設定します。

| 名前 | 役割 | 確認状況 |
| --- | --- | --- |
| `PINATA_JWT` | `dist/` のfolder upload | 登録済み。既存の自動実行で成功記録あり |
| `CLOUDFLARE_API_TOKEN` | `_dnslink` TXTレコード更新。専用Worker tokenがない場合はWorker deploymentにも利用 | 登録済み。既存のDNSLink更新で成功記録あり |
| `CLOUDFLARE_ZONE_ID` | `ipfsuniverse.xyz` zoneの指定 | 登録済み |
| `CLOUDFLARE_WORKERS_API_TOKEN` | 任意の専用Worker token。設定時はWorker deploymentに優先利用 | 現在は未登録。省略時は `CLOUDFLARE_API_TOKEN` にフォールバック |

専用Worker tokenを作る場合はCloudflareアカウントと`ipfsuniverse.xyz` zoneに範囲を限定し、Workers Scriptsの編集とWorkers Routesの書き込みを許可します。CloudflareのアカウントIDは秘密ではないため `wrangler.jsonc` に保存します。`production` environmentにはsecretもvariableもなく、workflowはrepository secretsを読みます。

`APP_NAME` と `APP_TOKEN` はGitHubに登録されていますが、このリポジトリのworkflow・sourceから参照されていません。外部連携が使用している可能性があるため用途確認までは削除しません。GitHub secretの値はAPIから読み返せないため、値自体は調査・表示していません。

Pinataの無料枠は現行プラン表で1GB、500 filesです。通常のfolder uploadは無料枠に含まれ、CAR file uploadは含まれません。アップロード総量とファイル数はこの上限内に保つ必要があります。

参照: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、[Pinata料金](https://pinata.cloud/pricing)、[Pinata folder upload API](https://docs.pinata.cloud/api-reference/endpoint/ipfs/pin-file-to-ipfs)
