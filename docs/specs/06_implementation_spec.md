# muChordbot Implementation Spec

## 実装構成
- `code/src/app.js`: 状態管理、描画、イベント、import / export
- `code/src/audio.js`: Web Audio による発音管理
- `code/src/pitch.js`: cent / microStep / 周波数変換
- `code/src/history.js`: Undo / Redo
- `code/src/storage.js`: IndexedDB 永続化
- `code/index.html`, `code/styles.css`: UI
- `code/manifest.webmanifest`, `code/service-worker.js`: PWA 基盤

## 実装済みフェーズ
1. 音高入力、発音、toggle / momentary
2. 音高プリセット追加、コード保存
3. コード呼び出し、ルート変更
4. コード進行編集、再生、並び替え、モバイル導線
5. `.mcb` / `.mcbl` の基本 I/O

## 保留フェーズ
6. scale 管理と丸め込み表示

## 直近の追加実装
- activeNotes 行からの音高プリセット追加
- コード呼び出しのルート音高直接入力
- 進行セル選択時 / 音程編集時のプレビュー発音
- PWA / LAN / localhost の起動モード分岐
