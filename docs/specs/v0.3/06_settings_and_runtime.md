# μChordbot v0.3 Settings and Runtime

- Status: draft
- Purpose: 設定、保存/読込、Runtime/PWA、開発寄り情報の露出方針を定義する。
- Depends On: `00_overview.md`, `02_information_architecture.md`, `08_data_and_persistence.md`
- Impacts: settings ビュー、PWA 通知、import/export、表示設定

## Intent
通常作業の主画面と、環境設定や内部状態確認を明確に分ける。

## User-facing behavior
- ユーザーは主画面で作曲操作に集中できる
- 必要時だけ settings で Runtime/PWA、一覧幅、丸め、入出力を確認できる
- Runtime/PWA の通知は作業を邪魔せず、あとから設定で確認できる

## Problem statement
- 現行は Runtime/PWA/build や詳細設定が主画面に露出しやすい
- 一般ユーザー向け設定と開発寄り情報が混ざっている
- 一覧幅などの調整項目が、通常作曲操作と同じ重みで見えやすい

## Specification direction
- 主画面では制作に必要な最小操作だけを常設する
- Runtime/PWA は settings 内の独立ブロックに集約する
- 表示調整や入出力は settings からアクセスする

## Feature requirements
### Runtime / PWA
- Intent: 実行環境や更新状態を必要時に確認する
- User-facing behavior: 現在状態、更新反映、PWA 導線、通知履歴を settings から確認できる
- Internal notes: service worker、build、キャッシュ状態と接続する
- Current implementation state: 部分実装
- Known gaps: 主画面への露出量がまだ多い

### 表示・音楽設定
- Intent: 一覧幅、round、A4 Hz、BPM などを調整する
- User-facing behavior: 通常作業を邪魔しない settings 内フォームで操作する
- Internal notes: `settings` payload に保存
- Current implementation state: 実装済み
- Known gaps: 項目の整理と優先順位は要改善

### Import / Export
- Intent: project と library を扱う
- User-facing behavior: `.mcb`, `.mcbl`, 進行保存を明確に区別して扱える
- Internal notes: file format ごとに用途が違う
- Current implementation state: 部分実装
- Known gaps: 導線とラベル整理が未完

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
