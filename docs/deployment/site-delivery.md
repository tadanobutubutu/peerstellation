# サイトの配信経路

## 通常のWebアクセス

ブラウザーから `ipfsuniverse.xyz` と `www.ipfsuniverse.xyz` へ来た通信は、Cloudflare の Worker Route `*ipfsuniverse.xyz/*` で受け、Worker Assets が `dist/` の静的ファイルを返します。

```text
ブラウザー → Cloudflare DNS proxy → ipfs-universe-gateway → Worker Assets (dist/)
```

Wrangler の `name` は既存 Route が指す `ipfs-universe-gateway` と一致させます。別名でデプロイすると、新しい Worker ができても本番 Route は旧 Worker を呼び続けます。Worker Route を使う apex と `www` の DNS レコードは Cloudflare proxy を有効にします。

## IPFS上の不変リリース

IPFS向けの不変リリースを作る場合は、Pinataにビルド成果物をpinし、`_dnslink.ipfsuniverse.xyz` をそのCIDへ向けます。DNSLink はIPFSクライアントが不変リリースを見つけるための記録であり、通常のWebリクエストの配信先ではありません。

Pinata の公開ゲートウェイはこのアカウントのHTML配信を拒否するため、公開サイトのHTTP配信元として使いません。Cloudflare Workers の静的アセット要求は無料で無制限です。

## リリース

1. `npm run build` で `dist/` を作ります。
2. `npm run deploy:cloudflare` で同じWorkerに静的ファイルを発行します。
3. Pinataへの同期が必要な場合は `PINATA_JWT` を設定して `npm run deploy:pinata` を実行します。
4. 新しいCIDを `_dnslink` に反映する場合だけ `CID`、`CLOUDFLARE_DNS_API_TOKEN`、`CLOUDFLARE_ZONE_ID` を設定して `npm run deploy:dnslink` を実行します。

Cloudflare配信を直すだけなら、Pinata pin と DNSLink の更新は必要ありません。DNSLinkを更新しても、Cloudflare Worker の配信内容は変わりません。

参照: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、[Pinata料金](https://pinata.cloud/pricing)
