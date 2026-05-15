# μChordbot v0.3 Interaction Rules

- Status: draft
- Purpose: これまで確定した主要インタラクション契約を一箇所に集約する。
- Depends On: `03_pitch_workspace.md`, `04_chord_workspace.md`, `05_progression_workspace.md`
- Impacts: ポインタ操作、キーボード操作、再生、編集フロー

## Intent
実装や見た目が変わっても、ユーザーが期待する操作契約を崩さない。

## Pitch rules
### 数直線ドラッグ
- Intent: 音高を直接動かして決める
- User-facing behavior: 既存音はつまんで連続ドラッグでき、新規音と同じ滑らかさで移動する
- Internal notes: 最後に触った音へ cent 編集が流れる
- Current implementation state: 部分実装
- Known gaps: 実機での滑らかさと丸め込みの同期に調整余地がある

### Ctrl 微調整
- Intent: 微細な移動を行う
- User-facing behavior: Ctrl 押下中はドラッグ速度が落ち、段差の 10 分の 1 単位で近い操作感になる
- Internal notes: `snapCent / 10` 相当の粒度を基本にする
- Current implementation state: 部分実装
- Known gaps: 体感速度の再調整余地がある

### ダブルクリック削除
- Intent: ドラッグと削除を両立する
- User-facing behavior: 数直線上の既存音はダブルクリックで削除する
- Internal notes: シングルクリック削除は採用しない
- Current implementation state: 実装済み
- Known gaps: 説明表示が弱い

## Chord rules
### root / Bass / 転回形 / 拍
- Intent: コード入力を軽く扱えるようにする
- User-facing behavior: root、Bass、転回形、拍は同一視野のコード入力面で扱う
- Internal notes: root は pitch class と octave を持ち、Bass は相対指定と固定音指定を持つ
- Current implementation state: 部分実装
- Known gaps: PC での配置と露出量は要再設計

### chordbot 風の進行追加導線
- Intent: パラメータ編集より「積む」感覚を優先する
- User-facing behavior: コード候補を押して進行へ素早く追加できる
- Internal notes: 高度な設定は維持しつつ、頻出操作を前面に出す
- Current implementation state: 部分実装
- Known gaps: UI 主役がまだ進行より編集盤に寄る

## Progression rules
### chunk / section 編集
- Intent: 構造単位をその場で扱う
- User-facing behavior: chunk 名と section 名はダブルクリックでインライン編集できる
- Internal notes: chunk はまとまり、section は区切り
- Current implementation state: 部分実装
- Known gaps: 表示ルールの分かりやすさに改善余地がある

### 再生
- Intent: 今見ている流れを即確認する
- User-facing behavior: 現在選択中のコードから、現チャンクだけを再生する
- Internal notes: ループも現チャンクに限定する
- Current implementation state: 部分実装
- Known gaps: レイアウト再設計後の視認性確認が必要

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
