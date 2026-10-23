"""Stage and verify portable Windows, update and source ZIPs (stdlib only)."""
import argparse
import hashlib
import json
import shutil
import tempfile
import zipfile
from pathlib import Path
from release_notes import release_notes

ROOT = Path(__file__).resolve().parents[1]
APP = 'VRM-Desktop-Companion'
DOCS = ['package.json', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.txt', 'UPDATE.md', 'VALIDATION.md', 'TTS_SETUP.md', 'OLLAMA_SETUP.md', 'LLAMA_SERVER_SETUP.md', 'USAGE.md']

def application(target):
    target.mkdir(parents=True, exist_ok=True)
    for name in ['src', 'dist']:
        shutil.copytree(ROOT / name, target / name, dirs_exist_ok=True)
    for name in DOCS:
        shutil.copy2(ROOT / name, target / name)

def tts_helpers(target):
    target.mkdir(parents=True, exist_ok=True)
    for name in ['install_irodori_tts.bat', 'start_irodori_tts.bat', 'install_ollama.bat', 'install_llama_server.bat']:
        # cmd.exe wrappers use CRLF in every release archive.
        content = (ROOT / name).read_text(encoding='utf-8').replace('\r\n', '\n')
        (target / name).write_bytes(content.replace('\n', '\r\n').encode('utf-8'))
    for folder in ['tts-tools', 'llm-tools']:
        shutil.copytree(ROOT / folder, target / folder, dirs_exist_ok=True, ignore=shutil.ignore_patterns('llama-server', '.llama-setup-*'))

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
        shutil.copytree(runtime, portable, ignore=shutil.ignore_patterns('.*', 'backup-before-*', 'llama-server'))
        old = portable / 'resources/app'
        if old.exists():
            shutil.rmtree(old)
        asar = portable / 'resources/app.asar'
        if asar.exists():
            asar.unlink()
        application(old)
        for name in ['README.md', 'UPDATE.md', 'VALIDATION.md', 'THIRD_PARTY_NOTICES.txt', 'TTS_SETUP.md', 'OLLAMA_SETUP.md', 'LLAMA_SERVER_SETUP.md', 'USAGE.md']:
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
    (out / 'notes.md').write_text(release_notes(version), encoding='utf-8')
    for p in assets:
        print(f'{p.name}: {p.stat().st_size} bytes')

if __name__ == '__main__':
    main()



