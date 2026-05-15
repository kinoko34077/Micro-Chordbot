# μChordbot v0.3 Data and Persistence

- Status: draft
- Purpose: v0.3 が前提とする内部モデル、保存単位、I/O 対象を整理する。
- Depends On: 既存 `docs/specs/04_data_spec.md`, `03_pitch_workspace.md`, `04_chord_workspace.md`, `05_progression_workspace.md`
- Impacts: project 保存、library 保存、進行保存、UI 表示項目、移行方針

## Intent
UI で隠す情報と、内部で保持すべき情報を分離したまま整理する。

## Data entities
### PitchPreset
- Intent: 再利用可能な音高定義を保持する
- User-facing behavior: 名前、短名、cent、タグ、メモを主に扱う
- Internal notes: `id`, `name`, `shortName`, `cent`, `microStep`, `tags[]`, `memo` を持つ
- Current implementation state: 実装済み
- Known gaps: UI 露出は cent 優先でよく、microStep は主表示不要

### ChordPreset
- Intent: 再利用可能なコード構造を保持する
- User-facing behavior: コード名、タグ、構成、メモとして扱う
- Internal notes: `id`, `name`, `baseRoot`, `tones[]`, `tags[]`, `memo`
- Current implementation state: 実装済み
- Known gaps: 表示側で内部構造が露出しがち

### ProgressionPart
- Intent: 進行セル単位の状態を保持する
- User-facing behavior: ルート、コード名、Bass、転回形、拍、section を伴うセルとして見える
- Internal notes: `id`, `chordId`, `root`, `bass`, `voicing`, `beats`, `beatUnit`, `chunkId`, `chunkName`, `sectionName`
- Current implementation state: 部分実装
- Known gaps: v0.3 仕様としての正式フィールド定義は再確認が必要

## Payloads
### Project `.mcb`
- Intent: 作業全体を保存する
- User-facing behavior: 設定、音高、コード、進行をまとめて保存/読込する
- Internal notes: `settings`, `pitchPresets`, `chordPresets`, `progression`, `progressionEditor`
- Current implementation state: 実装済み
- Known gaps: v0.3 文書では進行保存との役割差を明確化する

### Library `.mcbl`
- Intent: 再利用素材だけを保存する
- User-facing behavior: 音高プリセットとコードプリセットを共有する
- Internal notes: `pitchPresets`, `chordPresets`
- Current implementation state: 実装済み
- Known gaps: project と library の導線整理が必要

### Progression save
- Intent: 進行単体を project から独立保存する
- User-facing behavior: `.mcbp` 相当として扱い、曲進行だけ移し替えられる
- Internal notes: `progression.parts`, chunk/section 情報を主に持つ
- Current implementation state: 部分実装
- Known gaps: 正式ファイル仕様は v0.3 文書で追補が必要

## Current implementation state
- project / library の入出力は存在する
- 進行単体保存も入り始めている
- 内部保持情報は UI より豊富で、表示規則との分離が必要

## Known gaps
- `voicing`, `bass`, `section`, `chunk` の正式な仕様文面が散在している
- 進行単体保存形式を v0.3 として固定できていない

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
