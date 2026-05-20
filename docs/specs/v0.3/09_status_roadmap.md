# μChordbot v0.3 Status Roadmap

- Status: partial
- Purpose: v0.3 の仕様段階と実装段階を一枚で把握できるようにする。
- Depends On: `00_overview.md` から `08_data_and_persistence.md`
- Impacts: 実装優先順位、受け入れ判断、既知課題の明示

## Stage definitions
### Spec status
- `S0 未定義`: 方向性が未定
- `S1 方向性合意`: 大枠だけ合意済み
- `S2 仕様化中`: 具体要件を整理中
- `S3 仕様確定`: 実装判断に使える状態

### Implementation status
- `I0 未着手`: 実装なし
- `I1 部分実装`: 動くが仕様未達や不整合が残る
- `I2 実装済み`: 基本挙動は実装済み
- `I3 実機調整中`: 実ブラウザ、PWA、UI 微調整中
- `I4 受け入れ完了`: 仕様との整合確認まで完了

## Roadmap table
| Area | Spec status | Implementation status | Priority | Owner/target | Blocking issues | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 画面骨格 | S2 | I1 | High | v0.3 PC shell | 3 分割レイアウトの密度最適化が未完 | 左 pitch、中 editor、右 progression/control の固定化を継続 |
| 音高編集 | S2 | I1 | High | Pitch workspace | 数直線ドラッグと丸め込みの最終調整 | 最後に触った音の微調整、Ctrl 微調整、ダブルクリック削除は再確認対象 |
| 音高プリセット | S3 | I2 | High | Pitch workspace | 表の操作系統一 | 検索、列幅、1 行表示、ID 列分離までは進行済み |
| コード作成 | S2 | I1 | High | Chord workspace | root/Bass/転回形 UI の密度不足 | Bass 分離、転回形、ルート追従は動くが整理不足 |
| コードプリセット | S2 | I2 | Medium | Chord workspace | 表共通化の残り調整 | 検索、編集順、列幅の整合を維持中 |
| 進行編集 | S2 | I1 | High | Progression workspace | チャンク、セクション、進行セル表示の最終整理 | chordbot 風の編集導線へ寄せる段階 |
| chunk/section | S2 | I1 | High | Progression workspace | 命名編集と切替導線の再検証 | 追加、切替、現在チャンク再生の整理が必要 |
| 再生 | S2 | I1 | High | Audio and progression | 開始位置、ループ、チャンク単位再生の再確認 | 選択セルから再生、停止、プレビューの一貫性が必要 |
| 保存/読込 | S2 | I1 | High | Data and persistence | `.mcb` と進行保存の役割分離 | デフォルト project 読込、進行保存形式、PWA キャッシュ整合が対象 |
| 設定/PWA | S2 | I1 | Medium | Settings and runtime | ハンバーガーメニュー統合後の整理 | runtime notice、PWA notice、menu 内設定は継続調整 |
| デザインシステム | S1 | I1 | High | Cross-cutting UI | トークン統一と寸法規則が未完 | 余白、行高、アイコン、灰文字サイズの統一が必要 |
| 文字コード/整合性 | S3 | I3 | High | Cross-cutting infra | `app.js` 以外の残存チェック | UTF-8 without BOM と mojibake 再発防止を継続監視 |

## Current focus
- `app.js` から純粋関数と default library を外出しし、view 単位 render と dirty persist へ寄せる
- 文字化け修正で崩れた表示文言と履歴ラベルの正常化
- 進行 editor と progression grid の密度調整
- 表 UI の共通規格化と操作系統一
- PWA/localhost 実機確認時のキャッシュ起因差分の抑制

## Review rule
- `I2` 以上でも UI 密度、操作導線、実機挙動が仕様未達なら `I1` または `I3` 扱いにする。
- `S3` へ上げる前に、各章の `Known gaps` とこの表の `Blocking issues` を同期する。
- 受け入れ判断は syntax check だけでなく、実ブラウザ確認を前提とする。

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
