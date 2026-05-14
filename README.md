# μChordbot

微分音対応コード進行エディタ / 和声プロトタイピングPWA

μChordbot は、

- 微分音コード設計
- コード進行編集
- 相対コード進行展開
- 和声テンプレート化
- xenharmonic 実験
- WebAudio によるリアルタイム再生

を目的とした、ブラウザベースの音楽制作ツールです。

---

# 文字コード方針

- 全テキストファイルは `UTF-8 without BOM` で統一する
- 対象: `HTML / CSS / JS / JSON / MD / TXT / CSV / webmanifest`
- `UTF-16`、`Shift_JIS`、`EUC-JP`、`BOM 付き UTF-8` への変換は禁止
- `code/index.html` では `<meta charset="UTF-8">` を維持する
- JavaScript / JSON 内の日本語は不要な Unicode エスケープへ変換しない
- 改行は `LF` に統一する

---

# 特徴

## 微分音対応

μChordbot は、1オクターブを 3600 microStep として扱います。

```text
1 cent = 3 microStep
1 octave = 1200 cent = 3600 microStep
```

これにより、

- 24EDO
- 31EDO
- 72EDO
- 純正律
- 倍音近似
- 独自音律

などを柔軟に扱えます。

---

## コードライブラリ

コードをプリセット化して保存可能です。

保存内容:

- 名前
- タグ
- 構成音
- bass
- メモ

---

## コード進行編集

コード進行をグリッド形式で編集できます。

対応:

- コード追加
- 並び替え
- 拍数変更
- ループ
- コードプレビュー
- コード再生

---

## コード進行プリセット

コード進行自体をプリセット化可能です。

保存内容:

- 名前
- 短名
- タグ
- 構成コード列
- メモ

例:

```text
ii-V-I
V/V-V-I
IV-V-iii-vi
```

---

## Relative Progression（先頭相対挿入）

μChordbot の特徴的機能。

現在選択中コードを基準として、
進行プリセットを相対展開できます。

例:

```text
プリセット:
Dm7 | G7 | CM7

現在選択:
Fm9

結果:
Fm9 | Bb7 | EbM7
```

この時、

- 現在選択コードの品質
- テンション
- 微分音構造
- 独自ボイシング

は保持されます。

つまり、

```text
「現在のコードから、こう進行したい」
```

という和声文脈を再利用できます。

---

## コード進行一括トランスポーズ

選択したコード群のみを一括移調可能です。

対応:

- 半音
- 全音
- オクターブ
- cent
- microStep

また、

```text
選択範囲の先頭を指定rootへ合わせる
```

ような相対移調も可能です。

---

## WebAudio リアルタイム再生

WebAudio API により、

- コードプレビュー
- 進行再生
- リアルタイム編集確認

を行えます。

---

## PWA 対応

ブラウザアプリとしてだけでなく、
PWA としてインストール可能です。

対応:

- オフライン動作
- ホーム画面追加
- IndexedDB 保存

---

# 主な機能

- 微分音ピッチ入力
- microStep ベース内部音高
- 音高プリセット
- コードプリセット
- コード進行編集
- コード進行プリセット
- Relative Progression
- 一括トランスポーズ
- WebAudio 再生
- Import / Export
- IndexedDB 自動保存
- PWA

---

# ファイル構成

```text
code/
 ├ index.html
 ├ styles.css
 ├ service-worker.js
 ├ manifest.webmanifest
 └ src/
    ├ app.js
    ├ audio.js
    ├ history.js
    ├ pitch.js
    └ storage.js

docs/
 └ specs/
```

---

# データ構造

## PitchPreset

```text
音高プリセット
```

保持内容:

- 名前
- shortName
- microStep
- cent
- タグ
- メモ

---

## ChordPreset

```text
コードプリセット
```

保持内容:

- 名前
- タグ
- tones
- bass
- メモ

---

## ProgressionPreset

```text
コード進行プリセット
```

保持内容:

- 名前
- shortName
- タグ
- parts
- メモ

---

# Import / Export

## Project (.mcb)

保存対象:

- 設定
- 音高プリセット
- コードプリセット
- コード進行
- 進行プリセット

---

## Library (.mcbl)

保存対象:

- 音高プリセット
- コードプリセット
- 進行プリセット

---

# 動作環境

推奨:

- Chrome
- Edge
- Firefox

PWA:

- HTTPS 環境推奨

---

# 開発状況

現在 alpha 段階です。

仕様変更・構造変更が頻繁に行われます。

---

# 今後の予定

- スケールシステム
- bass 編集強化
- 高度な微分音表示
- MIDI連携
- 外部音源連携
- DSL連携
- 和声分析支援
- progression search
- progression morphing

---

# License

MIT License予定

---

# Keywords

microtonal  
xenharmonic  
music-theory  
chord-progression  
harmonic-analysis  
web-audio  
music-composition  
pwa  
microtuning  
