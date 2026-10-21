# Irodori-TTSによる読み上げ

このアプリは同じWindows PC上の **Irodori-TTS-Server** に接続します。Gradio画面のURLではなく、公式のOpenAI互換TTSサーバーを使います。WSLは不要です。TTSサーバー・モデル・Speaker Embeddingはアプリに同梱しません。

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

v4 Largeで作成したEmbeddingなら、**v4 Large** を設定します。v4 Smallなど異なる基盤モデルへ切り替えると、そのEmbeddingをそのまま使うことはできません。サーバーの既定モデルはSmallなので、下記のモデル指定を省略しないでください。

同じPowerShellで実行します。

```powershell
$env:IRODORI_HF_CHECKPOINT = "Aratako/Irodori-TTS-v4-Large"
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
2. URLを `http://127.0.0.1:8088` にする。
3. 「Speaker Embeddingを選ぶ」で、作成済みの `.speaker.safetensors` を選ぶ。
4. 「キャラクターの発言を読み上げる」を有効にする。必要に応じて話し方、速度、音量、生成待ち時間を調整する。
5. 「設定を保存」→「声を試す」。

Speaker Studioのプロジェクト内にある作成済みファイルも、その場所から直接選べます。ファイルのパスを同じPCのサーバーへ渡すため、別の場所へ移動したら選び直してください。Docker内のパスや別PCのサーバーには対応しません。

## 発言と口パク

- 挨拶、LLMの返答、タッチ反応のセリフを読み上げます。考え中表示やシステムの読み込みエラーは読み上げません。
- 音声が生成されるまでは口を閉じ、生成完了後に音声を再生します。音声を再生するのはマスコットのウィンドウだけです。
- 再生音声の波形から、実際の出力時刻付近の音量を計算して口を開閉します。無音では閉じ、発言テキストから母音の形を補助します。VRMに「あ・い・う・え・お」の表情が必要です。母音が一部しかないモデルでは使える表情に寄せます。
- 音量に基づく同期＋文字からの母音推定です。音素の強制アライメントによる厳密な母音同期は行いません。
- 吹き出しは生成待ち・再生中も保持し、再生終了後に閉じます。音声はWAV、32MB・5分以内です。
- 新しい発言、非表示、VRM変更、吹き出しを閉じる操作、設定の保存で古い音声の生成待ち・再生を取り消します。メニューや設定の「読み上げを停止」でも停止できます。通信を取り消してもサーバー内の推論処理は完了まで続く場合があります。
- 生成失敗時も発言テキストは残り、設定画面にエラーを表示します。音声なしで文字に合わせた口パクへ戻ります。

この環境では実際のGPUモデルとユーザーのEmbeddingを使った音声生成・スピーカー出力の確認はできていません。ローカルHTTPのWAV応答、Embeddingの受け渡し、再生時刻・無音に合わせた口パク、キャンセルは自動テストで確認しています。
