param([switch]$DefinitionsOnly)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Models = @(
    @{ Name = 'huihui_ai/qwen3-abliterated:8b-v2-q4_K_M'; HF = 'hf.co/mradermacher/Huihui-Qwen3-8B-abliterated-v2-GGUF:Q4_K_M'; Size = '約5GB' },
    @{ Name = 'HammerAI/nemomix-unleashed:12b-q4_K_M'; HF = 'hf.co/bartowski/NemoMix-Unleashed-12B-GGUF:Q4_K_M'; Size = '約7.5GB' }
)
function Find-Ollama {
    $cmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    return $null
}
function Get-VramMiB {
    # Dedicated memory per GPU, never the sum of multiple cards or free memory.
    $smi = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
    if ($smi) {
        $values = @(& $smi.Source --query-gpu=memory.total --format=csv,noheader,nounits 2>$null)
        if ($LASTEXITCODE -eq 0) {
            $numbers = @($values | Where-Object { "$_".Trim() -match '^\d+$' } | ForEach-Object { [double]"$_".Trim() })
            if ($numbers.Count) { return ($numbers | Measure-Object -Maximum).Maximum }
        }
    }
    # WMI AdapterRAM truncates above 4GB. Use the 64-bit registry value instead.
    $sizes = @(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Video\*\0*' -ErrorAction SilentlyContinue |
        ForEach-Object { if ($_.'HardwareInformation.qwMemorySize' -is [long] -or $_.'HardwareInformation.qwMemorySize' -is [ulong]) { [double]$_.'HardwareInformation.qwMemorySize' / 1MB } })
    if ($sizes.Count) { return ($sizes | Measure-Object -Maximum).Maximum }
    return $null
}
function Get-DefaultModelIndex($MiB) {
    # Driver reservations can make a nominal 16GB board report slightly less.
    if ($null -ne $MiB -and [math]::Round($MiB / 1024) -ge 16) { return 1 }
    return 0
}
function Write-DownloadBar([long]$Received, [long]$Total, [switch]$Complete) {
    # ASCII only on the changing line; CJK text remains on fixed lines.
    if ($Complete) { $percent = 100 }
    elseif ($Total -gt 0) { $percent = [int][math]::Floor([math]::Min(99, 100.0 * $Received / $Total)) }
    else { Write-Host "`rDownloading [          ...           ]      " -NoNewline; return }
    $filled = [int][math]::Floor($percent * 24 / 100)
    $bar = ('#' * $filled) + ('-' * (24 - $filled))
    Write-Host ("`rDownloading [{0}] {1,3}% " -f $bar, $percent) -NoNewline
}
function Copy-InstallerStream($Source, $Destination, [long]$Total = -1) {
    $buffer = New-Object byte[] 65536
    $received = 0L
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $cancel = New-Object Threading.CancellationTokenSource
    try {
        Write-DownloadBar 0 $Total
        while ($true) {
            # Reset the idle timeout for each read, so slow but active transfers continue.
            $cancel.CancelAfter(120000)
            $count = $Source.ReadAsync($buffer, 0, $buffer.Length, $cancel.Token).GetAwaiter().GetResult()
            if ($count -eq 0) { break }
            $Destination.Write($buffer, 0, $count)
            $received += $count
            if ($clock.ElapsedMilliseconds -ge 1000) {
                Write-DownloadBar $received $Total
                $clock.Restart()
            }
        }
        if ($Total -ge 0 -and $received -ne $Total) { throw 'ダウンロードが途中で終了しました。もう一度実行してください。' }
        Write-DownloadBar $received $Total -Complete
    } finally { $cancel.Dispose(); Write-Host '' }
}
function Receive-OllamaInstaller([string]$Url, [string]$Destination) {
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object Net.Http.HttpClient
    $response = $null; $source = $null; $target = $null
    try {
        $client.Timeout = [TimeSpan]::FromSeconds(120)
        $response = $client.GetAsync($Url, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        $response.EnsureSuccessStatusCode() | Out-Null
        $length = $response.Content.Headers.ContentLength
        if ($null -eq $length) { $length = -1 }
        $source = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $target = [IO.File]::Create($Destination)
        Copy-InstallerStream $source $target $length
    } finally {
        if ($target) { $target.Dispose() }
        if ($source) { $source.Dispose() }
        if ($response) { $response.Dispose() }
        $client.Dispose()
    }
}
function Ensure-Ollama {
    $exe = Find-Ollama
    if ($exe) { return $exe }
    $setup = Join-Path ([IO.Path]::GetTempPath()) ('Companion-Ollama-' + [guid]::NewGuid().ToString() + '.exe')
    try {
        Write-Host 'Ollama公式インストーラーを取得します。開いた画面でインストールしてください。'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Receive-OllamaInstaller 'https://ollama.com/download/OllamaSetup.exe' $setup
        Write-Host 'Ollama本体の取得が完了しました。インストーラーを確認しています。'
        if ((Get-AuthenticodeSignature -LiteralPath $setup).Status -ne 'Valid') { throw 'インストーラーの電子署名を確認できません。https://ollama.com/download/windows から手動で導入してください。' }
        $process = Start-Process -FilePath $setup -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw 'Ollamaのインストールが完了しませんでした。再実行してください。' }
    } finally { Remove-Item -LiteralPath $setup -Force -ErrorAction SilentlyContinue }
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + $env:Path
    $exe = Find-Ollama
    if (-not $exe) { throw 'Ollamaを確認できません。インストール先を確認し、Windowsにサインインし直して再実行してください。' }
    return $exe
}
function Test-OllamaReady {
    try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2; return $true } catch { return $false }
}
function Wait-Ollama([string]$Exe) {
    if (Test-OllamaReady) { return }
    Start-Process -FilePath $Exe -ArgumentList 'serve' -WindowStyle Minimized | Out-Null
    for ($i = 0; $i -lt 30; $i++) {
        if (Test-OllamaReady) { return }
        Start-Sleep -Seconds 1
    }
    throw 'Ollamaに接続できません。Ollamaを起動し、ポート11434を確認して再実行してください。'
}
function Install-OllamaModel([string]$Exe, $Model) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Exe show $Model.Name *> $null; $showCode = $LASTEXITCODE }
    finally { $ErrorActionPreference = $oldPreference }
    if ($showCode -eq 0) { Write-Host '導入済みのモデルを再利用します。'; return }
    # Capture a copy while still showing download progress in the console.
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Exe pull $Model.Name 2>&1 | Tee-Object -Variable pullOutput | ForEach-Object { Write-Host "$_" }; $code = $LASTEXITCODE; $output = @($pullOutput) }
    finally { $ErrorActionPreference = $oldPreference }
    if ($code -eq 0) { return }
    if (($output -join "`n") -notmatch '(?i)file does not exist|not found|\b404\b') {
        throw 'モデルの取得に失敗しました。通信・空き容量を確認し再実行してください。途中までのダウンロードはOllamaが再利用します。'
    }
    Write-Host 'Ollama側にモデルがないため、Hugging Faceの同モデル・Q4_K_Mを取得します。'
    & $Exe pull $Model.HF
    if ($LASTEXITCODE -ne 0) { throw 'Hugging Faceからの取得に失敗しました。通信・空き容量を確認して再実行してください。' }
    & $Exe cp $Model.HF $Model.Name
    if ($LASTEXITCODE -ne 0) { throw '取得したモデルの登録に失敗しました。' }
    & $Exe show $Model.Name *> $null
    if ($LASTEXITCODE -ne 0) { throw 'モデルを確認できません。再実行してください。' }
}
function Start-OllamaSetup {
    # Keep setup local, even when the user's shell targets a remote Ollama server.
    $env:OLLAMA_HOST = '127.0.0.1:11434'
    $memory = Get-VramMiB
    $index = Get-DefaultModelIndex $memory
    if ($null -eq $memory) { Write-Host 'VRAMを判定できませんでした。モデルを選んでください（初期選択は8B）。' }
    else { Write-Host ('検出した最大VRAM：{0:N1}GB。16GB以上は12B、それ未満は8Bを初期選択します。' -f ($memory / 1024)) }
    Write-Host '1: Qwen3 8B Q4_K_M（約5GB） / 2: NemoMix 12B Q4_K_M（約7.5GB）'
    Write-Host 'TTSやVRMも同時にGPUを使います。余裕が少ない場合は1を選んでください。'
    do { $choice = Read-Host ('番号を選択（Enterで{0}、Qで中止）' -f ($index + 1)) } while ($choice -notin @('', '1', '2', 'q', 'Q'))
    if ($choice -in @('q', 'Q')) { return }
    if ($choice) { $index = [int]$choice - 1 }
    $model = $Models[$index]
    Write-Host ('使用モデル：' + $model.Name + ' / ダウンロード：' + $model.Size)
    $exe = Ensure-Ollama
    Wait-Ollama $exe
    Install-OllamaModel $exe $model
    Write-Host '準備完了！Companionの設定で接続方式「Ollama」を選び、モデル一覧を取得してください。' -ForegroundColor Green
    Write-Host '接続先：http://127.0.0.1:11434'
    Write-Host ('モデル：' + $model.Name)
    Write-Host '既存のCompanionの設定や会話履歴は変更しません。'
}
if (-not $DefinitionsOnly) {
    $transcript = $false
    try {
        $logs = Join-Path $ProjectRoot 'ollama-logs'
        New-Item -ItemType Directory -Path $logs -Force | Out-Null
        Start-Transcript -Path (Join-Path $logs ((Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')) | Out-Null
        $transcript = $true
        Start-OllamaSetup
    } catch { Write-Host ('エラー：' + $_.Exception.Message) -ForegroundColor Red; exit 1 }
    finally { if ($transcript) { Stop-Transcript | Out-Null } }
}
