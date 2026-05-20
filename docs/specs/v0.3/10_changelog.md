# μChordbot v0.3 Changelog

- Status: partial
- Purpose: v0.3 仕様書と実装方針の変更履歴を時系列で残す。
- Depends On: `docs/specs/v0.3/*`
- Impacts: 仕様差分確認、実装判断、調査ログ参照

## 2026-05-20
- `code/src/app.js` の過描画を抑えるため、表示中 view を基準に render 対象を絞り、セクション単位の render cache を導入。
- render cache のキーは、大きい state 全体の stringify ではなく、改訂番号ベースへ置き換えて軽量化。
- project 保存は dirty 状態ベースへ変更し、無変更時の IndexedDB 書込を抑制。
- default pitch/chord preset を `code/src/default-library.js` へ分離。
- project payload、snapshot、default library 適用、pitch scale migration を `code/src/project-state.js` へ分離。
- CSV / sort / id / decimal 整形などの純粋 util を `code/src/format-utils.js` へ分離。
- `.gitignore` に `code/.edge-profile/` と `code/.edge-headless/` を追加し、ブラウザ検証用生成物が repo のノイズにならないよう調整。
- `docs/specs/v0.3/09_status_roadmap.md` と `10_changelog.md` の文字化けを解消し、文書として再利用可能な状態へ修正。
- changelog と roadmap が存在していても、文字化けしている限り基準資料として無効であることを確認。
- `code/src/app.js` の起動停止要因だった構文破損を段階的に修正。
  - `trackStateChange(...)` の壊れた文字列
  - 孤立したブロック断片
  - 重複した `async`
- `localhost` / `127.0.0.1` 起動時の runtime 文言と manifest 周辺の挙動を整理。
- PWA と Service Worker キャッシュが「反映されない」主因になっていたため、実装確認ではブラウザキャッシュ要因を前提に扱う方針を明文化。
- `code/src/app.js` に残っていた表示文言の文字化けを整理。
  - 進行 editor
  - status 文
  - 履歴ラベル
  - activeNotes
  - 音高/コードプリセット
  - 再生ボタン文言
- デフォルト project 読込、表 UI、進行 editor、設定 drawer などの調整が同時進行しているため、`09_status_roadmap.md` の実装段階を `I1` / `I3` 基準で見直した。

## 2026-05-19
- `C:/Users/kinok/Downloads/project (7).mcb` を既定 project として読み込む方向へ切り替え。
- `default_project.mcb` と保存データの source id を使い、空ライブラリで起動しないよう初期読込経路を補強。
- 進行セル表示を圧縮し、表の 1 行化、列幅調整、重なり防止を進めた。
- ハンバーガーメニューへ設定項目を寄せ、設定タブ常駐前提の構成を弱めた。
- 表 UI に選択列、一括操作、列ソートを追加し、mp3tag 的な編集導線へ寄せ始めた。

## 2026-05-15
- `docs/specs/v0.3/` を新設。
- v0.3 の中心思想を `PC 2 カラム + 右内部 3 ペイン` として整理開始。
- `docs/UI･UX/` の批評を仕様へ翻訳する方針を導入。
- `09_status_roadmap.md` を単一の進捗基準として設置。
- pitch、chord、progression、settings、interaction、persistence を v0.3 仕様へ分冊化。

## Logging rule
- 実装を進めたら、仕様差分があるものは changelog に追記する。
- changelog は「ファイルがある」だけでは不十分で、読めること、履歴として追えることを必須条件にする。
- 実装先行の修正でも、仕様上の意味があるものは roadmap と合わせて更新する。

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
