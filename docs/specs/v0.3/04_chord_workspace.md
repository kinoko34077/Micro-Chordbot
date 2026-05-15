# μChordbot v0.3 Chord Workspace

- Status: draft
- Purpose: コード作成、コード候補、コードプリセットの UI と役割を定義する。
- Depends On: `02_information_architecture.md`, `03_pitch_workspace.md`, `07_interaction_rules.md`, `08_data_and_persistence.md`
- Impacts: コード入力面、コード候補ボタン、コードプリセット一覧

## Intent
コードワークスペースは、音高からコードを組み、軽く候補を選び、そのまま進行へ積めることを目的とする。

## User-facing behavior
- ユーザーは root、Bass、転回形、拍、コード品質を一つのコード入力面で扱える
- 頻出コードはすぐ押せる
- 詳細な構成をいじる時も、進行表示を見失わない

## Problem statement
- 現行はパラメータ編集盤が巨大で、コードを作るというより内部値を編集している感覚になりやすい
- 頻出コードと特殊コードが同じ重みで並び、迷いやすい
- コード入力、コード候補、進行追加がやや分離している

## Specification direction
- コード入力面は、進行へ積むための前処理として軽く扱えることを優先する
- 高度な内部モデルは保持するが、UI 露出は段階化する
- コード候補はカテゴリと検索を中心に整理する

## Feature requirements
### コード入力面
- Intent: root、Bass、転回形、拍を素早く決める
- User-facing behavior: root 編集、Bass 指定、転回形指定、拍入力、頻出コード選択を同じ視野で扱う
- Internal notes: root、bass、voicing、beats、section などを `progressionEditor` と共有する
- Current implementation state: 部分実装
- Known gaps: PC 上での配置と優先度整理が未完

### コード候補
- Intent: よく使うコードを軽く選ぶ
- User-facing behavior: 頻出、拡張、特殊を検索やカテゴリで絞り込める
- Internal notes: `ChordPreset.tags` と使用頻度系の将来拡張を考慮する
- Current implementation state: 部分実装
- Known gaps: 頻出順、カテゴリ折りたたみ、最近使用は未実装

### コードプリセット
- Intent: 保存済みコード構造を再利用する
- User-facing behavior: 一覧、検索、呼び出し、保存、編集ができる
- Internal notes: `ChordPreset` は pitch preset と接続される
- Current implementation state: 実装済み
- Known gaps: PC 主画面内での配置と進行との関係が弱い

## Known UX rules
- `追加` のような曖昧ラベルは避ける
- `/ P1` のような冗長表示は既定では省く
- Chordbot 的な軽さを優先し、定義エディタ感を出しすぎない

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
