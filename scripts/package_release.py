"""Stage and verify portable Windows, update and source ZIPs (stdlib only)."""
import argparse
import hashlib
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = 'VRM-Desktop-Companion'
DOCS = ['package.json', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.txt', 'UPDATE.md', 'VALIDATION.md', 'TTS_SETUP.md']

def application(target):
    target.mkdir(parents=True, exist_ok=True)
    for name in ['src', 'dist']:
        shutil.copytree(ROOT / name, target / name, dirs_exist_ok=True)
    for name in DOCS:
        shutil.copy2(ROOT / name, target / name)

def tts_helpers(target):
    target.mkdir(parents=True, exist_ok=True)
    for name in ['install_irodori_tts.bat', 'start_irodori_tts.bat']:
        # cmd.exe wrappers use CRLF in every release archive.
        content = (ROOT / name).read_text(encoding='utf-8').replace('\r\n', '\n')
        (target / name).write_bytes(content.replace('\n', '\r\n').encode('utf-8'))
    shutil.copytree(ROOT / 'tts-tools', target / 'tts-tools', dirs_exist_ok=True)

def archive(folder, dest, prefix=''):
    with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for file in sorted(folder.rglob('*')):
            if file.is_file():
                z.write(file, str(Path(prefix) / file.relative_to(folder)))
    with zipfile.ZipFile(dest) as z:
        bad = z.testzip()
        if bad:
            raise RuntimeError(f'Corrupt ZIP entry: {bad}')

def installer(version):
    return r'''@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist "VRM-Desktop-Companion.exe" (
 echo このファイルとupdate-filesを、exeのあるフォルダーへ置いてください。
 pause
 exit /b 1
)
tasklist /FI "IMAGENAME eq VRM-Desktop-Companion.exe" /FO CSV /NH | findstr /I /C:"VRM-Desktop-Companion.exe" >nul
if not errorlevel 1 (
 echo アプリをトレイから完全に終了してください。
 pause
 exit /b 1
)
if not exist "update-files\resources\app\src\layout.cjs" goto failed
if exist "backup-before-vVERSION" (
 echo バックアップが既にあります。更新済みか確認してください。
 pause
 exit /b 1
)
mkdir "backup-before-vVERSION"
if errorlevel 1 goto failed
if exist "resources\app" (
 xcopy "resources\app" "backup-before-vVERSION\app\" /E /I /H /Y >nul
 if errorlevel 1 goto failed
)
if exist "resources\app.asar" (
 move "resources\app.asar" "backup-before-vVERSION\app.asar" >nul
 if errorlevel 1 goto failed
)
xcopy "update-files\resources\app" "resources\app\" /E /I /H /Y >nul
if errorlevel 1 goto failed
echo VERSIONへ更新しました。従来のexeから起動してください。
pause
exit /b 0
:failed
echo 更新に失敗しました。ZIPをすべて展開したか確認してください。
echo バックアップがある場合は元の場所へ戻してください。
pause
exit /b 1
'''.replace('VERSION', version)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts')
    args = parser.parse_args()
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    if not version or any(c not in '0123456789.' for c in version):
        raise ValueError('Expected a numeric release version')
    runtime = args.runtime.resolve()
    if not (runtime / f'{APP}.exe').is_file():
        raise FileNotFoundError('Windows executable is missing')
    if not (ROOT / 'dist/renderer.js').is_file():
        raise FileNotFoundError('Run npm run build before packaging')
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='companion-release-', dir=out) as tmp:
        stage = Path(tmp)
        portable = stage / 'portable'
        # Exclude leftover file-transfer fragments from older packages.
        shutil.copytree(runtime, portable, ignore=shutil.ignore_patterns('.*', 'backup-before-*'))
        old = portable / 'resources/app'
        if old.exists():
            shutil.rmtree(old)
        asar = portable / 'resources/app.asar'
        if asar.exists():
            asar.unlink()
        application(old)
        for name in ['README.md', 'UPDATE.md', 'VALIDATION.md', 'THIRD_PARTY_NOTICES.txt', 'TTS_SETUP.md']:
            shutil.copy2(ROOT / name, portable / name)
        tts_helpers(portable)
        archive(portable, out / f'{APP}-v{version}-Windows-x64.zip', APP)
        patch = stage / 'update'
        application(patch / 'update-files/resources/app')
        tts_helpers(patch)
        (patch / 'apply_update.bat').write_bytes(installer(version).replace('\n', '\r\n').encode('utf-8'))
        (patch / 'README-update.txt').write_text('旧版をトレイから終了→ZIPをすべて展開→中身をexeのフォルダーへコピー→apply_update.batを実行→従来のexeで起動。設定・履歴は引き継ぎます。\n', encoding='utf-8')
        archive(patch, out / f'{APP}-v{version}-Update.zip')
        source = stage / 'source'
        for name in ['src', 'dist', 'test', 'scripts', '.github']:
            if (ROOT / name).exists():
                shutil.copytree(ROOT / name, source / name, ignore=shutil.ignore_patterns('__pycache__'))
        for name in DOCS + ['package-lock.json', '.gitignore', 'start.bat', 'build_windows.bat']:
            shutil.copy2(ROOT / name, source / name)
        tts_helpers(source)
        archive(source, out / f'{APP}-v{version}-Source.zip', APP)
    assets = sorted(out.glob(f'{APP}-v{version}-*.zip'))
    (out / 'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in assets), encoding='utf-8')
    (out / 'notes.md').write_text(f'''## Windows版 {version}

## TTSサーバー用batを同梱（0.1.25）

初回は **install_irodori_tts.bat**、普段は **start_irodori_tts.bat** をダブルクリックしてください。同じ場所の `tts-tools` フォルダーも必要です。インストール用はGit・uvの準備、公式リポジトリのクローン、Python 3.10とCUDA版依存関係の導入を行います。

起動用は **v4-Large-Quantized/int8-weight-only・bf16** を指定し、`127.0.0.1:8088` で待ち受けます。初回はモデルとコーデックの取得があるため、Application startup complete を待ってからマスコットで「声を試す」を実行してください。

Windows版・更新版・ソース版すべてに同梱します。更新ZIPは従来どおり中身をexeのある場所へコピーしてください。既存のサーバー設定を上書きせず、日時付きログを `tts-logs` に保存します。詳細はTTS_SETUP.mdをご覧ください。実際のWinGet導入・GPU音声生成はこの環境では未検証です。

## 前回のウィンドウ位置を復元（0.1.24）

キャラクター・設定画面・会話入力・吹き出しの位置を個別に記録して、次回起動時に復元します。移動時に加え、アプリ終了直前にも最新の位置を保存します。設定画面が最大化・最小化中の場合は通常状態の位置を記録します。

同じモニター構成では、キャラクターの画面外配置も維持します。モニター構成が変わって完全に画面外になった場合は初期位置へ復旧します。設定・入力・吹き出しは操作できる位置に復元します。起動直後はキャラクターだけを表示します。

更新後、一度位置を調整してトレイからアプリを終了すると、次回から復元されます。旧版の会話入力・吹き出しの保存位置も引き継ぎます。

## モデル一覧の取得表示を改善（0.1.23）

「モデル取得」を **モデル一覧を取得** に改名しました。モデル本体のダウンロードではありません。ボタン直下に取得中・完了・エラーを表示し、取得中はボタンの表示も変えます。取得後はその場に選択可能な一覧を開くので、選んで「設定を保存」を押してください。モデルIDの直接入力も使えます。

重複クリックと接続方式変更後の古い結果の反映を防ぎます。APIキー未登録などのエラーもボタンの近くで確認できます。設定画面の最下部には実行中のバージョンを表示します。実アカウントによる有料API接続は未検証です。

## 拡大率の数値入力（0.1.22）

設定の「大きさ」を、角度と同じ数値入力欄に変更しました。現在の倍率を確認し、0.5〜10倍を0.001刻みで直接入力できます。入力後は「設定を保存」で反映します。Ctrl＋ホイールで変更した倍率も数値欄へ反映します。

## Ctrl＋マウスホイールで拡大縮小（0.1.21）

キャラクター上で **Ctrlを押しながらホイールを上へ回すと拡大、下へ回すと縮小** します。0.5〜10倍の範囲で設定へ反映・自動保存します。通常のホイールでは倍率を変更しません。回転・移動などのドラッグ中やクリック無効時は拡大縮小しません。

ウィンドウの下端と横方向の中心を保ち、吹き出し・入力ウィンドウの位置は変えません。連続操作による丸め誤差の位置ずれも抑えています。

## OpenRouter接続（0.1.20）

「設定 → 会話用LLM」の接続方式に **OpenRouter（クラウド）** を追加しました。

1. OpenRouterを選ぶとURLを自動設定します。
2. OpenRouterで発行したAPIキーを登録します。
3. 「モデル取得」または `anthropic/claude-haiku-5.5` などの提供元/モデル名のIDを直接入力します。
4. 設定を保存して会話します。通常会話・タッチ反応・好感度の文脈に対応します。

推論設定をOpenRouterの形式へ変換し、トークン上限には `max_tokens` を使います。モデルの提供状況はOpenRouter側で確認してください。APIキーは他の接続方式と分けて暗号化保存します。旧「OpenAI互換API」で登録したOpenRouterのキーは登録し直してください。残高不足・提供先エラーを表示し、課金リクエストをアプリから自動再試行しません。実アカウントでの有料API接続は未検証です。

## 好感度・恋愛要素（0.1.19）

「設定 → ふたりの関係」で関係を確認・切り替えられます。会話や頭を撫でることで徐々に親しくなり、照れ・機嫌・好意が会話、しぐさ、TTSの話し方に反映されます。好感度と一時的な機嫌は別で、放置による減少はありません。成功した会話のみ加点し、時間制限と1日12の上限を設けています。

「気持ちを伝える（告白）」で告白できます。好感度60以上・恋愛への意識40以上・怒っていないことが必要で、仲良くなっただけでは恋人になりません。恋愛要素はキャラクターごとに無効にできます。

別衣装のVRMは元の関係プロフィールを選ぶと引き継げます。関係と会話履歴をキャラクターごとに保存し、既存の履歴も移行します。性格・名前・声の設定は共通です。詳しい加点ルールはREADMEをご覧ください。

OpenAIを新規選択するとデフォルトモデルは `gpt-6-luna` です。登録済みのモデル指定は維持します。

## クラウドLLM（0.1.18）

「設定 → 会話用LLM」の接続方式で、Ollama／LM Studioに加えて **OpenAI API** と **OpenAI互換API** を選べます。会話・タッチ反応はクラウドへ送信し、Irodori-TTSとSpeaker Embeddingは従来どおりローカルで利用できます。

1. 接続方式を選びます。OpenAIは `https://api.openai.com/v1` に固定、互換APIは利用先のHTTPSベースURLを指定します（例：末尾が `/v1` や `/api/v1` のURL）。`/chat/completions` 自体は付けません。
2. APIキーを入力して「APIキーを登録」。入力欄は登録操作後に空になります。保存済みキーは再表示しません。キーは接続方式・ベースURLごとに保存され、他の接続先へ使い回しません。
3. 「モデル取得」で一覧から会話用モデルIDを選ぶか、直接入力します。モデル一覧APIがない互換サービスでも直接入力できます。
4. 「設定を保存」して会話します。APIキーの登録と、接続方式・モデルなどの設定保存は別操作です。

出力トークン上限は初期1024、128〜8192に変更できます。OpenAIには `max_completion_tokens`、互換APIには初期状態で `max_tokens` を送ります。互換先が必要とする場合は上限パラメーターを切り替えられます。推論量は初期状態では送信せず、Temperatureもクラウドでは初期状態で送信しません。使用するモデルが対応する場合に指定してください。推論に多くのトークンを使うモデルで返答が空になる場合は、出力上限を増やすか、対応する推論量を調整します。タッチ反応は最大1024トークン・15秒の範囲で生成し、失敗時は固定のセリフに戻ります。

互換APIはChat Completions形式（`/chat/completions`）に対応するサービス用です。APIキーによるBearer認証を使用します。OpenAIへのリクエストでは `store:false` を指定します。APIへの送信内容は名前・性格・指定した範囲の履歴・今回の発言や触った部位、関係の段階・機嫌・告白結果などのテキストです。VRMファイル、音声、Speaker EmbeddingはLLMへ送りません。API利用料金とデータの取り扱いは接続先のサービスに従います。

APIキーはメインプロセスで管理し、通常の設定・履歴ファイルには入れません。別ファイル `api-keys.json` にOS機能による暗号化データを保存します。WindowsではElectron safeStorageのDPAPIを使用します。暗号化が使えない環境では平文保存へ切り替えず、登録エラーにします。別PCや別のWindowsユーザーへ移行した場合はキーを登録し直してください。APIのエラー表示ではキー文字列を伏せ、ネットワークのリダイレクトにも追従しません。

本環境では実際の課金APIとの疎通は行っていません。通信を模擬したモデル取得・会話・タッチ反応、キーの暗号化委譲・接続先ごとの分離・画面に戻さないこと・エラー時の伏字化を検証しています。


## Irodori-TTS読み上げ（0.1.17）

設定の「Irodori-TTS 読み上げ」で有効化し、同じPCの公式TTSサーバーURLと、作成済みの `.speaker.safetensors` を選べます。設定を保存して「声を試す」で確認してください。初期URLは `http://127.0.0.1:8088` です。Irodori-TTSサーバーの導入・v4 Largeの指定・既存モデルの利用手順は **TTS_SETUP.md** にあります。サーバーにはEmbeddingを学習したものと同じ基盤モデルを指定します。

挨拶、LLMの返答、タッチ反応を読み上げ、音声を実際に再生する時刻付近の波形から口を開閉します。無音では口を閉じ、母音の形はテキストから補助します。厳密な音素アライメントではありません。考え中やシステムの読み込みエラーは読み上げません。音声待ちでは口を閉じ、吹き出しは生成待ち・再生中も保持します。新しい発言や停止操作、非表示などで古い音声の生成待ち・再生を取り消します。設定やメニューに「読み上げを停止」を追加しました。

話し方、話す速さ、音量、生成待ち時間を設定・保存できます。生成に失敗してもテキストは残し、設定画面にエラーを表示します。モデル、Embedding、TTSサーバーは同梱しません。読み上げは初期状態では無効です。


## 基本の待機ポーズ・モーション（0.1.16）

「設定 → VRMAモーション → 基本の待機ポーズ・モーション」で、標準の待機動作または読み込み済みのVRMAを選べます。「設定を保存」で反映し、再起動後も引き継ぎます。

- 「モーションをループ」：選択したVRMAを繰り返します。速度を0.1〜3倍に変更できます。
- 「静止ポーズ」：モーション全体の0〜100%から止める位置を指定します。例えば50%なら中間時点の姿勢です。速度設定は静止ポーズには影響しません。
- 「標準の待機動作」：従来の姿勢・やわらかい待機モーションに戻します。

挨拶・ランダム動作を優先し、その終了後は選択した待機ポーズ・モーションへブレンドして戻ります。待機用と挨拶用に同じVRMAを選んでも別々に再生します。会話生成・口パク中も待機動作は継続します。手・裾・回転などの操作やタッチ反応、非表示時は待機VRMAを休止し、操作後や再表示時に復帰します。待機用ファイルが見つからない場合は標準の待機動作を使います。挨拶・ランダム再生の設定はそのまま併用できます。

動きのつながりは元のVRMAに依存するため、ループ用の動作を選ぶと自然になります。モーションデータは同梱しません。


## VRMAモーション（0.1.14）

1. VRMA_MotionPack.zipをすべて展開します。
2. 設定の「VRMAモーション」→「モーションフォルダーを選ぶ」で、7個の.vrmaが入った `vrma` フォルダーを選びます。直下に `vrma` がある親フォルダーも選べます。
3. 挨拶には初期状態で `VRMA_02.vrma` を選びます。別の挨拶を使う場合は一覧から変更し、設定を保存してください。
4. 「待機中にランダム再生」を有効にして再生間隔を設定します。初期値60秒、10〜3600秒に変更できます。

VRMとモーションの読み込みが完了すると挨拶します。通常の左クリックで会話入力を開いたときにも挨拶し、再生途中なら最初から再生します。頭のタップなど既存のタッチ反応は優先します。7種類をランダムな順番で一巡し、次の一巡では順番を変えます。ランダム再生は前のモーションの終了から指定秒数待ちます。ランダム再生を無効にしても起動・会話クリックの挨拶は有効です。

会話生成中・発言中の新しいランダム再生、非表示中、手・裾・位置・回転などの操作中は休止します。起動・クリックの挨拶は発言と並行して再生できます。操作が終わると改めて間隔を数え、休止中の動作をまとめて実行しません。手足の動作には開始・終了のブレンドを入れ、終了後は待機姿勢へ戻ります。横方向の移動はその場に固定し、屈伸などの上下動と回転は反映します。フォルダー、挨拶、間隔、ランダム再生の有効状態は再起動後も引き継ぎます。

モーションは同梱しません。手元のファイルを読み込みます。読み込み失敗したファイルは通知して除外し、残りで動作します。選択フォルダー直下の最大64ファイル、各16MBまで対応します。外部ファイル参照を含むVRMAには対応しません。VRMの骨・体格によって見た目が異なり、衣服との貫通やモーションの大きな動きによる表示範囲外へのはみ出しは起こりえます。


Ctrl＋ドラッグで上下に動かすとX軸、左右に動かすとY軸で回転します。Ctrl＋Shift＋左右ドラッグでZ軸を回転します。Shiftのみのドラッグは位置移動です。設定の「向き」でX・Y・Z軸をそれぞれ−180〜180°、0.1°単位で指定できます。離したときに角度を保存し、再起動後も復元します。キャンセル時は操作前の向きに戻ります。

回転中心には重心の目安として腰ボーンの位置を使い、腰がないモデルはモデルの中央を使います。VRMには質量情報がないため、物理的な重心の厳密な計算ではありません。カメラもこの中心を基準にするため、回転で表示位置が大きくずれないようにしています。読み込み時の範囲を保存して回転中の計算負荷を抑えています。手を大きく伸ばしたポーズなどは基準範囲からはみ出す場合があります。旧版の「向き」はY軸へ引き継ぎます。

- **Windows-x64.zip**：実行環境込みの完全版。展開してexeで起動します。
- **Update.zip**：0.1.0〜0.1.24からの更新。旧版を完全終了し、中身をexeの場所へ置いてapply_update.batを実行します。
- **Source.zip**：ビルド済み描画コードを含むソース一式。
- SHA256SUMS.txt：ZIPの照合用ハッシュ。

通常はキャラクターのみを表示します。反応部位以外の左クリックで「どうしたの？」と反応し会話入力窓を開き、右クリック・トレイクリックで設定メニューを表示します。反応部位以外をドラッグ、またはShift＋ドラッグで移動できます。発言は伺か風の吹き出しに表示します。名前欄をドラッグして自由に動かせ、位置をキャラクターから独立して保存します。設定でフォント名を選択・自由入力、文字サイズを8〜72pxに変更できます。頭を撫でると照れ、頭・顔のタップで驚き、胸・臀部への操作で恥ずかしがります。胸・臀部への操作が10秒以内に連続3回以上で怒ります。表情はVRMに依存し、非対応時もしぐさと吹き出しで反応します。最大10.0倍まで拡大でき、画面端への押し戻しを行わず画面外へ移動できます。会話入力窓の位置はキャラクターと独立して保存・復元します。文字に合わせた疑似口パクと、やわらかい待機モーションを追加しました。設定の「動きを試す」で確認できます。口パクにはVRMの母音表情が必要です。Irodori-TTS連携では読み上げと実音声に合わせた口パクを利用できます。

手をクリックしたままドラッグすると肩と肘が追従し、離すと戻る操作を追加しました。左右の手に対応し、設定で無効化できます。腕の長さと届く範囲を保つ簡易IKです。

衣服ドラッグの可動範囲も拡大しました。初期値は身長比18%・1関節80°です。設定の「衣服の操作」で距離2〜50%・角度10〜120°に変更できます。コート・ジャケットの裾にも対応しています。表情モーフの多いモデルで操作時の負荷が高いクリック判定を軽量化しました。裾を引いた反応だけが出て布が動かない不具合も修正済みです。VRM揺れものボーンの行列を操作・復元時に明示的に更新します。スカートのボーンを自動検出する共通の衣服ドラッグに対応します。裾をクリックしたままドラッグすると周辺が動き、離すと戻ります。設定で無効化できます。キャラクター移動はShift＋ドラッグを使えます。簡易的なボーン変形のため対応可否・見た目はモデルに依存します。

LLMモデル選択時は、性格・口調と直近の会話、触った部位・操作・感情・連続回数に合わせて反応のセリフを生成します。表情・しぐさは即時に反応します。連続操作は最新へまとめ、通常会話を優先します。モデル未設定や通信失敗・15秒タイムアウト時は固定セリフに戻ります。

設定・会話履歴は引き継ぎます。VRM・LLMは同梱しません。ローカルLLMを使う場合はOllama／LM Studio、クラウドLLMを使う場合はAPI接続先とキーを用意してください。
Windows版のビルドと自動テストを実施しています。実デスクトップでの透過表示、クリック透過、実LLMとの通し動作は未確認です。
''', encoding='utf-8')
    for p in assets:
        print(f'{p.name}: {p.stat().st_size} bytes')

if __name__ == '__main__':
    main()

