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
DOCS = ['package.json', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.txt', 'UPDATE.md', 'VALIDATION.md']

def application(target):
    target.mkdir(parents=True, exist_ok=True)
    for name in ['src', 'dist']:
        shutil.copytree(ROOT / name, target / name, dirs_exist_ok=True)
    for name in DOCS:
        shutil.copy2(ROOT / name, target / name)

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
        for name in ['README.md', 'UPDATE.md', 'VALIDATION.md', 'THIRD_PARTY_NOTICES.txt']:
            shutil.copy2(ROOT / name, portable / name)
        archive(portable, out / f'{APP}-v{version}-Windows-x64.zip', APP)
        patch = stage / 'update'
        application(patch / 'update-files/resources/app')
        (patch / 'apply_update.bat').write_bytes(installer(version).replace('\n', '\r\n').encode('utf-8'))
        (patch / 'README-update.txt').write_text('旧版をトレイから終了→ZIPをすべて展開→中身をexeのフォルダーへコピー→apply_update.batを実行→従来のexeで起動。設定・履歴は引き継ぎます。\n', encoding='utf-8')
        archive(patch, out / f'{APP}-v{version}-Update.zip')
        source = stage / 'source'
        for name in ['src', 'dist', 'test', 'scripts', '.github']:
            if (ROOT / name).exists():
                shutil.copytree(ROOT / name, source / name, ignore=shutil.ignore_patterns('__pycache__'))
        for name in DOCS + ['package-lock.json', '.gitignore', 'start.bat', 'build_windows.bat']:
            shutil.copy2(ROOT / name, source / name)
        archive(source, out / f'{APP}-v{version}-Source.zip', APP)
    assets = sorted(out.glob(f'{APP}-v{version}-*.zip'))
    (out / 'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in assets), encoding='utf-8')
    (out / 'notes.md').write_text(f'''## Windows版 {version}

- **Windows-x64.zip**：実行環境込みの完全版。展開してexeで起動します。
- **Update.zip**：0.1.0〜0.1.5からの更新。旧版を完全終了し、中身をexeの場所へ置いてapply_update.batを実行します。
- **Source.zip**：ビルド済み描画コードを含むソース一式。
- SHA256SUMS.txt：ZIPの照合用ハッシュ。

通常はキャラクターのみを表示します。反応部位以外の左クリックで「どうしたの？」と反応し会話入力窓を開き、右クリック・トレイクリックで設定メニューを表示します。反応部位以外をドラッグ、またはShift＋ドラッグで移動できます。発言は伺か風の吹き出しに表示します。名前欄をドラッグして自由に動かせ、位置をキャラクターから独立して保存します。設定でフォント名を選択・自由入力、文字サイズを8〜72pxに変更できます。頭を撫でると照れ、頭・顔のタップで驚き、胸・臀部への操作で恥ずかしがります。胸・臀部への操作が10秒以内に連続3回以上で怒ります。表情はVRMに依存し、非対応時もしぐさと吹き出しで反応します。最大10.0倍まで拡大でき、画面端への押し戻しを行わず画面外へ移動できます。会話入力窓の位置はキャラクターと独立して保存・復元します。文字に合わせた疑似口パクと、やわらかい待機モーションを追加しました。設定の「動きを試す」で確認できます。口パクにはVRMの母音表情が必要です。音声合成・音声同期は未実装です。

設定・会話履歴は引き継ぎます。VRM・LLMは同梱しません。Ollama／LM Studioを別途用意してください。
Windows版のビルドと自動テストを実施しています。実デスクトップでの透過表示、クリック透過、実LLMとの通し動作は未確認です。
''', encoding='utf-8')
    for p in assets:
        print(f'{p.name}: {p.stat().st_size} bytes')

if __name__ == '__main__':
    main()
