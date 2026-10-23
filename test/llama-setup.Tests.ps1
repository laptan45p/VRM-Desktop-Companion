$ErrorActionPreference = 'Stop'
$helper = Join-Path (Split-Path -Parent $PSScriptRoot) 'llm-tools\llama_setup.ps1'
$tokens = $null; $errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($helper, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count) { throw ($errors | Out-String) }
. $helper -DefinitionsOnly
foreach ($backend in @('vulkan', 'cpu')) {
    $asset = Get-LlamaArchive $backend
    if ($asset.Url -ne "https://github.com/ggml-org/llama.cpp/releases/download/b11829/llama-b11829-bin-win-$backend-x64.zip") { throw 'Wrong official URL.' }
    if ($asset.Hash -notmatch '^[a-f0-9]{64}$') { throw 'Missing pinned hash.' }
}
$failed = $false
try { Get-LlamaArchive 'unknown' } catch { $failed = $true }
if (-not $failed) { throw 'Unknown backends must be rejected.' }
$temp = Join-Path $env:TEMP ('llama-setup-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    $file = Join-Path $temp 'archive.zip'
    [IO.File]::WriteAllText($file, 'fixture')
    Confirm-LlamaArchive $file (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    $failed = $false
    try { Confirm-LlamaArchive $file ('0' * 64) } catch { $failed = $true }
    if (-not $failed) { throw 'Corrupt archives must be rejected before extraction.' }
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
Write-Host 'llama-server setup tests passed (no downloads or GPU inference).'

$selected = ''
$answer = ''
function Read-Host { return $answer }
function Install-LlamaRuntime([string]$Backend) { $script:selected = $Backend }
Start-LlamaSetup
if ($selected -ne 'vulkan') { throw 'Enter must choose Vulkan.' }
$answer = '2'
Start-LlamaSetup
if ($selected -ne 'cpu') { throw 'CPU choice must work.' }
