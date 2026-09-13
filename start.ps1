param([string]$PythonPath = '')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not $PythonPath) {
    $installedPython = Get-Command python -ErrorAction SilentlyContinue
    if ($installedPython) { $PythonPath = $installedPython.Source }
    else {
        $bundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
        if (Test-Path -LiteralPath $bundledPython) { $PythonPath = $bundledPython }
        else { throw 'Python 3.11 이상 경로를 -PythonPath 인수로 지정해 주세요.' }
    }
}
if (-not (Test-Path -LiteralPath 'node_modules\vite\bin\vite.js')) { throw '먼저 npm install을 실행해 주세요.' }
$apiProcess = Start-Process -FilePath $PythonPath -ArgumentList @('-X','utf8',('"' + (Join-Path $PSScriptRoot 'server.py') + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
try { & node 'node_modules/vite/bin/vite.js' --host 127.0.0.1 }
finally { if (-not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id } }
