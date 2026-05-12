# μChordbot の現行版アプリ解析

## 構造と目的

**μChordbot** は、ブラウザ上で微分音（1オクターブ = 3600 microStep＝1200 cent ×3）ベースの音高設計やコード進行の試作を行う PWA（Progressive Web App）です。トップレベルのディレクトリには `docs` と `code` があり、`docs/specs` には要件・機能・UI などの仕様書が、`code/` には実際のアプリ実装が置かれています。ユーザーが求めているのは**実装側が現行仕様**となるため、ここでは `code` 配下の動作を中心に説明します。

## ファイル構成（主要部分）

|ディレクトリ/ファイル|説明|
|---|---|
|`code/index.html`|UI の骨格を提供する単一ページの SPA。本体画面の他に音高・コード進行・設定（入出力）タブを持つ。|
|`code/styles.css`|Tailwind 風の CSS 変数を利用したスタイル定義。ダークテーマの配色やパネル・グリッドレイアウトを定義。|
|`code/src/app.js`|アプリケーション全体のロジック。状態管理、イベント処理、Undo/Redo、オーディオ制御、プリセット管理、コード進行編集など多数の関数を含む。|
|`code/src/pitch.js`|音高と周波数の変換やスナップ処理を提供するユーティリティ。1 oct = 3600 microStep とするための基礎関数が含まれる【832650105538075†L0-L25】。|
|`code/src/audio.js`|Web Audio API を使った発音エンジン。オシレータの生成・停止・周波数滑らか変更などを扱う【43808760720124†L0-L52】。|
|`code/src/history.js`|Undo/Redo を実装する履歴管理クラス。コマンドをスタックに追加し、state オブジェクトを元に戻す／進めることができる【330420527628673†L42-L72】。|
|`code/src/storage.js`|IndexedDB を使ってプロジェクト状態を永続化するモジュール。`saveProject` と `loadProject` により現在の状態を保存／復元する【976553530929189†L0-L38】。|
|`code/manifest.webmanifest`|アプリ名、アイコン、テーマカラー等を定義した PWA マニフェスト【208459784664938†L0-L22】。|
|`code/service-worker.js`|オフラインキャッシュ用の Service Worker。ページやスクリプトなどのアセットを事前キャッシュし、`fetch` ハンドラでキャッシュが存在すればそれを返す【992761152148980†L0-L49】。|
|`code/icons/`|PWA のアイコン画像（192/512 px SVG）。|

`docs/specs` 以下には 00〜08 の Markdown 仕様書があり、要件・機能・挙動・データ構造・UI デザイン・実装方針・テスト仕様・変更履歴がまとめられている。これらは設計時点のドキュメントであり、現行コードの仕様確認に役立つが、優先すべきは実装である。

## 状態管理とデータモデル

`src/app.js` で定義される `state` オブジェクトがアプリの中心的なデータストアであり、以下のような構造を持ちます【212517081097214†L26-L59】：

- **settings** – A4 の基準周波数 (`a4Hz`)、再生テンポ BPM (`bpm`)、丸め単位 cent (`roundUnitCent`)、丸めモード (`roundingMode`)、マスターボリュームやアクティブノート音量、音高入力時のスナップ幅 (`snapCent`)、play mode（momentary/toggle）、波形 (`waveform`) など。デフォルトでは A4=440 Hz、BPM=130、スナップ幅 16.666 cent（100/6 cent）です。
- **pitchDraft** – 数直線入力で編集中の音高。`octave`・`cent`・`microStepInOctave` を保持し、スナップ処理や正規化後のドラフト値を格納します。
- **activeNotes** – 現在鳴っている音高の配列。各要素は `{id, octave, microStepInOctave, cent}` のようなオブジェクトで、`id` は `note:<octave>:<microStep>` として生成されます。sound preview など momentary ボイス専用 ID もあり、音高個別削除や一括削除が可能です。
- **pitchPresets** – 名前付き音高プリセットのリスト。プリセットには `id`・`name`・`shortName`・`tags`・`microStep`（オクターブ内 microStep 値）・`memo` が含まれます。色付けされたタグで分類され、単クリックで activeNotes へ追加、ダブルクリックで編集が可能です。
- **chordPresets** – コードプリセットのリスト。各コードは `id`・`name`・`tags`・`tones`・`memo` 等を持ちます。`tones` はコード構成音の配列で、各トーンは `pitchPresetId` または `localCent`（cent 値）と `octaveShift` を持ち、名前ラベルも付けられます。必要に応じて bass（ベース音）情報も持ちます。
- **progression** – コード進行データ。`id`・`name`・`columns`（何列表示か）・`loop`・`selectedPartId`・`playingPartId`・`parts` などを含みます。`parts` はコード進行の各セルで、`id`・`chordId`・`root`（ルート音）・`beats`（拍数）・`bass` などを持ちます。
- **progressionEditor** – 進行編集画面の入力一時状態。選択したコード ID (`chordId`)、ルート音文字列 (`rootNoteText`)、拍数 (`beats`) などが保持されます。

Undo/Redo 管理は `HistoryManager`（`src/history.js`）で行われます。このクラスは最大 `limit` 件の履歴を保持し、`push` で履歴を積み、`canUndo` / `undo` / `redo` などで状態を戻す【330420527628673†L42-L72】。アプリでは state のスナップショットを取得して変更前後を履歴に登録し、ユーザーが「元に戻す」「やり直す」ボタンで操作を巻き戻せます。

永続化は `storage.js` の `saveProject` と `loadProject` が行います。IndexedDB に `muChordbotDB` データベースを開き、`project` ストアに現在の state（履歴を除外）を保存します【976553530929189†L0-L38】。ページ再読み込み時に `loadProject` を呼び出すことでプロジェクトが復元されます。

## 音高処理

### MicroStep と cent の変換

`src/pitch.js` では microStep 基準の音高表現が定義されています。

- `OCTAVE_MICROSTEP = 3600` は 1 オクターブを 3600 microStep と定義します【832650105538075†L0-L25】。
- `centToMicroStep(cent)` は cent 値を microStep に変換します。1 cent = 3 microStep なので、例えば 100 cent は 300 microStep【832650105538075†L0-L25】。
- `microStepToCent(ms)` は逆変換で、microStep を 1/3 cent 単位に戻します【832650105538075†L0-L25】。
- `normalizePitch(octave, ms)` は octave と microStep の組み合わせを正規化し、ms が 0 未満や 3600 以上の場合はオクターブを増減して 0≤ms<3600 に揃えた結果を返します【832650105538075†L14-L25】。
- `frequencyFromPitch(a4Hz, octave, microStepInOctave)` は A4 の基準周波数から C4 を算出し、オクターブの比率と microStep 値から周波数を求めます【832650105538075†L28-L35】。これにより任意の微分音の周波数を算出できます。
- `snapCent(rawCent, snapCentValue)` は cent 値を指定された単位で丸める処理です。snap 値が 0 以下の場合は丸めを行いません【832650105538075†L38-L41】。

### オーディオエンジン

`src/audio.js` には Web Audio API を利用した `AudioEngine` クラスがあり、発音の作成・更新・停止を抽象化します。

- `ensure()` で AudioContext とマスターボリューム用 GainNode を初期化し、サスペンド状態なら再開します【43808760720124†L7-L17】。
- `startVoice(id, freq, waveform, gain)` は指定 ID の音を生成して `this.voices` に登録します。既存の ID があれば波形や周波数・ゲインをスムーズに更新します【43808760720124†L24-L40】。初回の場合は Oscillator と Gain を作成し、微かなゲインから指定ゲインまで 0.02 秒でフェードインします【43808760720124†L42-L51】。
- `updateVoice(id, freq)` や `setVoiceGain(id, gain)` は既存ボイスの周波数やゲインを滑らかに変更します【43808760720124†L54-L70】。
- `stopVoice(id, fadeMs)` は指定ボイスをフェードアウトしながら停止して Map から削除します【43808760720124†L76-L86】。`stopAll()` は全ボイスを停止します。

アプリでは activeNotes の各ノートを `AudioEngine` に登録し、UI 操作に応じて音を鳴らしたり停止したりします。波形は sine/square/sawtooth から選択できます。

## UI 構成

### 全体レイアウト

`index.html` は単一ページ構成です。ヘッダにはアプリ名「μChordbot」とタブ形式のナビゲーションがあり、「音高」「コード進行」「設定」の 3 ビューを切り替えます。Undo/Redo ボタンとマスター音量スライダーが右側に配置されています。

`<main>` には 3 つの `<section>` があり、いずれかが `.active` クラスで表示されます。

### 音高タブ

- **入力ツールバー** – オクターブ (`#octaveInput`)、スナップ単位 (`#snapCentInput`)、cent 値 (`#centInput` + ± ボタン)、読み取り専用の microStep (`#microStepInput`)、持続音のオン/オフ (`#sustainModeInput`)、波形選択 (`#waveformSelect`)、activeNotes 音量スライダー (`#activeNotesVolumeInput`) が並びます。
- **数直線 (pitchLine)** – Canvas に 12 音の目盛り（C〜B）を表示し、ドラフト音高や activeNotes の位置をマーカーとして描画します。ドラフト位置は水色、activeNotes は赤色で、オクターブが変わると縦にオフセットされます。
- **音高ライブラリパネル** – activeNotes の一覧と削除ボタン、「音高プリセット」の保存/編集エリアが配置されます。activeNotes からプリセットに追加、プリセットから activeNotes への追加（クリック）、プリセットのダブルクリック編集ができます。
- **コードライブラリパネル** – コードプリセットの保存/呼び出し機能。コード ID、名前、タグ、構成音ラベル、メモを入力し、activeNotes からコードを保存できます。保存済みコードの一覧では単クリックで activeNotes へ展開・発音、ダブルクリックで編集ができます。呼び出し時はルート音を直接文字列（例 `D#3`）で入力するか、音高プリセットを選択します。

### コード進行タブ

コード進行は “Chordbot” 風のセル編集 UI になっています。主な構成要素：

- **進行グリッド** – `#progressionGrid` がコード進行のセル一覧です。各セルはコードとルート音を表示し、選択・ドラッグ・長押しで並び替えができます。列数 (`#progColumnsSelect`) やループ設定 (`#progLoopInput`) などのオプションがあります。
- **進行再生コントロール** – 「前へ」「次へ」「再生」「停止」ボタンで進行を順送り・再生します。BPM と各パートの拍数に基づき、`AudioEngine` でボイスを生成しテンポに合わせて鳴らします。
- **進行エディタ** – 下部に折りたたみ式の編集パネルがあり、選択セルの内容を即時編集できます。コードボタン一覧（保存済みコードプリセットから自動生成）、ルート音の直接入力やノートボタン (`C`〜`B`、`b`/`♮`/`#`、オクターブ 2〜5) による入力補助、拍数ボタン (`4/4`など) が揃っています。編集内容はセルにすぐ反映され、プレビュー音が鳴ります。

### 設定タブ（入出力）

- **基本設定** – A4 Hz や BPM、丸め単位 cent (`#roundUnitInput`)、丸めモード (`#roundingModeSelect`) を設定します。丸め単位 0 で丸め無効になります。現行実装では丸めモードやスケール機能は骨格のみです。
- **入出力** – プロジェクトやライブラリをファイルとして入出力する UI です。`exportBtn` で `.mcb`（project）、`exportLibraryBtn` で `.mcbl`（library）の JSON ファイルを書き出し、`importFileInput` で読み込みます。インポート処理ではファイルの拡張子に応じて project/library を判定し、state にマージします。

### PWA とランタイム判定

ブラウザや配布方法に応じて使い方を変えるため、`app.js` には実行環境検出関数が用意されています。`validateRuntime()` は `location.protocol` を判定して `file://` で開かれた場合にはエラーメッセージを表示し、`localhost` や LAN アドレスで開かれた場合には警告を出さないようにします【992761152148980†L31-L49】。iOS Safari などスタンドアロンインストール時は PWA としてインストールするよう `pwaPrompt` が表示され、`installPwaBtn` から `beforeinstallprompt` イベントを捕まえてインストールを促します。Service Worker は HTTPS で公開した時のみ登録され、指定されたアセットをキャッシュすることでオフライン動作を実現します【992761152148980†L0-L49】。

## コアロジックの概要

### 音高入力と activeNotes 管理

数直線 (`#pitchLine`) ではポインタ操作により cent 値を変更し、`snapCent` 関数でスナップした後 microStep に変換し `normalizePitch` でオクターブと microStep を正規化します【832650105538075†L14-L25】。ユーザーがクリックで音を鳴らしたりドラッグして位置を変えると `AudioEngine` の preview ボイス（ID `__preview__` や `__preview_drag__`）が生成されます。ドラフト確定時には `activeNotes` に追加され、任意に削除・一括削除できます。各音高は `activeNotesVolumeInput` で全体の音量を設定し、`sustainModeInput` によって momentary モード（押している間のみ鳴る）/持続音モードを切り替えます。

### 音高プリセットとコードプリセット

activeNotes に登録した音高はプリセットとして保存できます。`pitchPresets` では microStep 値と名前・短縮名・タグを保存しておき、プリセット一覧は表形式で表示されます。microStep から適切なプリセットを検索する補助関数 `findPitchPresetByMicroStep` もあります。プリセットをダブルクリックすると編集モードになり、名称や cent 値を変更して保存できます。

コード保存では、現在の `activeNotes` を基準として構成音を計算します。各音高は選択中のルート音に対して相対 microStep（pitchPresetId 指定または cent 指定）として保存され、`state.chordPresets` に追加されます。コードの短縮表示名は各トーンラベル (`Root`, `M3`, `P5` など) を使って自動生成できます。保存済みコードはタグや文字列でフィルタ可能で、単クリックで指定したルート音へ展開して activeNotes に再配置し、`AudioEngine` で即再生します。

### コード進行再生

コード進行の各セル (`part`) にはコード ID とルート音、拍数が保存されます。再生ボタンを押すと `playProgressionPart(part, index)` が呼び出され、各トーンの絶対 microStep を `progressionPartVoiceSpecs()` で計算します。その後 `AudioEngine.startVoice` で複数ボイスを生成し、拍数と BPM に基づいて次のパートへ移動します。`loop` がオンのときは最後まで再生した後に最初に戻ります。プレビュー機能では長押しや選択時に短い時間だけ該当セルの和音を鳴らすよう `previewProgressionPart()` が用意されています。

### Undo/Redo

`trackStateChange(type, label, before, after)` が呼ばれると現在の state を深いコピーで保持し、`HistoryManager` にプッシュします。Undo を行うと `undo()` が呼ばれ、以前のスナップショットで state を上書きして画面を再レンダリングします。Redo も同様に履歴を進めます。大きな操作（複数コマンドをまとめて登録したい場合）は `beginGroup()` と `endGroup()` によりグループ化できます【330420527628673†L8-L32】。

### インポート/エクスポート

アプリは JSON 形式の `.mcb`（プロジェクトファイル）と `.mcbl`（ライブラリファイル）を入出力できます。`buildProjectPayload()` と `buildLibraryPayload()` で現在の状態を JSON オブジェクトに変換し、Blob にしてファイルを生成します。インポート時は拡張子に応じて処理を分岐し、プロジェクトの場合は `settings`・`pitchPresets`・`chordPresets`・`progression` などすべてを置き換え、ライブラリの場合はプリセットのみをマージします。インポート時の競合解決ダイアログは未実装であり、保存済みのプリセットが重複する場合は後から読み込んだ側が優先されます。

## 未実装・今後の課題

- スケール管理と丸め込み (`roundUnitCent` と `roundingMode`) の本格実装はまだ行われていません。現状では snap cent のみで丸め制御を行っています。
- コードの bass の個別指定やスケール DSL (`docs/specs/dsl/01_dsl_spec.md`) との連携は将来的な拡張点として残されています。
- インポート時の競合解決（既存プリセットと同 ID の取り扱い）や UI でのダイアログ表示は仕様書に記載されていますが、現行コードでは処理が簡略化されています。
- Service Worker は HTTP(S) 環境でのみ登録される設計であり、`file://` 直開きでは PWA として機能しません。README には `python -m http.server` で `localhost` を使うよう案内があります。

## まとめ

μChordbot は、微分音ベースの音高実験とコード進行作成をブラウザだけで行える高度なツールです。アプリはオクターブ内を 3600 microStep に細分し、Web Audio API によりリアルタイムに音を生成します。activeNotes、音高プリセット、コードプリセット、コード進行という階層的データモデルを持ち、Undo/Redo や IndexedDB ベースの永続化も実装済みです。保存したプロジェクトやライブラリは JSON ファイルとして入出力でき、PWA としてオフライン利用も可能です。現行仕様ではスケールや bass 編集、インポートの競合解決など未完の部分もありますが、microtonal 音楽のプロトタイピング環境として十分な機能を備えています。

