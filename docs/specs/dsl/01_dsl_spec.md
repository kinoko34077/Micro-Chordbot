# muChordbot DSL Spec

## 目的
DSL は将来の外部連携用フォーマットです。現時点では本体 UI より優先度を下げ、JSON ベースで定義を保持します。

## 想定対象
- 音高プリセット定義
- コード定義
- コード進行定義
- 将来の bass / scale / 追加記号

## 現状
- 本体アプリでの DSL 直接編集 UI は未実装
- `.mcb` / `.mcbl` が現行の主経路
- DSL は将来 import / export 拡張で扱う前提
