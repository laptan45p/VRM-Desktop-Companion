$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$helper = Join-Path $root 'tts-tools\irodori_server.ps1'
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($helper, [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
. $helper -DefinitionsOnly
$temp = Join-Path ([IO.Path]::GetTempPath()) ('irodori helpers space 日本語-' + [Guid]::NewGuid())
$Server = Join-Path $temp 'Irodori-TTS-Server'
$calls = New-Object System.Collections.Generic.List[object]
$originValue = $Repository
$occupied = $false
$failSync = $false
$runtimeChecks = 0
function Assert-SetupTest([bool]$Value, [string]$Message) { if (-not $Value) { throw $Message } }
function Ensure-SetupTool([string]$Name, [string]$Package, [switch]$Install) { return ('C:\fake tools\' + $Name + '.exe') }
function Get-SetupOrigin([string]$Git) { return $originValue }
function Test-SetupRuntime([string]$Uv) { $script:runtimeChecks++ }
function Test-SetupPort { return $occupied }
function Invoke-SetupNative([string]$Executable, [string[]]$Arguments) {
    $script:calls.Add(@{ exe = $Executable; arguments = @($Arguments) })
    if ($Arguments[0] -eq 'clone') {
        New-Item -ItemType Directory -Path (Join-Path $Server '.git') -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $Server 'pyproject.toml') -Value '[project]'
        Set-Content -LiteralPath (Join-Path $Server '.env.example') -Value 'IRODORI_HF_CHECKPOINT=old-default'
    }
    if ($script:failSync -and $Arguments[0] -eq 'sync') { throw 'test sync failure' }
}
try {
    Install-SetupServer
    Assert-SetupTest ($calls.Count -eq 2) 'Install must clone and sync exactly once.'
    Assert-SetupTest ($calls[0].arguments[-1] -eq $Server) 'Clone destination must remain a single argument with spaces and Japanese.'
    Assert-SetupTest (($calls[1].arguments -join ' ') -eq 'sync --python 3.10 --extra cu128 --frozen') 'Install must select CUDA and Python 3.10.'
    Assert-SetupTest ($env:UV_PROJECT_ENVIRONMENT -eq (Join-Path $Server '.venv')) 'Use a dedicated virtual environment.'
    Assert-SetupTest ($env:IRODORI_MODEL_PRECISION -eq 'bf16') 'Precision must be BF16.'
    Assert-SetupTest ($env:IRODORI_HF_CHECKPOINT -eq 'Aratako/Irodori-TTS-v4-Large-Quantized/int8-weight-only') 'Wrong model.'
    Set-Content -LiteralPath (Join-Path $Server '.env') -Value 'keep-existing-settings'
    Install-SetupServer
    Assert-SetupTest ($calls.Count -eq 3) 'Reinstall must not clone or pull again.'
    Assert-SetupTest ((Get-Content -LiteralPath (Join-Path $Server '.env') -Raw).Trim() -eq 'keep-existing-settings') 'Do not overwrite an existing .env.'
    $originValue = 'https://github.com/example/unrelated.git'
    $before = $calls.Count
    $rejected = $false
    try { Install-SetupServer } catch { $rejected = $true }
    Assert-SetupTest ($rejected -and $calls.Count -eq $before) 'Reject unrelated repositories before syncing.'
    $originValue = $Repository
    New-Item -ItemType Directory -Path (Join-Path $Server '.venv\Scripts') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $Server '.venv\Scripts\python.exe') -Value 'fixture only'
    $env:IRODORI_CHECKPOINT = 'wrong-checkpoint'
    Start-SetupServer
    $start = $calls[$calls.Count - 1].arguments -join ' '
    Assert-SetupTest ($start -eq 'run --no-sync python -m irodori_openai_tts --host 127.0.0.1 --port 8088') 'Start must bind loopback without re-syncing.'
    Assert-SetupTest ($env:IRODORI_CHECKPOINT -eq ' ') 'Mask inherited local-checkpoint settings.'
    $occupied = $true
    $before = $calls.Count
    $rejected = $false
    try { Start-SetupServer } catch { $rejected = $true }
    Assert-SetupTest ($rejected -and $calls.Count -eq $before) 'Do not start another server on an occupied port.'
    $occupied = $false
    $script:failSync = $true
    $beforeChecks = $runtimeChecks
    $rejected = $false
    try { Install-SetupServer } catch { $rejected = $true }
    Assert-SetupTest ($rejected -and $runtimeChecks -eq $beforeChecks) 'Stop after a dependency-install failure.'
    $Server = Join-Path $temp 'existing unrelated files'
    New-Item -ItemType Directory -Path $Server -Force | Out-Null
    $before = $calls.Count
    $rejected = $false
    try { Install-SetupServer } catch { $rejected = $true }
    Assert-SetupTest ($rejected -and $calls.Count -eq $before) 'Do not overwrite a non-repository folder.'
    Write-Host 'TTS helper smoke tests passed.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
