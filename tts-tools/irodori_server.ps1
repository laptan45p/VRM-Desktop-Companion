param(
    [ValidateSet('Install', 'Start')][string]$Mode = 'Start',
    [switch]$DefinitionsOnly
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Server = Join-Path $ProjectRoot 'Irodori-TTS-Server'
$Repository = 'https://github.com/Aratako/Irodori-TTS-Server.git'
$Checkpoint = 'Aratako/Irodori-TTS-v4-Large-Quantized/int8-weight-only'

function Find-SetupTool([string]$Name) {
    $command = Get-Command ($Name + '.exe') -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @()
    if ($Name -eq 'git') {
        $candidates = @("$env:ProgramFiles\Git\cmd\git.exe", "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")
    } elseif ($Name -eq 'uv') {
        $candidates = @("$env:USERPROFILE\.local\bin\uv.exe", "$env:USERPROFILE\.cargo\bin\uv.exe", "$env:LOCALAPPDATA\Microsoft\WinGet\Links\uv.exe")
    }
    foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate } }
    return $null
}
function Invoke-SetupNative([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "コマンドが失敗しました（終了コード $LASTEXITCODE）：$Executable。上のエラーとログを確認してください。" }
}
function Ensure-SetupTool([string]$Name, [string]$Package, [switch]$Install) {
    $tool = Find-SetupTool $Name
    if ($tool) { return $tool }
    if (-not $Install) { throw "$Name が見つかりません。先に install_irodori_tts.bat を実行してください。" }
    $winget = Get-Command 'winget.exe' -ErrorAction SilentlyContinue
    if (-not $winget) { throw 'WinGetが見つかりません。Microsoft Storeで「アプリ インストーラー」を更新するか、Git（https://git-scm.com/install/windows）とuv（https://docs.astral.sh/uv/getting-started/installation/）を導入して、もう一度実行してください。' }
    Write-Host "$Name をWinGetで導入します。表示される確認や管理者権限の画面に従ってください。"
    # Keep native output out of this function's return value.
    Invoke-SetupNative $winget.Source @('install', '--id', $Package, '-e', '--source', 'winget', '--accept-source-agreements') | Out-Host
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
    $tool = Find-SetupTool $Name
    if (-not $tool) { throw "$Name の導入後に実行ファイルを確認できません。Windowsへサインインし直し、batを再実行してください。" }
    return $tool
}
function Get-SetupOrigin([string]$Git) {
    $origin = & $Git -C $Server remote get-url origin
    if ($LASTEXITCODE -ne 0) { throw 'サーバーのGitリポジトリを確認できません。' }
    return ([string]$origin).Trim()
}
function Assert-SetupRepository([string]$Git) {
    if (-not (Test-Path -LiteralPath (Join-Path $Server '.git'))) { throw "専用フォルダーがGitリポジトリではありません：$Server。既存のファイルを別の場所へ移して再実行してください。" }
    $origin = Get-SetupOrigin $Git
    if ($origin.TrimEnd('/') -notin @($Repository, 'https://github.com/Aratako/Irodori-TTS-Server')) { throw '専用フォルダーが別のリポジトリを参照しています。既存のフォルダーには変更を加えません。' }
    if (-not (Test-Path -LiteralPath (Join-Path $Server 'pyproject.toml'))) { throw 'サーバーのpyproject.tomlが見つかりません。クローンが完了しているか確認してください。' }
}
function Set-SetupEnvironment {
    # Changes only affect this PowerShell process and its children.
    $env:VIRTUAL_ENV = $null
    $env:PYTHONHOME = $null
    $env:PYTHONPATH = $null
    $env:UV_PROJECT_ENVIRONMENT = Join-Path $Server '.venv'
    $env:IRODORI_HF_CHECKPOINT = $Checkpoint
    # Whitespace masks any .env local checkpoint; the runtime treats it as unset.
    $env:IRODORI_CHECKPOINT = ' '
    $env:IRODORI_MODEL_PRECISION = 'bf16'
    $env:IRODORI_MODEL_DEVICE = 'cuda'
    $env:IRODORI_MODEL_NAME = 'irodori-tts'
    $env:IRODORI_PRELOAD = 'true'
    $env:IRODORI_MODEL_LOAD_TIMEOUT = '900'
    $env:IRODORI_SYNTHESIS_WAIT_TIMEOUT = '900'
    $env:PYTHONUTF8 = '1'
}
function Test-SetupRuntime([string]$Uv) {
    $code = @'
import sys
import torch
from irodori_openai_tts.config import Settings
s = Settings()
if s.api_key is not None:
    print('ERROR: IRODORI_API_KEY is configured. This companion uses local TTS without API authentication. Comment out IRODORI_API_KEY in .env and clear any inherited IRODORI_API_KEY environment variable.')
    sys.exit(2)
print('PyTorch:', torch.__version__, '/ CUDA:', torch.version.cuda)
if not torch.cuda.is_available():
    print('ERROR: CUDA is unavailable. Check your NVIDIA GPU and driver, then rerun the installer.')
    sys.exit(3)
print('GPU:', torch.cuda.get_device_name(0))
if not torch.cuda.is_bf16_supported():
    print('ERROR: This GPU cannot run the required BF16 configuration.')
    sys.exit(4)
'@
    Invoke-SetupNative $Uv @('run', '--no-sync', 'python', '-c', $code)
}
function Test-SetupPort {
    $client = New-Object System.Net.Sockets.TcpClient
    try { return $client.ConnectAsync('127.0.0.1', 8088).Wait(700) -and $client.Connected }
    catch { return $false }
    finally { $client.Dispose() }
}
function Install-SetupServer {
    if ((Test-Path -LiteralPath $Server) -and -not (Test-Path -LiteralPath (Join-Path $Server '.git'))) { throw "既存のフォルダーを上書きしません：$Server。専用フォルダー名を確認してください。" }
    $git = Ensure-SetupTool 'git' 'Git.Git' -Install
    $uv = Ensure-SetupTool 'uv' 'astral-sh.uv' -Install
    $env:Path = (Split-Path -Parent $git) + ';' + $env:Path
    if (-not (Test-Path -LiteralPath $Server)) {
        Write-Host "公式サーバーを取得します：$Server"
        Invoke-SetupNative $git @('clone', '--', $Repository, $Server)
    } else { Write-Host '既存の公式リポジトリを再利用します。git pullや設定の上書きは行いません。' }
    Assert-SetupRepository $git
    Push-Location -LiteralPath $Server
    try {
        if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
        Set-SetupEnvironment
        Write-Host 'Python 3.10とCUDA版の依存関係を準備します。初回は大きなダウンロードがあります。'
        Invoke-SetupNative $uv @('sync', '--python', '3.10', '--extra', 'cu128', '--frozen')
        Test-SetupRuntime $uv
        Write-Host 'インストール完了。次は start_irodori_tts.bat をダブルクリックしてください。' -ForegroundColor Green
    } finally { Pop-Location }
}
function Start-SetupServer {
    if (-not (Test-Path -LiteralPath (Join-Path $Server '.venv\Scripts\python.exe'))) { throw 'インストールが完了していません。先に install_irodori_tts.bat を実行してください。' }
    $git = Ensure-SetupTool 'git' 'Git.Git'
    $uv = Ensure-SetupTool 'uv' 'astral-sh.uv'
    Assert-SetupRepository $git
    if (Test-SetupPort) { throw '127.0.0.1:8088 は使用中です。既にTTSサーバーが起動していれば、そのまま利用できます。別のアプリが使用中なら終了してから再実行してください。' }
    Push-Location -LiteralPath $Server
    try {
        Set-SetupEnvironment
        Test-SetupRuntime $uv
        Write-Host "使用モデル：$Checkpoint"
        Write-Host '初回はモデルとコーデックを取得します。Application startup complete が出るまでお待ちください。'
        Write-Host 'マスコットのTTS接続先：http://127.0.0.1:8088'
        Write-Host 'この画面は開いたまま使用してください。終了はCtrl+Cです。'
        Write-Host 'Hugging Faceの認証エラー（401/403）が出る場合は、下記手順でログイン後に再実行してください。'
        Write-Host '  cd Irodori-TTS-Server'
        Write-Host '  uv run --no-sync hf auth login'
        Invoke-SetupNative $uv @('run', '--no-sync', 'python', '-m', 'irodori_openai_tts', '--host', '127.0.0.1', '--port', '8088')
    } finally { Pop-Location }
}
if (-not $DefinitionsOnly) {
    $transcript = $false
    try {
        [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
        $logDir = Join-Path $ProjectRoot 'tts-logs'
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        $logFile = Join-Path $logDir ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $Mode.ToLower() + '.log')
        Start-Transcript -Path $logFile -Append | Out-Null
        $transcript = $true
        Write-Host "ログ：$logFile"
        if ($Mode -eq 'Install') { Install-SetupServer } else { Start-SetupServer }
    } catch {
        Write-Host ('エラー：' + $_.Exception.Message) -ForegroundColor Red
        Write-Host 'TTS_SETUP.mdの「batで導入」と、上に表示されたログを確認してください。'
        exit 1
    } finally { if ($transcript) { Stop-Transcript | Out-Null } }
}
