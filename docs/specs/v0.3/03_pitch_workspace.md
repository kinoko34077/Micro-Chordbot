# μChordbot v0.3 Pitch Workspace

- Status: draft
- Purpose: 音高編集、activeNotes、音高プリセットのあるべき UI と責務を定義する。
- Depends On: `02_information_architecture.md`, `07_interaction_rules.md`, `08_data_and_persistence.md`
- Impacts: 音高画面、数直線、activeNotes 一覧、音高プリセット一覧

## Intent
音高ワークスペースは、現在鳴らしている音、保持中の音、再利用候補の音高を、役割が分かる形で扱えることを目的とする。

## User-facing behavior
- 上段で数直線と即時音高操作を扱う
- 中段で activeNotes を編集対象として扱う
- 下段で音高プリセットを候補一覧として扱う
- ユーザーは「今触っている音」と「保存済み候補音」を混同しない

## Problem statement
- activeNotes と音高プリセットの見た目が近く、階層差が弱い
- タグやメモが主役情報より強く見えやすい
- 音高操作と一覧編集の表示規則が統一されていない

## Specification direction
- activeNotes は編集対象として強く見せる
- 音高プリセットは候補一覧として密度を抑える
- `microStep` は内部保持し、数直線上以外では既定で出さない
- ID、タグ、メモは必要時に読めるが主役にしない

## Feature requirements
### 数直線と即時音高編集
- Intent: 音高を直接触って決める
- User-facing behavior: 数直線上で追加、ドラッグ、Ctrl 微調整、丸め込み差分表示、ダブルクリック削除ができる
- Internal notes: 内部値は `microStep` を保持し、UI では必要最小限の `cent` と状態のみ出す
- Current implementation state: 部分実装
- Known gaps: 実機調整と表示一貫性がまだ不安定

### activeNotes
- Intent: 現在の作業対象をまとめて扱う
- User-facing behavior: 現在保持中の音高を一覧し、cent や短名など必要な項目だけ素早く編集できる
- Internal notes: プリセット参照、タグ、メモ、再生状態を持つ
- Current implementation state: 実装済み
- Known gaps: 候補一覧との見分けと列設計は要再設計

### 音高プリセット
- Intent: 再利用候補を保持し、activeNotes へ素早く入れる
- User-facing behavior: 検索、並び替え、ダブルクリック編集、クリック追加ができる
- Internal notes: `PitchPreset` 群を project と library で共有する
- Current implementation state: 実装済み
- Known gaps: 役割の見せ方とメモ/タグ露出量が過多

## Known UX rules
- 検索は名前、ID、タグを対象にする
- 各列幅は仕様で意味づけし、重要列を優先する
- 余分な括弧書きや重複情報は出さない

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
