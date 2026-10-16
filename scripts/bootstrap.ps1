$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$nodeReady = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = & node --version
    $nodeReady = $LASTEXITCODE -eq 0 -and [version]($nodeVersion.TrimStart('v')) -ge [version]'22.13.0'
}
if (-not $nodeReady -and (Test-Path '.data\node\node.exe')) {
    $env:PATH = "$PWD\.data\node;$env:PATH"
    $nodeVersion = & node --version
    $nodeReady = $LASTEXITCODE -eq 0 -and [version]($nodeVersion.TrimStart('v')) -ge [version]'22.13.0'
}
if (-not $nodeReady) {
    Write-Host '[环境] 自动安装 Node.js 22 LTS 到 .data/node…'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } elseif ($env:PROCESSOR_ARCHITECTURE -eq 'AMD64') { 'x64' } else { throw '不支持的 CPU 架构' }
    New-Item -ItemType Directory -Force '.data' | Out-Null
    $stage = Join-Path "$PWD\.data" ('node-download.' + [guid]::NewGuid())
    New-Item -ItemType Directory $stage | Out-Null
    try {
        $checks = (Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt').Content
        $match = [regex]::Match($checks, "(?m)^([a-f0-9]{64})\s+(node-v22\.[0-9.]+-win-$arch\.zip)\s*$")
        if (-not $match.Success) { throw '无法确定 Node 下载文件' }
        $archive = $match.Groups[2].Value
        $zip = Join-Path $stage $archive
        Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/latest-v22.x/$archive" -OutFile $zip
        if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $match.Groups[1].Value) { throw 'Node 下载校验失败' }
        Expand-Archive $zip $stage
        if (Test-Path '.data\node') { Move-Item '.data\node' (Join-Path $stage 'previous') }
        Move-Item (Join-Path $stage ($archive -replace '\.zip$', '')) '.data\node'
        $env:PATH = "$PWD\.data\node;$env:PATH"
    } finally { Remove-Item -Recurse -Force $stage }
}
& node --disable-warning=UNDICI-EHPA scripts/launch.mjs @args
exit $LASTEXITCODE
