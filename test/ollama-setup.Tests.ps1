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
