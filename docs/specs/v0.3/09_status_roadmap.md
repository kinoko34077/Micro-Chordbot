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
| 画面骨格 | S2 | I1 | High | v0.3 PC shell | 3 分割レイアウトの密度と区切り規則が未確定 | 左 pitch、中 editor、右 progression/control の固定化は進行中だが、各領域の最小幅と内部スクロール責務がまだ揺れている |
| 音高編集 | S2 | I1 | High | Pitch workspace | 既存音ドラッグ量子化、波形切替、丸め込み表示の実機再確認 | 最後に触った音の微調整、Ctrl 微調整、ダブルクリック削除の契約は維持しつつ、表示更新と音声反映の整合を優先 |
| 音高プリセット | S3 | I2 | High | Pitch workspace | 表共通化後の ID 方針確定 | 検索、列幅、1 行表示は進んでいる。表示上の ID は短名優先、内部参照 id は別管理という整理へ寄せている |
| コード作成 | S2 | I1 | High | Chord workspace | root/Bass/転回形 UI の密度不足と状態表示の冗長さ | Bass 分離、転回形、ルート追従は動くが、編集導線とラベル密度はまだ仕様未達 |
| コードプリセット | S2 | I2 | Medium | Chord workspace | 表共通化の残り調整と visible ID の整理 | 検索、編集順、列幅の整合は維持しつつ、コード名と短名表示の責務を再整理中 |
| 進行編集 | S2 | I1 | High | Progression workspace | チャンク、セクション、進行セル表示密度の最終整理 | chordbot 風の編集導線へ寄せる段階で、セル本文と hover 詳細の役割分離を継続 |
| chunk/section | S2 | I1 | High | Progression workspace | 命名編集、切替、追加直後フォーカスの再検証 | 追加、切替、現在チャンク再生の整理が必要。ページャ表記とチャンク選択導線も再評価対象 |
| 再生 | S2 | I1 | High | Audio and progression | 開始位置、ループ、チャンク単位再生、波形反映の再確認 | 選択セルから再生、停止、プレビューの一貫性が必要。表示更新抑制の影響も監視対象 |
| 保存/読込 | S2 | I1 | High | Data and persistence | `.mcb` と進行保存の役割分離 | デフォルト project 読込は進行済み。進行保存形式、chunk/section 含む読込導線、PWA キャッシュ整合が残課題 |
| 設定/PWA | S2 | I1 | Medium | Settings and runtime | ハンバーガーメニュー統合後の情報整理 | runtime notice、PWA notice、menu 内設定は継続調整。help/privacy と settings 本体の排他表示を維持する |
| デザインシステム | S1 | I1 | High | Cross-cutting UI | トークン統一と寸法規則が未完 | 余白、行高、アイコン、灰文字サイズ、ボタン密度の統一が必要。見た目の場当たり修正を減らす段階 |
| 文字コード/整合性 | S3 | I3 | High | Cross-cutting infra | `app.js` 以外の残存チェックと再発防止 | UTF-8 without BOM と mojibake 再発防止を継続監視。文言修正後も実ブラウザでの再確認が必要 |

## Current assessment
- 仕様文書は `v0.3` の基準として再利用可能な状態に戻っているが、実装はまだ「動くが揺れる」段階が広い。
- 直近の render 軽量化と UI 密度調整は前進だが、表示更新漏れや音声反映漏れが再発しやすく、実機確認込みで `I1` を維持する領域が多い。
- プリセット表と既定 project 読込は比較的前進している一方、制作卓としての主体験である音高編集、進行編集、再生は優先度 High のまま。

## Current focus
1. 音高編集の安定化
   数直線ドラッグ、丸め込み、波形切替、表示更新を実ブラウザで再確認し、render 軽量化の副作用を潰す。
2. 進行編集と再生契約の固定
   chunk/section、現在チャンク再生、セル表示密度、開始位置とループの整合を詰める。
3. 表 UI と ID 方針の整理
   pitch と chord の visible ID を短名基準へ寄せつつ、内部 id との責務を明文化し、列幅と一括操作の仕様を安定化する。
4. レイアウト密度と寸法規則の統一
   3 分割レイアウト内の余白、サブラベル、入力幅、アイコン寸法をトークン化前提で揃える。
5. 保存/読込と PWA 実機確認
   既定 project、進行保存、service worker キャッシュ、localhost/PWA 差分を実機で詰める。

## Next checkpoints
- `Pitch workspace`: 既存音ドラッグ、波形切替、丸め込み表示をまとめて再確認する。
- `Progression workspace`: chunk/section 切替、セル選択起点再生、ページャ表示、hover 詳細を再確認する。
- `Table UI`: visible ID、列幅初期値、ソート、一括操作バーの整合を pitch/chord 両方で確認する。
- `Runtime`: localhost と PWA の両方でキャッシュ差分と初期読込経路を再確認する。

## Review rule
- `I2` 以上でも UI 密度、操作導線、実機挙動が仕様未達なら `I1` または `I3` 扱いにする。
- `S3` へ上げる前に、各章の `Known gaps` とこの表の `Blocking issues` を同期する。
- 受け入れ判断は syntax check だけでなく、実ブラウザ確認を前提とする。

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)
