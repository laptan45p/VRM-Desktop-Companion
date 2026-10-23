# llama-serverをCompanionから使う

Companionの設定からllama.cppのサーバーを起動・停止し、ローカルの会話用GGUFを利用できます。DRYによる文章の反復抑制に対応しています。Ollama・LM Studio・クラウド接続も引き続き選択できます。

## 初回の手順（Windows x64）

1. Companionを更新し、exeと同じフォルダーの `install_llama_server.bat` を実行します。ソース版ではプロジェクト直下にあります。
2. EnterでVulkan版を導入します。対応するGPUドライバーが必要です。GPUを使わない場合は「2」でCPU版を選べます。管理者権限は不要です。
3. 会話用GGUFモデルをダウンロードします。以下の配布元のFiles一覧から、ファイル名に `Q4_K_M` が含まれる `.gguf` を選びます。モデルの利用条件も各配布元で確認してください。
   - Qwen3 8B派生：[Huihui-Qwen3-8B-abliterated-v2-GGUF](https://huggingface.co/mradermacher/Huihui-Qwen3-8B-abliterated-v2-GGUF)
   - NemoMix 12B：[NemoMix-Unleashed-12B-GGUF](https://huggingface.co/bartowski/NemoMix-Unleashed-12B-GGUF)
4. Companionの設定で接続方式「llama-server（Companionで起動・DRY対応）」を選びます。
5. 「GGUFを選ぶ」でファイルを指定します。実行ファイル欄が空ならBATの導入先を使います。手動導入した場合は公式配布の `llama-server.exe` を選んでください。DLLも同じフォルダーに残します。
6. 「設定を保存」→「llama-serverを起動」。読み込みが終わり「起動済み：会話できます」と表示されたら会話できます。モデル一覧の取得は不要です。

サーバー本体の導入とモデルのダウンロードは別です。このBATはGGUFをダウンロードしません。Ollamaで導入済みのモデル名も、このGGUF選択欄には入力できません。分割GGUFは全パートを同じフォルダーに置き、先頭ファイルを選んでください。

## 反復抑制とモデル設定

DRYはQwen系・NemoMix系のどちらにも適用されます。初期値は強さ0.8、増加率1.75、許容長2トークン、参照範囲はコンテキスト全体です。強さ0でDRYを無効にできます。通常のRepeat Penaltyは1.0にして二重に抑制しない構成です。強さは少しずつ調整してください。反復を完全に防ぐ保証はありません。

DRYは会話・ふれあい・告白など、llama-serverへ送る生成要求に適用します。設定を保存すると次の生成から反映されます。他の接続方式にはDRYパラメーターを送りません。既存履歴は書き換えません。すでに反復していた会話では、履歴を消して比較してください。

会話テンプレートは通常「自動」でGGUF内の設定を使います。NemoMixで会話が成立しない場合は「Mistral v1」を選び、保存して起動し直してください。モデルに合わないテンプレートを指定すると応答が崩れる場合があります。Qwen3向けに `enable_thinking: false` を生成要求へ指定します（テンプレートの対応が必要）。

## 起動とメモリ

初期値はコンテキスト4096、GPUレイヤー99、同時生成1件です。GPUレイヤーの指定がモデルの層数を超える場合は、載せられる全層を対象にします。VRAMが厳しい場合はコンテキスト長やGPUレイヤー数を減らしてください。CPUへの移動で遅くなる場合があります。TTSやVRM描画もVRAMを使います。

Ollama等がモデルを読み込んでいる場合、そのモデルをアンロードするか、不要なサーバーを終了してから利用してください。Companionは外部で起動したサーバーを停止しません。

起動は手動です。Companion再起動後も設定したファイルとDRYの値は保持しますが、サーバーは起動ボタンから読み込み直してください。「停止」は読み込み中にも使えます。Companionをトレイから完全終了すると、Companionから起動したサーバーも停止します。ウィンドウを閉じてトレイにしまうだけでは停止しません。

モデル・実行ファイル・ポート・コンテキスト長・GPUレイヤー数・会話テンプレート・接続方式を変更して保存すると、起動中のサーバーは停止します。必要に応じて起動し直してください。

## 起動できないとき

- 「状態を確認」→「サーバーログ」を開いてください。直近のログが表示されます。進捗バーは読み込み中を示すもので、読み込み率ではありません。
- ポート18080が使用中なら、詳細設定で別のポートを選び、保存してください。
- DLL不足やGPU初期化失敗は、公式ZIPの全内容とドライバーを確認してください。CPU版も試せます。
- BATは既存の導入先を上書きしません。版を入れ替える場合はCompanionを完全終了し、`llm-tools/llama-server` を別の場所へ移してからBATを再実行してください。
- モデル読み込みの待ち時間は最大約3分です。メモリ不足や破損したGGUFも確認してください。

## 配布元

導入BATは公式llama.cpp **b11829** のWindows x64 Vulkan/CPU ZIPを取得し、同版の公式配布で公表されたSHA-256と照合してから展開します。将来の別ビルドへ自動更新はしません。導入先は `llm-tools/llama-server` です。ランタイムとモデルはCompanionの配布ZIPへ含めません。更新ZIPを適用してもこのフォルダーを上書きしません。

サーバーは127.0.0.1だけにバインドし、起動ごとの認証情報をCompanion内部で管理します。ユーザーによるAPIキーの入力は不要です。

- [llama.cpp公式リリース](https://github.com/ggml-org/llama.cpp/releases/tag/b11829)
- [llama-server公式説明](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)
- [llama.cppのMITライセンス](llm-tools/LICENSE-llama.cpp.txt)
