$ErrorActionPreference = 'Stop'
$helper = Join-Path (Split-Path -Parent $PSScriptRoot) 'llm-tools\ollama_setup.ps1'
$tokens = $null; $errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($helper, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count) { throw ($errors | Out-String) }
. $helper -DefinitionsOnly
function Assert-Test($Condition, $Message) { if (-not $Condition) { throw $Message } }
foreach ($memory in @(0, 4096, 8192, 12282, 14336)) { Assert-Test ((Get-DefaultModelIndex $memory) -eq 0) "Wrong 8B default: $memory" }
foreach ($memory in @(16283, 16384, 24576)) { Assert-Test ((Get-DefaultModelIndex $memory) -eq 1) "Wrong 12B default: $memory" }
Assert-Test ((Get-DefaultModelIndex $null) -eq 0) 'Unknown VRAM must default to 8B.'
$calls = New-Object System.Collections.Generic.List[string]
$scenario = 'existing'
function Fake-Ollama {
    $calls.Add(($args -join ' '))
    $global:LASTEXITCODE = 0
    if ($args[0] -eq 'show' -and $calls.Count -eq 1 -and $scenario -ne 'existing') { $global:LASTEXITCODE = 1 }
    if ($args[0] -eq 'pull' -and $args[1] -eq $Models[0].Name -and $scenario -ne 'success') {
        $global:LASTEXITCODE = 1
        if ($scenario -eq 'missing') { Write-Output 'Error: pull model manifest: file does not exist' }
        else { Write-Output 'Error: connection timeout' }
    }
}
Install-OllamaModel 'Fake-Ollama' $Models[0]
Assert-Test ($calls.Count -eq 1) 'Installed models must not be pulled again.'
$calls.Clear(); $scenario = 'success'
Install-OllamaModel 'Fake-Ollama' $Models[0]
Assert-Test ($calls.Count -eq 2) 'Normal installation should show then pull.'
$calls.Clear(); $scenario = 'missing'
Install-OllamaModel 'Fake-Ollama' $Models[0]
Assert-Test ($calls.Count -eq 5) 'Missing models should pull HF, alias, and verify.'
Assert-Test ($calls[2] -eq ('pull ' + $Models[0].HF)) 'Wrong Hugging Face fallback.'
Assert-Test ($calls[3] -eq ('cp ' + $Models[0].HF + ' ' + $Models[0].Name)) 'Fallback must preserve requested model name.'
$calls.Clear(); $scenario = 'timeout'; $failed = $false
try { Install-OllamaModel 'Fake-Ollama' $Models[0] } catch { $failed = $true }
Assert-Test ($failed -and $calls.Count -eq 2) 'Network failures must stop without unrelated fallback downloads.'
Write-Host 'Ollama setup smoke tests passed.'

# The expected failing mock must not become the CI shell exit code.
$global:LASTEXITCODE = 0

# Exercise streaming without a network download or an Ollama installation.
$rendered = New-Object System.Collections.Generic.List[string]
function Write-Host { param($Object, [switch]$NoNewline); $rendered.Add([string]$Object) }
$payload = New-Object byte[] 150000
$payload[0] = 42; $payload[149999] = 99
foreach ($total in @($payload.Length, -1)) {
    $source = New-Object IO.MemoryStream
    $target = New-Object IO.MemoryStream
    try {
        $source.Write($payload, 0, $payload.Length); $source.Position = 0
        $rendered.Clear()
        Copy-InstallerStream $source $target $total
        Assert-Test ([Convert]::ToBase64String($target.ToArray()) -eq [Convert]::ToBase64String($payload)) 'Streaming corrupted the downloaded bytes.'
        Assert-Test ($rendered.Count -eq 3) 'A fast transfer should render only start, completion, and newline.'
        Assert-Test ($rendered[1] -match '100%') 'Only a complete transfer should reach 100%.'
        if ($total -eq -1) { Assert-Test ($rendered[0] -match '\.\.\.') 'Unknown-length transfer needs an indeterminate display.' }
    } finally { $source.Dispose(); $target.Dispose() }
}
$source = New-Object IO.MemoryStream
$target = New-Object IO.MemoryStream
try {
    $rendered.Clear(); $failed = $false
    try { Copy-InstallerStream $source $target 100 } catch { $failed = $true }
    Assert-Test $failed 'Truncated downloads must fail.'
    Assert-Test (-not (($rendered -join '') -match '100%')) 'Truncated downloads must not report completion.'
} finally { $source.Dispose(); $target.Dispose(); Remove-Item Function:\Write-Host }
Write-Host 'Download streaming and progress tests passed.'
$global:LASTEXITCODE = 0



# Model configuration uses a fake local API: no network, downloads, or GPU.
$infos = @{}
$createdModels = New-Object System.Collections.Generic.List[object]
$failCreate = $false
function Invoke-OllamaSetupApi([string]$Path, $Payload, [switch]$AllowMissing) {
    if ($Path -eq 'show') {
        if ($infos.ContainsKey($Payload.model)) { return $infos[$Payload.model] }
        if ($AllowMissing) { return $null }
        throw 'test model missing'
    }
    if ($Path -eq 'create') {
        $createdModels.Add($Payload)
        if ($failCreate) { throw 'test create failed' }
        $infos[$Payload.model] = @{ template = $Payload.template; modelfile = $infos[$Payload.from].modelfile }
        return @{ status = 'success' }
    }
    throw 'Unexpected API path'
}
$sourceName = $Models[1].Name
$infos[$sourceName] = @{ template = '{{ .Prompt }}'; modelfile = 'FROM /fake/blobs/sha256-original' }
$fixedName = Ensure-OllamaChatModel $Models[1]
Assert-Test ($fixedName -eq $NemoChatModel -and $createdModels.Count -eq 1) 'Raw NemoMix must create a separate chat model.'
Assert-Test ($infos[$sourceName].template -eq '{{ .Prompt }}') 'Do not overwrite the source model.'
$payload = $createdModels[0]
Assert-Test ($payload.from -eq $sourceName -and $payload.stream -eq $false) 'Create must reuse the installed model and wait for success.'
Assert-Test ($payload.template.Contains('.Messages') -and $payload.template.Contains('.System') -and $payload.template.Contains('assistant') -and $payload.template.Contains('[INST]')) 'Template must handle persona and conversation history.'
Assert-Test (($payload.parameters.stop -join ',') -eq '[INST],[/INST],</s>') 'Wrong stop sequences.'
$fixedName = Ensure-OllamaChatModel $Models[1]
Assert-Test ($fixedName -eq $NemoChatModel -and $createdModels.Count -eq 1) 'Repeat setup must reuse the verified chat model.'
$infos[$sourceName].template = '[INST]{{ .Prompt }}[/INST]'
Assert-Test ((Ensure-OllamaChatModel $Models[1]) -eq $sourceName -and $createdModels.Count -eq 1) 'Already configured source models must be preserved.'
$infos[$sourceName].template = '{{ .Prompt }}'
$infos[$NemoChatModel].modelfile = 'FROM /fake/blobs/sha256-unrelated'
$failed = $false
try { Ensure-OllamaChatModel $Models[1] | Out-Null } catch { $failed = $true }
Assert-Test ($failed -and $createdModels.Count -eq 1) 'Do not overwrite an unrelated model with the reserved name.'
$infos.Remove($NemoChatModel)
$failCreate = $true; $failed = $false
try { Ensure-OllamaChatModel $Models[1] | Out-Null } catch { $failed = $true }
Assert-Test ($failed -and -not $infos.ContainsKey($NemoChatModel)) 'Create failure must not report a usable model.'
$infos[$Models[0].Name] = @{ template = '<|im_start|>{{ .Prompt }}<|im_end|>'; modelfile = 'FROM /fake/qwen' }
Assert-Test ((Ensure-OllamaChatModel $Models[0]) -eq $Models[0].Name) 'Valid Qwen must not be modified.'
Write-Host 'Automatic chat model configuration tests passed.'
$global:LASTEXITCODE = 0
