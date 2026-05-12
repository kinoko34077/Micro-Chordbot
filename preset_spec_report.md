# プリセット仕様の厳密化とテスト用埋め込みガイド

## 導入

μChordbot は微分音ベースの音高設計とコード進行を試作するための PWA です。現行実装では音高プリセットとコードプリセットの保存・呼び出しができ、ユーザーが自由に登録したプリセットを再利用できるようになっています。しかし、仕様書の `Data Spec` ではプリセットのフィールド名のみが簡潔に列挙されるだけで、型や制約・意味づけが明確ではありません【941012885124628†L2-L20】。また、テスト環境でプリセットを手動で登録しなければならないため、テストケースの再現性が低くなります。そこで、プリセット仕様を厳密化するとともに、テストコード内であらかじめプリセットを埋め込めるようにする指針をまとめます。

## 背景

### 現行のデータ構造

`src/app.js` の `state` オブジェクトには、音高プリセット (`pitchPresets`) やコードプリセット (`chordPresets`) の配列が含まれます【212517081097214†L26-L59】。各プリセットの内部構造はコード内で自由に扱われていますが、仕様書では以下のようにフィールド名だけが記載されています【941012885124628†L2-L20】：

- **PitchPreset**: `id`, `name`, `shortName`, `cent`, `microStep`, `tags[]`, `memo`, `symbolRuleKey`, `symbolMap`  
- **ChordPreset**: `id`, `name`, `baseRoot`, `tones[]`, `tags[]`, `memo`

データ型や値域が示されていないため、実装者・テスト担当者・将来の拡張者にとって一貫した利用が難しい状況です。また、テストで初期プリセットを作成する場合は UI 操作を再現する必要があり、複雑な準備が求められます。

## 分析 — プリセット仕様の詳細定義

以下では音高プリセットとコードプリセットの各フィールドについて、型、必須／任意、制約、意味を定義します。フィールド名はキャメルケースで統一し、JSON の構造に準拠します。

### 音高プリセット (`PitchPreset`)

|フィールド|型・必須|説明/制約|
|---|---|---|
|`id`|string／必須|プリセットの識別子。大文字英数字およびアンダースコアで構成し、先頭は英字とする (例: `PITCH_M3`)。アプリ内で一意でなければならない。|
|`name`|string／必須|プリセットの正式名称 (例: "Major Third")。表示やフィルタ用。|
|`shortName`|string／任意|短縮表示名 (2〜4 文字程度)。ボタンやセル内の表示に使用。空欄可。|
|`microStep`|integer／必須|このプリセットが示す音程を microStep 単位 (0–3599) で表した値。0 以上 3599 以下とし、小数は使用しない。1 cent = 3 microStep なので、例えば 1200 cent の M3 は `microStep=1200*3/100=1200`。|
|`cent`|number／任意|音程を cent 単位で表した値。`microStep / 3` と一致している必要がある。編集 UI では cent で扱うことが多いため冗長に保持する。省略可。|
|`tags`|string[]／任意|分類や検索用のタグ配列。各文字列はトリムして重複しないようにする。大文字小文字は区別しない。|
|`memo`|string／任意|備考欄。自由記述。|
|`symbolRuleKey`|string／予約済み|音高ラベルを自動生成するためのルールキー。現行実装では未使用だが、将来のスケールシステム実装時に利用予定。|
|`symbolMap`|object／予約済み|microStep 値と表示記号を対応付けるマップ。現行では未使用。|

**注意:** `microStep` が仕様の基準値であり、`cent` は冗長な表示用フィールドです。テストデータではいずれか一方を指定すれば良いですが、両方指定する場合は整合性を保ってください。

### コードプリセット (`ChordPreset`)

|フィールド|型・必須|説明/制約|
|---|---|---|
|`id`|string／必須|コードプリセットの識別子。大文字英数字とアンダースコアから成り、先頭は英字 (例: `CHORD_MAJ`)。一意であること。|
|`name`|string／必須|コード名称。短縮名でも構わない (例: "Maj", "min7").|
|`tags`|string[]／任意|コードを分類するタグ配列。pitch preset と同様にトリムし重複を避ける。|
|`memo`|string／任意|備考欄。|
|`tones`|Tone[]／必須|コード構成音の配列。インデックス 0 は暗黙的にルート音を意味し、常に `pitchPresetId` または `localCent` が 0 を表すようにする。配列の長さは 1 以上。各 Tone は下記の仕様に従う。|
|`baseRoot`|未使用|Data Spec には存在するが現行実装では利用されていない。将来の拡張として reserve とし、テストデータでは省略する。|
|`bass`|object／任意|ベース音指定。以下のプロパティを持つ: `enabled` (boolean) – ベースを有効にするか、`octave` (integer) – ベース音の絶対オクターブ、`microStepInOctave` (integer) – オクターブ内 microStep、`pitchPresetId` (string) – preset で指定する場合。コード呼び出し時に 1 オクターブ下に加える用途。|

#### Tone オブジェクト

各構成音は Tone オブジェクトとして表します。下表のいずれかの方法で音程を指定します。

|フィールド|型・必須|説明/制約|
|---|---|---|
|`pitchPresetId`|string／排他|音程を既存の音高プリセット ID で参照する。`pitchPresets` 配列に存在しなければならない。指定した場合、`localCent` は無視する。|
|`localCent`|number／排他|ルート音との間隔を cent 単位で直接指定する。小数も可。テストでは microStep へ変換して評価するため、 `localCent*3` を四捨五入した整数が microStep になる。|
|`octaveShift`|integer／必須|ルート音から何オクターブ上げるか。0 以上。例えば M7 を 1 オクターブ上に置きたい場合に 1 とする。|
|`label`|string／任意|構成音のラベル。UI での表示名や保存時の推論に用いる。空欄可。|

**トーン指定のルール**

- 各トーンは `pitchPresetId` と `localCent` のどちらか一方だけを指定する（両方指定はエラー）。
- インデックス 0 のトーンはルート音であり、`pitchPresetId` を空にするか `localCent=0`、`octaveShift=0` とする。`label` が省略された場合、自動で "Root" などが割り当てられる。
- `octaveShift` が 1 以上の場合、基準 octave に 1 オクターブ加算して配置する。
- `label` はコード構造の説明 ("M3", "P5", "b7" 等) や自由な文字列を付けられる。

### プリセット間の参照

コードプリセットが使用する `pitchPresetId` は、`pitchPresets` 配列内の `id` と一致しなければなりません。テストデータでは、この参照関係を壊さないよう、先に音高プリセットを定義し、コードプリセット内でその ID を用いる必要があります。

## 応用 — テスト用プリセットの埋め込み

テストシナリオでプリセットを手動入力する手間をなくすため、以下のようにデフォルトのプリセットを定義し、テスト開始時に `state.pitchPresets` や `state.chordPresets` へ設定する方法を推奨します。

### 標準音高プリセット例

```json
[
  {"id":"PITCH_UNISON","name":"Unison","shortName":"P1","microStep":0,"cent":0,"tags":["core"],"memo":"基準音"},
  {"id":"PITCH_m2","name":"Minor 2nd","shortName":"m2","microStep":300,"cent":100,"tags":["core"],"memo":"100 cent"},
  {"id":"PITCH_M2","name":"Major 2nd","shortName":"M2","microStep":600,"cent":200,"tags":["core"],"memo":"200 cent"},
  {"id":"PITCH_m3","name":"Minor 3rd","shortName":"m3","microStep":900,"cent":300,"tags":["core"],"memo":"300 cent"},
  {"id":"PITCH_M3","name":"Major 3rd","shortName":"M3","microStep":1200,"cent":400,"tags":["core"],"memo":"400 cent"},
  {"id":"PITCH_P4","name":"Perfect 4th","shortName":"P4","microStep":1500,"cent":500,"tags":["core"],"memo":"500 cent"},
  {"id":"PITCH_tritone","name":"Tritone","shortName":"TT","microStep":1800,"cent":600,"tags":["core"],"memo":"600 cent"},
  {"id":"PITCH_P5","name":"Perfect 5th","shortName":"P5","microStep":2100,"cent":700,"tags":["core"],"memo":"700 cent"},
  {"id":"PITCH_M6","name":"Major 6th","shortName":"M6","microStep":2700,"cent":900,"tags":["core"],"memo":"900 cent"},
  {"id":"PITCH_m7","name":"Minor 7th","shortName":"m7","microStep":3000,"cent":1000,"tags":["core"],"memo":"1000 cent"},
  {"id":"PITCH_M7","name":"Major 7th","shortName":"M7","microStep":3300,"cent":1100,"tags":["core"],"memo":"1100 cent"}
]
```

上記では 1 オクターブ（0〜1100 cent）内の主要音程を含めています。必要に応じて五度下や微分音用のプリセットを追加できますが、最低限このセットがあれば一般的なコードのテストに対応できます。

### 標準コードプリセット例

```json
[
  {
    "id":"CHORD_MAJ",
    "name":"Major",
    "tags":["core","major"],
    "memo":"Major triad",
    "tones":[
      {"pitchPresetId":null,"localCent":0,"octaveShift":0,"label":"Root"},
      {"pitchPresetId":"PITCH_M3","localCent":null,"octaveShift":0,"label":"M3"},
      {"pitchPresetId":"PITCH_P5","localCent":null,"octaveShift":0,"label":"P5"}
    ]
  },
  {
    "id":"CHORD_MIN",
    "name":"Minor",
    "tags":["core","minor"],
    "memo":"Minor triad",
    "tones":[
      {"pitchPresetId":null,"localCent":0,"octaveShift":0,"label":"Root"},
      {"pitchPresetId":"PITCH_m3","localCent":null,"octaveShift":0,"label":"m3"},
      {"pitchPresetId":"PITCH_P5","localCent":null,"octaveShift":0,"label":"P5"}
    ]
  },
  {
    "id":"CHORD_DIM",
    "name":"Diminished",
    "tags":["core","diminished"],
    "memo":"Diminished triad",
    "tones":[
      {"pitchPresetId":null,"localCent":0,"octaveShift":0,"label":"Root"},
      {"pitchPresetId":"PITCH_m3","localCent":null,"octaveShift":0,"label":"m3"},
      {"pitchPresetId":"PITCH_tritone","localCent":null,"octaveShift":0,"label":"TT"}
    ]
  },
  {
    "id":"CHORD_AUG",
    "name":"Augmented",
    "tags":["core","augmented"],
    "memo":"Augmented triad",
    "tones":[
      {"pitchPresetId":null,"localCent":0,"octaveShift":0,"label":"Root"},
      {"pitchPresetId":"PITCH_M3","localCent":null,"octaveShift":0,"label":"M3"},
      {"pitchPresetId":"PITCH_M3","localCent":null,"octaveShift":1,"label":"M3+8ve"}
    ]
  },
  {
    "id":"CHORD_DOM7",
    "name":"Dominant 7th",
    "tags":["core","7th"],
    "memo":"Dominant seventh",
    "tones":[
      {"pitchPresetId":null,"localCent":0,"octaveShift":0,"label":"Root"},
      {"pitchPresetId":"PITCH_M3","localCent":null,"octaveShift":0,"label":"M3"},
      {"pitchPresetId":"PITCH_P5","localCent":null,"octaveShift":0,"label":"P5"},
      {"pitchPresetId":"PITCH_m7","localCent":null,"octaveShift":0,"label":"m7"}
    ]
  }
]
```

この例では 5 つの基本コードを定義し、構成音に先述の音高プリセット ID を参照しています。`Tone` 配列の先頭要素はルートで `localCent=0` とし、その他の音程は `pitchPresetId` を使って明確に記述しています。augmented chord の 3 番目のトーンでは `octaveShift=1` とすることで、完全 8 度上の M3（+12 半音）を表現しています。

### テストへの組み込み方法

テスト環境にプリセットを埋め込むには、次のアプローチを推奨します。

1. **プリセット生成関数を用意する。** 例えば `getDefaultPitchPresets()` と `getDefaultChordPresets()` という純粋関数を定義し、上記 JSON を返すようにします。テストコードではこれらの関数をインポートして使用します。
2. **state に直接設定する。** テスト実行前に `state.pitchPresets = getDefaultPitchPresets();`、`state.chordPresets = getDefaultChordPresets();` として初期化することで、UI 操作を介さずにプリセットをセットアップできます。Undo/Redo 履歴を残さないよう `HistoryManager` を通さず直接書き込みます。
3. **IndexedDB へ保存しない。** テスト用のプリセットは一時的なものなので、`saveProject()` を呼び出さずにテストを進めるか、テスト終了後に `indexedDB.deleteDatabase("muChordbotDB")` を実行してクリーンアップします。
4. **テストケースで期待値を検証する。** プリセットが正しくロードされているか、コード呼び出しで正しい microStep が設定されるかなどを assert します。例えば、`loadChordIntoActiveNotes(CHORD_MAJ, root= C4)` を実行した後、`state.activeNotes` の microStep 値が `[0,1200,2100]` になるかを確認します。

## 結論

本稿では μChordbot のプリセット仕様を厳密に定義し、各フィールドの型や制約を明文化しました。音高プリセット (`PitchPreset`) では `microStep` を基準として `id` の命名規則や `cent` の整合性を示し、コードプリセット (`ChordPreset`) では `Tone` 構造や `octaveShift` の扱いを明確にしました。さらに、テスト環境でプリセットを埋め込むための標準データセットと組み込み方法を提案しました。これにより、UI 操作に依存しない再現性の高いテストが可能になり、今後の機能追加や DSL 連携の際にも整合の取れたデータ構造を維持できます。

