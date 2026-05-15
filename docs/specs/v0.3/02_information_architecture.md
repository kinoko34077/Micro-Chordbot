# μChordbot v0.3 Information Architecture

- Status: draft
- Purpose: 画面上の情報を主役情報、補助情報、隠す情報に分け、PC/モバイルの骨格を定義する。
- Depends On: `00_overview.md`, `01_product_goals.md`, `docs/UI･UX/当初のモックの解説.txt`
- Impacts: DOM 構造、レイアウト、ナビゲーション、情報露出量

## Intent
機能の多さではなく、制作フローに沿った空間配置を与えることで、ユーザーが「今どの階層を触っているか」を自然に理解できるようにする。

## Problem statement
- 現行 UI は、編集対象、ライブラリ、再生、設定、入出力、デバッグ情報が同じ重さで並んでいる。
- PC でもタブ分離が強く、音高からコード、コードから進行への因果関係が追いにくい。
- 同種の情報でもレイアウト規則が揃っていない。

## Specification direction
- 主役情報は常時表示する。
- 補助情報は同一視野に置くが、密度を下げる。
- 隠す情報は設定や詳細展開に移す。

## Main information
- 現在の音高操作面
- activeNotes
- コード入力面
- 現在の進行、再生位置、選択中セル
- 頻出のコード候補、進行への追加導線

## Supporting information
- 音高プリセット
- コードプリセット
- 検索、タグ、メモ
- chunk と section の構造情報

## Hidden information
- Runtime / build / PWA 詳細
- 一覧幅や内部寄り表示調整
- DSL 由来メモ、ID、詳細タグ、保存形式メタ

## PC layout rule
- 全体は 2 カラム
- 左カラムは音高ワークスペース
- 右カラムはコード/進行ワークスペース
- 右内部は 3 ペイン的に、コード入力、進行表示、再生操作を同時参照可能にする

## Mobile layout rule
- 音高系とコード/進行系はタブ分離を許容する
- ただし情報構造とラベルは PC と同じ意味を保つ
- 設定と Runtime/PWA は主作業タブから外す

## Current implementation state
- `pitch`, `progression`, `settings` の 3 ビュー分離が強い
- PC では右側 2 カラム的な進行 UI は一部あるが、全体の制作フロー骨格にはなっていない

## Known gaps
- PC 主画面の再統合レイアウトが未実装
- 主役情報と補助情報の視覚差が弱い
- 隠すべき情報の退避先が一貫していない

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
