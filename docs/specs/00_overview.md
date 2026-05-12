# muChordbot Overview

## 目的
muChordbot は、微分音ベースの音高設計とコード進行試作をブラウザだけで行うための Web アプリです。音高設計、コード保存、コード呼び出し、コード進行編集、PWA 配布を一つの画面群で扱います。

## 現行スコープ
- 音高入力: 数直線ドラッグ、cent / microStep 表示、オクターブ移動、スナップ
- 発音: momentary / 持続音、activeNotes 音量、マスター音量、波形切替
- プリセット: activeNotes 行から音高プリセット追加、コード保存、タグフィルタ
- コード呼び出し: 直接音高入力または音高プリセット選択で activeNotes 展開
- コード進行: Chordbot 風セル編集、即時プレビュー、並び替え、ループ再生
- 入出力: `.mcb` project、`.mcbl` library
- 配布: localhost / LAN / HTTPS を分けた起動案内、PWA 土台

## 未完了の主な項目
- scale 管理と丸め込みの本実装
- bass 個別指定 UI
- import 競合解決ダイアログの本実装
- 実機での最終操作検証
