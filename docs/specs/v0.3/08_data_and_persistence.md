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

## Startup persistence authority
IndexedDB の起動時読込では、保存状態を次の3種類として区別する。

- `LOADED`: 読込が成功し、`current` レコードが存在する。保存済みプロジェクトを正本として復元する。
- `ABSENT`: 読込が成功し、`current` レコードが存在しない。新規状態であることが確認できたため、既定プロジェクトを初期保存してよい。
- `READ_FAILED / UNKNOWN`: open・read・timeout 等で保存状態を確認できない。既定プロジェクトを画面継続用の一時フォールバックとして使用してよいが、IndexedDB へ自動保存してはならない。

`READ_FAILED / UNKNOWN` 中は autosave を停止し、保存状態UIで警告と読込再試行を提示する。再試行で保存済みプロジェクトを取得でき、起動後の未保存変更がなければ、その保存済みプロジェクトを復元して通常保存へ戻る。

読込不能中に利用者が編集し、その後の再試行で既存の保存済みプロジェクトが見つかった場合は、どちらかを自動上書きしない。autosave を停止したまま競合を通知し、必要な内容をエクスポートしてから再読込できる状態を保つ。

原則: **保存データを読めなかったことは、保存データが存在しない証拠ではない。**

### Pre-marker project migration

`defaultProjectSourceId` が存在しないことだけを、既定プロジェクトへ置換してよい根拠にしてはならない。

履歴上、source marker 導入前には次の2種類が同じ `muChordbotDB / project / current` に保存されていた。

1. 利用者の通常autosave: `app=muChordbot`, `extensionType=mcb`, `exportType=project`, `payload` を持つ完全なproject envelope。
2. 旧default初期化: default projectの `payload` だけを保存したmarkerless object。

起動時は次の順序で扱う。

- 現行 `defaultProjectSourceId=project-7`: 現行保存としてそのままLOADED。
- markerlessで、履歴上の完全なproject envelopeとして必要fieldを検証できるもの: 利用者データとして保持し、内容を変えずに現行source markerだけを付与して1回だけ保存する。次回以降は通常LOADEDとなり、移行はidempotentでなければならない。
- markerlessで、履歴上のpayload-only default初期化shapeとして検証できるもの: 旧生成defaultとして現行defaultへ更新してよい。
- 未知source marker、field不足、または上記いずれにも安全に分類できないshape: `RECOVERY_REQUIRED` としてfail closedする。既定値や別projectで上書きせずautosaveを停止し、元のIndexedDB recordを退避してから再試行する案内を表示する。

原則: **source markerの欠如は「利用者データではない」証拠ではない。既知の履歴shapeとして積極的に識別できた場合だけ自動移行する。**


## Pitch encoding and legacy migration — 2026-10-10

- Current runtime precision: `1 octave = 120000 microStep`, `1 cent = 100 microStep`.
- New project/library/progression exports explicitly carry `pitchEncoding: "cent-x100"`.
- Legacy inputs with no encoding marker may be inferred from nonzero paired `pitchPresets[].cent` and `microStep` values. A consistently old `cent × 3` payload is converted only once to the current scale. A consistently modern `cent × 100` payload is not rescaled.
- `specVersion: "1.2.0"` alone cannot distinguish formats: both source formats use it.
- Unknown/conflicting evidence is **not** treated as legacy from small numerical values alone. No destructive numeric root conversion is made without positive evidence. Such files may require explicit source review/migration.
- Import migration applies **only to incoming entities**, never to an existing merged library. On startup, conversion precedes autosave, which writes a current encoding marker and must remain idempotent.
- Historical reference: `project (2).mcb`; current reference `code/default_project.mcb`.
