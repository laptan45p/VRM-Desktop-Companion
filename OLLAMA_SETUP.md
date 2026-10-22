# Ollamaのかんたん導入（Windows）

1. 配布ZIPをすべて展開し、`install_ollama.bat`をダブルクリックします。
2. 表示された推奨モデルでよければEnter。変更するときは1か2、終了はQを入力します。
3. Ollamaが未導入の場合は本体を取得して公式インストーラーが開きます。本体の取得中はプログレスバーと％を最大1秒に1回更新します。バイト数は表示しません。全体サイズが不明な場合は取得中表示になります。取得完了の案内が出るまで待ち、開いた画面に従って導入してください。
4. モデルの取得が終わるまで待ちます。初回は数GBのダウンロードがあります。
5. Companionの設定で接続方式を「Ollama」、接続先を`http://127.0.0.1:11434`にし、モデル一覧を取得して下記モデルを選択・保存します。

| VRAM | 初期選択 | モデル本体の目安 |
| --- | --- | --- |
| 12GB以下 | `huihui_ai/qwen3-abliterated:8b-v2-q4_K_M` | 約5GB |
| 12GB超〜16GB未満 | 同上 | 約5GB |
| 16GB以上 | `HammerAI/nemomix-unleashed:12b-q4_K_M` | 約7.5GB |

判定できない場合は8Bが初期選択です。どのPCでも番号で変更できます。複数GPUのメモリは合算せず、最も大きい1枚を基準にします。ドライバー予約分による端数はGB単位に丸めます。NVIDIAはnvidia-smi、その他はWindowsの64bit専用VRAM情報を参照します。

モデル本体以外にも推論用メモリが必要です。VRM表示やIrodori-TTSと併用して余裕が少ない場合は8Bを選んでください。GPUがない場合も導入は可能ですが、CPUでの応答は遅くなります。Ollama本体にも別途空き容量が必要です。

導入済みのOllamaとモデルは再利用します。Ollamaがモデル未検出（404等）を返した場合のみ、次のHugging Face GGUFをOllama経由で取得し、元の指定モデル名で登録します。テンプレートはOllamaのGGUF取り込み機能を使用します。別配布者による量子化のため、Ollama配布版とのバイト単位での一致は保証しません。

- 8B：[mradermacher/Huihui-Qwen3-8B-abliterated-v2-GGUF](https://huggingface.co/mradermacher/Huihui-Qwen3-8B-abliterated-v2-GGUF)（Q4_K_M）
- 12B：[bartowski/NemoMix-Unleashed-12B-GGUF](https://huggingface.co/bartowski/NemoMix-Unleashed-12B-GGUF)（Q4_K_M）

通信エラーや容量不足では停止するので、原因を解消してBATを再実行してください。途中の取得データはOllamaが再利用します。ログは`ollama-logs`フォルダーに保存されます。モデルファイル自体はOllamaの保存先（通常はユーザーフォルダー内の`.ollama/models`、変更済みなら`OLLAMA_MODELS`）に保存されます。

既存のCompanionの接続設定・会話履歴は書き換えません。Ollamaはバックグラウンドで動作します。接続できない場合はスタートメニューからOllamaを起動して再実行してください。

[Ollama公式Windows案内](https://docs.ollama.com/windows) · [Hugging FaceのOllama連携](https://huggingface.co/docs/hub/en/ollama)
