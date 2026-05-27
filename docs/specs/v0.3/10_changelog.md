# μChordbot v0.3 Changelog

- Status: partial
- Purpose: v0.3 仕様書と実装方針の変更履歴を時系列で残す。
- Depends On: `docs/specs/v0.3/*`
- Impacts: 仕様差分確認、実装判断、調査ログ参照

## 2026-05-20
- `code/src/app.js` の過描画を抑えるため、表示中 view を基準に render 対象を絞り、セクション単位の render cache を導入。
- render cache のキーは、大きい state 全体の stringify ではなく、改訂番号ベースへ置き換えて軽量化。
- project 保存は dirty 状態ベースへ変更し、無変更時の IndexedDB 書込を抑制。
- default pitch/chord preset を `code/src/default-library.js` へ分離。
- project payload、snapshot、default library 適用、pitch scale migration を `code/src/project-state.js` へ分離。
- CSV / sort / id / decimal 整形などの純粋 util を `code/src/format-utils.js` へ分離。
- `.gitignore` に `code/.edge-profile/` と `code/.edge-headless/` を追加し、ブラウザ検証用生成物が repo のノイズにならないよう調整。
- `docs/specs/v0.3/09_status_roadmap.md` と `10_changelog.md` の文字化けを解消し、文書として再利用可能な状態へ修正。
- changelog と roadmap が存在していても、文字化けしている限り基準資料として無効であることを確認。
- `code/src/app.js` の起動停止要因だった構文破損を段階的に修正。
  - `trackStateChange(...)` の壊れた文字列
  - 孤立したブロック断片
  - 重複した `async`
- `localhost` / `127.0.0.1` 起動時の runtime 文言と manifest 周辺の挙動を整理。
- PWA と Service Worker キャッシュが「反映されない」主因になっていたため、実装確認ではブラウザキャッシュ要因を前提に扱う方針を明文化。
- `code/src/app.js` に残っていた表示文言の文字化けを整理。
  - 進行 editor
  - status 文
  - 履歴ラベル
  - activeNotes
  - 音高/コードプリセット
  - 再生ボタン文言
- デフォルト project 読込、表 UI、進行 editor、設定 drawer などの調整が同時進行しているため、`09_status_roadmap.md` の実装段階を `I1` / `I3` 基準で見直した。

## 2026-05-19
- `C:/Users/kinok/Downloads/project (7).mcb` を既定 project として読み込む方向へ切り替え。
- `default_project.mcb` と保存データの source id を使い、空ライブラリで起動しないよう初期読込経路を補強。
- 進行セル表示を圧縮し、表の 1 行化、列幅調整、重なり防止を進めた。
- ハンバーガーメニューへ設定項目を寄せ、設定タブ常駐前提の構成を弱めた。
- 表 UI に選択列、一括操作、列ソートを追加し、mp3tag 的な編集導線へ寄せ始めた。

## 2026-05-15
- `docs/specs/v0.3/` を新設。
- v0.3 の中心思想を `PC 2 カラム + 右内部 3 ペイン` として整理開始。
- `docs/UI･UX/` の批評を仕様へ翻訳する方針を導入。
- `09_status_roadmap.md` を単一の進捗基準として設置。
- pitch、chord、progression、settings、interaction、persistence を v0.3 仕様へ分冊化。

## Logging rule
- 実装を進めたら、仕様差分があるものは changelog に追記する。
- changelog は「ファイルがある」だけでは不十分で、読めること、履歴として追えることを必須条件にする。
- 実装先行の修正でも、仕様上の意味があるものは roadmap と合わせて更新する。

Roadmap link: [09_status_roadmap.md](./09_status_roadmap.md)

## 2026-05-20 (continued)
- UI follow-up: quantized active-note drag on the pitch line, compact in-field cent stepper, line readout removal, drawer panel exclusivity, per-table column-width separation, and page-scroll lock with internal scroll regions.
- Regression follow-up: restored visible updates during pitch drag and chunk switching by widening progression render keys, stabilized waveform changes, restored undo/redo icon buttons, moved volume sliders to icon-anchored hover popdowns, reduced sublabel sizing, renamed `activeNotes` display to `現音高`, and merged visible `ID / 短名` table treatment into `ID` 중심 columns.
- Follow-up fix: waveform icon clicks now react even when the SVG child is tapped, dragged existing notes now move in snap-cent increments from a snapped base, and visible preset `ID` values are driven by short names such as `P5` and `m7` while internal reference ids remain stable.

## 2026-05-22
- `docs/specs/v0.3/09_status_roadmap.md` を現状基準で再整理。
- 各エリアの `Blocking issues` と `Notes` を、直近の実装変更と実機上の不安定要素に合わせて更新。
- roadmap の `Current focus` を優先順位付きへ再編し、次に潰すべき論点を `音高編集 -> 進行編集/再生 -> 表 UI/ID 方針 -> レイアウト密度 -> 保存/PWA` の順で固定。
- `Current assessment` と `Next checkpoints` を追加し、「何が進んでいて」「どこがまだ揺れているか」を一目で追える形にした。
- `Pitch workspace` の再整理として、数直線再描画キーを transient state まで含めて見直し、`resize` 時は render cache を明示的に無効化するよう修正。
- 既存音ドラッグの cent 量子化は helper 化し、基準 cent と coarse/fine step を分離して計算経路を単純化。
- 波形変更は button/select の両経路を共通 helper へ統一し、表示更新だけでなく可聴中 voice の再同期まで同じ処理で通すよう整理。
- `update_cent` と `update_octave` が pitch revision を進めないままだったため、revision 判定を明示的な分類へ整理して描画更新漏れを減らした。
- 音高ドラッグ中は `syncFormFromState()` と全 voice 再同期を毎フレームで走らせず、上部 pitch 入力欄と数直線だけを軽量更新する経路へ分離。
- 既存音ドラッグ時の音声は、全 `activeNotes` の再構築ではなく、動かしている note の voice だけを即時更新する形に変更。
- `renderIfChanged()` の drag 中全スロット強制再描画をやめ、progression の並び替え系以外では render key 判定を維持するよう整理。
- progression 側の操作で毎回 `syncFormFromState()` を踏んでいた経路を見直し、`syncProgressionFormFromState()` を追加してチャンク選択、セル選択、Section/Chunk 追加、削除、editor 反映を局所更新へ寄せた。
- progression grid と chunk 再生は `currentProgressionAnchorId()` / `chunkPartsForPartId()` を使う形へ寄せ、現在チャンクの解決と次セル探索の重複計算を削減。
- progression grid 描画は `partById` / `indexById` を先に構築して `find` / `findIndex` の繰り返しを避けるよう整理した。
- `toggleCurrentNote()` と `addPitchPresetToActiveNotes()` は preview voice を先に止め、最終的な active note state から `syncAudioToActiveNotes()` で鳴らし直す形へ整理し、最後に追加した音だけが二重に大きくなる経路を抑制。
- `AudioEngine` に位相モード `reset / continue` を追加し、設定から「毎回頭固定」か「現在位相に合わせる」かを切り替えられるようにした。
- `continue` モードでは新規 oscillator を現在時刻由来の位相で開始し、既存 voice へは waveform が変わったときだけ再適用するよう整理。
- mobile (`max-width: 640px`) では `html/body/main/view` の scroll lock を解除し、ページ全体を縦スクロールできるように調整。
- `audio.setPhaseMode is not a function` 対策として、`app.js` 側に後方互換ガードを追加し、古い `audio.js` を掴んでも init で停止しないよう修正。
- service worker cache 名を `mu-chordbot-v6` へ更新し、`app.js` と `audio.js` の不整合が残りにくいようにした。
- progression / chord 再生も位相継続モードへ対応し、セルごとに voice を stop/start するのではなく、継続モード時は tone slot ごとの stable id を frequency 更新で使い回す形へ変更。
- progression preview / playback は `syncScopedVoiceSpecs()` を使って scoped voice を同期し、継続モード時だけ既存 voice を残しつつ不要 voice を止める形へ整理。
- 位相継続の内部実装は `currentTime * freq` の単純再計算ではなく、`AudioEngine.phaseState` による slot ごとの accumulated phase 保持へ変更。
- progression の tone/bass は `phaseKey` を preview / playback 横断で共有し、単クリック preview でも再生中でも同じ global-like 位相が継続する方向へ寄せた。
- さらに単発 preview の頭固定感を減らすため、継続モードでも scoped voice が無音から立ち上がる初回だけは `phaseStartMode: random` を使い、slot 継続中だけ stored phase を使う混合方式へ調整。
