param([switch]$DefinitionsOnly)
$ErrorActionPreference = 'Stop'
$RunLlamaSetup = -not $DefinitionsOnly
# Reuse the tested, throttled download progress bar. This does not run Ollama setup.
. (Join-Path $PSScriptRoot 'ollama_setup.ps1') -DefinitionsOnly
$LlamaBuild = 'b11829'
function Get-LlamaArchive([string]$Backend) {
    $hashes = @{
        vulkan = '839ff55ce9cbee6a099b403b640ca6b694ee5d74b815e39f77fc5d2b20962f0d'
        cpu = 'c534f35ce9c842f3bc224fadaecc82e1b49768f63e8320922f6dbd603f66395e'
    }
    if (-not $hashes.ContainsKey($Backend)) { throw 'Unknown backend.' }
    return @{ Url = "https://github.com/ggml-org/llama.cpp/releases/download/$LlamaBuild/llama-$LlamaBuild-bin-win-$Backend-x64.zip"; Hash = $hashes[$Backend] }
}
function Confirm-LlamaArchive([string]$Archive, [string]$Expected) {
    if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash -ne $Expected) { throw 'ダウンロードの検証に失敗しました。再実行してください。' }
}
function Install-LlamaRuntime([string]$Backend) {
    $destination = Join-Path $PSScriptRoot 'llama-server'
    if (Test-Path -LiteralPath (Join-Path $destination 'llama-server.exe')) {
        Write-Host 'llama-serverは導入済みです。Companionの設定から起動できます。'
        return
    }
    $stage = Join-Path $PSScriptRoot ('.llama-setup-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    try {
        $asset = Get-LlamaArchive $Backend
        $zip = Join-Path $stage 'runtime.zip'
        Write-Host "公式llama.cpp $LlamaBuild ($Backend) をダウンロードします。"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Receive-OllamaInstaller $asset.Url $zip
        Confirm-LlamaArchive $zip $asset.Hash
        $unpack = Join-Path $stage 'unpacked'
        Expand-Archive -LiteralPath $zip -DestinationPath $unpack
        $servers = @(Get-ChildItem -LiteralPath $unpack -Recurse -Filter 'llama-server.exe' -File)
        if ($servers.Count -ne 1) { throw 'ZIP内のllama-server.exeを特定できません。' }
        if (Test-Path -LiteralPath $destination) { throw '導入先フォルダーが既にあります。内容を確認してから再実行してください。' }
        Move-Item -LiteralPath $servers[0].Directory.FullName -Destination $destination
        Write-Host '導入しました。Companionで「llama-server」を選び、GGUFを指定して設定を保存し、起動してください。'
        Write-Host 'GGUFモデル本体はこのBATではダウンロードしません。LLAMA_SERVER_SETUP.mdを参照してください。'
    } finally { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
function Start-LlamaSetup {
    Write-Host 'llama-server導入：1 Vulkan（推奨・NVIDIA/AMD/Intel） / 2 CPUのみ'
    $choice = Read-Host '番号を入力（Enterで1）'
    if ($choice -eq '2') { Install-LlamaRuntime 'cpu' }
    elseif ($choice -eq '' -or $choice -eq '1') { Install-LlamaRuntime 'vulkan' }
    else { throw '1または2を入力してください。' }
}
if ($RunLlamaSetup) {
    try { Start-LlamaSetup }
    catch { Write-Host ('導入できませんでした：' + $_.Exception.Message) -ForegroundColor Red; exit 1 }
}
