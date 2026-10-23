# Irodori-TTSによる読み上げ

このアプリは同じWindows PC上、またはLAN内のIPv4アドレスで指定した **Irodori-TTS-Server** に接続します。Gradio画面のURLではなく、公式のOpenAI互換TTSサーバーを使います。WSLは不要です。TTSサーバー・モデル・Speaker Embeddingはアプリに同梱しません。

## batで導入（初心者向け・推奨）

Windows版・更新ZIP・ソースZIPに、次の2本を同梱しています。ZIPの中では実行せず、すべて展開してください。更新版ではZIPの中身をexeのあるフォルダーへコピーします。`tts-tools` フォルダーも一緒に置いてください。

1. **install_irodori_tts.bat** をダブルクリックします。Git・uvがなければWinGetで導入します。確認や管理者権限の画面が出たら内容に従ってください。Python 3.10はuvで用意します。
2. 公式リポジトリをbatと同じ場所の `Irodori-TTS-Server` にクローンし、その中の `.venv` にCUDA 12.8版の依存関係を導入します。NVIDIA GPU・CUDA・BF16の利用可否を確認し、「インストール完了」が出るまで待ちます。
3. **start_irodori_tts.bat** をダブルクリックします。`Aratako/Irodori-TTS-v4-Large-Quantized/int8-weight-only`・`bf16` を指定して、`127.0.0.1:8088` で起動します。
4. 初回はモデルとコーデックをダウンロードします。ログに **Application startup complete** が出てから、下の「マスコット側で設定する」に進んでください。モデルはインストールbatではなく、初回の起動時に取得します。

通常は2回目以降、起動用batだけを使います。サーバーの画面は開いたままにし、終了はCtrl+Cです。起動batはモデル設定を毎回指定するため、既定のSmallモデルでは起動しません。`.env` に古いローカルチェックポイントがあっても、このbatでは指定の量子化版を優先します。

インストールbatの再実行は既存の公式リポジトリを再利用し、依存関係を再確認します。`git pull`、既存の`.env`の上書き、Embeddingの削除は行いません。サーバーを更新する際は公式手順で更新してください。Irodori-TTS-MODやSpeaker Studioの環境とは分かれています。

### うまく起動しない場合

- **WinGetがない**：Microsoft Storeで「アプリ インストーラー」を導入・更新するか、[Git](https://git-scm.com/install/windows)と[uv](https://docs.astral.sh/uv/getting-started/installation/)を手動導入して再実行します。
- **CUDAを利用できない**：NVIDIAのGPUとドライバーを確認します。このbatは量子化版のCUDA実行用で、CPUへの自動切り替えはしません。
- **401/403などHugging Faceの認証エラー**：サーバーフォルダーで `uv run --no-sync hf auth login` を実行し、必要なモデルの利用条件・アクセスを確認します。トークンをbatへ書き込む必要はありません。
- **8088が使用中**：既にサーバーが起動しているなら追加起動は不要です。他のアプリが使っている場合は終了してから試します。
- **IRODORI_API_KEYの設定エラー**：このマスコットはローカルTTSのAPIキー認証を使いません。専用サーバーの`.env`で該当行をコメントアウトし、Windowsの環境変数にも設定していないか確認します。既存の認証設定をbatが勝手に消すことはありません。
- **途中で止まった**：`tts-logs` の日時付きログと、画面のエラーを確認します。batは失敗しても画面がすぐ閉じないようにしています。書き込み権限のあるフォルダーで実行してください。

モデル・コーデックはHugging Faceのキャッシュ、Python・依存関係はuvのキャッシュにも保存されます。複数GBのダウンロードと空き容量が必要です。作成済みのSpeaker Embeddingは、マスコットの設定画面で別途選んでください。Large用Embeddingと量子化版での声の再現性は、実際に生成して確認してください。

## 手動で導入する場合

## 1. TTSサーバーを用意する

公式: https://github.com/Aratako/Irodori-TTS-Server

Gitとuvが使えるPowerShellで、保存したい場所を開いて実行します。

```powershell
git clone https://github.com/Aratako/Irodori-TTS-Server.git
cd Irodori-TTS-Server
uv sync --python 3.10 --extra cu128
```

既にサーバーを導入済みなら、そのフォルダーを使用できます。Irodori-TTS-MODやSpeaker Studioの既存環境へこのサーバーの依存を上書きせず、サーバー自身の環境を使ってください。

## 2. Speaker Embeddingを学習した基盤モデルで起動する

v4 Largeで作成したEmbeddingなら、**v4 Large系** を設定します。ここでは使用予定のint8-weight-only版を指定します。v4 Smallなど異なる基盤モデルへ切り替えると、そのEmbeddingをそのまま使うことはできません。サーバーの既定モデルはSmallなので、下記のモデル指定を省略しないでください。

同じPowerShellで実行します。

```powershell
$env:IRODORI_HF_CHECKPOINT = "Aratako/Irodori-TTS-v4-Large-Quantized/int8-weight-only"
$env:IRODORI_MODEL_PRECISION = "bf16"
$env:IRODORI_PRELOAD = "true"
uv run --no-sync python -m irodori_openai_tts --host 127.0.0.1 --port 8088
```

手元に学習時と同じ `model.safetensors` がある場合は、起動前に次のように指定できます（上記のHFモデル指定より優先されます）。基盤モデルと一緒に配布されたtokenizerフォルダーも所定の位置に置いてください。

```powershell
$env:IRODORI_CHECKPOINT = "F:\models\Irodori-TTS-v4-Large\model.safetensors"
```

モデル取得に必要なHugging Faceの認証・アクセス設定は、公式の案内に従って済ませてください。初回はモデルやコーデックの取得・読み込みに時間がかかります。このPowerShellはサーバーを使う間は開いたままにします。終了はCtrl+Cです。

サーバーの `.env` に別の設定がある場合は内容も確認してください。アプリ側ではAPIモデルID `irodori-tts` を使い、APIキー未設定のローカルサーバーへ接続します。

## 3. マスコット側で設定する

1. 右クリック → 設定 →「Irodori-TTS 読み上げ」。
2. 同じPCのサーバーはURLを `http://127.0.0.1:8088` にする。LAN内のサーバーは `http://192.168.1.101:8088/` のように指定できます。
3. 使用するVRMを読み込んだ状態で、「Speaker Embeddingを選ぶ」から作成済みの `.speaker.safetensors` を選ぶ。現在のVRMとの組み合わせを自動保存します。
4. 「キャラクターの発言を読み上げる」を有効にする。必要に応じて話し方、速度、音量、生成待ち時間を調整する。
5. 「設定を保存」→「声を試す」。

VRMを切り替えると、登録したSpeaker Embeddingへ自動で切り替わります。初めてのVRMでは未選択になり、文字だけで応答するので、そのモデルの声を登録してください。同じEmbeddingを複数のVRMへ指定することもできます。切り替え前の音声の生成待ち・再生は停止します。

Speaker Studioのプロジェクト内にある作成済みファイルも、その場所から直接選べます。ファイル本体ではなく、選択したパスをサーバーへ渡します。別の場所へ移動したら選び直してください。

LAN接続では `192.168.x.x`・`10.x.x.x`・`172.16.x.x〜172.31.x.x` を指定できます。サーバー側もLANから接続できるアドレスで待ち受けている必要があります。同梱の起動batはこのPC向けの待ち受けです。別PCを使う場合は、選んだSpeaker Embeddingが両方のPCから同じパスで読める構成が必要です。Embeddingの自動アップロードやサーバー専用パスの指定、APIキー認証には対応していません。

## 発言と口パク

- 挨拶、LLMの返答、タッチ反応のセリフを読み上げます。考え中表示やシステムの読み込みエラーは読み上げません。
- 音声が生成されるまでは口を閉じ、生成完了後に音声を再生します。音声を再生するのはマスコットのウィンドウだけです。
- 再生音声の波形から、実際の出力時刻付近の音量を計算して口を開閉します。無音では閉じ、発言テキストから母音の形を補助します。VRMに「あ・い・う・え・お」の表情が必要です。母音が一部しかないモデルでは使える表情に寄せます。
- 音量に基づく同期＋文字からの母音推定です。音素の強制アライメントによる厳密な母音同期は行いません。
- 吹き出しは生成待ち・再生中も保持し、再生終了後に閉じます。音声はWAV、32MB・5分以内です。
- 新しい発言、非表示、VRM変更、吹き出しを閉じる操作、設定の保存で古い音声の生成待ち・再生を取り消します。メニューや設定の「読み上げを停止」でも停止できます。通信を取り消してもサーバー内の推論処理は完了まで続く場合があります。
- 生成失敗時も発言テキストは残り、設定画面にエラーを表示します。音声なしで文字に合わせた口パクへ戻ります。

この環境では実際のGPUモデルとユーザーのEmbeddingを使った音声生成・スピーカー出力の確認はできていません。ローカルHTTPのWAV応答、Embeddingの受け渡し、再生時刻・無音に合わせた口パク、キャンセルは自動テストで確認しています。

