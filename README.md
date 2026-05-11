# μChordbot
微分音・独自和声体系対応の  
Webベース コード進行設計 / 和声プロトタイピング環境。
μChordbot は、
- 微分音コード設計
- コード進行編集
- 和声実験
- 相対進行テンプレート
- xenharmonic / microtonal 作曲
を目的とした、ブラウザベースの PWA アプリです。
---
# 特徴
## 微分音対応
1オクターブを 3600 microStep で管理。

1 cent = 3 microStep
1200 cent = 3600 microStep

これにより、

* 12EDO
* 微分音
* 独自音律
* xenharmonic
* 純正律的運用

などを柔軟に扱えます。

⸻

コードライブラリ

コードをプリセット化し保存可能。

保存内容:

* 名前
* タグ
* 構成音
* テンション
* bass
* メモ

⸻

コード進行プリセット

コード進行自体をプリセット化可能。

保存内容:

* 名前
* 短名
* タグ
* 構成コード列
* メモ

例:

ii-V-I
V/V-V-I
IV-V-iii-vi

⸻

Relative Progression

現在選択中コードを基準に、
進行プリセットを相対展開可能。

例:

Preset:
Dm7 | G7 | CM7
Selected:
Fm9
Result:
Fm9 | Bb7 | EbM7

選択コード自体は保持されるため、

* 独自テンション
* 微分音構造
* 特殊コード

を壊さずに進行だけ適用できます。

⸻

コード進行編集

* ドラッグ並び替え
* コード追加
* 一括移調
* relative transpose
* slash bass
* Undo / Redo

に対応。

⸻

PWA 対応

ブラウザ上で動作し、

* PC
* タブレット
* スマートフォン

から利用可能。

PWA インストールにも対応。

⸻

主な機能

* 微分音ピッチ編集
* コードプリセット
* コード進行編集
* コード進行プリセット
* Relative Progression
* 一括トランスポーズ
* WebAudio リアルタイム再生
* Import / Export
* IndexedDB 永続保存
* Undo / Redo
* PWA Support

⸻

技術仕様

Pitch System

1 octave = 3600 microStep

内部では microStep ベースで管理。

⸻

Audio

* WebAudio API
* OscillatorNode
* realtime playback

⸻

Storage

* IndexedDB
* Project export/import
* Library export/import

⸻

Import / Export

Project (.mcb)

アプリ全体状態を保存。

含まれるもの:

* settings
* pitch presets
* chord presets
* progression
* progression presets

⸻

Library (.mcbl)

ライブラリ共有用。

含まれるもの:

* pitch presets
* chord presets
* progression presets

⸻

Runtime

推奨:

http://localhost
https://

file:// 直開きは非推奨。

⸻

開発状況

現在は experimental / alpha 段階。

仕様変更・破壊的変更を含む可能性があります。

⸻

Screenshots

準備中

⸻

Roadmap

* Scale System
* Relative Harmonic Templates
* Advanced Progression Editor
* Bass-aware progression editing
* MIDI export
* Scala support
* Custom tuning systems
* Harmonic analysis helpers

⸻

License

MIT License予定
