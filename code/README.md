# muChordbot 起動ガイド

## PC 開発
`file://` 直開きでは動作保証しません。ES Modules、IndexedDB、Service Worker を使うため、HTTP サーバー経由で開いてください。

```bash
cd code
python -m http.server 5173
```

ブラウザで以下を開きます。

```text
http://localhost:5173/
```

## 同一 Wi-Fi でスマホ / タブレット確認
同じネットワーク上の端末から開く場合は LAN 公開で起動します。

```bash
cd code
python -m http.server 5173 --bind 0.0.0.0
```

PC の LAN IP を確認し、端末側で以下のような URL を開きます。

```text
http://192.168.x.x:5173/
```

この URL はブラウザ閲覧確認用です。PWA install とオフライン利用は想定していません。

## Netlify / Vercel 公開
HTTPS 公開時は PWA として利用できます。

- Netlify は `netlify.toml` を同梱済みで、公開ディレクトリは `code/` です。
- Vercel は `Root Directory` を `code` に設定してください。
- 公開後は HTTPS URL で開き、Android Chrome ではインストール導線、iPhone / iPad では Safari の「ホーム画面に追加」を使います。

## PWA の前提
- `file://` : 非対応
- `http://localhost/...` : 開発用。Service Worker 登録対象
- `http://192.168...` など LAN URL : 実機ブラウザ確認用
- `https://...` : PWA install / オフライン確認用

## キャッシュ更新
Service Worker のキャッシュ対象を更新したときは `code/service-worker.js` の `CACHE_NAME` を更新してください。
