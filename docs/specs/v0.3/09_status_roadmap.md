# μChordbot v0.3 Status Roadmap

- Status: draft
- Purpose: v0.3 の仕様段階と実装段階を同じ表で追跡する。
- Depends On: `00_overview.md` から `08_data_and_persistence.md`
- Impacts: 開発優先順位、仕様確定順、確認順序

## Stage definitions
### Spec status
- `S0 未定義`: 方針が未整理
- `S1 方向性合意`: 大枠だけ合意済み
- `S2 仕様化中`: 文書化は進んでいるが詳細未確定
- `S3 仕様確定`: 仕様として凍結可能

### Implementation status
- `I0 未着手`: 実装なし
- `I1 部分実装`: 一部動くが不完全
- `I2 実装済み`: 仕様の大半が入っている
- `I3 実機調整中`: 動作後の UI/UX 調整段階
- `I4 受け入れ完了`: 仕様と実装の整合確認済み

## Roadmap table
| Area | Spec status | Implementation status | Priority | Owner/target | Blocking issues | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 画面骨格 | S1 | I1 | High | v0.3 PC shell | 現行タブ構成との共存整理 | PC で pitch/progression の同時表示骨格に着手済み |
| 音高編集 | S2 | I1 | High | Pitch workspace | 数直線の最終調整 | ドラッグ、Ctrl 微調整、丸め込み差分 |
| 音高プリセット | S2 | I2 | Medium | Pitch workspace | 役割差の見せ方 | activeNotes との視覚分離が必要 |
| コード作成 | S2 | I1 | High | Chord workspace | root/Bass/転回形 UI 再編 | コード入力面の軽量化が必要 |
| コードプリセット | S2 | I2 | Medium | Chord workspace | 候補カテゴリ整理 | 候補一覧の優先度整理が必要 |
| 進行編集 | S2 | I1 | High | Progression workspace | 主役化と配置再設計 | chordbot 風の積み上げ感を優先 |
| chunk/section | S2 | I1 | High | Progression workspace | 追加導線と表示規則 | 名称変更はあるが直感性不足 |
| 再生 | S2 | I1 | High | Progression workspace | 新レイアウト下で再確認 | 現チャンク、現選択開始が原則 |
| 保存/読込 | S2 | I1 | Medium | Data and persistence | `.mcbp` 位置づけ整理 | project, library, progression を区別 |
| 設定/PWA | S2 | I1 | Medium | Settings workspace | 主画面からの退避 | settings 集約を優先 |
| デザインシステム | S1 | I1 | High | Cross-cutting UI | 共通トークン未整備 | まずは workspace grid と焦点表現から着手済み |

## Review rule
- 実装が動いていても、v0.3 の仕様意図とずれていれば `I2` にしない
- UI 再編前の暫定実装は `I1` または `I3` に留める
- `S3` に上げるのは、文書内の `Known gaps` が潰れた段階とする

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
