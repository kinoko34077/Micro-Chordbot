# μChordbot v0.3 Progression Workspace

- Status: draft
- Purpose: 進行編集、再生、chunk、section の UI と操作契約を定義する。
- Depends On: `02_information_architecture.md`, `04_chord_workspace.md`, `07_interaction_rules.md`, `08_data_and_persistence.md`
- Impacts: 進行グリッド、再生系、chunk/section、進行保存/読込

## Intent
進行ワークスペースは、コードを積み、流れを見て、再生し、構造単位で整理する中心領域として機能する。

## User-facing behavior
- 現在のチャンクだけを見て、選択、再生、編集できる
- 現在選択中のコードから再生できる
- chunk と section は進行構造として見分けられる
- 進行カードは主役として強い視認性を持つ

## Problem statement
- 進行カードより編集パラメータが強く見える場面がある
- chunk/section の編集、切替、追加は機能していても意味が見えにくい
- 再生、保存、読込、チャンク管理の視覚的まとまりが弱い

## Specification direction
- 進行グリッドを右ワークスペースの主役にする
- 再生系と chunk 管理は進行の近くに置く
- chunk は進行のまとまり、section は曲構造上の区切りとして視覚差を持たせる

## Feature requirements
### 進行カード
- Intent: コードの流れを積み上げて管理する
- User-facing behavior: 選択中、再生中、同一チャンク、セクション境界が分かる
- Internal notes: `ProgressionPart`, `chunkId`, `chunkName`, `sectionName`, `voicing`, `bass`, `beats`, `beatUnit`
- Current implementation state: 部分実装
- Known gaps: 主役感、密度整理、PC 配置の再設計が必要

### chunk / section
- Intent: 曲構造と編集単位を両立する
- User-facing behavior: chunk 追加、切替、名称変更、section 追加、名称変更ができる
- Internal notes: chunk はまとまり、section は区切りのラベル
- Current implementation state: 部分実装
- Known gaps: 追加導線と表示ルールの直感性が不足

### 再生と進行管理
- Intent: 現在の選択から流れを確認する
- User-facing behavior: 前後移動、再生、停止、ループ、保存、読込、チャンク選択が行える
- Internal notes: 再生は現チャンク基準、開始位置は選択セル基準
- Current implementation state: 部分実装
- Known gaps: 画面内でのまとまりと記号表現の統一が未完

## Known UX rules
- 進行一覧は現チャンクだけを出す
- ループ対象も現チャンクに限定する
- 進行追加は chordbot 風に軽く行えることを優先する

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
