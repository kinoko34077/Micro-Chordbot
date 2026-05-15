# μChordbot v0.3 Overview

- Status: draft
- Purpose: v0.3 の中心思想、文書の読み順、仕様の優先順位を定義する。
- Depends On: `docs/UI･UX/*`, 既存 `docs/specs/*`, 現行実装 `code/index.html`, `code/styles.css`, `code/src/app.js`
- Impacts: 画面構成、情報設計、文書運用、実装優先順位

## Summary
μChordbot v0.3 は、微分音音高編集、コード構成、コード進行編集を単なる管理画面の集合ではなく、同一視野でつながる作曲作業台として再構成する版である。  
v0.3 では PC 版の制作体験を主軸に据え、音高、コード、進行を空間的に連続したワークスペースとして設計する。

## Core direction
- PC は全体 2 カラムを基本にする。
- 左は音高ワークスペース、右はコード/進行ワークスペースとする。
- 右側内部は、コード入力、進行表示、再生操作を同時参照できる構成にする。
- 設定、Runtime、PWA、詳細メタ情報は主画面から退避する。
- モバイルはタブ分離を許容するが、PC の情報設計思想を保った簡略版とする。

## Source priority
v0.3 の仕様判断は以下の優先順で行う。

1. `docs/UI･UX/` にある意図、批評、モック思想
2. これまでの会話で確定した操作契約
3. 現行実装が持っている実データ構造と機能

## Documentation map
- `01_product_goals.md`: 誰のために、何を改善する版か
- `02_information_architecture.md`: 主役情報、補助情報、隠す情報の分離
- `03_pitch_workspace.md`: 音高編集、activeNotes、音高プリセット
- `04_chord_workspace.md`: コード作成、コード候補、コードプリセット
- `05_progression_workspace.md`: 進行、chunk、section、再生
- `06_settings_and_runtime.md`: 設定、入出力、Runtime/PWA
- `07_interaction_rules.md`: 主要インタラクション契約
- `08_data_and_persistence.md`: 保存データ、内部モデル、I/O
- `09_status_roadmap.md`: 仕様段階と実装段階の進捗管理
- `10_changelog.md`: v0.3 文書更新履歴

## Current implementation state
- 微分音編集、activeNotes、音高プリセット、コードプリセット、進行、chunk/section、保存/読込は既に実装要素を持つ。
- 一方で UI は、音楽制作フローよりも内部構造の露出が強く、主従関係が弱い。
- PC 画面では、音高、コード、進行を同一視野で扱う構成が未完成である。

## Known gaps
- 既存タブ構成は、v0.3 が要求する PC 向け一覧性とずれている。
- 設定、Runtime、PWA、デバッグ寄り情報が主画面に残りやすい。
- 画面骨格、寸法規則、ボタン種別、色の意味づけが統一されていない。

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
