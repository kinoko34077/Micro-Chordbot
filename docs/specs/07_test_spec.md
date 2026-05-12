# muChordbot Test Spec

## 重点確認
- 数直線が表示され、ドラッグで音高が更新される
- 持続音オン / オフで発音挙動が切り替わる
- activeNotes の追加、個別削除、一括削除ができる
- activeNotes 行から音高プリセットを追加できる
- コード保存、コード一覧フィルタ、コード呼び出しが動く
- 進行セルの追加、削除、並び替え、再生、ループが動く
- 進行セル選択と音程変更でプレビュー発音する
- `.mcb` / `.mcbl` の import / export が通る
- localhost / LAN / HTTPS で適切な起動案内が出る

## 自動確認
- `node --check code/src/app.js`
- `node --check code/src/audio.js`
- 必要に応じて `node --check code/service-worker.js`
